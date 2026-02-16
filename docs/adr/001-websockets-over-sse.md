# ADR 001: WebSockets Over Server-Sent Events for Real-Time Updates

## Status

Accepted

## Date

2024-01-15

## Context

The incident dashboard requires real-time updates for:
- New events as they are ingested
- Incident status changes
- AI summary generation completion

We need to choose between WebSockets and Server-Sent Events (SSE) for pushing updates to the browser.

### Options Considered

1. **WebSockets** - Full-duplex communication over a single TCP connection
2. **Server-Sent Events (SSE)** - Unidirectional server-to-client streaming over HTTP
3. **Long Polling** - Repeated HTTP requests (baseline comparison)

## Decision

We chose **WebSockets** for real-time communication.

## Rationale

### Why WebSockets

1. **Bidirectional Communication**: WebSockets allow the client to send messages to the server, enabling:
   - Channel subscriptions (e.g., subscribe to specific services)
   - Client heartbeat/ping for connection health
   - Future features like acknowledging events

2. **Lower Overhead**: After the initial handshake, WebSocket frames have minimal overhead (2-14 bytes) compared to SSE's HTTP headers on each message.

3. **Connection Management**: Single connection handles both incoming events and outgoing subscriptions, simplifying state management.

4. **Broad Ecosystem Support**: The `ws` library for Node.js is mature and well-maintained, with built-in support for heartbeats, per-message deflate, and backpressure handling.

### Why Not SSE

1. **Unidirectional Only**: SSE only supports server-to-client. We would need a separate mechanism for client-to-server communication (subscriptions, heartbeats).

2. **Connection Limits**: Browsers limit concurrent SSE connections (6 per domain in HTTP/1.1). While HTTP/2 mitigates this, WebSockets avoid the issue entirely.

3. **Reconnection Logic**: SSE has built-in reconnection, but WebSockets allow more control over reconnection strategy with exponential backoff.

## Consequences

### Positive

- Clean bidirectional communication model
- Efficient binary frame format
- Single connection for all real-time features
- Easy to implement channel-based subscriptions

### Negative

- WebSockets can be blocked by some corporate proxies (mitigated by falling back to long-polling if needed)
- Slightly more complex server setup compared to SSE
- Need to implement heartbeat mechanism manually

### Risks

- Load balancers must support WebSocket connections
- Horizontal scaling requires sticky sessions or Redis pub/sub for cross-instance communication

## References

- [WebSocket API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Server-Sent Events - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [ws library documentation](https://github.com/websockets/ws)
