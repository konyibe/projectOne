const express = require('express');
const router = express.Router();

const eventRoutes = require('./eventRoutes');
const incidentRoutes = require('./incidentRoutes');
const aiRoutes = require('./aiRoutes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/events', eventRoutes);
router.use('/incidents', incidentRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
