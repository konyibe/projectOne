const defaultWsUrl =
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:5000';

export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  wsUrl: import.meta.env.VITE_WS_URL || defaultWsUrl,
};

export const SEVERITY_COLORS = {
  1: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-500', fill: '#3B82F6' },
  2: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500', fill: '#22C55E' },
  3: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500', fill: '#EAB308' },
  4: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500', fill: '#F97316' },
  5: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500', fill: '#EF4444' },
};

export const SEVERITY_LABELS = {
  1: 'Info',
  2: 'Low',
  3: 'Warning',
  4: 'High',
  5: 'Critical',
};

export const STATUS_COLORS = {
  active: { bg: 'bg-red-100', text: 'text-red-800' },
  investigating: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  resolved: { bg: 'bg-green-100', text: 'text-green-800' },
};
