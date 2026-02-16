const mongoose = require('mongoose');

// Schema for persisting rolling statistics
const statsSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    index: true
  },
  windowKey: {
    type: String,
    required: true
  },
  count: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

statsSchema.index({ service: 1, windowKey: 1 }, { unique: true });
statsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7200 }); // TTL: 2 hours

const ServiceStats = mongoose.model('ServiceStats', statsSchema);

/**
 * Spike Detection Service
 * Maintains rolling statistics and detects anomalies
 */
class SpikeDetection {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 5 * 60 * 1000; // 5 minutes
    this.historyWindows = options.historyWindows || 12; // 1 hour of history (12 x 5min)
    this.stdDevThreshold = options.stdDevThreshold || 2.0; // 2 standard deviations
    this.minDataPoints = options.minDataPoints || 3; // Minimum windows for reliable stats

    // In-memory cache for fast access
    this.statsCache = new Map();
    this.lastCacheUpdate = null;
  }

  /**
   * Get current window key based on timestamp
   * @param {Date} timestamp - Timestamp
   * @returns {string} Window key
   */
  getWindowKey(timestamp = new Date()) {
    const windowStart = Math.floor(timestamp.getTime() / this.windowSize) * this.windowSize;
    return `w_${windowStart}`;
  }

  /**
   * Record an event count for a service in the current window
   * @param {string} service - Service name
   * @param {number} count - Event count to add
   */
  async recordCount(service, count = 1) {
    const windowKey = this.getWindowKey();
    const cacheKey = `${service}:${windowKey}`;

    // Update in-memory cache
    const current = this.statsCache.get(cacheKey) || 0;
    this.statsCache.set(cacheKey, current + count);

    // Persist to MongoDB (upsert)
    try {
      await ServiceStats.findOneAndUpdate(
        { service, windowKey },
        {
          $inc: { count },
          $set: { timestamp: new Date() }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error persisting spike stats:', error.message);
    }
  }

  /**
   * Get historical statistics for a service
   * @param {string} service - Service name
   * @returns {Object} Statistics object
   */
  async getServiceStats(service) {
    const now = new Date();
    const historyStart = new Date(now.getTime() - (this.windowSize * this.historyWindows));

    try {
      const stats = await ServiceStats.find({
        service,
        timestamp: { $gte: historyStart }
      }).sort({ timestamp: -1 }).lean();

      if (stats.length === 0) {
        return {
          service,
          mean: 0,
          stdDev: 0,
          dataPoints: 0,
          hasEnoughData: false
        };
      }

      const counts = stats.map(s => s.count);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;

      // Calculate standard deviation
      const squaredDiffs = counts.map(c => Math.pow(c - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / counts.length;
      const stdDev = Math.sqrt(variance);

      return {
        service,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        dataPoints: counts.length,
        hasEnoughData: counts.length >= this.minDataPoints,
        recentCounts: counts.slice(0, 5),
        min: Math.min(...counts),
        max: Math.max(...counts)
      };
    } catch (error) {
      console.error('Error getting service stats:', error.message);
      return {
        service,
        mean: 0,
        stdDev: 0,
        dataPoints: 0,
        hasEnoughData: false,
        error: error.message
      };
    }
  }

  /**
   * Check if current count represents a spike
   * @param {string} service - Service name
   * @param {number} currentCount - Current event count
   * @returns {Object} Spike detection result
   */
  async isSpike(service, currentCount) {
    const stats = await this.getServiceStats(service);

    // Not enough historical data
    if (!stats.hasEnoughData) {
      return {
        isSpike: false,
        reason: 'insufficient_data',
        currentCount,
        threshold: null,
        stats
      };
    }

    // Calculate threshold: mean + (stdDev * threshold multiplier)
    const threshold = stats.mean + (stats.stdDev * this.stdDevThreshold);

    // Check for spike
    const isSpike = currentCount > threshold && stats.stdDev > 0;

    // Calculate deviation from mean in standard deviations
    const deviations = stats.stdDev > 0
      ? (currentCount - stats.mean) / stats.stdDev
      : 0;

    // Determine spike level
    let spikeLevel = 'normal';
    if (deviations >= 4) spikeLevel = 'critical';
    else if (deviations >= 3) spikeLevel = 'high';
    else if (deviations >= 2) spikeLevel = 'elevated';

    return {
      isSpike,
      spikeLevel,
      reason: isSpike ? 'threshold_exceeded' : 'within_normal',
      currentCount,
      threshold: Math.round(threshold * 100) / 100,
      deviations: Math.round(deviations * 100) / 100,
      stats: {
        mean: stats.mean,
        stdDev: stats.stdDev,
        dataPoints: stats.dataPoints
      }
    };
  }

  /**
   * Batch check for spikes across multiple services
   * @param {Object} serviceCounts - Map of service -> count
   * @returns {Object} Spike results by service
   */
  async checkSpikes(serviceCounts) {
    const results = {};

    await Promise.all(
      Object.entries(serviceCounts).map(async ([service, count]) => {
        results[service] = await this.isSpike(service, count);
      })
    );

    return results;
  }

  /**
   * Record event counts for multiple services
   * @param {Object} serviceCounts - Map of service -> count
   */
  async recordCounts(serviceCounts) {
    await Promise.all(
      Object.entries(serviceCounts).map(([service, count]) =>
        this.recordCount(service, count)
      )
    );
  }

  /**
   * Get all services with active spikes
   * @returns {Array} Array of spike results
   */
  async getActiveSpikes() {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.windowSize);

    try {
      // Get current window counts for all services
      const currentStats = await ServiceStats.aggregate([
        {
          $match: {
            timestamp: { $gte: windowStart }
          }
        },
        {
          $group: {
            _id: '$service',
            currentCount: { $sum: '$count' }
          }
        }
      ]);

      const spikes = [];

      for (const stat of currentStats) {
        const spikeResult = await this.isSpike(stat._id, stat.currentCount);
        if (spikeResult.isSpike) {
          spikes.push({
            service: stat._id,
            ...spikeResult
          });
        }
      }

      return spikes;
    } catch (error) {
      console.error('Error getting active spikes:', error.message);
      return [];
    }
  }

  /**
   * Clean up old statistics (called periodically)
   */
  async cleanup() {
    const cutoff = new Date(Date.now() - (this.windowSize * this.historyWindows * 2));

    try {
      const result = await ServiceStats.deleteMany({
        timestamp: { $lt: cutoff }
      });

      if (result.deletedCount > 0) {
        console.log(`Cleaned up ${result.deletedCount} old spike detection records`);
      }
    } catch (error) {
      console.error('Error cleaning up spike stats:', error.message);
    }
  }
}

module.exports = new SpikeDetection();
module.exports.SpikeDetection = SpikeDetection;
module.exports.ServiceStats = ServiceStats;
