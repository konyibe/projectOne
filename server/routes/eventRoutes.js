const express = require('express');
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEventById,
  getEventStats
} = require('../controllers/eventController');
const { eventValidationRules, validate } = require('../middleware/validators');

// GET /api/events/stats - Get event statistics (must be before /:eventId)
router.get('/stats', getEventStats);

// POST /api/events - Create a new event
router.post('/', eventValidationRules, validate, createEvent);

// GET /api/events - Get all events with filtering
router.get('/', getEvents);

// GET /api/events/:eventId - Get single event
router.get('/:eventId', getEventById);

module.exports = router;
