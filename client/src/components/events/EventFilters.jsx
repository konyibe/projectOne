import { useStore } from '../../store/useStore';
import { SEVERITY_LABELS } from '../../utils/config';

export function EventFilters() {
  const { eventFilters, setEventFilters } = useStore();

  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
      {/* Service Filter */}
      <div className="flex-1">
        <input
          type="text"
          placeholder="Filter by service..."
          value={eventFilters.service}
          onChange={(e) => setEventFilters({ service: e.target.value })}
          className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
        />
      </div>

      {/* Severity Filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Severity:</label>
        <select
          value={eventFilters.minSeverity}
          onChange={(e) => setEventFilters({ minSeverity: parseInt(e.target.value) })}
          className="px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg dark:text-white"
        >
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}+
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(eventFilters.service || eventFilters.minSeverity > 1) && (
        <button
          onClick={() => setEventFilters({ service: '', minSeverity: 1 })}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
