# Failure Mode Analysis

This document catalogs potential failure scenarios in the Incident Intelligence Dashboard and their mitigations.

## Failure Mode Summary

| ID | Failure Mode | Severity | Likelihood | Detection | Recovery Time |
|----|--------------|----------|------------|-----------|---------------|
| FM-01 | MongoDB Connection Failure | Critical | Medium | Immediate | 30s-5min |
| FM-02 | AI Service Timeout | Medium | High | Immediate | Auto |
| FM-03 | WebSocket Server Crash | High | Low | Immediate | 5-30s |
| FM-04 | Event Ingestion Overload | Medium | Medium | Immediate | Auto |
| FM-05 | Browser Tab Inactive | Low | High | N/A | Instant |
| FM-06 | Redis Failure | High | Low | Immediate | 30s-2min |
| FM-07 | Network Partition | Critical | Low | 10-30s | Variable |
| FM-08 | Memory Exhaustion | High | Medium | 30s | 1-5min |

---

## FM-01: MongoDB Connection Failure

### Description
MongoDB becomes unreachable due to network issues, database crash, or maintenance.

### Impact
- **Event ingestion fails**: Cannot persist new events
- **Dashboard stale**: No new data displayed
- **Incidents not created**: Aggregation worker fails

### Detection

```javascript
// Mongoose connection monitoring
mongoose.connection.on('disconnected', () => {
  console.error('[MongoDB] Disconnected');
  metrics.setDatabaseStatus('disconnected');
  alerting.trigger('mongodb_disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[MongoDB] Connection error:', err);
  metrics.incrementCounter('mongodb_errors');
});
```

### Mitigation: Circuit Breaker + In-Memory Buffer

```javascript
// server/services/eventBuffer.js
class EventBuffer {
  constructor() {
    this.buffer = [];
    this.maxSize = 10000;
    this.circuitBreaker = new CircuitBreaker({
      name: 'mongodb',
      failureThreshold: 3,
      timeout: 30000
    });
  }

  async saveEvent(eventData) {
    try {
      return await this.circuitBreaker.execute(async () => {
        // Flush buffer first if we're recovering
        if (this.buffer.length > 0) {
          await this.flushBuffer();
        }
        return await Event.create(eventData);
      });
    } catch (error) {
      if (error.code === 'CIRCUIT_OPEN') {
        // Buffer event for later
        this.bufferEvent(eventData);
        return { buffered: true, bufferSize: this.buffer.length };
      }
      throw error;
    }
  }

  bufferEvent(eventData) {
    if (this.buffer.length >= this.maxSize) {
      // Drop oldest events
      this.buffer.shift();
      metrics.incrementCounter('events_dropped');
    }
    this.buffer.push({
      data: eventData,
      timestamp: Date.now()
    });
    metrics.setGauge('event_buffer_size', this.buffer.length);
  }

  async flushBuffer() {
    const batch = this.buffer.splice(0, 100);
    if (batch.length > 0) {
      await Event.insertMany(batch.map(b => b.data), { ordered: false });
      console.log(`[EventBuffer] Flushed ${batch.length} events`);

      // Continue flushing
      if (this.buffer.length > 0) {
        setImmediate(() => this.flushBuffer());
      }
    }
  }
}
```

### Recovery Steps
1. Circuit breaker detects failure after 3 consecutive errors
2. Events buffered in memory (up to 10,000)
3. Circuit breaker retries after 30 seconds
4. On success, buffer flushed to MongoDB
5. Normal operation resumes

### Monitoring
- `mongodb_connection_state` gauge (0=disconnected, 1=connected)
- `event_buffer_size` gauge
- `events_dropped` counter
- Alert: Buffer size > 5000

---

## FM-02: AI Service Timeout

### Description
Claude/OpenAI API responds slowly or not at all due to rate limits, outages, or network issues.

### Impact
- **Summaries delayed**: Incidents show placeholder text
- **Insights unavailable**: No root cause analysis

### Detection

```javascript
// Circuit breaker state monitoring
aiService.circuitBreaker.on('stateChange', (from, to) => {
  metrics.setGauge('ai_circuit_state', { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 }[to]);
  if (to === 'OPEN') {
    alerting.trigger('ai_service_degraded');
  }
});
```

### Mitigation: Cached Summaries + Fallback

