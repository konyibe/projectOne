import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Header } from './Header';
import { EventStream } from '../events/EventStream';
import { IncidentList } from '../incidents/IncidentList';
import { Timeline } from '../timeline/Timeline';

export function Dashboard() {
  const { toggleDarkMode, togglePaused, clearEvents } = useStore();

  // Initialize WebSocket connection
  useWebSocket();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePaused();
          break;
        case 'd':
          toggleDarkMode();
          break;
        case 'c':
          clearEvents();
          break;
        case 'escape':
          // Close any open modals (handled by modal component)
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDarkMode, togglePaused, clearEvents]);

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-hidden">
        <div className="h-full grid grid-cols-12 grid-rows-6 gap-4">
          {/* Event Stream - Left Column */}
          <div className="col-span-12 lg:col-span-3 row-span-6">
            <ErrorBoundary>
              <EventStream />
            </ErrorBoundary>
          </div>

          {/* Incident List - Center Column */}
          <div className="col-span-12 lg:col-span-5 row-span-4">
            <ErrorBoundary>
              <IncidentList />
            </ErrorBoundary>
          </div>

          {/* Stats Panel - Right Column Top */}
          <div className="col-span-12 lg:col-span-4 row-span-4">
            <ErrorBoundary>
              <StatsPanel />
            </ErrorBoundary>
          </div>

          {/* Timeline - Bottom */}
          <div className="col-span-12 lg:col-span-9 row-span-2">
            <ErrorBoundary>
              <Timeline />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}

// Quick stats panel
function StatsPanel() {
  const { events, incidents } = useStore();

  const activeIncidents = incidents.filter(
    (i) => i.status === 'active' || i.status === 'investigating'
  );
  const criticalCount = activeIncidents.filter((i) => i.severityScore >= 4).length;

  const recentEvents = events.filter(
    (e) => new Date(e.timestamp) > new Date(Date.now() - 5 * 60 * 1000)
  );

  const serviceCount = new Set(recentEvents.map((e) => e.service)).size;

  const stats = [
    {
      label: 'Active Incidents',
      value: activeIncidents.length,
      color: 'text-red-600',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Critical',
      value: criticalCount,
      color: 'text-orange-600',
      bg: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      label: 'Events (5m)',
      value: recentEvents.length,
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Services',
      value: serviceCount,
      color: 'text-purple-600',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <div className="card h-full p-4">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
        Overview
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bg} rounded-lg p-4 text-center`}
          >
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Severity Distribution */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Event Severity Distribution
        </h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((severity) => {
            const count = recentEvents.filter((e) => e.severity === severity).length;
            const percentage = recentEvents.length > 0
              ? (count / recentEvents.length) * 100
              : 0;

            const colors = {
              5: 'bg-red-500',
              4: 'bg-orange-500',
              3: 'bg-yellow-500',
              2: 'bg-green-500',
              1: 'bg-blue-500',
            };

            const labels = {
              5: 'Critical',
              4: 'High',
              3: 'Warning',
              2: 'Low',
              1: 'Info',
            };

            return (
              <div key={severity} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16">{labels[severity]}</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${colors[severity]} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Keyboard Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 dark:text-gray-400">
          <div>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Space</kbd> Pause
          </div>
          <div>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">D</kbd> Dark mode
          </div>
          <div>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">C</kbd> Clear
          </div>
          <div>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> Close
          </div>
        </div>
      </div>
    </div>
  );
}
