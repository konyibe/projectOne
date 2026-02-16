/**
 * AI Service for Incident Summarization
 * Supports Claude (Anthropic) and OpenAI APIs
 */

const https = require('https');
const { redactEvents } = require('./piiRedactor');
const {
  buildSingleIncidentPrompt,
  buildBatchIncidentPrompt,
  parseSingleResponse,
  parseBatchResponse
} = require('./promptTemplates');
const CircuitBreaker = require('./circuitBreaker');

// Default configuration
const DEFAULT_CONFIG = {
  provider: process.env.AI_PROVIDER || 'claude', // 'claude' or 'openai'
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  timeout: 60000,  // 60 seconds
  maxTokens: 1024,
  temperature: 0.3 // Low temperature for consistent output
};

// API endpoints
const ENDPOINTS = {
  claude: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307'
  },
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
  }
};

class AIService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = this.config.provider;

    // Validate API key
    this.apiKey = this.provider === 'claude'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

    // Circuit breaker for API calls
    this.circuitBreaker = new CircuitBreaker({
      name: `ai-service-${this.provider}`,
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000
    });

    // Metrics tracking
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      fallbacks: 0
    };
  }

  /**
   * Check if AI service is available
   * @returns {boolean}
   */
  isAvailable() {
    if (!this.apiKey) {
      return false;
    }
    return this.circuitBreaker.canExecute();
  }

  /**
   * Sleep for exponential backoff
   * @param {number} attempt - Current attempt number
   * @returns {Promise}
   */
  async sleep(attempt) {
    const delay = Math.min(
      this.config.baseDelay * Math.pow(2, attempt),
      this.config.maxDelay
    );
    const jitter = delay * 0.1 * Math.random();
    await new Promise(resolve => setTimeout(resolve, delay + jitter));
  }

  /**
   * Make HTTP request to AI API
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>}
   */
  makeRequest(payload) {
    return new Promise((resolve, reject) => {
      const endpoint = ENDPOINTS[this.provider];
      const headers = this.getHeaders();

      const options = {
        hostname: endpoint.host,
        path: endpoint.path,
        method: 'POST',
        headers,
        timeout: this.config.timeout
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (res.statusCode >= 400) {
              const error = new Error(parsed.error?.message || `API error: ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.response = parsed;
              reject(error);
              return;
            }

            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Get API-specific headers
   * @returns {Object}
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.provider === 'claude') {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Build provider-specific payload
   * @param {Array} messages - Messages array
   * @returns {Object}
   */
  buildPayload(messages) {
    const endpoint = ENDPOINTS[this.provider];

    if (this.provider === 'claude') {
      // Extract system message
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      return {
        model: endpoint.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemMessage?.content || '',
        messages: userMessages
      };
    } else {
      // OpenAI format
      return {
        model: endpoint.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages
      };
    }
  }

  /**
   * Extract response text from provider response
   * @param {Object} response - API response
   * @returns {string}
   */
  extractResponseText(response) {
    if (this.provider === 'claude') {
      return response.content?.[0]?.text || '';
    } else {
      return response.choices?.[0]?.message?.content || '';
    }
  }

  /**
   * Extract token usage from response
   * @param {Object} response - API response
   * @returns {Object}
   */
  extractTokenUsage(response) {
    if (this.provider === 'claude') {
      return {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0
      };
    } else {
      return {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      };
    }
  }

  /**
   * Call AI API with retry logic
   * @param {Array} messages - Messages array
   * @returns {Promise<Object>}
   */
  async callWithRetry(messages) {
    const startTime = Date.now();
    let lastError;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const payload = this.buildPayload(messages);
        const response = await this.makeRequest(payload);

        const latency = Date.now() - startTime;
        const usage = this.extractTokenUsage(response);

        this.metrics.totalCalls++;
        this.metrics.successfulCalls++;
        this.metrics.totalLatencyMs += latency;
        this.metrics.totalInputTokens += usage.input;
        this.metrics.totalOutputTokens += usage.output;

        return {
          text: this.extractResponseText(response),
          usage,
          latency,
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error;
        console.error(`[AIService] Attempt ${attempt + 1} failed:`, error.message);

        // Don't retry on certain errors
        if (error.statusCode === 401 || error.statusCode === 403) {
          throw error; // Auth errors - don't retry
        }

        if (error.statusCode === 429) {
          // Rate limited - wait longer
          await this.sleep(attempt + 2);
        } else if (attempt < this.config.maxRetries - 1) {
          await this.sleep(attempt);
        }
      }
    }

    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    throw lastError;
  }

  /**
   * Summarize a single incident
   * @param {Object} incident - Incident object
   * @param {Array} events - Related events
   * @returns {Promise<Object>}
   */
  async summarizeIncident(incident, events) {
    if (!this.isAvailable()) {
      this.metrics.fallbacks++;
      return this.getFallbackSummary(incident, events);
    }

    try {
      // Redact PII from events
      const { events: redactedEvents, stats: redactionStats } = redactEvents(events);

      // Build prompt
      const { messages, metadata } = buildSingleIncidentPrompt(incident, redactedEvents);

      // Call API with circuit breaker
      const result = await this.circuitBreaker.execute(() =>
        this.callWithRetry(messages)
      );

      // Parse response
      const parsed = parseSingleResponse(result.text);

      return {
        success: parsed.success,
        ...parsed.data,
        metadata: {
          ...metadata,
          latencyMs: result.latency,
          tokenUsage: result.usage,
          attempts: result.attempt,
          redactionStats
        }
      };
    } catch (error) {
      console.error('[AIService] summarizeIncident failed:', error.message);
      this.metrics.fallbacks++;
      return this.getFallbackSummary(incident, events);
    }
  }

  /**
   * Summarize multiple incidents in a batch
   * @param {Array} incidentBatch - Array of { incident, events } objects
   * @returns {Promise<Object>}
   */
  async summarizeBatch(incidentBatch) {
    if (!this.isAvailable() || incidentBatch.length === 0) {
      this.metrics.fallbacks++;
      return this.getBatchFallback(incidentBatch);
    }

    try {
      // Redact PII from all events
      const redactedBatch = incidentBatch.map(({ incident, events }) => ({
        incident,
        events: redactEvents(events).events
      }));

      // Build batch prompt
      const { messages, metadata } = buildBatchIncidentPrompt(redactedBatch);

      // Call API with circuit breaker
      const result = await this.circuitBreaker.execute(() =>
        this.callWithRetry(messages)
      );

      // Parse batch response
      const parsed = parseBatchResponse(result.text);

      // Fill in any missing summaries with fallbacks
      const summaries = {};
      for (const { incident, events } of incidentBatch) {
        if (parsed.data[incident.incidentId]) {
          summaries[incident.incidentId] = {
            success: true,
            ...parsed.data[incident.incidentId]
          };
        } else {
          summaries[incident.incidentId] = this.getFallbackSummary(incident, events);
        }
      }

      return {
        success: parsed.success,
        summaries,
        metadata: {
          ...metadata,
          latencyMs: result.latency,
          tokenUsage: result.usage,
          attempts: result.attempt
        }
      };
    } catch (error) {
      console.error('[AIService] summarizeBatch failed:', error.message);
      this.metrics.fallbacks++;
      return this.getBatchFallback(incidentBatch);
    }
  }

  /**
   * Generate fallback summary when AI is unavailable
   * @param {Object} incident - Incident object
   * @param {Array} events - Related events
   * @returns {Object}
   */
  getFallbackSummary(incident, events) {
    const services = [...new Set(events.map(e => e.service))];
    const maxSeverity = Math.max(...events.map(e => e.severity), 1);

    return {
      success: false,
      summary: `${events.length} events detected across ${services.join(', ')}. AI summary unavailable.`,
      rootCause: 'Automated analysis unavailable - manual review required',
      impact: `Severity level ${maxSeverity}/5 incident affecting ${services.length} service(s)`,
      suggestedActions: [
        'Review event details manually',
        'Check service health dashboards',
        'Escalate if severity is critical'
      ],
      metadata: {
        fallback: true,
        reason: 'AI service unavailable'
      }
    };
  }

  /**
   * Generate fallback summaries for batch
   * @param {Array} incidentBatch - Array of { incident, events } objects
   * @returns {Object}
   */
  getBatchFallback(incidentBatch) {
    const summaries = {};

    for (const { incident, events } of incidentBatch) {
      summaries[incident.incidentId] = this.getFallbackSummary(incident, events);
    }

    return {
      success: false,
      summaries,
      metadata: {
        fallback: true,
        reason: 'AI service unavailable'
      }
    };
  }

  /**
   * Get service metrics
   * @returns {Object}
   */
  getMetrics() {
    const avgLatency = this.metrics.successfulCalls > 0
      ? Math.round(this.metrics.totalLatencyMs / this.metrics.successfulCalls)
      : 0;

    return {
      ...this.metrics,
      avgLatencyMs: avgLatency,
      circuitBreaker: this.circuitBreaker.getStatus(),
      provider: this.provider,
      isAvailable: this.isAvailable()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      fallbacks: 0
    };
  }
}

// Singleton instance
const aiService = new AIService();

module.exports = aiService;
module.exports.AIService = AIService;
