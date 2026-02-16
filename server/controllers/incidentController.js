const { Incident, Event } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { broadcastIncident } = require('../websocket/wsHandler');

// @desc    Get all incidents with filtering and pagination
// @route   GET /api/incidents
// @access  Public
const getIncidents = async (req, res, next) => {
  try {
    const {
      status,
      minSeverity,
      service,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (minSeverity) {
      query.severityScore = { $gte: parseInt(minSeverity) };
    }

    if (service) {
      query.affectedServices = service;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [incidents, total] = await Promise.all([
      Incident.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Incident.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: incidents,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single incident by ID
// @route   GET /api/incidents/:incidentId
// @access  Public
const getIncidentById = async (req, res, next) => {
  try {
    const { incidentId } = req.params;

    const incident = await Incident.findOne({ incidentId })
      .populate('eventIds')
      .lean();

    if (!incident) {
      throw new ApiError(404, `Incident not found: ${incidentId}`);
    }

    res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update incident status
// @route   PATCH /api/incidents/:incidentId
// @access  Public
const updateIncident = async (req, res, next) => {
  try {
    const { incidentId } = req.params;
    const { status, assignedTo, resolution, rootCause } = req.body;

    const incident = await Incident.findOne({ incidentId });

    if (!incident) {
      throw new ApiError(404, `Incident not found: ${incidentId}`);
    }

    // Update allowed fields
    if (status) {
      incident.status = status;
      if (status === 'resolved' && !incident.resolvedAt) {
        incident.resolvedAt = new Date();
      }
    }

    if (assignedTo !== undefined) {
      incident.assignedTo = assignedTo;
      if (assignedTo && !incident.acknowledgedAt) {
        incident.acknowledgedAt = new Date();
      }
    }

    if (resolution !== undefined) {
      incident.resolution = resolution;
    }

    if (rootCause !== undefined) {
      incident.rootCause = rootCause;
    }

    await incident.save();

    // Broadcast update
    broadcastIncident(incident.toObject(), 'updated');

    res.status(200).json({
      success: true,
      message: 'Incident updated successfully',
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get incident statistics
// @route   GET /api/incidents/stats
// @access  Public
const getIncidentStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const [summary, byStatus, bySeverity, byService] = await Promise.all([
      // Overall summary
      Incident.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
            avgSeverity: { $avg: '$severityScore' },
            totalEvents: { $sum: { $size: '$eventIds' } }
          }
        }
      ]),

      // By status
      Incident.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // By severity
      Incident.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severityScore', count: { $sum: 1 } } },
        { $sort: { _id: -1 } }
      ]),

      // By affected service
      Incident.aggregate([
        { $match: matchStage },
        { $unwind: '$affectedServices' },
        { $group: { _id: '$affectedServices', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          total: 0,
          active: 0,
          resolved: 0,
          avgSeverity: 0,
          totalEvents: 0
        },
        byStatus,
        bySeverity,
        byService
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active incidents
// @route   GET /api/incidents/active
// @access  Public
const getActiveIncidents = async (req, res, next) => {
  try {
    const incidents = await Incident.find({
      status: { $in: ['active', 'investigating'] }
    })
      .sort({ severityScore: -1, createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: incidents,
      count: incidents.length
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getIncidents,
  getIncidentById,
  updateIncident,
  getIncidentStats,
  getActiveIncidents
};
