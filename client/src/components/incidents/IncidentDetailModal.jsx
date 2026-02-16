import { Modal } from '../common/Modal';
import { SeverityBadge } from '../common/SeverityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { formatTimestamp, formatDuration } from '../../utils/formatters';

export function IncidentDetailModal({ incident, isOpen, onClose }) {
  if (!incident) return null;

  const duration = incident.resolvedAt
    ? new Date(incident.resolvedAt) - new Date(incident.createdAt)
    : Date.now() - new Date(incident.createdAt);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Incident Details" size="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SeverityBadge severity={incident.severityScore} size="lg" />
              <StatusBadge status={incident.status} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {incident.affectedServices?.join(', ') || 'Unknown Service'}
            </h3>
            <p className="text-sm text-gray-500">
              ID: {incident.incidentId}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Created: {formatTimestamp(incident.createdAt)}</p>
            {incident.resolvedAt && (
              <p>Resolved: {formatTimestamp(incident.resolvedAt)}</p>
            )}
            <p>Duration: {formatDuration(duration)}</p>
          </div>
        </div>

        {/* AI Summary */}
        {(incident.aiGeneratedSummary || incident.summary) && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Summary
            </h4>
            <p className="text-gray-700 dark:text-gray-300">
              {incident.aiGeneratedSummary || incident.summary}
            </p>
          </div>
        )}

        {/* Root Cause */}
        {incident.rootCause && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Root Cause
            </h4>
            <p className="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              {incident.rootCause}
            </p>
          </div>
        )}

        {/* Suggested Actions */}
        {incident.suggestedActions?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Suggested Actions
            </h4>
            <ul className="space-y-2">
              {incident.suggestedActions.map((action, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3"
                >
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-sm font-medium">
                    {i + 1}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Event Count */}
        <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-700">
          <span>{incident.eventIds?.length || 0} events clustered</span>
          {incident.assignedTo && (
            <span>Assigned to: {incident.assignedTo}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
