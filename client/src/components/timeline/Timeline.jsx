import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import clsx from 'clsx';
import { format, subHours, subDays } from 'date-fns';
import { useStore } from '../../store/useStore';
import { incidentsApi } from '../../services/api';
import { SEVERITY_COLORS } from '../../utils/config';
import { IncidentDetailModal } from '../incidents/IncidentDetailModal';

const TIME_RANGES = {
  '1h': { label: '1 Hour', hours: 1 },
  '6h': { label: '6 Hours', hours: 6 },
  '24h': { label: '24 Hours', hours: 24 },
  '7d': { label: '7 Days', hours: 168 },
};

export function Timeline() {
  const { timeRange, setTimeRange, incidents } = useStore();
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch historical incidents
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const hours = TIME_RANGES[timeRange].hours;
        const startDate = hours <= 24
          ? subHours(new Date(), hours)
          : subDays(new Date(), hours / 24);

        const response = await incidentsApi.getIncidents({
          startDate: startDate.toISOString(),
          limit: 100,
        });

        setHistoryData(response.data || []);
      } catch (error) {
        console.error('Failed to fetch incident history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [timeRange]);

  // Process data for chart
  const chartData = useMemo(() => {
    const hours = TIME_RANGES[timeRange].hours;
    const bucketCount = hours <= 6 ? hours * 4 : hours <= 24 ? 24 : 28;
    const bucketSize = (hours * 60 * 60 * 1000) / bucketCount;
    const now = Date.now();
    const startTime = now - (hours * 60 * 60 * 1000);

    // Initialize buckets
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const time = startTime + (i * bucketSize);
      return {
        time,
        label: format(new Date(time), hours <= 6 ? 'HH:mm' : hours <= 24 ? 'HH:00' : 'MMM d'),
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        incidents: [],
      };
    });

    // Fill buckets with incidents
    const allIncidents = [...historyData, ...incidents];
    allIncidents.forEach((incident) => {
      const incidentTime = new Date(incident.createdAt).getTime();
      if (incidentTime < startTime) return;

      const bucketIndex = Math.floor((incidentTime - startTime) / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].total++;
        buckets[bucketIndex].incidents.push(incident);

        if (incident.severityScore >= 4) buckets[bucketIndex].critical++;
        else if (incident.severityScore === 3) buckets[bucketIndex].high++;
        else if (incident.severityScore === 2) buckets[bucketIndex].medium++;
        else buckets[bucketIndex].low++;
      }
    });

    return buckets;
  }, [historyData, incidents, timeRange]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;

    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="font-medium text-gray-900 dark:text-white mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600 dark:text-gray-400">Critical: {data.critical}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-gray-600 dark:text-gray-400">High: {data.high}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">Medium: {data.medium}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Low: {data.low}</span>
          </div>
        </div>
        {data.incidents.length > 0 && (
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
            Click to view details
          </p>
        )}
      </div>
    );
  };

  const handleChartClick = (data) => {
    if (data?.activePayload?.[0]?.payload?.incidents?.length > 0) {
      const incident = data.activePayload[0].payload.incidents[0];
      setSelectedIncident(incident);
    }
  };

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          Incident Timeline
        </h2>

        {/* Time Range Controls */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {Object.entries(TIME_RANGES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={clsx(
                'px-3 py-1 text-xs rounded-md transition-colors',
                timeRange === key
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Loading timeline...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={handleChartClick}
            >
              <defs>
                <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorMedium" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EAB308" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#EAB308" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="critical"
                stackId="1"
                stroke="#EF4444"
                fill="url(#colorCritical)"
              />
              <Area
                type="monotone"
                dataKey="high"
                stackId="1"
                stroke="#F97316"
                fill="url(#colorHigh)"
              />
              <Area
                type="monotone"
                dataKey="medium"
                stackId="1"
                stroke="#EAB308"
                fill="url(#colorMedium)"
              />
              <Area
                type="monotone"
                dataKey="low"
                stackId="1"
                stroke="#3B82F6"
                fill="url(#colorLow)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Incident Detail Modal */}
      <IncidentDetailModal
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
