/**
 * Prometheus Metrics Service
 * Collects and exposes application metrics
 */

const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

// Counter: Total events ingested
const eventsIngestedTotal = new client.Counter({
  name: 'incident_events_ingested_total',
  help: 'Total number of events ingested',
  labelNames: ['service', 'severity'],
  registers: [register]
});

// Gauge: Events per service (recent window)
const eventsPerService = new client.Gauge({
  name: 'incident_events_per_service',
  help: 'Number of events per service in recent window',
  labelNames: ['service'],
  registers: [register]
});

// Gauge: Active incidents
const activeIncidents = new client.Gauge({
  name: 'incident_active_count',
  help: 'Number of active incidents',
  labelNames: ['severity', 'status'],
  registers: [register]
});

// Histogram: AI summarization latency
const aiSummarizationLatency = new client.Histogram({
  name: 'incident_ai_summarization_latency_seconds',
  help: 'AI summarization latency in seconds',
  labelNames: ['provider', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

// Gauge: WebSocket connections
const wsConnectionsGauge = new client.Gauge({
  name: 'incident_websocket_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

// Histogram: MongoDB query latency
const mongoQueryLatency = new client.Histogram({
  name: 'incident_mongodb_query_latency_seconds',
  help: 'MongoDB query latency in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

// Counter: API requests
const apiRequestsTotal = new client.Counter({
  name: 'incident_api_requests_total',
  help: 'Total API requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

// Histogram: API request duration
const apiRequestDuration = new client.Histogram({
  name: 'incident_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

// Gauge: Event queue size (backpressure)
const eventQueueSize = new client.Gauge({
  name: 'incident_event_queue_size',
  help: 'Current size of the event ingestion queue',
  registers: [register]
});

// Counter: Rejected requests (backpressure)
const rejectedRequests = new client.Counter({
  name: 'incident_rejected_requests_total',
  help: 'Total requests rejected due to backpressure',
  labelNames: ['reason'],
  registers: [register]
});

// Counter: AI fallbacks
const aiFallbacksTotal = new client.Counter({
  name: 'incident_ai_fallbacks_total',
  help: 'Total AI summarization fallbacks',
  labelNames: ['reason'],
  registers: [register]
});

// Gauge: Circuit breaker state
const circuitBreakerState = new client.Gauge({
  name: 'incident_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['name'],
  registers: [register]
});

// Helper functions

function recordEventIngested(service, severity) {
  eventsIngestedTotal.inc({ service, severity: severity.toString() });
}

function updateEventsPerService(serviceCounts) {
  // Reset all to avoid stale data
  eventsPerService.reset();
  for (const [service, count] of Object.entries(serviceCounts)) {
    eventsPerService.set({ service }, count);
  }
}

function updateActiveIncidents(incidents) {
  // Reset all to avoid stale data
  activeIncidents.reset();

  const counts = {};
  incidents.forEach((incident) => {
    const key = `${incident.severityScore}_${incident.status}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  for (const [key, count] of Object.entries(counts)) {
    const [severity, status] = key.split('_');
    activeIncidents.set({ severity, status }, count);
  }
}

function recordAiLatency(provider, status, durationSeconds) {
  aiSummarizationLatency.observe({ provider, status }, durationSeconds);
}

function setWsConnections(count) {
  wsConnectionsGauge.set(count);
}

function recordMongoLatency(operation, collection, durationSeconds) {
  mongoQueryLatency.observe({ operation, collection }, durationSeconds);
}

function recordApiRequest(method, path, status, durationSeconds) {
  apiRequestsTotal.inc({ method, path, status: status.toString() });
  apiRequestDuration.observe({ method, path }, durationSeconds);
}

function setEventQueueSize(size) {
  eventQueueSize.set(size);
}

function recordRejectedRequest(reason) {
  rejectedRequests.inc({ reason });
}

function recordAiFallback(reason) {
  aiFallbacksTotal.inc({ reason });
}

function setCircuitBreakerState(name, state) {
  const stateValue = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 }[state] ?? 0;
  circuitBreakerState.set({ name }, stateValue);
}

// Get metrics in Prometheus format
async function getMetrics() {
  return register.metrics();
}

// Get content type for metrics
function getContentType() {
  return register.contentType;
}

module.exports = {
  register,
  recordEventIngested,
  updateEventsPerService,
  updateActiveIncidents,
  recordAiLatency,
  setWsConnections,
  recordMongoLatency,
  recordApiRequest,
  setEventQueueSize,
  recordRejectedRequest,
  recordAiFallback,
  setCircuitBreakerState,
  getMetrics,
  getContentType
};
