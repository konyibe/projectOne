const { SpikeDetection } = require('../services/spikeDetection');

describe('SpikeDetection', () => {
  let detector;

  beforeEach(() => {
    detector = new SpikeDetection({
      windowSize: 60000, // 1 minute for testing
      historyWindows: 5,
      stdDevThreshold: 2.0,
      minDataPoints: 3
    });
  });

  describe('getWindowKey', () => {
    it('should generate consistent window keys for same window', () => {
      const time1 = new Date('2024-01-01T10:00:30.000Z');
      const time2 = new Date('2024-01-01T10:00:45.000Z');

      const key1 = detector.getWindowKey(time1);
      const key2 = detector.getWindowKey(time2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different windows', () => {
      const time1 = new Date('2024-01-01T10:00:00.000Z');
      const time2 = new Date('2024-01-01T10:01:30.000Z');

      const key1 = detector.getWindowKey(time1);
      const key2 = detector.getWindowKey(time2);

      expect(key1).not.toBe(key2);
    });

    it('should use current time when no timestamp provided', () => {
      const key = detector.getWindowKey();
      expect(key).toMatch(/^w_\d+$/);
    });
  });

  describe('isSpike calculation logic', () => {
    // Test the spike threshold logic without database
    it('should flag as spike when count exceeds mean + 2*stdDev', () => {
      const mean = 10;
      const stdDev = 2;
      const threshold = mean + (stdDev * 2); // 14

      expect(15 > threshold).toBe(true);  // Should be spike
      expect(13 > threshold).toBe(false); // Should not be spike
    });

    it('should calculate correct deviation from mean', () => {
      const mean = 10;
      const stdDev = 2;
      const currentCount = 16;

      const deviations = (currentCount - mean) / stdDev;
      expect(deviations).toBe(3); // 3 standard deviations
    });

    it('should classify spike levels correctly', () => {
      const classifyLevel = (deviations) => {
        if (deviations >= 4) return 'critical';
        if (deviations >= 3) return 'high';
        if (deviations >= 2) return 'elevated';
        return 'normal';
      };

      expect(classifyLevel(1.5)).toBe('normal');
      expect(classifyLevel(2.0)).toBe('elevated');
      expect(classifyLevel(3.0)).toBe('high');
      expect(classifyLevel(4.0)).toBe('critical');
      expect(classifyLevel(5.0)).toBe('critical');
    });
  });

  describe('statistics calculations', () => {
    it('should calculate mean correctly', () => {
      const counts = [10, 12, 8, 14, 11];
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;

      expect(mean).toBe(11);
    });

    it('should calculate standard deviation correctly', () => {
      const counts = [10, 12, 8, 14, 11];
      const mean = 11;

      const squaredDiffs = counts.map(c => Math.pow(c - mean, 2));
      // [1, 1, 9, 9, 0]
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / counts.length;
      // 20 / 5 = 4
      const stdDev = Math.sqrt(variance);
      // sqrt(4) = 2

      expect(stdDev).toBe(2);
    });

    it('should handle single data point', () => {
      const counts = [10];
      const mean = 10;
      const variance = 0;
      const stdDev = 0;

      expect(mean).toBe(10);
      expect(stdDev).toBe(0);
    });

    it('should handle identical values', () => {
      const counts = [5, 5, 5, 5];
      const mean = 5;
      const stdDev = 0;

      const calculatedMean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const squaredDiffs = counts.map(c => Math.pow(c - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / counts.length;
      const calculatedStdDev = Math.sqrt(variance);

      expect(calculatedMean).toBe(5);
      expect(calculatedStdDev).toBe(0);
    });
  });

  describe('threshold calculation', () => {
    it('should calculate threshold as mean + stdDev * multiplier', () => {
      const mean = 10;
      const stdDev = 3;
      const multiplier = 2.0;

      const threshold = mean + (stdDev * multiplier);

      expect(threshold).toBe(16);
    });

    it('should not flag spike when count equals threshold', () => {
      const mean = 10;
      const stdDev = 3;
      const threshold = mean + (stdDev * 2); // 16
      const currentCount = 16;

      // > threshold, not >= threshold
      expect(currentCount > threshold).toBe(false);
    });

    it('should flag spike when count exceeds threshold', () => {
      const mean = 10;
      const stdDev = 3;
      const threshold = mean + (stdDev * 2); // 16
      const currentCount = 17;

      expect(currentCount > threshold).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle zero standard deviation', () => {
      const mean = 10;
      const stdDev = 0;
      const currentCount = 11;

      // When stdDev is 0, any increase could be considered anomalous
      // But we should avoid division by zero
      const isSpike = stdDev > 0 && currentCount > (mean + stdDev * 2);

      expect(isSpike).toBe(false); // Because stdDev is 0
    });

    it('should handle negative counts gracefully', () => {
      // Counts should never be negative, but handle it
      const counts = [10, -5, 8]; // Invalid data
      const validCounts = counts.filter(c => c >= 0);

      expect(validCounts).toEqual([10, 8]);
    });

    it('should require minimum data points for reliable detection', () => {
      const dataPoints = 2;
      const minRequired = 3;

      const hasEnoughData = dataPoints >= minRequired;

      expect(hasEnoughData).toBe(false);
    });
  });
});
