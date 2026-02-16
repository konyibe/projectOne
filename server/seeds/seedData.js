require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const dns = require('dns');
const { v4: uuidv4 } = require('uuid');

dns.setDefaultResultOrder('ipv4first');

const Event = require('../models/Event');
const Incident = require('../models/Incident');

const services = [
  'payment-service',
  'auth-service',
  'order-service',
  'notification-service',
  'inventory-service',
  'api-gateway',
  'search-service',
  'user-service'
];

function randomDate(hoursBack) {
  const now = Date.now();
  return new Date(now - Math.random() * hoursBack * 60 * 60 * 1000);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const eventTemplates = [
  { service: 'payment-service', severity: 5, errorType: 'TransactionFailure', message: 'Payment gateway returning 503 - Stripe API degraded', tags: ['payment', 'gateway', 'critical'] },
  { service: 'payment-service', severity: 4, errorType: 'ConnectionTimeout', message: 'Database connection pool exhausted', tags: ['database', 'timeout'] },
  { service: 'payment-service', severity: 4, errorType: 'ConnectionTimeout', message: 'Redis cache unreachable, falling back to DB', tags: ['cache', 'redis', 'timeout'] },
  { service: 'payment-service', severity: 3, errorType: 'HighLatency', message: 'Payment processing latency exceeded 3s threshold', tags: ['latency', 'performance'] },
  { service: 'auth-service', severity: 5, errorType: 'AuthFailure', message: 'OAuth token validation failing - upstream provider unreachable', tags: ['authentication', 'critical'] },
  { service: 'auth-service', severity: 5, errorType: 'AuthFailure', message: 'JWT signing key rotation failed - all new tokens invalid', tags: ['authentication', 'jwt', 'critical'] },
  { service: 'auth-service', severity: 4, errorType: 'BruteForce', message: 'Abnormal login attempt spike from IP range 203.0.113.0/24', tags: ['security', 'brute-force'] },
  { service: 'auth-service', severity: 3, errorType: 'SessionExpiry', message: 'Session store TTL mismatch causing premature logouts', tags: ['session', 'configuration'] },
  { service: 'order-service', severity: 4, errorType: 'DeadlockDetected', message: 'Database deadlock on orders table - 15 transactions rolled back', tags: ['database', 'deadlock'] },
  { service: 'order-service', severity: 3, errorType: 'LatencySpike', message: 'Order processing latency exceeded 5s threshold', tags: ['latency', 'performance'] },
  { service: 'order-service', severity: 4, errorType: 'QueueOverflow', message: 'Order processing queue at 95% capacity - backpressure applied', tags: ['queue', 'capacity'] },
  { service: 'order-service', severity: 2, errorType: 'ValidationError', message: 'Increased order validation failures - missing shipping address', tags: ['validation', 'data-quality'] },
  { service: 'notification-service', severity: 2, errorType: 'QueueBacklog', message: 'Email notification queue backlog exceeding 10k messages', tags: ['queue', 'email'] },
  { service: 'notification-service', severity: 3, errorType: 'DeliveryFailure', message: 'SMS provider returning 429 rate limit - 30% messages delayed', tags: ['sms', 'rate-limit'] },
  { service: 'notification-service', severity: 1, errorType: 'TemplateError', message: 'Push notification template rendering failure for locale fr-FR', tags: ['template', 'i18n'] },
  { service: 'inventory-service', severity: 3, errorType: 'SyncFailure', message: 'Inventory sync with warehouse API failed - stale stock data', tags: ['sync', 'inventory'] },
  { service: 'inventory-service', severity: 4, errorType: 'StockMismatch', message: 'Critical stock mismatch detected - 47 SKUs showing negative inventory', tags: ['inventory', 'data-integrity'] },
  { service: 'inventory-service', severity: 2, errorType: 'CacheStale', message: 'Inventory cache invalidation lag exceeding 60s threshold', tags: ['cache', 'staleness'] },
  { service: 'api-gateway', severity: 4, errorType: 'RateLimitExceeded', message: 'Rate limiter triggered - 429 responses spiking across /api/v2 endpoints', tags: ['rate-limit', 'gateway'] },
  { service: 'api-gateway', severity: 5, errorType: 'CircuitBreakerOpen', message: 'Circuit breaker OPEN for downstream payment-service - all requests failing', tags: ['circuit-breaker', 'critical'] },
  { service: 'api-gateway', severity: 3, errorType: 'SSLError', message: 'TLS handshake failures increasing - certificate chain validation issue', tags: ['ssl', 'security'] },
  { service: 'search-service', severity: 3, errorType: 'IndexCorruption', message: 'Elasticsearch index health yellow - 2 shards unassigned', tags: ['elasticsearch', 'index'] },
  { service: 'search-service', severity: 4, errorType: 'QueryTimeout', message: 'Search queries timing out - average response time 12s', tags: ['performance', 'timeout'] },
  { service: 'search-service', severity: 2, errorType: 'ReindexDelay', message: 'Product reindex job lagging 45 minutes behind schedule', tags: ['reindex', 'delay'] },
  { service: 'user-service', severity: 3, errorType: 'ProfileLoadError', message: 'User profile endpoint returning partial data - preferences cache miss', tags: ['cache', 'degraded'] },
  { service: 'user-service', severity: 4, errorType: 'DataCorruption', message: 'User records with duplicate email addresses detected in batch import', tags: ['data-integrity', 'import'] },
  { service: 'user-service', severity: 2, errorType: 'MigrationWarning', message: 'Schema migration v42 running slow - 2M records remaining', tags: ['migration', 'performance'] },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4
    });
    console.log('Connected to MongoDB');

    const existingEvents = await Event.countDocuments();
    if (existingEvents > 0) {
      console.log(`Database already has ${existingEvents} events. Skipping seed.`);
      console.log('To reseed, clear the database first or run with: FORCE_SEED=1 npm run seed');
      if (!process.env.FORCE_SEED) {
        await mongoose.disconnect();
        return;
      }
    }

    console.log('Seeding database with sample data...');

    // Create 50 events spread across the last 24 hours
    const events = [];
    for (let i = 0; i < 50; i++) {
      const template = pick(eventTemplates);
      events.push({
        eventId: `evt_${uuidv4()}`,
        service: template.service,
        severity: template.severity,
        timestamp: randomDate(24),
        metadata: {
          errorType: template.errorType,
          message: template.message,
          requestId: `req-${uuidv4().slice(0, 8)}`
        },
        tags: template.tags
      });
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    const insertedEvents = await Event.insertMany(events);
    console.log(`Inserted ${insertedEvents.length} events`);

    // Create incidents by grouping related events
    const incidentGroups = {
      'payment-service': { name: 'Payment System Degradation', services: ['payment-service'], severity: 5 },
      'auth-service': { name: 'Authentication Service Outage', services: ['auth-service'], severity: 5 },
      'order-service': { name: 'Order Processing Slowdown', services: ['order-service'], severity: 4 },
      'api-gateway': { name: 'API Gateway Rate Limiting Incident', services: ['api-gateway'], severity: 4 },
      'search-service': { name: 'Search Infrastructure Degradation', services: ['search-service'], severity: 3 },
    };

    const incidents = [];
    for (const [service, config] of Object.entries(incidentGroups)) {
      const relatedEvents = insertedEvents.filter(e => e.service === service);
      if (relatedEvents.length === 0) continue;

      const incident = await Incident.create({
        incidentId: `inc_${uuidv4()}`,
        eventIds: relatedEvents.map(e => e._id),
        summary: config.name,
        aiGeneratedSummary: '',
        status: service === 'search-service' ? 'resolved' : 'active',
        severityScore: config.severity,
        affectedServices: config.services,
        rootCause: '',
        resolution: service === 'search-service' ? 'Elasticsearch shards rebalanced after node restart' : '',
        resolvedAt: service === 'search-service' ? new Date() : null,
      });

      // Link events back to incident
      await Event.updateMany(
        { _id: { $in: relatedEvents.map(e => e._id) } },
        { $set: { incidentId: incident._id } }
      );

      incidents.push(incident);
    }

    console.log(`Created ${incidents.length} incidents`);
    console.log('Seed complete!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seed();
