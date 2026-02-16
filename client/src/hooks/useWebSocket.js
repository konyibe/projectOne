import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { config } from '../utils/config';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

export function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscriptionRef = useRef(new Set());

  const {
    setConnected,
    setConnectionError,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reconnectAttempts,
    addEvent,
    addIncident,
    updateIncident,
    isPaused,
  } = useStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(config.wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Connected');
        setConnected(true);
        resetReconnectAttempts();

        // Resubscribe to previous channels
        if (subscriptionRef.current.size > 0) {
          wsRef.current.send(JSON.stringify({
            type: 'subscribe',
            channels: Array.from(subscriptionRef.current)
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setConnected(false);
        scheduleReconnect();
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setConnectionError('WebSocket connection failed');
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      setConnectionError(error.message);
      scheduleReconnect();
    }
  }, [setConnected, setConnectionError, resetReconnectAttempts]);

  const handleMessage = useCallback((message) => {
    if (isPaused && message.type === 'event') {
      return; // Skip events when paused
    }

    switch (message.type) {
      case 'connection':
        console.log('[WebSocket] Server greeting:', message.message);
        break;

      case 'event':
        addEvent(message.data);
        break;

      case 'incident':
        if (message.action === 'created') {
          addIncident(message.data);
        } else {
          updateIncident(message.data);
        }
        break;

      case 'subscribed':
        console.log('[WebSocket] Subscribed to:', message.channels);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }, [isPaused, addEvent, addIncident, updateIncident]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)];
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      incrementReconnectAttempts();
      connect();
    }, delay);
  }, [reconnectAttempts, incrementReconnectAttempts, connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((channels) => {
    channels.forEach(c => subscriptionRef.current.add(c));

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channels
      }));
    }
  }, []);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    // Heartbeat interval
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    subscribe,
    send,
  };
}
