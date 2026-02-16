/**
 * Backpressure Middleware
 * Implements graceful degradation under load
 */

const eventQueue = require('../services/eventQueue');
const aiService = require('../services/aiService');
const { recordRejectedRequest } = require('../services/metrics');

// Load thresholds
const THRESHOLDS = {
  queueWarning: 0.7,      // 70% queue capacity
  queueCritical: 0.9,     // 90% queue capacity
  skipAiThreshold: 0.8,   // Skip AI above 80% capacity
};

/**
 * Check system load and determine degradation level
 * @returns {Object} Load status
 */
function getLoadStatus() {
  const queueStats = eventQueue.getStats();
  const queueUtilization = queueStats.queueSize / queueStats.config.maxQueueSize;

  let level = 'normal';
  let skipAi = false;
  let acceptRequests = true;

  if (queueUtilization >= THRESHOLDS.queueCritical) {
    level = 'critical';
    skipAi = true;
    acceptRequests = false;
  } else if (queueUtilization >= THRESHOLDS.queueWarning) {
    level = 'warning';
    skipAi = queueUtilization >= THRESHOLDS.skipAiThreshold;
    acceptRequests = true;
  }

  return {
    level,
    queueUtilization: Math.round(queueUtilization * 100),
    skipAi,
    acceptRequests,
    queueSize: queueStats.queueSize,
    maxQueueSize: queueStats.config.maxQueueSize
  };
}

/**
 * Backpressure middleware for event ingestion
 */
const backpressureMiddleware = (req, res, next) => {
  const status = getLoadStatus();

  // Add load status to request for downstream handlers
  req.loadStatus = status;

  // Set response headers
  res.set({
    'X-Load-Level': status.level,
    'X-Queue-Utilization': `${status.queueUtilization}%`
  });

  // Reject if at critical capacity
  if (!status.acceptRequests) {
    recordRejectedRequest('backpressure');
    console.warn(`[Backpressure] Rejecting request - queue at ${status.queueUtilization}%`);

    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable due to high load',
      retryAfter: 5,
      loadStatus: status.level
    });
  }

  // Log warning at high utilization
  if (status.level === 'warning') {
    console.warn(`[Backpressure] High load - queue at ${status.queueUtilization}%`);
  }

  next();
};

/**
 * Check if AI should be skipped due to load
 * @returns {boolean}
 */
function shouldSkipAi() {
  const status = getLoadStatus();
  return status.skipAi || !aiService.isAvailable();
}

/**
 * Graceful degradation wrapper for AI calls
 * @param {Function} aiCall - AI function to call
 * @param {Function} fallback - Fallback function
 * @returns {Promise}
 */
async function withGracefulDegradation(aiCall, fallback) {
  if (shouldSkipAi()) {
    console.log('[Backpressure] Skipping AI call due to load or unavailability');
    return fallback();
  }

  try {
    return await aiCall();
  } catch (error) {
    console.error('[Backpressure] AI call failed, using fallback:', error.message);
    return fallback();
  }
}

module.exports = {
  getLoadStatus,
  backpressureMiddleware,
  shouldSkipAi,
  withGracefulDegradation,
  THRESHOLDS
};
