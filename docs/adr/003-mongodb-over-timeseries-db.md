# ADR 003: MongoDB Over Time-Series Databases for Event Storage

## Status

Accepted

## Date

2024-01-15

## Context

The incident intelligence system needs to store:
- High-volume event data (potentially 1000s per minute)
- Incident documents with relationships to events
- Statistical aggregations for spike detection
- Time-range queries for dashboard and timeline

### Options Considered

1. **MongoDB** - General-purpose document database
2. **TimescaleDB** - PostgreSQL extension for time-series
3. **InfluxDB** - Purpose-built time-series database
4. **Elasticsearch** - Search engine with time-series capabilities

## Decision

We chose **MongoDB** as the primary database for all data storage.

## Rationale

### Why MongoDB

1. **Document Flexibility**: Events have variable metadata:
   ```javascript
   {
     service: "payment-service",
     severity: 4,
     metadata: {
       // Varies by service and event type
       errorCode: "DB_TIMEOUT",
       query: "SELECT...",
       duration: 5000
     }
   }
   ```
   MongoDB's schema-less nature handles this naturally.

2. **Relationship Modeling**: Incidents reference arrays of event IDs:
   ```javascript
   {
     incidentId: "inc_123",
     eventIds: [ObjectId("..."), ObjectId("...")],
     // Populated with events when needed
   }
   ```
   Time-series DBs are optimized for metrics, not document relationships.

3. **Aggregation Pipeline**: MongoDB's aggregation framework handles:
   - Event clustering by service and time window
   - Rolling statistics for spike detection
   - Dashboard analytics and grouping

   Example spike detection aggregation:
   ```javascript
   db.events.aggregate([
     { $match: { timestamp: { $gte: windowStart } } },
     { $group: { _id: "$service", count: { $sum: 1 } } }
   ])
   ```

4. **Operational Simplicity**: Single database for:
   - Events
   - Incidents
   - Spike detection statistics
   - Future user/team data

   Reduces operational overhead compared to multiple specialized databases.

5. **Atlas Time Series Collections**: MongoDB 5.0+ supports native time-series collections with:
   - Automatic time-based partitioning
   - Efficient compression
   - Optimized time-range queries

   Can migrate hot event data to time-series collection if needed.

### Why Not Time-Series Databases

1. **InfluxDB**:
   - Excellent for metrics, not documents
   - Limited querying for non-time fields
   - Would need separate DB for incidents

2. **TimescaleDB**:
   - Requires schema definition upfront
   - PostgreSQL JSON support exists but less natural
   - Additional database to operate

3. **Elasticsearch**:
   - Great for search, overkill for our queries
   - Higher resource requirements
   - Complex cluster management

## Consequences

### Positive

- Single database simplifies operations
- Flexible schema for varying event metadata
- Strong aggregation capabilities for analytics
- Easy relationship modeling for incidents
- Good ecosystem (Mongoose ODM, Atlas cloud)

### Negative

- Less optimized for pure time-series workloads than InfluxDB
- Storage efficiency may be lower than columnar time-series DBs
- Need to implement retention policies manually

### Mitigations

- Create compound indexes on `{timestamp: -1, service: 1}`
- Implement TTL indexes for automatic data expiration
- Monitor query performance and add indexes as needed
- Consider sharding if data volume exceeds single node capacity

## Index Strategy

```javascript
// Event indexes
eventSchema.index({ timestamp: -1, service: 1 });
eventSchema.index({ service: 1, severity: 1, timestamp: -1 });
eventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 }); // 7-day TTL

// Incident indexes
incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ affectedServices: 1, status: 1 });
```

## Future Considerations

- If event volume exceeds 10M/day, evaluate time-series collection migration
- Consider cold storage tier for historical events
- Implement archival strategy for resolved incidents

## References

- [MongoDB Time Series Collections](https://www.mongodb.com/docs/manual/core/timeseries-collections/)
- [TimescaleDB vs MongoDB](https://www.timescale.com/blog/timescaledb-vs-mongodb/)
- [InfluxDB vs MongoDB](https://www.influxdata.com/comparison/influxdb-vs-mongodb/)
