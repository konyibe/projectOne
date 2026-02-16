import { useState } from 'react';
import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { incidentsApi, aiApi } from '../../services/api';
import { SeverityBadge } from '../common/SeverityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { formatRelativeTime, formatEventCount } from '../../utils/formatters';
import { LoadingSkeleton } from '../common/LoadingSkeleton';

export function IncidentCard({ incident }) {
  const { updateIncident, setSelectedIncident } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleResolve = async (e) => {
    e.stopPropagation();
    try {
      setResolving(true);
      await incidentsApi.resolveIncident(incident.incidentId);
      updateIncident({ ...incident, status: 'resolved', resolvedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Failed to resolve incident:', error);
    } finally {
      setResolving(false);
    }
  };

  const handleRegenerateSummary = async (e) => {
    e.stopPropagation();
    try {
      setRegenerating(true);
      const result = await aiApi.summarizeIncident(incident.incidentId);
      if (result.success) {
        updateIncident({
          ...incident,
          aiGeneratedSummary: result.data.summary,
          summary: result.data.summary,
          rootCause: result.data.rootCause,
        });
      }
    } catch (error) {
      console.error('Failed to regenerate summary:', error);
    } finally {
      setRegenerating(false);
    }
  };

  const hasSummary = incident.aiGeneratedSummary || incident.summary;
  const isActive = incident.status === 'active' || incident.status === 'investigating';

  return (
    <div
      className={clsx(
        'card p-4 cursor-pointer transition-all hover:shadow-md',
        'border-l-4',
        {
          'border-l-red-500': incident.severityScore >= 4,
          'border-l-orange-500': incident.severityScore === 3,
          'border-l-yellow-500': incident.severityScore === 2,
          'border-l-blue-500': incident.severityScore <= 1,
        }
      )}
      onClick={() => setSelectedIncident(incident)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={incident.severityScore} />
          <StatusBadge status={incident.status} />
        </div>
        <time className="text-xs text-gray-500">
          {formatRelativeTime(incident.createdAt)}
        </time>
      </div>

      {/* Service & Event Count */}
      <div className="mb-2">
        <h3 className="font-medium text-gray-900 dark:text-white">
          {incident.affectedServices?.join(', ') || 'Unknown Service'}
        </h3>
        <p className="text-sm text-gray-500">
          {formatEventCount(incident.eventIds?.length || 0)} events clustered
        </p>
      </div>

      {/* Summary Preview or Loading */}
      <div className="mb-3">
        {regenerating ? (
          <LoadingSkeleton lines={2} />
        ) : hasSummary ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {incident.aiGeneratedSummary || incident.summary}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            AI summary generating...
          </p>
        )}
      </div>

      {/* Expandable AI Details */}
      {expanded && hasSummary && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {/* Root Cause */}
          {incident.rootCause && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Root Cause
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {incident.rootCause}
              </p>
            </div>
          )}

          {/* Suggested Actions */}
          {incident.suggestedActions?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Suggested Actions
              </h4>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                {incident.suggestedActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500">•</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          {expanded ? 'Show less' : 'Show details'}
          <svg
            className={clsx('w-4 h-4 transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {!hasSummary && (
            <button
              onClick={handleRegenerateSummary}
              disabled={regenerating}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Generate Summary
            </button>
          )}

          {isActive && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className={clsx(
                'btn btn-success text-xs py-1 px-3',
                resolving && 'opacity-50 cursor-not-allowed'
              )}
            >
              {resolving ? 'Resolving...' : 'Resolve'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
