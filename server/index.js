require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const connectDB = require('./config/db');
const routes = require('./routes');
const metricsRoutes = require('./routes/metricsRoutes');
const { notFound, errorHandler } = require('./middleware');
const { initWebSocket, getConnectionStats } = require('./websocket/wsHandler');
const aggregationWorker = require('./services/aggregationWorker');
const summarizationWorker = require('./services/summarizationWorker');
const aiService = require('./services/aiService');
const { setWsConnections } = require('./services/metrics');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api', routes);

// Metrics & Health endpoints (outside /api for Prometheus/K8s)
app.use('/metrics', metricsRoutes);
app.use('/health', metricsRoutes);

// API status endpoint
app.get('/api/status', (req, res) => {
  const wsStats = getConnectionStats();
  const aggWorkerStats = aggregationWorker.getStats();
  const sumWorkerStats = summarizationWorker.getStats();
  res.json({
    name: 'Incident Intelligence API',
    version: '1.0.0',
    status: 'running',
    websocket: {
      connections: wsStats.connections
    },
    workers: {
      aggregation: {
        isRunning: aggWorkerStats.isRunning,
        runs: aggWorkerStats.runs,
        lastRun: aggWorkerStats.lastRun
      },
      summarization: {
        isRunning: sumWorkerStats.isRunning,
        runs: sumWorkerStats.runs,
        lastRun: sumWorkerStats.lastRun,
        aiAvailable: aiService.isAvailable()
      }
    },
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      events: '/api/events',
      eventStats: '/api/events/stats',
      incidents: '/api/incidents',
      aiMetrics: '/api/ai/metrics'
    }
  });
});

// Serve React client in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// SPA catch-all — serve index.html for any non-API route
app.get('*', (req, res, next) => {
  // Let API/metrics/health 404s fall through to error handler
  if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Initialize WebSocket with metrics callback
initWebSocket(server);

// Update WebSocket metrics periodically
setInterval(() => {
  const stats = getConnectionStats();
  setWsConnections(stats.connections);
}, 5000);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`WebSocket server running on same port`);

  // Start workers
  aggregationWorker.start();
  summarizationWorker.start();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = { app, server };