```javascript
// server/services/summaryCache.js
class SummaryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 3600000; // 1 hour
  }

  // Cache summaries by incident pattern (service + error type)
  getCacheKey(incident) {
    return `${incident.affectedServices.sort().join(',')}_${incident.eventCount > 10 ? 'high' : 'low'}`;
  }

  async getSummary(incident, events) {
    const cacheKey = this.getCacheKey(incident);

    // Try AI service first
    if (aiService.isAvailable()) {
      try {
        const summary = await aiService.summarizeIncident(incident, events);
        this.cache.set(cacheKey, {
          summary,
          timestamp: Date.now()
        });
        return summary;
      } catch (error) {
        console.warn('[SummaryCache] AI failed, checking cache');
      }
    }

    // Fall back to cached similar summary
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return {
        ...cached.summary,
        cached: true,
        cacheAge: Date.now() - cached.timestamp
      };
    }

    // Generate static fallback
    return this.generateFallback(incident, events);
  }

  generateFallback(incident, events) {
    const services = incident.affectedServices.join(', ');
    const maxSeverity = Math.max(...events.map(e => e.severity));
    const errorTypes = [...new Set(events.map(e => e.metadata?.errorType).filter(Boolean))];

    return {
      summary: `${events.length} events detected across ${services}. Manual analysis required.`,
      rootCause: `Potential issues: ${errorTypes.join(', ') || 'Unknown'}`,
      impact: `Severity ${maxSeverity}/5 incident affecting ${incident.affectedServices.length} service(s).`,
      suggestedActions: [
        'Check service health dashboards',
        'Review recent deployments',
        'Check dependent service status'
      ],
      fallback: true,
      reason: 'AI service unavailable'
    };
  }
}
```

### Placeholder UI

```jsx
// client/src/components/incidents/AISummary.jsx
function AISummary({ incident }) {
  if (!incident.aiGeneratedSummary) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <LoadingSpinner size="sm" />
          <span>AI analysis in progress...</span>
        </div>
        <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-2">
          Summary will appear automatically when ready.
          <button onClick={onManualRequest} className="ml-2 underline">
            Request now
          </button>
        </p>
      </div>
    );
  }

  if (incident.summaryFallback) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500 mb-2">
          <WarningIcon size="sm" />
          <span className="text-xs">AI unavailable - showing cached analysis</span>
        </div>
        <p>{incident.aiGeneratedSummary}</p>
      </div>
    );
  }

  return <SummaryContent summary={incident.aiGeneratedSummary} />;
}
```

### Recovery
- Automatic: Circuit breaker re-enables after timeout
- Manual: `/api/ai/circuit-breaker/reset` endpoint
- Cache hit rate improves during extended outages

---

## FM-03: WebSocket Server Crash

### Description
WebSocket server process crashes or becomes unresponsive.

### Impact
- **Real-time updates stop**: Dashboard becomes stale
- **User confusion**: No indication of connection loss initially

### Detection

```javascript
// Client-side heartbeat monitoring
class WebSocketClient {
  constructor() {
    this.lastPong = Date.now();
    this.heartbeatInterval = setInterval(() => {
      this.checkConnection();
    }, 5000);
  }

  checkConnection() {
    if (Date.now() - this.lastPong > 15000) {
      this.handleDisconnect('heartbeat_timeout');
    }
  }

  onMessage(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'pong') {
      this.lastPong = Date.now();
    }
  }
}
```

### Mitigation: Auto-Reconnect with Event Replay

```javascript
// client/src/hooks/useWebSocket.js
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

function useWebSocket() {
  const lastEventTimestamp = useRef(null);
  const reconnectAttempt = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(config.wsUrl);

    ws.onopen = () => {
      reconnectAttempt.current = 0;

      // Request missed events since last connection
      if (lastEventTimestamp.current) {
        ws.send(JSON.stringify({
          type: 'replay',
          since: lastEventTimestamp.current
        }));
      }

      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['all']
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'event' && data.data.timestamp) {
        lastEventTimestamp.current = data.data.timestamp;
      }

      handleMessage(data);
    };

    ws.onclose = () => {
      const delay = RECONNECT_DELAYS[
        Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
      ];

      setTimeout(() => {
        reconnectAttempt.current++;
        connect();
      }, delay);
    };
  }, []);
}
```

### Server-Side Event Replay

