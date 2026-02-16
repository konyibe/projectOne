const express = require('express');
const router = express.Router();
const {
  getIncidents,
  getIncidentById,
  updateIncident,
  getIncidentStats,
  getActiveIncidents
} = require('../controllers/incidentController');

// GET /api/incidents/stats - Get incident statistics
router.get('/stats', getIncidentStats);

// GET /api/incidents/active - Get active incidents
router.get('/active', getActiveIncidents);

// GET /api/incidents - Get all incidents
router.get('/', getIncidents);

// GET /api/incidents/:incidentId - Get single incident
router.get('/:incidentId', getIncidentById);

// PATCH /api/incidents/:incidentId - Update incident
router.patch('/:incidentId', updateIncident);

module.exports = router;
