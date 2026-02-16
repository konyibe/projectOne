const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  incidentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  summary: {
    type: String,
    default: '',
    trim: true
  },
  aiGeneratedSummary: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'investigating', 'resolved'],
    default: 'active',
    index: true
  },
  severityScore: {
    type: Number,
    min: 1,
    max: 5,
    default: 1,
    index: true
  },
  affectedServices: {
    type: [String],
    default: [],
    index: true
  },
  rootCause: {
    type: String,
    default: ''
  },
  resolution: {
    type: String,
    default: ''
  },
  assignedTo: {
    type: String,
    default: null
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ severityScore: -1, status: 1 });
incidentSchema.index({ affectedServices: 1, status: 1 });
incidentSchema.index({ createdAt: -1 });
incidentSchema.index({ updatedAt: -1 });

// Virtual for incident duration
incidentSchema.virtual('duration').get(function() {
  if (this.resolvedAt) {
    return this.resolvedAt - this.createdAt;
  }
  return Date.now() - this.createdAt;
});

// Ensure virtuals are included in JSON output
incidentSchema.set('toJSON', { virtuals: true });
incidentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Incident', incidentSchema);
