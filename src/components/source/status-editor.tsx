import { QuickStatus } from '@/components/dashboard/quick-status';
import type { SourceStatus } from '@/lib/constants';

/** Labeled wrapper around the dashboard's status dropdown, for the detail page. */
export function StatusEditor({
  sourceId,
  status,
}: {
  sourceId: string;
  status: SourceStatus;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">Status</span>
      <QuickStatus sourceId={sourceId} status={status} />
    </div>
  );
}
