const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const summarizationWorker = require('../services/summarizationWorker');
const { ApiError } = require('../middleware/errorHandler');

// @desc    Get AI service metrics
// @route   GET /api/ai/metrics
// @access  Public
router.get('/metrics', (req, res) => {
  const metrics = summarizationWorker.getStats();

  res.status(200).json({
    success: true,
    data: metrics
  });
});

// @desc    Manually trigger summarization for an incident
// @route   POST /api/ai/summarize/:incidentId
// @access  Public
router.post('/summarize/:incidentId', async (req, res, next) => {
  try {
    const { incidentId } = req.params;

    if (!aiService.isAvailable()) {
      throw new ApiError(503, 'AI service is currently unavailable');
    }

    const result = await summarizationWorker.summarizeIncident(incidentId);

    res.status(200).json({
      success: true,
      message: 'Summary generated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get circuit breaker status
// @route   GET /api/ai/circuit-breaker
// @access  Public
router.get('/circuit-breaker', (req, res) => {
  const metrics = aiService.getMetrics();

  res.status(200).json({
    success: true,
    data: {
      status: metrics.circuitBreaker.state,
      details: metrics.circuitBreaker
    }
  });
});

// @desc    Reset circuit breaker (admin action)
// @route   POST /api/ai/circuit-breaker/reset
// @access  Public (should be protected in production)
router.post('/circuit-breaker/reset', (req, res) => {
  aiService.circuitBreaker.reset();

  res.status(200).json({
    success: true,
    message: 'Circuit breaker reset successfully',
    data: aiService.circuitBreaker.getStatus()
  });
});

// @desc    Check AI service health
// @route   GET /api/ai/health
// @access  Public
router.get('/health', (req, res) => {
  const isAvailable = aiService.isAvailable();
  const metrics = aiService.getMetrics();

  res.status(isAvailable ? 200 : 503).json({
    success: isAvailable,
    status: isAvailable ? 'healthy' : 'unavailable',
    provider: metrics.provider,
    circuitBreaker: metrics.circuitBreaker.state,
    stats: {
      totalCalls: metrics.totalCalls,
      successRate: metrics.totalCalls > 0
        ? ((metrics.successfulCalls / metrics.totalCalls) * 100).toFixed(1) + '%'
        : 'N/A',
      avgLatencyMs: metrics.avgLatencyMs
    }
  });
});

module.exports = router;
