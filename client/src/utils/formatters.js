import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return format(date, "'Today' HH:mm:ss");
  }

  if (isYesterday(date)) {
    return format(date, "'Yesterday' HH:mm:ss");
  }

  return format(date, 'MMM d, HH:mm:ss');
}

export function formatRelativeTime(timestamp) {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

export function truncate(str, length = 50) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function formatEventCount(count) {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
}
