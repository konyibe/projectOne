/**
 * Batch Summarization Worker
 * Generates AI summaries for incidents on a scheduled basis
 */

const { Incident, Event } = require('../models');
const aiService = require('./aiService');
const { broadcastIncident } = require('../websocket/wsHandler');

class SummarizationWorker {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // 30 seconds
    this.batchSize = options.batchSize || 5;   // 5 incidents per batch
    this.maxRetries = options.maxRetries || 2;
    this.isRunning = false;
    this.timer = null;

    // Metrics
    this.metrics = {
      runs: 0,
      incidentsProcessed: 0,
      summariesGenerated: 0,
      fallbacksUsed: 0,
      errors: 0,
      totalLatencyMs: 0,
      totalTokensUsed: 0,
      lastRun: null,
      lastError: null
    };
  }

  /**
   * Start the summarization worker
   */
  start() {
    if (this.isRunning) {
      console.log('[SummarizationWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[SummarizationWorker] Started (interval: ${this.interval}ms, batch: ${this.batchSize})`);

    // Run immediately, then on interval
    this.run();
    this.timer = setInterval(() => this.run(), this.interval);
  }

  /**
   * Stop the summarization worker
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[SummarizationWorker] Stopped');
  }

  /**
   * Main worker run
   */
  async run() {
    const runStart = Date.now();
    console.log(`[SummarizationWorker] Starting run #${this.metrics.runs + 1}`);

    try {
      // Check if AI service is available
      if (!aiService.isAvailable()) {
        console.log('[SummarizationWorker] AI service unavailable, skipping run');
        this.metrics.runs++;
        this.metrics.lastRun = new Date();
        return;
      }

      // Query incidents missing summaries
      const incidents = await this.getIncidentsNeedingSummary();

      if (incidents.length === 0) {
        console.log('[SummarizationWorker] No incidents need summaries');
        this.metrics.runs++;
        this.metrics.lastRun = new Date();
        return;
      }

      console.log(`[SummarizationWorker] Found ${incidents.length} incidents to process`);

      // Process in batches
      for (let i = 0; i < incidents.length; i += this.batchSize) {
        const batch = incidents.slice(i, i + this.batchSize);
        await this.processBatch(batch);
      }

      this.metrics.runs++;
      this.metrics.lastRun = new Date();

      const duration = Date.now() - runStart;
      console.log(`[SummarizationWorker] Run completed in ${duration}ms`);

    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = {
        message: error.message,
        timestamp: new Date()
      };
      console.error('[SummarizationWorker] Error during run:', error.message);
    }
  }

  /**
   * Query incidents that need summaries
   * @returns {Promise<Array>}
   */
  async getIncidentsNeedingSummary() {
    // Find active incidents with empty or placeholder summaries
    const incidents = await Incident.find({
      $or: [
        { aiGeneratedSummary: { $exists: false } },
        { aiGeneratedSummary: '' },
        { aiGeneratedSummary: null }
      ],
      status: { $in: ['active', 'investigating'] },
      // Only process recent incidents (last 24 hours)
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({ severityScore: -1, createdAt: -1 })
      .limit(this.batchSize * 3) // Get extra in case some fail
      .lean();

    return incidents;
  }

  /**
   * Process a batch of incidents
   * @param {Array} incidents - Array of incident documents
   */
  async processBatch(incidents) {
    try {
      // Fetch events for each incident
      const incidentBatch = await Promise.all(
        incidents.map(async (incident) => {
          const events = await Event.find({
            _id: { $in: incident.eventIds }
          })
            .sort({ timestamp: -1 })
            .limit(50) // Limit events to control token usage
            .lean();

          return { incident, events };
        })
      );

      // Filter out incidents with no events
      const validBatch = incidentBatch.filter(b => b.events.length > 0);

      if (validBatch.length === 0) {
        console.log('[SummarizationWorker] No valid incidents in batch');
        return;
      }

      // Call AI service for batch summarization
      const result = await aiService.summarizeBatch(validBatch);

      // Update incidents with summaries
      for (const { incident } of validBatch) {
        const summaryData = result.summaries[incident.incidentId];

        if (summaryData) {
          await this.updateIncidentSummary(incident, summaryData);
          this.metrics.incidentsProcessed++;

          if (summaryData.success) {
            this.metrics.summariesGenerated++;
          } else {
            this.metrics.fallbacksUsed++;
          }
        }
      }

      // Track metrics
      if (result.metadata) {
        if (result.metadata.latencyMs) {
          this.metrics.totalLatencyMs += result.metadata.latencyMs;
        }
        if (result.metadata.tokenUsage) {
          this.metrics.totalTokensUsed +=
            (result.metadata.tokenUsage.input || 0) +
            (result.metadata.tokenUsage.output || 0);
        }
      }

      console.log(`[SummarizationWorker] Processed ${validBatch.length} incidents`);

    } catch (error) {
      console.error('[SummarizationWorker] Batch processing error:', error.message);
      throw error;
    }
  }

  /**
   * Update incident with AI-generated summary
   * @param {Object} incident - Original incident
   * @param {Object} summaryData - AI summary data
   */
  async updateIncidentSummary(incident, summaryData) {
    try {
      const updateData = {
        aiGeneratedSummary: summaryData.summary,
        summary: summaryData.summary // Also update display summary
      };

      // Update root cause if provided
      if (summaryData.rootCause && summaryData.rootCause !== 'Unable to determine') {
        updateData.rootCause = summaryData.rootCause;
      }

      // Store suggested actions in metadata or a dedicated field
      const updatedIncident = await Incident.findByIdAndUpdate(
        incident._id,
        {
          $set: updateData,
          $push: {
            // Store AI analysis metadata (if you add this field to schema)
          }
        },
        { new: true }
      );

      if (updatedIncident) {
        // Broadcast update
        broadcastIncident(
          {
            ...updatedIncident.toObject(),
            suggestedActions: summaryData.suggestedActions
          },
          'summary_updated'
        );
      }

      console.log(`[SummarizationWorker] Updated summary for ${incident.incidentId}`);

    } catch (error) {
      console.error(`[SummarizationWorker] Failed to update ${incident.incidentId}:`, error.message);
    }
  }

  /**
   * Manually trigger summarization for a specific incident
   * @param {string} incidentId - Incident ID
   * @returns {Promise<Object>}
   */
  async summarizeIncident(incidentId) {
    const incident = await Incident.findOne({ incidentId }).lean();

    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const events = await Event.find({
      _id: { $in: incident.eventIds }
    })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    if (events.length === 0) {
      throw new Error(`No events found for incident: ${incidentId}`);
    }

    const result = await aiService.summarizeIncident(incident, events);

    // Update incident
    await this.updateIncidentSummary(incident, result);

    return result;
  }

  /**
   * Get worker statistics
   * @returns {Object}
   */
  getStats() {
    const avgLatency = this.metrics.summariesGenerated > 0
      ? Math.round(this.metrics.totalLatencyMs / this.metrics.summariesGenerated)
      : 0;

    return {
      ...this.metrics,
      avgLatencyMs: avgLatency,
      isRunning: this.isRunning,
      interval: this.interval,
      batchSize: this.batchSize,
      aiService: aiService.getMetrics()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      runs: 0,
      incidentsProcessed: 0,
      summariesGenerated: 0,
      fallbacksUsed: 0,
      errors: 0,
      totalLatencyMs: 0,
      totalTokensUsed: 0,
      lastRun: null,
      lastError: null
    };
  }
}

// Singleton instance
const worker = new SummarizationWorker();

module.exports = worker;
module.exports.SummarizationWorker = SummarizationWorker;
