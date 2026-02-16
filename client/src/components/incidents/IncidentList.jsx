import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { incidentsApi } from '../../services/api';
import { IncidentCard } from './IncidentCard';
import { IncidentCardSkeleton } from '../common/LoadingSkeleton';

export function IncidentList() {
  const {
    incidents,
    setIncidents,
    getSortedIncidents,
    incidentSortBy,
    setIncidentSortBy,
  } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch incidents on mount
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        setLoading(true);
        const response = await incidentsApi.getActiveIncidents();
        setIncidents(response.data || []);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Failed to fetch incidents:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [setIncidents]);

  const sortedIncidents = getSortedIncidents();
  const activeCount = incidents.filter(
    (i) => i.status === 'active' || i.status === 'investigating'
  ).length;

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Active Incidents
          </h2>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-full">
              {activeCount}
            </span>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort by:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setIncidentSortBy('severity')}
              className={clsx(
                'px-2 py-1 text-xs transition-colors',
                incidentSortBy === 'severity'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              )}
            >
              Severity
            </button>
            <button
              onClick={() => setIncidentSortBy('recency')}
              className={clsx(
                'px-2 py-1 text-xs transition-colors',
                incidentSortBy === 'recency'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
              )}
            >
              Recent
            </button>
          </div>
        </div>
      </div>

      {/* Incident List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <>
            <IncidentCardSkeleton />
            <IncidentCardSkeleton />
            <IncidentCardSkeleton />
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-12 h-12 mb-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : sortedIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-12 h-12 mb-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No active incidents</p>
            <p className="text-sm">All systems operational</p>
          </div>
        ) : (
          sortedIncidents.map((incident) => (
            <IncidentCard key={incident.incidentId} incident={incident} />
          ))
        )}
      </div>
    </div>
  );
}
