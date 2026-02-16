import clsx from 'clsx';
import { useStore } from '../../store/useStore';

export function ConnectionStatus() {
  const { isConnected, reconnectAttempts, connectionError } = useStore();

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-3 w-3">
        <span
          className={clsx(
            'absolute inline-flex h-full w-full rounded-full opacity-75',
            isConnected ? 'bg-green-400 animate-ping' : 'bg-red-400'
          )}
        />
        <span
          className={clsx(
            'relative inline-flex rounded-full h-3 w-3',
            isConnected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
      </span>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {isConnected ? (
          'Connected'
        ) : connectionError ? (
          <span className="text-red-500">{connectionError}</span>
        ) : reconnectAttempts > 0 ? (
          `Reconnecting... (${reconnectAttempts})`
        ) : (
          'Disconnected'
        )}
      </span>
    </div>
  );
}
