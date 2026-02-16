import { config } from '../utils/config';

async function fetchApi(endpoint, options = {}) {
  const url = `${config.apiUrl}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `HTTP error ${response.status}`);
  }

  return data;
}

// Events API
export const eventsApi = {
  getEvents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/events${query ? `?${query}` : ''}`);
  },

  getEvent: (eventId) => fetchApi(`/events/${eventId}`),

  getStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/events/stats${query ? `?${query}` : ''}`);
  },

  createEvent: (event) => fetchApi('/events', {
    method: 'POST',
    body: JSON.stringify(event),
  }),
};

// Incidents API
export const incidentsApi = {
  getIncidents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/incidents${query ? `?${query}` : ''}`);
  },

  getIncident: (incidentId) => fetchApi(`/incidents/${incidentId}`),

  getActiveIncidents: () => fetchApi('/incidents/active'),

  getStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/incidents/stats${query ? `?${query}` : ''}`);
  },

  updateIncident: (incidentId, data) => fetchApi(`/incidents/${incidentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),

  resolveIncident: (incidentId) => fetchApi(`/incidents/${incidentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved' }),
  }),
};

// AI API
export const aiApi = {
  getHealth: () => fetchApi('/ai/health'),

  getMetrics: () => fetchApi('/ai/metrics'),

  summarizeIncident: (incidentId) => fetchApi(`/ai/summarize/${incidentId}`, {
    method: 'POST',
  }),

  getCircuitBreakerStatus: () => fetchApi('/ai/circuit-breaker'),
};