```javascript
// server/websocket/wsHandler.js
const recentEvents = new LRUCache({
  max: 1000,
  ttl: 300000 // 5 minutes
});

function handleClientMessage(ws, data) {
  if (data.type === 'replay' && data.since) {
    const since = new Date(data.since).getTime();
    const eventsToReplay = [];

    recentEvents.forEach((event, key) => {
      if (new Date(event.timestamp).getTime() > since) {
        eventsToReplay.push(event);
      }
    });

    // Sort by timestamp and send
    eventsToReplay
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach(event => {
        ws.send(JSON.stringify({ type: 'event', data: event, replayed: true }));
      });

    ws.send(JSON.stringify({
      type: 'replay_complete',
      count: eventsToReplay.length
    }));
  }
}
```

### UI Indicators

```jsx
function ConnectionStatus() {
  const { isConnected, reconnectAttempts } = useStore();

  if (!isConnected) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <PulsingDot color="white" />
        {reconnectAttempts > 0 ? (
          <span>Reconnecting... (attempt {reconnectAttempts})</span>
        ) : (
          <span>Connection lost</span>
        )}
      </div>
    );
  }

  return null;
}
```

---

## FM-04: Event Ingestion Overload

### Description
Event volume exceeds system capacity (e.g., during major outage causing event storm).

### Impact
- **Events dropped**: Some events not recorded
- **Increased latency**: Slow API responses
- **Downstream effects**: Aggregation delays

### Detection

```javascript
// Monitor queue depth
setInterval(() => {
  const stats = eventQueue.getStats();
  metrics.setGauge('event_queue_depth', stats.queueSize);

  if (stats.queueSize > stats.config.maxQueueSize * 0.8) {
    alerting.trigger('event_queue_high', {
      depth: stats.queueSize,
      max: stats.config.maxQueueSize
    });
  }
}, 5000);
```

### Mitigation: Rate Limiting + Backpressure Signaling

```javascript
// server/middleware/backpressure.js
const backpressureMiddleware = (req, res, next) => {
  const status = getLoadStatus();

  // Add headers for client awareness
  res.set({
    'X-RateLimit-Remaining': rateLimiter.getRemaining(req),
    'X-Load-Level': status.level,
    'X-Queue-Depth': status.queueSize
  });

  if (!status.acceptRequests) {
    return res.status(429).json({
      success: false,
      error: 'Service overloaded',
      retryAfter: 5,
      queueDepth: status.queueSize,
      suggestion: 'Reduce event rate or batch events'
    });
  }

  if (status.level === 'warning') {
    // Warn but accept
    res.set('X-Backpressure-Warning', 'true');
  }

  next();
};
```

### Client-Side Adaptive Behavior

```javascript
// Service-side event client
class EventClient {
  constructor() {
    this.backoffMultiplier = 1;
    this.batchSize = 1;
  }

  async sendEvent(event) {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        body: JSON.stringify(event)
      });

      const loadLevel = response.headers.get('X-Load-Level');

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After')) || 5;
        this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 60);
        await this.sleep(retryAfter * 1000 * this.backoffMultiplier);
        return this.sendEvent(event);
      }

      // Adaptive batching based on load
      if (loadLevel === 'warning') {
        this.batchSize = Math.min(this.batchSize + 5, 50);
      } else {
        this.backoffMultiplier = 1;
        this.batchSize = Math.max(this.batchSize - 1, 1);
      }

      return response.json();
    } catch (error) {
      // Network error - exponential backoff
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 60);
      throw error;
    }
  }
}
```

### Graceful Degradation Chain

```
Normal → Warning (80%) → Critical (90%) → Rejecting (100%)
           ↓                  ↓                ↓
      Log warning      Skip AI calls    Return 429
      Batch more       Drop WebSocket   Buffer critical only
```

---

## FM-05: Browser Tab Inactive

### Description
User switches to another tab/app, causing the dashboard to become inactive.

### Impact
- **Wasted resources**: WebSocket messages to inactive tab
- **Stale UI**: Large gap when user returns
- **Performance**: Accumulated messages cause lag on resume

### Detection

```javascript
// client/src/hooks/useVisibility.js
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}
```

### Mitigation: Pause WebSocket + Batch Resume

```javascript
// client/src/hooks/useWebSocket.js
function useWebSocket() {
  const isVisible = usePageVisibility();
  const lastVisibleTimestamp = useRef(Date.now());
  const wsRef = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      // Notify server to pause updates
      wsRef.current?.send(JSON.stringify({
        type: 'pause',
        timestamp: new Date().toISOString()
      }));
      lastVisibleTimestamp.current = Date.now();
    } else {
      // Request batch update for missed period
      const pauseDuration = Date.now() - lastVisibleTimestamp.current;

      if (pauseDuration > 5000) {
        // Fetch missed data via REST (more efficient than WebSocket replay)
        fetchMissedData(lastVisibleTimestamp.current);
      }

      wsRef.current?.send(JSON.stringify({
        type: 'resume'
      }));
    }
  }, [isVisible]);

  async function fetchMissedData(since) {
    // Fetch summary instead of all events
    const [events, incidents] = await Promise.all([
      api.getEvents({ since, limit: 100 }),
      api.getActiveIncidents()
    ]);

    store.addEvents(events.data);
    store.setIncidents(incidents.data);
  }
}
```

