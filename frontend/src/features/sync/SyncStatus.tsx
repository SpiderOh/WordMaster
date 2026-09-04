import { CloudOff, RefreshCw } from "lucide-react";

import type { SyncQueueStatus } from "../../lib/sync/SyncQueue";

export function SyncStatus({ online, status }: { online: boolean; status: SyncQueueStatus }) {
  if (online && status.pending === 0 && !status.syncing) return null;
  return <aside className="sync-status" role="status">{online ? <RefreshCw aria-hidden="true" size={16} /> : <CloudOff aria-hidden="true" size={16} />}<span>{online ? status.syncing ? "正在同步" : `${status.pending} 项待同步` : `离线 · ${status.pending} 项待同步`}</span></aside>;
}
