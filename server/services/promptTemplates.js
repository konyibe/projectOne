/**
 * AI Prompt Templates for Incident Summarization
 */

const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) analyzing system incidents. Your task is to analyze event data and provide structured incident summaries.

You will receive JSON arrays of related system events. For each incident, you must:
1. Identify the root cause pattern from the events
2. Summarize the impact concisely
3. Suggest immediate actions to resolve or mitigate

Always respond with valid JSON matching the exact schema requested. Be concise and actionable.`;

const SINGLE_INCIDENT_PROMPT = `Analyze the following incident events and provide a structured summary.

Events:
\`\`\`json
{{EVENTS}}
\`\`\`

Incident Context:
- Service(s): {{SERVICES}}
- Time Range: {{TIME_RANGE}}
- Event Count: {{EVENT_COUNT}}
- Max Severity: {{MAX_SEVERITY}}

Respond with a JSON object in this exact format:
{
  "summary": "A concise 1-2 sentence summary of what happened",
  "rootCause": "The likely root cause or pattern identified",
  "impact": "Description of the impact on users/systems in 2-3 sentences",
  "suggestedActions": ["Action 1", "Action 2", "Action 3"]
}

Example output for a database connection failure:
{
  "summary": "Database connection pool exhaustion caused cascading failures across payment and order services.",
  "rootCause": "Connection leak in payment-service v2.3.1 preventing proper connection release",
  "impact": "Users experienced 30% checkout failure rate over 15 minutes. Approximately 450 failed transactions during the incident window.",
  "suggestedActions": ["Restart payment-service pods to release connections", "Increase connection pool timeout", "Deploy hotfix for connection leak in payment-service"]
}

Now analyze the provided events and respond with JSON only:`;

const BATCH_INCIDENTS_PROMPT = `Analyze the following batch of incidents and provide structured summaries for each.

{{INCIDENTS_BLOCK}}

For each incident, provide analysis in this exact JSON format:
{
  "incidents": [
    {
      "incidentId": "the incident ID from input",
      "summary": "A concise 1-2 sentence summary",
      "rootCause": "The likely root cause or pattern",
      "impact": "2-3 sentence impact description",
      "suggestedActions": ["Action 1", "Action 2", "Action 3"]
    }
  ]
}

Example for multiple incidents:
{
  "incidents": [
    {
      "incidentId": "inc_001",
      "summary": "API gateway timeout spike affecting checkout flow",
      "rootCause": "Downstream inventory service latency exceeding gateway timeout threshold",
      "impact": "15% of checkout requests failed with timeout errors. Users saw 'service unavailable' messages.",
      "suggestedActions": ["Increase gateway timeout to 30s", "Scale inventory service horizontally", "Add circuit breaker for inventory calls"]
    },
    {
      "incidentId": "inc_002",
      "summary": "Memory pressure on worker nodes causing pod evictions",
      "rootCause": "Memory leak in logging sidecar container accumulating over 48 hours",
      "impact": "Intermittent service disruptions as pods were evicted and rescheduled. No data loss reported.",
      "suggestedActions": ["Update logging sidecar to v1.4.2", "Add memory limits to sidecar containers", "Configure node memory alerts at 80%"]
    }
  ]
}

Analyze all incidents and respond with JSON only:`;

/**
 * Format a single incident for the prompt
 * @param {Object} incident - Incident object
 * @param {Array} events - Related events
 * @returns {string} Formatted prompt section
 */
function formatIncidentBlock(incident, events) {
  const services = [...new Set(events.map(e => e.service))].join(', ');
  const timestamps = events.map(e => new Date(e.timestamp).getTime());
  const startTime = new Date(Math.min(...timestamps)).toISOString();
  const endTime = new Date(Math.max(...timestamps)).toISOString();
  const maxSeverity = Math.max(...events.map(e => e.severity));

  return `
---
Incident ID: ${incident.incidentId}
Services: ${services}
Time Range: ${startTime} to ${endTime}
Event Count: ${events.length}
Max Severity: ${maxSeverity}/5

Events:
\`\`\`json
${JSON.stringify(events, null, 2)}
\`\`\`
---`;
}

