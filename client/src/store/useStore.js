import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const MAX_EVENTS = 1000;

export const useStore = create(
  subscribeWithSelector((set, get) => ({
    // Connection state
    isConnected: false,
    connectionError: null,
    reconnectAttempts: 0,

    // Events
    events: [],
    eventFilters: {
      service: '',
      minSeverity: 1,
      maxSeverity: 5,
    },

    // Incidents
    incidents: [],
    selectedIncident: null,
    incidentSortBy: 'severity', // 'severity' | 'recency'

    // UI state
    darkMode: localStorage.getItem('darkMode') === 'true',
    isPaused: false,
    timeRange: '24h', // '1h' | '6h' | '24h' | '7d'

    // Actions - Connection
    setConnected: (isConnected) => set({ isConnected, connectionError: null }),
    setConnectionError: (error) => set({ connectionError: error, isConnected: false }),
    incrementReconnectAttempts: () => set((state) => ({
      reconnectAttempts: state.reconnectAttempts + 1
    })),
    resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),

    // Actions - Events
    addEvent: (event) => set((state) => {
      const newEvents = [event, ...state.events].slice(0, MAX_EVENTS);
      return { events: newEvents };
    }),

    addEvents: (events) => set((state) => {
      const newEvents = [...events, ...state.events].slice(0, MAX_EVENTS);
      return { events: newEvents };
    }),

    clearEvents: () => set({ events: [] }),

    setEventFilters: (filters) => set((state) => ({
      eventFilters: { ...state.eventFilters, ...filters }
    })),

    // Actions - Incidents
    setIncidents: (incidents) => set({ incidents }),

    addIncident: (incident) => set((state) => ({
      incidents: [incident, ...state.incidents.filter(i => i.incidentId !== incident.incidentId)]
    })),

    updateIncident: (updatedIncident) => set((state) => ({
      incidents: state.incidents.map((incident) =>
        incident.incidentId === updatedIncident.incidentId
          ? { ...incident, ...updatedIncident }
          : incident
      ),
      selectedIncident: state.selectedIncident?.incidentId === updatedIncident.incidentId
        ? { ...state.selectedIncident, ...updatedIncident }
        : state.selectedIncident
    })),

    removeIncident: (incidentId) => set((state) => ({
      incidents: state.incidents.filter((i) => i.incidentId !== incidentId),
      selectedIncident: state.selectedIncident?.incidentId === incidentId
        ? null
        : state.selectedIncident
    })),

    setSelectedIncident: (incident) => set({ selectedIncident: incident }),

    setIncidentSortBy: (sortBy) => set({ incidentSortBy: sortBy }),

    // Actions - UI
    toggleDarkMode: () => set((state) => {
      const newMode = !state.darkMode;
      localStorage.setItem('darkMode', newMode.toString());
      return { darkMode: newMode };
    }),

    togglePaused: () => set((state) => ({ isPaused: !state.isPaused })),

    setTimeRange: (range) => set({ timeRange: range }),

    // Selectors
    getFilteredEvents: () => {
      const state = get();
      const { events, eventFilters } = state;

      return events.filter((event) => {
        if (eventFilters.service && !event.service.toLowerCase().includes(eventFilters.service.toLowerCase())) {
          return false;
        }
        if (event.severity < eventFilters.minSeverity || event.severity > eventFilters.maxSeverity) {
          return false;
        }
        return true;
      });
    },

    getSortedIncidents: () => {
      const state = get();
      const { incidents, incidentSortBy } = state;

      return [...incidents].sort((a, b) => {
        if (incidentSortBy === 'severity') {
          return b.severityScore - a.severityScore;
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    },

    getActiveIncidents: () => {
      const state = get();
      return state.incidents.filter((i) => i.status === 'active' || i.status === 'investigating');
    },
  }))
);

// Dark mode side effect
useStore.subscribe(
  (state) => state.darkMode,
  (darkMode) => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
  { fireImmediately: true }
);
