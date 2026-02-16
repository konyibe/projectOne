const { SeverityScoring } = require('../services/severityScoring');

describe('SeverityScoring', () => {
  let scorer;

  beforeEach(() => {
    scorer = new SeverityScoring();
  });

  describe('getBaseScore', () => {
    it('should return correct base scores for each severity level', () => {
      expect(scorer.getBaseScore(1)).toBe(10);
      expect(scorer.getBaseScore(2)).toBe(25);
      expect(scorer.getBaseScore(3)).toBe(50);
      expect(scorer.getBaseScore(4)).toBe(75);
      expect(scorer.getBaseScore(5)).toBe(100);
    });

    it('should handle out-of-range severity values', () => {
      expect(scorer.getBaseScore(0)).toBe(10);  // Clamps to 1
      expect(scorer.getBaseScore(6)).toBe(100); // Clamps to 5
      expect(scorer.getBaseScore(-1)).toBe(10);
    });

    it('should round decimal severity values', () => {
      expect(scorer.getBaseScore(2.4)).toBe(25); // Rounds to 2
      expect(scorer.getBaseScore(2.6)).toBe(50); // Rounds to 3
    });
  });

  describe('getServiceMultiplier', () => {
    it('should return higher multiplier for critical services', () => {
      expect(scorer.getServiceMultiplier('payment-service')).toBe(2.0);
      expect(scorer.getServiceMultiplier('auth-service')).toBe(1.8);
      expect(scorer.getServiceMultiplier('database')).toBe(2.0);
    });

    it('should return 1.0 for non-critical services', () => {
      expect(scorer.getServiceMultiplier('logging-service')).toBe(1.0);
      expect(scorer.getServiceMultiplier('unknown-service')).toBe(1.0);
    });

    it('should be case-insensitive', () => {
      expect(scorer.getServiceMultiplier('PAYMENT-SERVICE')).toBe(2.0);
      expect(scorer.getServiceMultiplier('Payment-Service')).toBe(2.0);
    });
  });

  describe('getFrequencyMultiplier', () => {
    it('should return normal multiplier when no spike', () => {
      const result = scorer.getFrequencyMultiplier(10, 10);
      expect(result.multiplier).toBe(1.0);
      expect(result.level).toBe('normal');
    });

    it('should return elevated multiplier for slight increase', () => {
      const result = scorer.getFrequencyMultiplier(16, 10); // 1.6x ratio
      expect(result.multiplier).toBe(1.3);
      expect(result.level).toBe('elevated');
    });

    it('should return high multiplier for significant increase', () => {
      const result = scorer.getFrequencyMultiplier(30, 10); // 3x ratio
      expect(result.multiplier).toBe(1.6);
      expect(result.level).toBe('high');
    });

    it('should return critical multiplier for major spike', () => {
      const result = scorer.getFrequencyMultiplier(50, 10); // 5x ratio
      expect(result.multiplier).toBe(2.0);
      expect(result.level).toBe('critical');
    });

    it('should handle zero baseline', () => {
      const result = scorer.getFrequencyMultiplier(5, 0);
      expect(result.multiplier).toBe(1.3);
      expect(result.level).toBe('elevated');
    });

    it('should handle zero current rate with zero baseline', () => {
      const result = scorer.getFrequencyMultiplier(0, 0);
      expect(result.multiplier).toBe(1.0);
      expect(result.level).toBe('normal');
    });
  });

  describe('scoreEvent', () => {
    it('should calculate correct score for basic event', () => {
      const event = { service: 'test-service', severity: 3 };
      const result = scorer.scoreEvent(event);

      expect(result.baseScore).toBe(50);
      expect(result.serviceMultiplier).toBe(1.0);
      expect(result.frequencyMultiplier).toBe(1.0);
      expect(result.finalScore).toBe(50);
    });

    it('should apply service multiplier for critical services', () => {
      const event = { service: 'payment-service', severity: 3 };
      const result = scorer.scoreEvent(event);

      expect(result.baseScore).toBe(50);
      expect(result.serviceMultiplier).toBe(2.0);
      expect(result.finalScore).toBe(100);
      expect(result.factors.isCriticalService).toBe(true);
    });

    it('should apply frequency multiplier during spike', () => {
      const event = { service: 'test-service', severity: 3 };
      const result = scorer.scoreEvent(event, {
        currentRate: 50,
        baselineRate: 10
      });

      expect(result.frequencyMultiplier).toBe(2.0);
      expect(result.frequencyLevel).toBe('critical');
      expect(result.finalScore).toBe(100); // Capped at 100
    });

    it('should cap final score at 100', () => {
      const event = { service: 'payment-service', severity: 5 };
      const result = scorer.scoreEvent(event, {
        currentRate: 50,
        baselineRate: 10
      });

      // 100 * 2.0 * 2.0 = 400, but capped at 100
      expect(result.finalScore).toBe(100);
    });
  });

  describe('scoreIncident', () => {
    it('should return zero score for empty events', () => {
      const result = scorer.scoreIncident([]);

      expect(result.compositeScore).toBe(0);
      expect(result.severityLevel).toBe(1);
      expect(result.classification).toBe('low');
      expect(result.eventCount).toBe(0);
    });

    it('should calculate composite score for single event', () => {
      const events = [{ service: 'test-service', severity: 3 }];
      const result = scorer.scoreIncident(events);

      expect(result.eventCount).toBe(1);
      expect(result.compositeScore).toBeGreaterThan(0);
    });

    it('should increase score for multiple events', () => {
      const singleEvent = [{ service: 'test-service', severity: 3 }];
      const multipleEvents = [
        { service: 'test-service', severity: 3 },
        { service: 'test-service', severity: 3 },
        { service: 'test-service', severity: 3 },
        { service: 'test-service', severity: 3 },
        { service: 'test-service', severity: 3 }
      ];

      const singleResult = scorer.scoreIncident(singleEvent);
      const multiResult = scorer.scoreIncident(multipleEvents);

      expect(multiResult.compositeScore).toBeGreaterThan(singleResult.compositeScore);
      expect(multiResult.countFactor).toBeGreaterThan(1);
    });

    it('should weight max severity higher than average', () => {
      const mixedSeverity = [
        { service: 'test-service', severity: 5 },
        { service: 'test-service', severity: 1 },
        { service: 'test-service', severity: 1 }
      ];

      const result = scorer.scoreIncident(mixedSeverity);

      // Max score (100) should dominate over avg
      expect(result.maxEventScore).toBe(100);
      expect(result.compositeScore).toBeGreaterThan(result.avgEventScore);
    });

    it('should track affected services correctly', () => {
      const events = [
        { service: 'service-a', severity: 3 },
        { service: 'service-b', severity: 4 },
        { service: 'service-a', severity: 2 }
      ];

      const result = scorer.scoreIncident(events);

      expect(result.factors.affectedServices).toContain('service-a');
      expect(result.factors.affectedServices).toContain('service-b');
      expect(result.factors.affectedServices.length).toBe(2);
    });

    it('should identify critical services affected', () => {
      const events = [
        { service: 'payment-service', severity: 3 },
        { service: 'test-service', severity: 3 }
      ];

      const result = scorer.scoreIncident(events);

      expect(result.factors.criticalServicesAffected).toContain('payment-service');
      expect(result.factors.criticalServicesAffected.length).toBe(1);
    });
  });

  describe('getSeverityLevel', () => {
    it('should return correct severity levels', () => {
      expect(scorer.getSeverityLevel(10)).toBe(1);
      expect(scorer.getSeverityLevel(25)).toBe(2);
      expect(scorer.getSeverityLevel(50)).toBe(3);
      expect(scorer.getSeverityLevel(75)).toBe(4);
      expect(scorer.getSeverityLevel(90)).toBe(5);
      expect(scorer.getSeverityLevel(100)).toBe(5);
    });
  });

  describe('getClassification', () => {
    it('should return correct classifications', () => {
      expect(scorer.getClassification(10)).toBe('low');
      expect(scorer.getClassification(50)).toBe('medium');
      expect(scorer.getClassification(75)).toBe('high');
      expect(scorer.getClassification(90)).toBe('critical');
    });
  });
});
