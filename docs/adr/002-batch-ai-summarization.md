# ADR 002: Batch AI Summarization Every 30 Seconds Instead of Per-Event

## Status

Accepted

## Date

2024-01-15

## Context

Incidents are clusters of related events that need AI-generated summaries explaining root causes and suggesting actions. We need to decide when to invoke the AI service:

1. **Per-event**: Generate/update summary immediately when each event is received
2. **Per-incident creation**: Generate summary when an incident is first created
3. **Batch processing**: Periodically process incidents missing summaries

### Constraints

- AI API calls have latency (1-10 seconds)
- AI APIs have rate limits and cost per token
- Events can arrive in bursts (100s per second during outages)
- Summaries need context from multiple events to be useful

## Decision

We chose **batch AI summarization** running every 30 seconds with up to 5 incidents per API call.

## Rationale

### Why Batch Processing

1. **Cost Efficiency**: Batching multiple incidents into a single API call reduces:
   - Per-request overhead
   - Total API calls (5 incidents per call vs. 1)
   - Token usage through shared context

2. **Better Summaries**: Waiting allows more events to accumulate before summarization:
   - 30 seconds of events provides better pattern detection
   - Root cause analysis improves with more data points
   - Reduces summary churn (updates every few seconds would be confusing)

3. **Resilience**: Batch processing handles AI service outages gracefully:
   - Queue incidents for processing when service recovers
   - Circuit breaker prevents cascade failures
   - Fallback summaries available immediately

4. **Rate Limit Management**: Predictable API usage:
   - Maximum 2 calls/minute (60s / 30s interval)
   - Easier to stay within provider rate limits
   - Budget predictability

### Why Not Per-Event

1. **High Cost**: At 100 events/second during an outage, per-event would mean:
   - 100+ API calls per second
   - $10-100+ per incident (depending on event count)
   - Would exceed rate limits immediately

2. **Poor Quality**: Single-event summaries lack context:
   - "An error occurred in payment-service" is not actionable
   - Pattern recognition requires multiple data points

3. **Performance Impact**: Blocking on AI would:
   - Add 1-10 seconds latency to event ingestion
   - Create backpressure during high-volume incidents

### Why 30 Seconds

- Balances real-time feel with efficiency
- Aligns with aggregation worker interval
- Provides enough events for meaningful analysis
- Short enough for urgent incidents to get summaries quickly

## Consequences

### Positive

- Predictable and manageable AI costs
- Higher quality summaries with more context
- System remains responsive during outages
- Graceful degradation when AI is unavailable

### Negative

- Summaries delayed by up to 30 seconds after incident creation
- Users may see "Summary generating..." placeholder briefly
- Batch failures affect multiple incidents

### Mitigations

- Manual "Generate Summary" button for immediate needs
- Loading skeleton UI for pending summaries
- Retry logic with exponential backoff
- Fallback summaries with basic event statistics

## Metrics to Monitor

- `incident_ai_summarization_latency_seconds` - Processing time
- `incident_ai_fallbacks_total` - Fallback usage rate
- Incidents without summaries after 5 minutes

## References

- [Anthropic Rate Limits](https://docs.anthropic.com/claude/reference/rate-limits)
- [Batch Processing Patterns](https://microservices.io/patterns/data/saga.html)
