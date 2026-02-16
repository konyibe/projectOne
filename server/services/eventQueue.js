/**
 * Event Queue Service with Backpressure Handling
 * Manages event ingestion with rate limiting and batching
 */

const { Event } = require('../models');
const { broadcastEvent } = require('../websocket/wsHandler');
const { recordEventIngested, setEventQueueSize, recordRejectedRequest } = require('./metrics');

class EventQueue {
  constructor(options = {}) {
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.batchSize = options.batchSize || 100;
    this.batchInterval = options.batchInterval || 1000; // 1 second
    this.wsBatchSize = options.wsBatchSize || 10;
    this.wsBatchInterval = options.wsBatchInterval || 100; // 100ms

    this.queue = [];
    this.wsBuffer = [];
    this.processing = false;
    this.batchTimer = null;
    this.wsBatchTimer = null;

    // Metrics
    this.stats = {
      enqueued: 0,
      processed: 0,
      rejected: 0,
      batches: 0
    };
  }

  /**
   * Add event to queue
   * @param {Object} eventData - Event data to queue
   * @returns {Object} Result with success/rejection status
   */
  enqueue(eventData) {
    // Check queue capacity
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.rejected++;
      recordRejectedRequest('queue_full');
      console.warn(`[EventQueue] Queue full (${this.maxQueueSize}), rejecting event`);
      return {
        success: false,
        reason: 'queue_full',
        queueSize: this.queue.length
      };
    }

    // Add to queue
    this.queue.push({
      data: eventData,
      timestamp: Date.now()
    });

    this.stats.enqueued++;
    setEventQueueSize(this.queue.length);

    // Start batch timer if not running
    if (!this.batchTimer && !this.processing) {
      this.scheduleBatch();
    }

    return {
      success: true,
      queued: true,
      queueSize: this.queue.length
    };
  }

  /**
   * Schedule batch processing
   */
  scheduleBatch() {
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchInterval);
  }

  /**
   * Process a batch of events
   */
  async processBatch() {
    if (this.processing || this.queue.length === 0) {
      this.batchTimer = null;
      return;
    }

    this.processing = true;

    try {
      // Get batch from queue
      const batch = this.queue.splice(0, this.batchSize);
      setEventQueueSize(this.queue.length);

      if (batch.length === 0) {
        this.processing = false;
        return;
      }

      // Prepare documents for bulk insert
      const documents = batch.map(item => item.data);

      // Bulk insert to MongoDB
      const startTime = Date.now();
      await Event.insertMany(documents, { ordered: false });
      const duration = Date.now() - startTime;

      this.stats.processed += batch.length;
      this.stats.batches++;

      console.log(`[EventQueue] Processed batch of ${batch.length} events in ${duration}ms`);

      // Record metrics
      documents.forEach(doc => {
        recordEventIngested(doc.service, doc.severity);
      });

      // Queue for WebSocket broadcast
      this.queueForBroadcast(documents);

    } catch (error) {
      console.error('[EventQueue] Batch processing error:', error.message);
      // Don't re-queue on error to avoid infinite loops
    } finally {
      this.processing = false;
      this.batchTimer = null;

      // Process next batch if queue has items
      if (this.queue.length > 0) {
        this.scheduleBatch();
      }
    }
  }

  /**
   * Queue events for WebSocket broadcast with batching
   * @param {Array} events - Events to broadcast
   */
  queueForBroadcast(events) {
    this.wsBuffer.push(...events);

    if (!this.wsBatchTimer) {
      this.wsBatchTimer = setTimeout(() => {
        this.broadcastBatch();
      }, this.wsBatchInterval);
    }
  }

  /**
   * Broadcast batched events to WebSocket clients
   */
  broadcastBatch() {
    const batch = this.wsBuffer.splice(0, this.wsBatchSize);

    if (batch.length > 0) {
      // Broadcast each event (or could batch into single message)
      batch.forEach(event => {
        broadcastEvent(event);
      });
    }

    this.wsBatchTimer = null;

    // Continue if more events in buffer
    if (this.wsBuffer.length > 0) {
      this.wsBatchTimer = setTimeout(() => {
        this.broadcastBatch();
      }, this.wsBatchInterval);
    }
  }

  /**
   * Process event immediately (bypass queue)
   * Used when queue is empty and low load
   * @param {Object} eventData - Event to process
   * @returns {Object} Saved event
   */
  async processImmediate(eventData) {
    const event = await Event.create(eventData);
    recordEventIngested(event.service, event.severity);
    broadcastEvent(event.toObject());
    this.stats.processed++;
    return event;
  }

  /**
   * Get current queue statistics
   * @returns {Object} Queue stats
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      wsBufferSize: this.wsBuffer.length,
      isProcessing: this.processing,
      config: {
        maxQueueSize: this.maxQueueSize,
        batchSize: this.batchSize,
        batchInterval: this.batchInterval
      }
    };
  }

  /**
   * Check if queue is under pressure
   * @returns {boolean}
   */
  isUnderPressure() {
    return this.queue.length > this.maxQueueSize * 0.8;
  }

  /**
   * Flush all queued events (for shutdown)
   */
  async flush() {
    console.log('[EventQueue] Flushing queue...');

    while (this.queue.length > 0) {
      await this.processBatch();
    }

    console.log('[EventQueue] Queue flushed');
  }

  /**
   * Clear the queue (for testing)
   */
  clear() {
    this.queue = [];
    this.wsBuffer = [];
    setEventQueueSize(0);
  }
}

// Singleton instance
const eventQueue = new EventQueue();

module.exports = eventQueue;
module.exports.EventQueue = EventQueue;
