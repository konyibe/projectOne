const { criticalServices, severityConfig } = require('../config/services');

/**
 * Severity Scoring Service
 * Calculates incident severity based on multiple factors
 */
class SeverityScoring {
  constructor(config = severityConfig) {
    this.config = config;
    this.criticalServices = criticalServices;
  }

  /**
   * Get base score from event severity level (1-5)
   * @param {number} severity - Event severity level
   * @returns {number} Base score
   */
  getBaseScore(severity) {
    const level = Math.min(Math.max(Math.round(severity), 1), 5);
    return this.config.baseScores[level] || this.config.baseScores[1];
  }

  /**
   * Get service criticality multiplier
   * @param {string} serviceName - Name of the service
   * @returns {number} Multiplier value
   */
  getServiceMultiplier(serviceName) {
    const serviceConfig = this.criticalServices[serviceName.toLowerCase()];
    return serviceConfig ? serviceConfig.multiplier : 1.0;
  }

  /**
   * Calculate frequency multiplier based on spike ratio
   * @param {number} currentRate - Current event rate
   * @param {number} baselineRate - Baseline event rate
   * @returns {{ multiplier: number, level: string }}
   */
  getFrequencyMultiplier(currentRate, baselineRate) {
    if (baselineRate === 0) {
      // No baseline, treat any events as elevated
      return currentRate > 0
        ? { multiplier: this.config.frequencyMultipliers.elevated, level: 'elevated' }
        : { multiplier: this.config.frequencyMultipliers.normal, level: 'normal' };
    }

    const ratio = currentRate / baselineRate;

    if (ratio >= this.config.spikeThresholds.critical) {
      return { multiplier: this.config.frequencyMultipliers.critical, level: 'critical' };
    }
    if (ratio >= this.config.spikeThresholds.high) {
      return { multiplier: this.config.frequencyMultipliers.high, level: 'high' };
    }
    if (ratio >= this.config.spikeThresholds.elevated) {
      return { multiplier: this.config.frequencyMultipliers.elevated, level: 'elevated' };
    }

    return { multiplier: this.config.frequencyMultipliers.normal, level: 'normal' };
  }

  /**
   * Calculate score for a single event
   * @param {Object} event - Event object
   * @param {Object} options - Scoring options
   * @returns {Object} Scoring result
   */
  scoreEvent(event, options = {}) {
    const { currentRate = 0, baselineRate = 0 } = options;

    const baseScore = this.getBaseScore(event.severity);
    const serviceMultiplier = this.getServiceMultiplier(event.service);
    const { multiplier: frequencyMultiplier, level: frequencyLevel } =
      this.getFrequencyMultiplier(currentRate, baselineRate);

    const finalScore = Math.min(
      Math.round(baseScore * serviceMultiplier * frequencyMultiplier),
      100
    );

    return {
      baseScore,
      serviceMultiplier,
      frequencyMultiplier,
      frequencyLevel,
      finalScore,
      factors: {
        severity: event.severity,
        service: event.service,
        isCriticalService: serviceMultiplier > 1.0,
        hasSpike: frequencyMultiplier > 1.0
      }
    };
  }

  /**
   * Calculate composite severity for an incident with multiple events
   * @param {Array} events - Array of event objects
   * @param {Object} options - Scoring options
   * @returns {Object} Composite scoring result
   */
  scoreIncident(events, options = {}) {
    if (!events || events.length === 0) {
      return {
        compositeScore: 0,
        severityLevel: 1,
        classification: 'low',
        eventCount: 0,
        factors: {}
      };
    }

    const { spikeData = {} } = options;

    // Score each event
    const eventScores = events.map(event => {
      const serviceSpike = spikeData[event.service] || {};
      return this.scoreEvent(event, {
        currentRate: serviceSpike.currentCount || 0,
        baselineRate: serviceSpike.mean || 0
      });
    });

    // Calculate weighted composite score
    const maxScore = Math.max(...eventScores.map(s => s.finalScore));
    const avgScore = eventScores.reduce((sum, s) => sum + s.finalScore, 0) / eventScores.length;

    // Event count factor (more events = higher severity, with diminishing returns)
    const countFactor = Math.min(1 + Math.log10(events.length) * 0.2, 1.5);

    // Composite: weighted average favoring max severity
    const compositeScore = Math.min(
      Math.round((maxScore * 0.6 + avgScore * 0.4) * countFactor),
      100
    );

    // Determine severity level (1-5)
    const severityLevel = this.getSeverityLevel(compositeScore);

    // Classification
    const classification = this.getClassification(compositeScore);

    // Aggregate factors
    const affectedServices = [...new Set(events.map(e => e.service))];
    const criticalServicesAffected = affectedServices.filter(
      s => this.criticalServices[s.toLowerCase()]
    );
    const hasSpike = eventScores.some(s => s.frequencyLevel !== 'normal');
    const maxSpikeLevel = this.getMaxSpikeLevel(eventScores);

    return {
      compositeScore,
      severityLevel,
      classification,
      eventCount: events.length,
      maxEventScore: maxScore,
      avgEventScore: Math.round(avgScore),
      countFactor: Math.round(countFactor * 100) / 100,
      factors: {
        affectedServices,
        criticalServicesAffected,
        hasSpike,
        maxSpikeLevel,
        highestSeverity: Math.max(...events.map(e => e.severity))
      }
    };
  }

  /**
   * Convert composite score to severity level (1-5)
   * @param {number} score - Composite score
   * @returns {number} Severity level
   */
  getSeverityLevel(score) {
    if (score >= 90) return 5;
    if (score >= 75) return 4;
    if (score >= 50) return 3;
    if (score >= 25) return 2;
    return 1;
  }

  /**
   * Get classification string from score
   * @param {number} score - Composite score
   * @returns {string} Classification
   */
  getClassification(score) {
    if (score >= this.config.incidentThresholds.critical) return 'critical';
    if (score >= this.config.incidentThresholds.high) return 'high';
    if (score >= this.config.incidentThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Get highest spike level from event scores
   * @param {Array} eventScores - Array of event scoring results
   * @returns {string} Highest spike level
   */
  getMaxSpikeLevel(eventScores) {
    const levels = ['normal', 'elevated', 'high', 'critical'];
    let maxIndex = 0;

    for (const score of eventScores) {
      const index = levels.indexOf(score.frequencyLevel);
      if (index > maxIndex) maxIndex = index;
    }

    return levels[maxIndex];
  }
}

module.exports = new SeverityScoring();
module.exports.SeverityScoring = SeverityScoring;
