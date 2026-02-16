import { useState, useRef, useCallback, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { SeverityBadge, SeverityDot } from '../common/SeverityBadge';
import { formatTimestamp, formatRelativeTime } from '../../utils/formatters';
import { EventFilters } from './EventFilters';

const ROW_HEIGHT = 72;

function EventRow({ index, style, data }) {
  const event = data.events[index];
  const isHovered = data.hoveredIndex === index;

  if (!event) return null;

  return (
    <div
      style={style}
      className={clsx(
        'px-4 py-2 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors',
        isHovered && 'bg-gray-50 dark:bg-gray-700/50'
      )}
      onMouseEnter={() => data.onHover(index)}
      onMouseLeave={() => data.onHover(null)}
    >
      <div className="flex items-start gap-3">
        <SeverityDot severity={event.severity} pulse={event.severity >= 4} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {event.service}
            </span>
            <SeverityBadge severity={event.severity} size="sm" />
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {event.metadata?.message || event.metadata?.errorType || `Event ${event.eventId}`}
          </p>

          <div className="flex items-center gap-2 mt-1">
            <time
              className="text-xs text-gray-500 dark:text-gray-500"
              title={new Date(event.timestamp).toLocaleString()}
            >
              {formatRelativeTime(event.timestamp)}
            </time>
            {event.tags?.length > 0 && (
              <div className="flex gap-1">
                {event.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventStream() {
  const { getFilteredEvents, isPaused, togglePaused } = useStore();
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const [listHeight, setListHeight] = useState(400);

  const events = getFilteredEvents();

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height || 400;
      setListHeight(height - 120); // Subtract header height
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (autoScroll && !isPaused && listRef.current) {
      listRef.current.scrollToItem(0);
    }
  }, [events.length, autoScroll, isPaused]);

  const handleScroll = useCallback(({ scrollOffset }) => {
    // Disable auto-scroll if user scrolls away from top
    setAutoScroll(scrollOffset < 50);
  }, []);

  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
    // Pause updates when hovering
    if (index !== null && !isPaused) {
      // Optional: auto-pause on hover
    }
  }, [isPaused]);

  const itemData = {
    events,
    hoveredIndex,
    onHover: handleHover,
  };

  return (
    <div ref={containerRef} className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Event Stream
          </h2>
          <span className="text-sm text-gray-500">
            ({events.length} events)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={clsx(
              'p-1.5 rounded transition-colors',
              autoScroll
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            )}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          <button
            onClick={togglePaused}
            className={clsx(
              'p-1.5 rounded transition-colors',
              isPaused
                ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            )}
            title={isPaused ? 'Resume updates' : 'Pause updates'}
          >
            {isPaused ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <EventFilters />

      {/* Event List */}
      <div className="flex-1 overflow-hidden">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p>No events to display</p>
            <p className="text-sm">Events will appear here in real-time</p>
          </div>
        ) : (
          <List
            ref={listRef}
            height={listHeight}
            itemCount={events.length}
            itemSize={ROW_HEIGHT}
            itemData={itemData}
            onScroll={handleScroll}
            overscanCount={5}
          >
            {EventRow}
          </List>
        )}
      </div>
    </div>
  );
}