/**
 * Build prompt for single incident summarization
 * @param {Object} incident - Incident object
 * @param {Array} events - Related events
 * @returns {Object} Messages array for API call
 */
function buildSingleIncidentPrompt(incident, events) {
  const services = [...new Set(events.map(e => e.service))].join(', ');
  const timestamps = events.map(e => new Date(e.timestamp).getTime());
  const startTime = new Date(Math.min(...timestamps)).toISOString();
  const endTime = new Date(Math.max(...timestamps)).toISOString();
  const maxSeverity = Math.max(...events.map(e => e.severity));

  const userPrompt = SINGLE_INCIDENT_PROMPT
    .replace('{{EVENTS}}', JSON.stringify(events, null, 2))
    .replace('{{SERVICES}}', services)
    .replace('{{TIME_RANGE}}', `${startTime} to ${endTime}`)
    .replace('{{EVENT_COUNT}}', events.length.toString())
    .replace('{{MAX_SEVERITY}}', `${maxSeverity}/5`);

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    metadata: {
      incidentId: incident.incidentId,
      eventCount: events.length,
      services: services.split(', ')
    }
  };
}

/**
 * Build prompt for batch incident summarization
 * @param {Array} incidentBatch - Array of { incident, events } objects
 * @returns {Object} Messages array for API call
 */
function buildBatchIncidentPrompt(incidentBatch) {
  const incidentsBlock = incidentBatch
    .map(({ incident, events }) => formatIncidentBlock(incident, events))
    .join('\n');

  const userPrompt = BATCH_INCIDENTS_PROMPT
    .replace('{{INCIDENTS_BLOCK}}', incidentsBlock);

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    metadata: {
      incidentCount: incidentBatch.length,
      incidentIds: incidentBatch.map(b => b.incident.incidentId),
      totalEvents: incidentBatch.reduce((sum, b) => sum + b.events.length, 0)
    }
  };
}

/**
 * Parse AI response for single incident
 * @param {string} response - AI response text
 * @returns {Object} Parsed summary object
 */
function parseSingleResponse(response) {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    const required = ['summary', 'rootCause', 'impact', 'suggestedActions'];
    for (const field of required) {
      if (!parsed[field]) {
        parsed[field] = field === 'suggestedActions' ? [] : 'Unable to determine';
      }
    }

    // Ensure suggestedActions is an array
    if (!Array.isArray(parsed.suggestedActions)) {
      parsed.suggestedActions = [parsed.suggestedActions].filter(Boolean);
    }

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: {
        summary: 'Summary generation failed',
        rootCause: 'Unable to determine',
        impact: 'Unable to assess impact',
        suggestedActions: ['Review incident manually']
      }
    };
  }
}

/**
 * Parse AI response for batch incidents
 * @param {string} response - AI response text
 * @returns {Object} Parsed summaries by incident ID
 */
function parseBatchResponse(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.incidents || !Array.isArray(parsed.incidents)) {
      throw new Error('Invalid batch response format');
    }

    const summaries = {};
    for (const incident of parsed.incidents) {
      if (incident.incidentId) {
        summaries[incident.incidentId] = {
          summary: incident.summary || 'Summary unavailable',
          rootCause: incident.rootCause || 'Unable to determine',
          impact: incident.impact || 'Unable to assess',
          suggestedActions: incident.suggestedActions || []
        };
      }
    }

    return {
      success: true,
      data: summaries
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: {}
    };
  }
}

module.exports = {
  SYSTEM_PROMPT,
  SINGLE_INCIDENT_PROMPT,
  BATCH_INCIDENTS_PROMPT,
  buildSingleIncidentPrompt,
  buildBatchIncidentPrompt,
  parseSingleResponse,
  parseBatchResponse,
  formatIncidentBlock
};
