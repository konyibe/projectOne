const { redactString, redactObject, redactEvents } = require('../services/piiRedactor');

describe('PII Redactor', () => {
  describe('redactString', () => {
    it('should redact email addresses', () => {
      const input = 'Contact john.doe@example.com for support';
      const result = redactString(input);

      expect(result.text).toBe('Contact [REDACTED_EMAIL] for support');
      expect(result.redactions.email).toBe(1);
      expect(result.hasRedactions).toBe(true);
    });

    it('should redact multiple emails', () => {
      const input = 'Send to admin@test.com and support@test.org';
      const result = redactString(input);

      expect(result.redactions.email).toBe(2);
      expect(result.text).not.toContain('@');
    });

    it('should redact IPv4 addresses', () => {
      const input = 'Server IP: 192.168.1.100';
      const result = redactString(input);

      expect(result.text).toBe('Server IP: [REDACTED_IP]');
      expect(result.redactions.ipv4).toBe(1);
    });

    it('should redact phone numbers', () => {
      const input = 'Call 555-123-4567 or (555) 987-6543';
      const result = redactString(input);

      expect(result.redactions.phone).toBe(2);
      expect(result.text).not.toMatch(/\d{3}[-.\s]?\d{4}/);
    });

    it('should redact SSN patterns', () => {
      const input = 'SSN: 123-45-6789';
      const result = redactString(input);

      expect(result.text).toBe('SSN: [REDACTED_SSN]');
      expect(result.redactions.ssn).toBe(1);
    });

    it('should redact credit card numbers', () => {
      const input = 'Card: 4111-2222-3333-4444';
      const result = redactString(input);

      expect(result.text).toBe('Card: [REDACTED_CC]');
      expect(result.redactions.creditCard).toBe(1);
    });

    it('should redact AWS access keys', () => {
      const input = 'Key: AKIAIOSFODNN7EXAMPLE';
      const result = redactString(input);

      expect(result.text).toBe('Key: [REDACTED_AWS_KEY]');
      expect(result.redactions.awsKey).toBe(1);
    });

    it('should redact JWT tokens', () => {
      const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = redactString(input);

      expect(result.redactions.jwt).toBe(1);
      expect(result.text).toContain('[REDACTED_JWT]');
    });

    it('should handle strings with no PII', () => {
      const input = 'This is a normal log message';
      const result = redactString(input);

      expect(result.text).toBe(input);
      expect(result.hasRedactions).toBe(false);
      expect(Object.keys(result.redactions).length).toBe(0);
    });

    it('should handle non-string input', () => {
      const result = redactString(12345);

      expect(result.text).toBe(12345);
      expect(result.redactions).toEqual({});
    });

    it('should redact multiple PII types in same string', () => {
      const input = 'User john@test.com from 10.0.0.1 called 555-1234';
      const result = redactString(input);

      expect(result.redactions.email).toBe(1);
      expect(result.redactions.ipv4).toBe(1);
      expect(result.text).not.toContain('john@test.com');
      expect(result.text).not.toContain('10.0.0.1');
    });
  });

  describe('redactObject', () => {
    it('should redact PII in nested objects', () => {
      const input = {
        user: {
          email: 'test@example.com',
          ip: '192.168.0.1'
        }
      };

      const result = redactObject(input);

      expect(result.data.user.email).toBe('[REDACTED_EMAIL]');
      expect(result.data.user.ip).toBe('[REDACTED_IP]');
      expect(result.stats.fieldsRedacted).toBe(2);
    });

    it('should handle arrays', () => {
      const input = {
        emails: ['a@test.com', 'b@test.com']
      };

      const result = redactObject(input);

      expect(result.data.emails[0]).toBe('[REDACTED_EMAIL]');
      expect(result.data.emails[1]).toBe('[REDACTED_EMAIL]');
    });

    it('should preserve non-string values', () => {
      const input = {
        count: 42,
        active: true,
        timestamp: null
      };

      const result = redactObject(input);

      expect(result.data.count).toBe(42);
      expect(result.data.active).toBe(true);
      expect(result.data.timestamp).toBe(null);
    });

    it('should track redaction statistics', () => {
      const input = {
        field1: 'user@test.com',
        field2: 'safe text',
        field3: '10.0.0.1'
      };

      const result = redactObject(input);

      expect(result.stats.fieldsProcessed).toBeGreaterThan(0);
      expect(result.stats.fieldsRedacted).toBe(2);
      expect(result.stats.redactionsByType.email).toBe(1);
      expect(result.stats.redactionsByType.ipv4).toBe(1);
    });
  });

  describe('redactEvents', () => {
    it('should redact PII from event metadata', () => {
      const events = [
        {
          eventId: 'evt_001',
          service: 'auth-service',
          severity: 3,
          timestamp: new Date().toISOString(),
          metadata: {
            userEmail: 'user@example.com',
            clientIp: '192.168.1.1'
          }
        }
      ];

      const result = redactEvents(events);

      expect(result.events[0].metadata.userEmail).toBe('[REDACTED_EMAIL]');
      expect(result.events[0].metadata.clientIp).toBe('[REDACTED_IP]');
      expect(result.events[0].eventId).toBe('evt_001');
      expect(result.events[0].service).toBe('auth-service');
    });

    it('should preserve core event fields', () => {
      const events = [
        {
          eventId: 'evt_002',
          service: 'payment-service',
          severity: 4,
          timestamp: '2024-01-01T00:00:00Z',
          tags: ['error', 'payment'],
          metadata: {}
        }
      ];

      const result = redactEvents(events);

      expect(result.events[0].eventId).toBe('evt_002');
      expect(result.events[0].service).toBe('payment-service');
      expect(result.events[0].severity).toBe(4);
      expect(result.events[0].tags).toEqual(['error', 'payment']);
    });

    it('should handle empty events array', () => {
      const result = redactEvents([]);

      expect(result.events).toEqual([]);
      expect(result.stats.eventsProcessed).toBe(0);
    });

    it('should track total redaction stats', () => {
      const events = [
        {
          eventId: 'evt_1',
          service: 'svc',
          severity: 1,
          metadata: { email: 'a@test.com' }
        },
        {
          eventId: 'evt_2',
          service: 'svc',
          severity: 2,
          metadata: { email: 'b@test.com', ip: '1.2.3.4' }
        }
      ];

      const result = redactEvents(events);

      expect(result.stats.eventsProcessed).toBe(2);
      expect(result.stats.fieldsRedacted).toBe(3);
      expect(result.stats.redactionsByType.email).toBe(2);
      expect(result.stats.redactionsByType.ipv4).toBe(1);
    });
  });
});
