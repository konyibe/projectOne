const { v4: uuidv4 } = require('uuid');
const { Event } = require('../models');
const { broadcastEvent } = require('../websocket/wsHandler');
const { ApiError } = require('../middleware/errorHandler');

// @desc    Create a new event
// @route   POST /api/events
// @access  Public
const createEvent = async (req, res, next) => {
  try {
    const { service, severity, metadata, rawPayload, tags } = req.body;

    // Generate unique event ID and timestamp
    const eventId = `evt_${uuidv4()}`;
    const timestamp = new Date();

    // Create event object
    const eventData = {
      eventId,
      service,
      severity,
      timestamp,
      metadata,
      rawPayload: rawPayload || req.body,
      tags: tags || []
    };

    // Save to MongoDB
    const event = await Event.create(eventData);

    // Broadcast to WebSocket subscribers
    broadcastEvent(event.toObject());

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all events with filtering and pagination
// @route   GET /api/events
// @access  Public
const getEvents = async (req, res, next) => {
  try {
    const {
      service,
      severity,
      minSeverity,
      maxSeverity,
      startDate,
      endDate,
      tags,
      page = 1,
      limit = 50,
      sort = '-timestamp'
    } = req.query;

    // Build query
    const query = {};

    if (service) {
      query.service = service;
    }

    if (severity) {
      query.severity = parseInt(severity);
    } else {
      if (minSeverity) query.severity = { ...query.severity, $gte: parseInt(minSeverity) };
      if (maxSeverity) query.severity = { ...query.severity, $lte: parseInt(maxSeverity) };
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      query.tags = { $in: tagArray };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Event.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: events,
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

// @desc    Get single event by ID
// @route   GET /api/events/:eventId
// @access  Public
const getEventById = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findOne({ eventId }).lean();

    if (!event) {
      throw new ApiError(404, `Event not found: ${eventId}`);
    }

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get event statistics
// @route   GET /api/events/stats
// @access  Public
const getEventStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    const stats = await Event.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          avgSeverity: { $avg: '$severity' },
          maxSeverity: { $max: '$severity' },
          services: { $addToSet: '$service' }
        }
      }
    ]);

    const severityDistribution = await Event.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const serviceDistribution = await Event.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$service',
          count: { $sum: 1 },
          avgSeverity: { $avg: '$severity' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: stats[0] || { totalEvents: 0, avgSeverity: 0, maxSeverity: 0, services: [] },
        severityDistribution,
        serviceDistribution
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  getEventStats
};
