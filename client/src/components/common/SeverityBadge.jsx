import clsx from 'clsx';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../utils/config';

export function SeverityBadge({ severity, size = 'md', showLabel = true }) {
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS[1];
  const label = SEVERITY_LABELS[severity] || 'Unknown';

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={clsx(
        'badge',
        colors.bg,
        colors.text,
        sizeClasses[size]
      )}
    >
      {showLabel ? label : severity}
    </span>
  );
}

export function SeverityDot({ severity, size = 'md', pulse = false }) {
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS[1];

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <span className="relative flex">
      <span
        className={clsx(
          'rounded-full',
          sizeClasses[size],
          colors.bg.replace('100', '500')
        )}
      />
      {pulse && (
        <span
          className={clsx(
            'absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping',
            colors.bg.replace('100', '400')
          )}
        />
      )}
    </span>
  );
}
