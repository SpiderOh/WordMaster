import { useEffect, useState } from 'react';
import { syncEngine } from '../../lib/sync/syncEngine';

// 顶栏同步状态徽标：有待同步条目、存在冲突或离线时提示
export function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      syncEngine
        .getStatus()
        .then((status) => {
          if (cancelled) {
            return;
          }
          setPending(status.pending);
          setConflictCount(status.conflicts.length);
          setOnline(status.online);
        })
        .catch(() => {
          /* 状态查询失败时保持当前显示 */
        });
    };
    void refresh();
    const unsubscribeEngine = syncEngine.subscribe(refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      cancelled = true;
      unsubscribeEngine();
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  return (
    <div className="sync-status" data-testid="sync-status">
      {!online && <span className="sync-status__badge">离线</span>}
      {pending > 0 && <span className="sync-status__badge">待同步 {pending}</span>}
      {conflictCount > 0 && <span className="sync-status__badge">同步冲突 {conflictCount}</span>}
    </div>
  );
}
