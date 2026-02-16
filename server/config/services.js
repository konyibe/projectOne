// Critical services configuration with severity multipliers
const criticalServices = {
  'payment-service': {
    multiplier: 2.0,
    description: 'Payment processing service',
    alertThreshold: 3
  },
  'auth-service': {
    multiplier: 1.8,
    description: 'Authentication service',
    alertThreshold: 3
  },
  'database': {
    multiplier: 2.0,
    description: 'Database service',
    alertThreshold: 2
  },
  'api-gateway': {
    multiplier: 1.5,
    description: 'API Gateway',
    alertThreshold: 3
  },
  'order-service': {
    multiplier: 1.6,
    description: 'Order processing service',
    alertThreshold: 3
  },
  'inventory-service': {
    multiplier: 1.4,
    description: 'Inventory management',
    alertThreshold: 4
  }
};

// Severity scoring configuration
const severityConfig = {
  // Base score weights for severity levels 1-5
  baseScores: {
    1: 10,   // Info
    2: 25,   // Warning
    3: 50,   // Error
    4: 75,   // Critical
    5: 100   // Fatal
  },

  // Frequency spike multipliers
  frequencyMultipliers: {
    normal: 1.0,      // No spike
    elevated: 1.3,    // Slight increase
    high: 1.6,        // Significant increase
    critical: 2.0     // Major spike
  },

  // Thresholds for spike classification
  spikeThresholds: {
    elevated: 1.5,    // 1.5x normal rate
    high: 2.5,        // 2.5x normal rate
    critical: 4.0     // 4x normal rate
  },

  // Time windows in milliseconds
  timeWindows: {
    rolling: 5 * 60 * 1000,      // 5 minutes for spike detection
    aggregation: 5 * 60 * 1000,  // 5 minutes for event aggregation
    baseline: 60 * 60 * 1000     // 1 hour for baseline calculation
  },

  // Incident severity thresholds
  incidentThresholds: {
    low: 30,
    medium: 50,
    high: 75,
    critical: 90
  }
};

module.exports = {
  criticalServices,
  severityConfig
};
