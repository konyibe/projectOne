# ADR 005: PII Redaction Approach Before AI Processing

## Status

Accepted

## Date

2024-01-15

## Context

Events may contain Personally Identifiable Information (PII) in their metadata:
- Email addresses in error messages
- IP addresses from client requests
- Phone numbers in user context
- API keys accidentally logged
- Names in user-related errors

We must redact PII before sending event data to external AI services (Claude/OpenAI) to:
1. Comply with privacy regulations (GDPR, CCPA)
2. Protect user privacy
3. Avoid exposing secrets

### Options Considered

1. **Regex-Based Redaction**: Pattern matching for known PII formats
2. **ML-Based NER**: Named Entity Recognition to identify PII
3. **Field Blocklist**: Only send allowed fields, block others
4. **No Redaction**: Trust AI providers' data handling policies

## Decision

We chose **Regex-Based Redaction** with a comprehensive pattern library.

## Rationale

### Why Regex-Based

1. **Predictable Performance**:
   - O(n) scanning per pattern
   - No ML model loading time
   - Consistent latency (~1-5ms for typical events)

2. **High Precision for Structured PII**:
   - Email: Nearly 100% accuracy with RFC 5322 pattern
   - IP addresses: Deterministic format
   - Credit cards: Luhn algorithm validation possible
   - API keys: Known provider patterns (AWS, etc.)

3. **No External Dependencies**:
   - Works offline
   - No ML model updates needed
   - No GPU/memory overhead

4. **Transparency**:
   - Clear what is being redacted
   - Easy to audit patterns
   - Predictable behavior

### Implemented Patterns

```javascript
const patterns = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}....\b/g,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  awsKey: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
  jwt: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
};
```

### Why Not ML-Based NER

1. **Complexity**: Would require:
   - Loading ML models (100MB+)
   - GPU or significant CPU for inference
   - Model version management

2. **Latency**: NER inference adds 100-500ms per event batch

3. **Overkill**: Most PII in logs follows predictable patterns
   - We're not processing free-form text
   - Structured metadata has known fields

4. **False Positives**: NER might flag service names as person names

### Why Not Field Blocklist

1. **Incomplete Coverage**: New fields would bypass the list
2. **Loss of Context**: Blocking entire fields loses useful info
3. **Maintenance Burden**: Every service change needs list update

## Implementation

### Redaction Flow

```
Event → Extract Metadata → Scan for PII → Replace with Tokens → Send to AI
                                ↓
                        Track Statistics
```

### Replacement Tokens

```javascript
const replacements = {
  email: '[REDACTED_EMAIL]',
  ipv4: '[REDACTED_IP]',
  phone: '[REDACTED_PHONE]',
  ssn: '[REDACTED_SSN]',
  creditCard: '[REDACTED_CC]',
  awsKey: '[REDACTED_AWS_KEY]',
  jwt: '[REDACTED_JWT]',
};
```

### Statistics Tracking

```javascript
{
  eventsProcessed: 150,
  fieldsRedacted: 23,
  redactionsByType: {
    email: 12,
    ipv4: 8,
    jwt: 3
  }
}
```

## Consequences

### Positive

- Fast, predictable processing
- Clear audit trail of redactions
- No external service dependencies
- Easy to extend with new patterns
- Low resource usage

### Negative

- May miss unusual PII formats
- Names without context are hard to detect
- Regex maintenance for new patterns
- Over-redaction possible (e.g., version numbers that look like IPs)

### Mitigations

- Log redaction statistics for monitoring
- Allow configuration of patterns per deployment
- Periodic review of redaction effectiveness
- Consider ML enhancement for name detection in future

## Testing

```javascript
describe('PII Redactor', () => {
  it('should redact email addresses', () => {
    const input = 'Contact john.doe@example.com';
    const result = redactString(input);
    expect(result.text).toBe('Contact [REDACTED_EMAIL]');
  });

  it('should track redaction statistics', () => {
    const result = redactObject({ email: 'test@test.com' });
    expect(result.stats.fieldsRedacted).toBe(1);
  });
});
```

## Future Considerations

- Add ML-based name detection as optional enhancement
- Implement custom pattern configuration via admin UI
- Consider on-premise AI options to avoid data transfer
- Add encrypted field support for certain metadata

## References

- [OWASP Data Protection](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/12-Testing_Browser_Storage)
- [GDPR Article 25 - Data Protection by Design](https://gdpr-info.eu/art-25-gdpr/)
- [RFC 5322 - Email Format](https://tools.ietf.org/html/rfc5322)