### Server-Side Pause Handling

```javascript
// server/websocket/wsHandler.js
ws.on('message', (message) => {
  const data = JSON.parse(message);

  if (data.type === 'pause') {
    ws.paused = true;
    ws.pausedAt = new Date(data.timestamp);
  }

  if (data.type === 'resume') {
    ws.paused = false;
    // Send summary of what was missed
    sendMissedSummary(ws, ws.pausedAt);
  }
});

function broadcastEvent(event) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && !client.paused) {
      client.send(JSON.stringify({ type: 'event', data: event }));
    }
  });
}
```

---

## FM-06: Redis Failure

### Description
Redis cluster becomes unavailable affecting session storage and pub/sub.

### Impact
- **WebSocket broadcast fails**: Multi-instance events not propagated
- **Rate limiting breaks**: Per-client tracking lost
- **AI queue stalls**: Jobs not processed

### Mitigation

```javascript
// Graceful degradation without Redis
class ResilientBroadcaster {
  constructor() {
    this.redis = null;
    this.localMode = false;

    this.initRedis();
  }

  async initRedis() {
    try {
      this.redis = new Redis(process.env.REDIS_URL, {
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3
      });

      this.redis.on('error', () => {
        console.warn('[Redis] Connection error, switching to local mode');
        this.localMode = true;
      });

      this.redis.on('ready', () => {
        console.log('[Redis] Connected, multi-instance mode enabled');
        this.localMode = false;
      });
    } catch (error) {
      console.warn('[Redis] Init failed, using local mode only');
      this.localMode = true;
    }
  }

  async broadcast(channel, data) {
    if (this.localMode) {
      // Fall back to local-only broadcast
      this.localBroadcast(channel, data);
    } else {
      try {
        await this.redis.publish(channel, JSON.stringify(data));
      } catch (error) {
        this.localBroadcast(channel, data);
      }
    }
  }
}
```

---

## Failure Response Matrix

| Failure | Automatic Recovery | Manual Intervention | User Impact |
|---------|-------------------|--------------------|--------------|
| MongoDB down | Circuit breaker + buffer | Restart database | Events buffered, dashboard stale |
| AI timeout | Cached summaries | Reset circuit breaker | Placeholder summaries shown |
| WebSocket crash | Auto-reconnect + replay | None | Brief disconnect notification |
| Overload | Rate limiting + backpressure | Scale infrastructure | 429 errors, retry guidance |
| Tab inactive | Pause + batch resume | None | None |
| Redis down | Local mode fallback | Restart Redis | Single-instance only |

## Runbook Quick Reference

### MongoDB Recovery
```bash
# Check status
kubectl exec -it mongo-0 -- mongosh --eval "rs.status()"

# Force primary election
kubectl exec -it mongo-0 -- mongosh --eval "rs.stepDown()"

# Check app circuit breaker
curl http://api:5000/health/detailed | jq '.mongodb'
```

### AI Service Recovery
```bash
# Check circuit breaker status
curl http://api:5000/api/ai/circuit-breaker

# Reset circuit breaker
curl -X POST http://api:5000/api/ai/circuit-breaker/reset

# Check API key validity
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
```

### WebSocket Debugging
```bash
# Check connection count
curl http://api:5000/health/detailed | jq '.websocket'

# Monitor WebSocket traffic
wscat -c ws://localhost:5000

# Force reconnect all clients (rolling restart)
kubectl rollout restart deployment/incident-api
```

## Monitoring Dashboard Panels

1. **System Health**
   - MongoDB connection state
   - Redis connection state
   - AI circuit breaker state
   - Event queue depth

2. **Performance**
   - Event ingestion rate
   - API response time p99
   - WebSocket message latency
   - AI summarization duration

3. **Failures**
   - Error rate by type
   - Circuit breaker trips
   - Dropped events
   - Failed AI requests

4. **Capacity**
   - Queue utilization %
   - Memory usage
   - CPU usage
   - Active connections
