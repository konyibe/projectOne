const express = require('express');
const router = express.Router();
const os = require('os');
const mongoose = require('mongoose');
const { getMetrics, getContentType } = require('../services/metrics');
const eventQueue = require('../services/eventQueue');
const { rateLimiter } = require('../middleware/rateLimiter');
const aggregationWorker = require('../services/aggregationWorker');
const summarizationWorker = require('../services/summarizationWorker');
const aiService = require('../services/aiService');
const { getConnectionStats } = require('../websocket/wsHandler');

// @desc    Get Prometheus metrics
// @route   GET /metrics
// @access  Public
router.get('/', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', getContentType());
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to collect metrics',
      error: error.message
    });
  }
});

// @desc    Health check endpoint for load balancers
// @route   GET /health
// @access  Public
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  // Check MongoDB connection
  try {
    const mongoState = mongoose.connection.readyState;
    health.checks.mongodb = {
      status: mongoState === 1 ? 'healthy' : 'unhealthy',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoState]
    };
  } catch (error) {
    health.checks.mongodb = { status: 'unhealthy', error: error.message };
  }

  // Check event queue
  const queueStats = eventQueue.getStats();
  health.checks.eventQueue = {
    status: queueStats.queueSize < queueStats.config.maxQueueSize * 0.9 ? 'healthy' : 'degraded',
    queueSize: queueStats.queueSize,
    maxSize: queueStats.config.maxQueueSize
  };

  // Check AI service
  const aiAvailable = aiService.isAvailable();
  health.checks.aiService = {
    status: aiAvailable ? 'healthy' : 'degraded',
    available: aiAvailable
  };

  // Determine overall health
  const unhealthyChecks = Object.values(health.checks).filter(c => c.status === 'unhealthy');
  if (unhealthyChecks.length > 0) {
    health.status = 'unhealthy';
    res.status(503);
  } else {
    const degradedChecks = Object.values(health.checks).filter(c => c.status === 'degraded');
    if (degradedChecks.length > 0) {
      health.status = 'degraded';
    }
  }

  res.json(health);
});

// @desc    Detailed health check (internal)
// @route   GET /health/detailed
// @access  Public
router.get('/health/detailed', async (req, res) => {
  const wsStats = getConnectionStats();
  const queueStats = eventQueue.getStats();
  const aggStats = aggregationWorker.getStats();
  const sumStats = summarizationWorker.getStats();
  const aiMetrics = aiService.getMetrics();
  const rateLimitStats = rateLimiter.getStats();

  res.json({
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: os.loadavg(),
      nodeVersion: process.version
    },
    mongodb: {
      state: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name
    },
    websocket: wsStats,
    eventQueue: queueStats,
    workers: {
      aggregation: {
        isRunning: aggStats.isRunning,
        runs: aggStats.runs,
        lastRun: aggStats.lastRun,
        errors: aggStats.errors
      },
      summarization: {
        isRunning: sumStats.isRunning,
        runs: sumStats.runs,
        lastRun: sumStats.lastRun,
        errors: sumStats.errors
      }
    },
    aiService: {
      provider: aiMetrics.provider,
      isAvailable: aiMetrics.isAvailable,
      circuitBreaker: aiMetrics.circuitBreaker.state,
      totalCalls: aiMetrics.totalCalls,
      avgLatencyMs: aiMetrics.avgLatencyMs
    },
    rateLimit: rateLimitStats
  });
});

// @desc    Liveness probe (Kubernetes)
// @route   GET /health/live
// @access  Public
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// @desc    Readiness probe (Kubernetes)
// @route   GET /health/ready
// @access  Public
router.get('/health/ready', async (req, res) => {
  // Check if critical dependencies are ready
  const mongoReady = mongoose.connection.readyState === 1;
  const queueReady = !eventQueue.isUnderPressure();

  if (mongoReady && queueReady) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({
      status: 'not ready',
      checks: {
        mongodb: mongoReady,
        eventQueue: queueReady
      }
    });
  }
});

module.exports = router;
