/**
 * PII Redaction Service
 * Redacts personally identifiable information before sending to AI
 */

const patterns = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // IP addresses (IPv4)
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  // IP addresses (IPv6)
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,

  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,

  // Social Security Numbers
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  // Credit card numbers
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // AWS Access Keys
  awsKey: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,

  // Generic API keys (long alphanumeric strings)
  apiKey: /\b(?:api[_-]?key|apikey|token|secret)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,

  // Bearer tokens
  bearerToken: /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,

  // JWT tokens
  jwt: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

  // Names (common patterns - limited accuracy)
  // This catches "Name: John Doe" or "user: jane.doe" patterns
  namedValues: /\b(?:name|user|username|author|owner|assigned)['":\s]*[=:]\s*['"]?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)['"]?/gi
};

const replacements = {
  email: '[REDACTED_EMAIL]',
  ipv4: '[REDACTED_IP]',
  ipv6: '[REDACTED_IPV6]',
  phone: '[REDACTED_PHONE]',
  ssn: '[REDACTED_SSN]',
  creditCard: '[REDACTED_CC]',
  awsKey: '[REDACTED_AWS_KEY]',
  apiKey: '[REDACTED_API_KEY]',
  bearerToken: '[REDACTED_TOKEN]',
  jwt: '[REDACTED_JWT]',
  namedValues: '[REDACTED_NAME]'
};

/**
 * Redact PII from a string
 * @param {string} text - Text to redact
 * @param {Object} options - Redaction options
 * @returns {Object} Redacted text and redaction stats
 */
function redactString(text, options = {}) {
  if (typeof text !== 'string') return { text, redactions: {} };

  const { patterns: customPatterns = patterns } = options;
  let redactedText = text;
  const redactions = {};

  for (const [type, pattern] of Object.entries(customPatterns)) {
    const matches = redactedText.match(pattern);
    if (matches && matches.length > 0) {
      redactions[type] = matches.length;
      redactedText = redactedText.replace(pattern, replacements[type] || `[REDACTED_${type.toUpperCase()}]`);
    }
  }

  return {
    text: redactedText,
    redactions,
    hasRedactions: Object.keys(redactions).length > 0
  };
}

/**
 * Recursively redact PII from an object
 * @param {*} obj - Object to redact
 * @param {Object} options - Redaction options
 * @returns {Object} Redacted object and stats
 */
function redactObject(obj, options = {}) {
  const stats = {
    fieldsProcessed: 0,
    fieldsRedacted: 0,
    redactionsByType: {}
  };

  function processValue(value, path = '') {
    stats.fieldsProcessed++;

    if (typeof value === 'string') {
      const result = redactString(value, options);
      if (result.hasRedactions) {
        stats.fieldsRedacted++;
        for (const [type, count] of Object.entries(result.redactions)) {
          stats.redactionsByType[type] = (stats.redactionsByType[type] || 0) + count;
        }
      }
      return result.text;
    }

    if (Array.isArray(value)) {
      return value.map((item, i) => processValue(item, `${path}[${i}]`));
    }

    if (value !== null && typeof value === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = processValue(val, `${path}.${key}`);
      }
      return result;
    }

    return value;
  }

  const redactedObj = processValue(obj);

  return {
    data: redactedObj,
    stats
  };
}

/**
 * Redact events for AI processing
 * @param {Array} events - Array of events
 * @returns {Object} Redacted events and stats
 */
function redactEvents(events) {
  if (!Array.isArray(events)) {
    return { events: [], stats: { total: 0 } };
  }

  const results = events.map(event => {
    // Create a copy with only necessary fields
    const sanitizedEvent = {
      eventId: event.eventId,
      service: event.service,
      severity: event.severity,
      timestamp: event.timestamp,
      tags: event.tags || []
    };

    // Redact metadata
    if (event.metadata) {
      const { data: redactedMetadata, stats } = redactObject(event.metadata);
      sanitizedEvent.metadata = redactedMetadata;
      return { event: sanitizedEvent, stats };
    }

    return { event: sanitizedEvent, stats: { fieldsProcessed: 0, fieldsRedacted: 0 } };
  });

  const totalStats = {
    eventsProcessed: events.length,
    fieldsRedacted: results.reduce((sum, r) => sum + (r.stats.fieldsRedacted || 0), 0),
    redactionsByType: {}
  };

  results.forEach(r => {
    if (r.stats.redactionsByType) {
      for (const [type, count] of Object.entries(r.stats.redactionsByType)) {
        totalStats.redactionsByType[type] = (totalStats.redactionsByType[type] || 0) + count;
      }
    }
  });

  return {
    events: results.map(r => r.event),
    stats: totalStats
  };
}

module.exports = {
  redactString,
  redactObject,
  redactEvents,
  patterns,
  replacements
};
