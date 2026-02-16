# ADR 004: Client-Side vs Server-Side Event Filtering Strategy

## Status

Accepted

## Date

2024-01-15

## Context

The dashboard displays a live event stream that users can filter by:
- Service name (text search)
- Severity level (1-5)
- Time range
- Tags

We need to decide where filtering logic should execute.

### Options Considered

1. **Client-Side Filtering**: Filter events in browser from full dataset
2. **Server-Side Filtering**: Query database with filters, return subset
3. **Hybrid**: Server-side for initial load, client-side for live updates

## Decision

We chose a **Hybrid Approach**:
- **Server-side** for initial data load and historical queries
- **Client-side** for real-time event stream filtering

## Rationale

### Why Hybrid

1. **Real-Time WebSocket Events**:
   - Events arrive via WebSocket in real-time
   - Server doesn't know client's current filters
   - Filtering on client avoids round-trip for each event

   ```javascript
   // Client filters incoming events
   ws.onmessage = (event) => {
     const data = JSON.parse(event.data);
     if (matchesFilters(data, currentFilters)) {
       addToEventList(data);
     }
   };
   ```

2. **Responsive Filter Changes**:
   - User changes severity filter from "3+" to "4+"
   - Client instantly re-filters existing events
   - No API call needed, feels instant

3. **Server Efficiency**:
   - Initial load uses server-side filtering:
     ```
     GET /api/events?service=payment&minSeverity=3&limit=100
     ```
   - Database indexes handle this efficiently
   - Reduces data transfer for initial render

4. **Virtualized List Performance**:
   - react-window only renders visible rows
   - Can hold 1000+ events in memory efficiently
   - Filter operation on 1000 objects: <1ms

### Why Not Pure Server-Side

1. **WebSocket Complexity**: Would need to:
   - Send filter changes to server
   - Server maintains per-client filter state
   - Re-query database for each change
   - Much higher latency for filter interactions

2. **API Overhead**: Each filter change would:
   - Make network request
   - Query database
   - Add 50-200ms latency
   - Poor user experience

### Why Not Pure Client-Side

1. **Initial Load Performance**: Loading all events client-side would:
   - Transfer megabytes of data
   - Slow initial render
   - Waste bandwidth for filtered-out events

2. **Memory Constraints**: Can't hold unlimited events in browser memory

## Implementation Details

### Client-Side Filtering (Zustand Store)

```javascript
// Store maintains events and filters
const useStore = create((set, get) => ({
  events: [],
  eventFilters: { service: '', minSeverity: 1 },

  getFilteredEvents: () => {
    const { events, eventFilters } = get();
    return events.filter(event => {
      if (eventFilters.service &&
          !event.service.includes(eventFilters.service)) {
        return false;
      }
      if (event.severity < eventFilters.minSeverity) {
        return false;
      }
      return true;
    });
  }
}));
```

### Server-Side Initial Load

```javascript
// API supports filtering parameters
GET /api/events?
  service=payment-service&
  minSeverity=3&
  startDate=2024-01-15T00:00:00Z&
  limit=100
```

### WebSocket Subscription Filtering

Optional server-side pre-filtering for efficiency:

```javascript
// Client subscribes to specific services
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['payment-service', 'auth-service']
}));

// Server only broadcasts matching events
```

## Consequences

### Positive

- Instant filter response (<10ms)
- Reduced server load for filter changes
- Works offline after initial load
- Smooth real-time updates

### Negative

- Client memory usage for event storage
- Duplicate filtering logic (client + API)
- WebSocket broadcasts all events (unless subscribed)

### Mitigations

- Cap client event storage at 1000 events (rolling window)
- Use WebSocket subscriptions to reduce broadcast volume
- Share validation schemas between client and server

## Performance Benchmarks

| Operation | Client-Side | Server-Side |
|-----------|-------------|-------------|
| Filter 1000 events | <5ms | 50-200ms |
| Change severity filter | Instant | API round-trip |
| Initial load (100 events) | N/A | ~100ms |

## References

- [React Virtual Lists Performance](https://react-window.vercel.app/)
- [Zustand State Management](https://github.com/pmndrs/zustand)
