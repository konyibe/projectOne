const { v4: uuidv4 } = require('uuid');
const { Event, Incident } = require('../models');
const severityScoring = require('./severityScoring');
const spikeDetection = require('./spikeDetection');
const { broadcastIncident } = require('../websocket/wsHandler');
const { severityConfig } = require('../config/services');

/**
 * Event Aggregation Worker
 * Clusters events into incidents and manages severity scoring
 */
class AggregationWorker {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // 30 seconds
    this.windowSize = options.windowSize || severityConfig.timeWindows.aggregation;
    this.isRunning = false;
    this.timer = null;
    this.stats = {
      runs: 0,
      eventsProcessed: 0,
      incidentsCreated: 0,
      incidentsUpdated: 0,
      errors: 0,
      lastRun: null
    };
  }

  /**
   * Start the aggregation worker
   */
  start() {
    if (this.isRunning) {
      console.log('Aggregation worker is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Aggregation worker started (interval: ${this.interval}ms)`);

    // Run immediately, then on interval
    this.run();
    this.timer = setInterval(() => this.run(), this.interval);
  }

  /**
   * Stop the aggregation worker
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('Aggregation worker stopped');
  }

  /**
   * Main aggregation run
   */
  async run() {
    const runStart = Date.now();
    console.log(`[Aggregation] Starting run #${this.stats.runs + 1}`);

    try {
      // Step 1: Query recent events
      const events = await this.getRecentEvents();

      if (events.length === 0) {
        console.log('[Aggregation] No recent events to process');
        this.stats.runs++;
        this.stats.lastRun = new Date();
        return;
      }

      console.log(`[Aggregation] Found ${events.length} events to process`);

      // Step 2: Update spike detection statistics
      const serviceCounts = this.countByService(events);
      await spikeDetection.recordCounts(serviceCounts);

      // Step 3: Check for spikes
      const spikeData = await spikeDetection.checkSpikes(serviceCounts);

      // Step 4: Cluster events
      const clusters = this.clusterEvents(events);
      console.log(`[Aggregation] Created ${clusters.length} event clusters`);

      // Step 5: Process each cluster
      for (const cluster of clusters) {
        await this.processCluster(cluster, spikeData);
      }

      // Step 6: Cleanup old spike detection data periodically
      if (this.stats.runs % 10 === 0) {
        await spikeDetection.cleanup();
      }

      this.stats.runs++;
      this.stats.eventsProcessed += events.length;
      this.stats.lastRun = new Date();

      const duration = Date.now() - runStart;
      console.log(`[Aggregation] Run completed in ${duration}ms`);

    } catch (error) {
      this.stats.errors++;
      console.error('[Aggregation] Error during run:', error.message);
    }
  }

  /**
   * Query events from the last window
   * @returns {Array} Array of events
   */
  async getRecentEvents() {
    const windowStart = new Date(Date.now() - this.windowSize);

    return Event.find({
      timestamp: { $gte: windowStart },
      incidentId: null // Only unprocessed events
    })
      .sort({ timestamp: -1 })
      .lean();
  }

  /**
   * Count events by service
   * @param {Array} events - Array of events
   * @returns {Object} Service count map
   */
  countByService(events) {
    const counts = {};
    for (const event of events) {
      counts[event.service] = (counts[event.service] || 0) + 1;
    }
    return counts;
  }

  /**
   * Cluster events by service and error type
   * @param {Array} events - Array of events
   * @returns {Array} Array of clusters
   */
  clusterEvents(events) {
    const clusterMap = new Map();

    for (const event of events) {
      // Create cluster key from service + error type/category
      const errorType = this.extractErrorType(event);
      const clusterKey = `${event.service}:${errorType}`;

      if (!clusterMap.has(clusterKey)) {
        clusterMap.set(clusterKey, {
          key: clusterKey,
          service: event.service,
          errorType,
          events: [],
          severities: []
        });
      }

      const cluster = clusterMap.get(clusterKey);
      cluster.events.push(event);
      cluster.severities.push(event.severity);
    }

    return Array.from(clusterMap.values());
  }

  /**
   * Extract error type from event metadata
   * @param {Object} event - Event object
   * @returns {string} Error type
   */
  extractErrorType(event) {
    const metadata = event.metadata || {};

    // Try common error type fields
    return (
      metadata.errorType ||
      metadata.error_type ||
      metadata.type ||
      metadata.category ||
      metadata.errorCode ||
      metadata.error_code ||
      `severity_${event.severity}`
    );
  }

  /**
   * Process a single cluster - create or update incident
   * @param {Object} cluster - Event cluster
   * @param {Object} spikeData - Spike detection data
   */
  async processCluster(cluster, spikeData) {
    try {
      // Calculate severity score for this cluster
      const scoring = severityScoring.scoreIncident(cluster.events, { spikeData });

      // Check for existing active incident for this cluster
      const existingIncident = await Incident.findOne({
        affectedServices: cluster.service,
        status: { $in: ['active', 'investigating'] },
        createdAt: { $gte: new Date(Date.now() - this.windowSize * 2) }
      });

      if (existingIncident) {
        await this.updateIncident(existingIncident, cluster, scoring, spikeData);
      } else {
        await this.createIncident(cluster, scoring, spikeData);
      }
    } catch (error) {
      console.error(`[Aggregation] Error processing cluster ${cluster.key}:`, error.message);
    }
  }

  /**
   * Create a new incident from cluster
   * @param {Object} cluster - Event cluster
   * @param {Object} scoring - Severity scoring result
   * @param {Object} spikeData - Spike detection data
   */
  async createIncident(cluster, scoring, spikeData) {
    const incidentId = `inc_${uuidv4()}`;
    const eventIds = cluster.events.map(e => e._id);
    const serviceSpike = spikeData[cluster.service] || {};

    const incident = await Incident.create({
      incidentId,
      eventIds,
      summary: this.generateSummary(cluster, scoring, serviceSpike),
      status: 'active',
      severityScore: scoring.severityLevel,
      affectedServices: [cluster.service]
    });

    // Update events with incident reference
    await Event.updateMany(
      { _id: { $in: eventIds } },
      { $set: { incidentId: incident._id } }
    );

    // Broadcast new incident
    broadcastIncident(incident.toObject(), 'created');

    this.stats.incidentsCreated++;
    console.log(`[Aggregation] Created incident ${incidentId} (severity: ${scoring.severityLevel})`);
  }

  /**
   * Update existing incident with new events
   * @param {Object} incident - Existing incident
   * @param {Object} cluster - Event cluster
   * @param {Object} scoring - Severity scoring result
   * @param {Object} spikeData - Spike detection data
   */
  async updateIncident(incident, cluster, scoring, spikeData) {
    const newEventIds = cluster.events
      .filter(e => !incident.eventIds.includes(e._id))
      .map(e => e._id);

    if (newEventIds.length === 0) return;

    const serviceSpike = spikeData[cluster.service] || {};

    // Update incident
    incident.eventIds.push(...newEventIds);
    incident.severityScore = Math.max(incident.severityScore, scoring.severityLevel);
    incident.summary = this.generateSummary(cluster, scoring, serviceSpike);

    if (!incident.affectedServices.includes(cluster.service)) {
      incident.affectedServices.push(cluster.service);
    }

    await incident.save();

    // Update events with incident reference
    await Event.updateMany(
      { _id: { $in: newEventIds } },
      { $set: { incidentId: incident._id } }
    );

    // Broadcast incident update
    broadcastIncident(incident.toObject(), 'updated');

    this.stats.incidentsUpdated++;
    console.log(`[Aggregation] Updated incident ${incident.incidentId} (+${newEventIds.length} events)`);
  }

  /**
   * Generate incident summary
   * @param {Object} cluster - Event cluster
   * @param {Object} scoring - Severity scoring result
   * @param {Object} spikeData - Spike data for service
   * @returns {string} Generated summary
   */
  generateSummary(cluster, scoring, spikeData) {
    const parts = [];

    // Service and error type
    parts.push(`${cluster.events.length} ${cluster.errorType} events from ${cluster.service}`);

    // Severity classification
    parts.push(`Severity: ${scoring.classification.toUpperCase()}`);

    // Spike information
    if (spikeData.isSpike) {
      parts.push(`Spike detected: ${spikeData.deviations}σ above normal`);
    }

    // Time range
    const timestamps = cluster.events.map(e => new Date(e.timestamp));
    const oldest = new Date(Math.min(...timestamps));
    const newest = new Date(Math.max(...timestamps));
    const durationMs = newest - oldest;
    const durationMins = Math.round(durationMs / 60000);

    if (durationMins > 0) {
      parts.push(`Duration: ${durationMins} minutes`);
    }

    return parts.join('. ');
  }

  /**
   * Get worker statistics
   * @returns {Object} Worker stats
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      interval: this.interval,
      windowSize: this.windowSize
    };
  }
}

// Singleton instance
const worker = new AggregationWorker();

module.exports = worker;
module.exports.AggregationWorker = AggregationWorker;
