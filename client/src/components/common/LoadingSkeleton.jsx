import clsx from 'clsx';

export function LoadingSkeleton({ className, variant = 'text', lines = 1 }) {
  const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700 rounded';

  if (variant === 'card') {
    return (
      <div className={clsx('card p-4 space-y-3', className)}>
        <div className={clsx(baseClass, 'h-4 w-3/4')} />
        <div className={clsx(baseClass, 'h-3 w-1/2')} />
        <div className={clsx(baseClass, 'h-3 w-5/6')} />
        <div className={clsx(baseClass, 'h-3 w-2/3')} />
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        className={clsx(baseClass, 'rounded-full', className || 'w-10 h-10')}
      />
    );
  }

  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            baseClass,
            'h-4',
            i === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
}

export function IncidentCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-5 w-32" />
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-full h-6 w-16" />
      </div>
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-48" />
      <div className="space-y-2">
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-3 w-full" />
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-3 w-5/6" />
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-3 w-4/6" />
      </div>
    </div>
  );
}
