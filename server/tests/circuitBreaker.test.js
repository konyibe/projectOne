const CircuitBreaker = require('../services/circuitBreaker');
const { STATE } = require('../services/circuitBreaker');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000 // 1 second for testing
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.state).toBe(STATE.CLOSED);
    });

    it('should allow execution in CLOSED state', () => {
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('should remain CLOSED below failure threshold', () => {
      breaker.recordFailure(new Error('test'));
      breaker.recordFailure(new Error('test'));

      expect(breaker.state).toBe(STATE.CLOSED);
      expect(breaker.failures).toBe(2);
    });

    it('should transition to OPEN at failure threshold', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure(new Error('test'));
      }

      expect(breaker.state).toBe(STATE.OPEN);
    });

    it('should reject calls when OPEN', () => {
      breaker.transitionTo(STATE.OPEN);

      expect(breaker.canExecute()).toBe(false);
    });

    it('should record rejections in metrics', () => {
      breaker.transitionTo(STATE.OPEN);
      breaker.recordRejection();

      expect(breaker.metrics.rejectedCalls).toBe(1);
    });
  });

  describe('success handling', () => {
    it('should reset failure count on success', () => {
      breaker.recordFailure(new Error('test'));
      breaker.recordFailure(new Error('test'));
      breaker.recordSuccess();

      expect(breaker.failures).toBe(0);
    });

    it('should track successful calls', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.metrics.successfulCalls).toBe(2);
    });
  });

  describe('HALF_OPEN state', () => {
    it('should allow test calls in HALF_OPEN', () => {
      breaker.transitionTo(STATE.HALF_OPEN);

      expect(breaker.canExecute()).toBe(true);
    });

    it('should transition to CLOSED after success threshold', () => {
      breaker.transitionTo(STATE.HALF_OPEN);
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.state).toBe(STATE.CLOSED);
    });

    it('should transition to OPEN on any failure', () => {
      breaker.transitionTo(STATE.HALF_OPEN);
      breaker.recordFailure(new Error('test'));

      expect(breaker.state).toBe(STATE.OPEN);
    });
  });

  describe('timeout recovery', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      breaker.transitionTo(STATE.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(breaker.canExecute()).toBe(true);
      expect(breaker.state).toBe(STATE.HALF_OPEN);
    });
  });

  describe('execute function', () => {
    it('should execute function when CLOSED', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));

      expect(result).toBe('success');
      expect(breaker.metrics.successfulCalls).toBe(1);
    });

    it('should record failure on function error', async () => {
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail')))
      ).rejects.toThrow('fail');

      expect(breaker.metrics.failedCalls).toBe(1);
    });

    it('should reject when OPEN', async () => {
      breaker.transitionTo(STATE.OPEN);

      await expect(
        breaker.execute(() => Promise.resolve('success'))
      ).rejects.toThrow('Circuit breaker [test] is OPEN');

      expect(breaker.metrics.rejectedCalls).toBe(1);
    });
  });

  describe('manual controls', () => {
    it('should allow manual reset', () => {
      breaker.transitionTo(STATE.OPEN);
      breaker.reset();

      expect(breaker.state).toBe(STATE.CLOSED);
      expect(breaker.failures).toBe(0);
    });

    it('should allow manual trip', () => {
      breaker.trip();

      expect(breaker.state).toBe(STATE.OPEN);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      breaker.recordSuccess();
      breaker.recordFailure(new Error('test'));

      const status = breaker.getStatus();

      expect(status.name).toBe('test');
      expect(status.state).toBe(STATE.CLOSED);
      expect(status.metrics.totalCalls).toBe(2);
      expect(status.metrics.successfulCalls).toBe(1);
      expect(status.metrics.failedCalls).toBe(1);
    });

    it('should track state changes', () => {
      breaker.transitionTo(STATE.OPEN);
      breaker.transitionTo(STATE.HALF_OPEN);
      breaker.transitionTo(STATE.CLOSED);

      const status = breaker.getStatus();

      expect(status.metrics.stateChanges.length).toBe(3);
    });
  });
});
