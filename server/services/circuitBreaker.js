/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by disabling calls during outages
 */

const STATE = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, reject all calls
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 60 seconds
    this.monitorInterval = options.monitorInterval || 10000;

    this.state = STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;

    // Metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: []
    };
  }

  /**
   * Check if circuit allows the call
   * @returns {boolean}
   */
  canExecute() {
    if (this.state === STATE.CLOSED) {
      return true;
    }

    if (this.state === STATE.OPEN) {
      // Check if timeout has passed
      if (Date.now() >= this.nextAttempt) {
        this.transitionTo(STATE.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow limited calls to test
    return true;
  }

  /**
   * Record a successful call
   */
  recordSuccess() {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls++;

    if (this.state === STATE.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.transitionTo(STATE.CLOSED);
      }
    } else if (this.state === STATE.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed call
   * @param {Error} error - The error that occurred
   */
  recordFailure(error) {
    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    this.lastFailureTime = Date.now();

    if (this.state === STATE.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(STATE.OPEN);
    } else if (this.state === STATE.CLOSED) {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.transitionTo(STATE.OPEN);
      }
    }
  }

  /**
   * Record a rejected call (circuit open)
   */
  recordRejection() {
    this.metrics.totalCalls++;
    this.metrics.rejectedCalls++;
  }

  /**
   * Transition to a new state
   * @param {string} newState
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString()
    });

    // Keep only last 10 state changes
    if (this.metrics.stateChanges.length > 10) {
      this.metrics.stateChanges.shift();
    }

    console.log(`[CircuitBreaker:${this.name}] State change: ${oldState} -> ${newState}`);

    if (newState === STATE.OPEN) {
      this.nextAttempt = Date.now() + this.timeout;
      this.successes = 0;
    } else if (newState === STATE.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.nextAttempt = null;
    } else if (newState === STATE.HALF_OPEN) {
      this.successes = 0;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result of function or rejection
   */
  async execute(fn) {
    if (!this.canExecute()) {
      this.recordRejection();
      const error = new Error(`Circuit breaker [${this.name}] is OPEN`);
      error.code = 'CIRCUIT_OPEN';
      error.nextAttempt = this.nextAttempt;
      throw error;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Get current state and metrics
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    this.transitionTo(STATE.CLOSED);
    this.failures = 0;
    this.successes = 0;
    console.log(`[CircuitBreaker:${this.name}] Manually reset`);
  }

  /**
   * Force the circuit open (for testing/maintenance)
   */
  trip() {
    this.transitionTo(STATE.OPEN);
    console.log(`[CircuitBreaker:${this.name}] Manually tripped`);
  }
}

module.exports = CircuitBreaker;
module.exports.STATE = STATE;
