/**
 * Rate Limiting Middleware
 * Implements per-client rate limiting for event ingestion
 */

const { recordRejectedRequest } = require('../services/metrics');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 1000; // 1000 requests per window
    this.clients = new Map();
    this.cleanupInterval = null;

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get client identifier from request
   * @param {Object} req - Express request
   * @returns {string} Client identifier
   */
  getClientId(req) {
    // Use X-Forwarded-For if behind proxy, otherwise use IP
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip ||
           'unknown';
  }

  /**
   * Check if request should be allowed
   * @param {string} clientId - Client identifier
   * @returns {Object} { allowed, remaining, resetTime }
   */
  checkLimit(clientId) {
    const now = Date.now();
    let client = this.clients.get(clientId);

    // Initialize or reset if window expired
    if (!client || now > client.resetTime) {
      client = {
        count: 0,
        resetTime: now + this.windowMs
      };
      this.clients.set(clientId, client);
    }

    // Check limit
    if (client.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: client.resetTime,
        retryAfter: Math.ceil((client.resetTime - now) / 1000)
      };
    }

    // Increment and allow
    client.count++;

    return {
      allowed: true,
      remaining: this.maxRequests - client.count,
      resetTime: client.resetTime
    };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, data] of this.clients.entries()) {
        if (now > data.resetTime) {
          this.clients.delete(clientId);
        }
      }
    }, this.windowMs);
  }

  /**
   * Stop cleanup (for shutdown)
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get current statistics
   * @returns {Object}
   */
  getStats() {
    return {
      activeClients: this.clients.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter({
  windowMs: 60000,    // 1 minute
  maxRequests: 1000   // 1000 events per minute per client
});

/**
 * Rate limiting middleware
 */
const rateLimitMiddleware = (req, res, next) => {
  const clientId = rateLimiter.getClientId(req);
  const result = rateLimiter.checkLimit(clientId);

  // Set rate limit headers
  res.set({
    'X-RateLimit-Limit': rateLimiter.maxRequests,
    'X-RateLimit-Remaining': result.remaining,
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
  });

  if (!result.allowed) {
    recordRejectedRequest('rate_limit');
    res.set('Retry-After', result.retryAfter);
    return res.status(429).json({
      success: false,
      message: 'Too many requests',
      retryAfter: result.retryAfter
    });
  }

  next();
};

/**
 * Strict rate limiting for event ingestion
 */
const eventRateLimitMiddleware = (options = {}) => {
  const limiter = new RateLimiter({
    windowMs: options.windowMs || 60000,
    maxRequests: options.maxRequests || 1000
  });

  return (req, res, next) => {
    const clientId = limiter.getClientId(req);
    const result = limiter.checkLimit(clientId);

    res.set({
      'X-RateLimit-Limit': limiter.maxRequests,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
    });

    if (!result.allowed) {
      recordRejectedRequest('rate_limit');
      res.set('Retry-After', result.retryAfter);
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded for event ingestion',
        retryAfter: result.retryAfter
      });
    }

    next();
  };
};

module.exports = {
  RateLimiter,
  rateLimiter,
  rateLimitMiddleware,
  eventRateLimitMiddleware
};
