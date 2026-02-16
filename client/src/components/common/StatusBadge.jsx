import clsx from 'clsx';
import { STATUS_COLORS } from '../../utils/config';

export function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.active;

  return (
    <span className={clsx('badge', colors.bg, colors.text)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
