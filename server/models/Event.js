const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  service: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    index: true
  },
  severity: {
    type: Number,
    required: [true, 'Severity is required'],
    min: [1, 'Severity must be at least 1'],
    max: [5, 'Severity cannot exceed 5'],
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Metadata is required'],
    default: {}
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  tags: {
    type: [String],
    default: [],
    index: true
  },
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    default: null,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
eventSchema.index({ timestamp: -1, service: 1 });
eventSchema.index({ timestamp: -1, severity: -1 });
eventSchema.index({ service: 1, severity: 1, timestamp: -1 });
eventSchema.index({ tags: 1, timestamp: -1 });


module.exports = mongoose.model('Event', eventSchema);
