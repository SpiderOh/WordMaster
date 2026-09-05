// 同步引擎：按 FIFO 重放离线 API 队列，批量推送计数事件，并按游标拉取远端事件
import { apiClient } from '../apiClient';
import type { SyncEventInput } from '../types';
import {
  getDeviceId,
  listOutbox,
  removeOutboxItem,
} from '../offline/outbox';
import { metaGet, metaSet } from '../offline/db';

export interface ConflictRecord {
  kind: 'sync_conflict' | 'api_replay' | 'pulled_conflict';
  eventId?: string;
  path?: string;
  message: string;
  detail?: unknown;
  at: string;
}

export interface SyncEngineStatus {
  pending: number;
  conflicts: ConflictRecord[];
  deviceId: string | null;
  lastSyncAt: string | null;
  pullCursor: number | null;
  online: boolean;
}

const CONFLICTS_KEY = 'sync_conflicts';
const PULL_CURSOR_KEY = 'pull_cursor';
const LAST_SYNC_KEY = 'last_sync_at';
const MAX_CONFLICT_RECORDS = 50;
const MAX_SYNC_BATCH = 500;

export function nextBackoffSeconds(attempt: number): number {
  return Math.min(60, 2 ** attempt);
}

function isNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    (error as { kind?: unknown }).kind === 'network'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class SyncEngine {
  private retryAttempt = 0;
  private retryTimer: number | null = null;
  private listeners = new Set<() => void>();
  private cachedConflicts: ConflictRecord[] | null = null;
  private syncing = false;

  getRetryAttempt(): number {
    return this.retryAttempt;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async recordConflict(record: Omit<ConflictRecord, 'at'>): Promise<void> {
    const existing = this.cachedConflicts ?? (await metaGet<ConflictRecord[]>(CONFLICTS_KEY)) ?? [];
    const next = [{ ...record, at: new Date().toISOString() }, ...existing].slice(0, MAX_CONFLICT_RECORDS);
    this.cachedConflicts = next;
    await metaSet(CONFLICTS_KEY, next);
  }

  async getDeviceId(): Promise<string> {
    return getDeviceId();
  }

  async getStatus(): Promise<SyncEngineStatus> {
    const [pending, conflicts, deviceId, lastSyncAt, pullCursor] = await Promise.all([
      listOutbox().then((items) => items.length),
      (async () => this.cachedConflicts ?? (await metaGet<ConflictRecord[]>(CONFLICTS_KEY)) ?? [])(),
      metaGet<string>('device_id'),
      metaGet<string>(LAST_SYNC_KEY),
      metaGet<number>(PULL_CURSOR_KEY),
    ]);
    return {
      pending,
      conflicts,
      deviceId: deviceId ?? null,
      lastSyncAt: lastSyncAt ?? null,
      pullCursor: pullCursor ?? null,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    };
  }

  async flush(): Promise<{ status: 'flushed' | 'offline'; pushed: number }> {
    if (this.syncing) {
      return { status: 'offline', pushed: 0 };
    }
    this.syncing = true;
    try {
      return await this.flushInternal();
    } finally {
      this.syncing = false;
    }
  }

  private async flushInternal(): Promise<{ status: 'flushed' | 'offline'; pushed: number }> {
    let offline = false;
    let pushed = 0;

    for (const item of await listOutbox()) {
      if (item.kind !== 'api') {
        continue;
      }
      const payload = item.payload;
      try {
        await apiClient.replayRequest(payload.method, payload.path, payload.body);
        await removeOutboxItem(item.id);
      } catch (error) {
        if (isNetworkError(error)) {
          offline = true;
          break;
        }
        await this.recordConflict({ kind: 'api_replay', path: payload.path, message: errorMessage(error) });
        await removeOutboxItem(item.id);
      }
    }

    if (!offline) {
      offline = !(await this.pushSyncBatch().catch(() => false));
      // pushSyncBatch 返回 false 表示网络不可用
    }

    if (offline) {
      this.retryAttempt += 1;
      this.scheduleRetry();
      this.notify();
      return { status: 'offline', pushed };
    }

    this.retryAttempt = 0;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.pull();
    await metaSet(LAST_SYNC_KEY, new Date().toISOString());
    this.notify();
    return { status: 'flushed', pushed };
  }

  private async pushSyncBatch(): Promise<boolean> {
    const syncItems = (await listOutbox()).filter((item) => item.kind === 'sync');
    if (syncItems.length === 0) {
      return true;
    }
    const events = syncItems.slice(0, MAX_SYNC_BATCH).map((item) => item.payload as SyncEventInput);
    try {
      const response = await apiClient.pushSyncEvents(events);
      for (const result of response.results) {
        const item = syncItems.find((candidate) => (candidate.payload as SyncEventInput).event_id === result.event_id);
        if (!item) {
          continue;
        }
        if (result.status === 'conflict') {
          await this.recordConflict({
            kind: 'sync_conflict',
            eventId: result.event_id,
            message: '同步合并产生冲突',
            detail: result.conflict,
          });
        }
        await removeOutboxItem(item.id);
      }
      return true;
    } catch (error) {
      if (isNetworkError(error)) {
        return false;
      }
      // 批次被服务端整体拒绝：丢弃并记录，避免死循环重试
      for (const item of syncItems) {
        await this.recordConflict({ kind: 'sync_conflict', message: errorMessage(error), detail: item.payload });
        await removeOutboxItem(item.id);
      }
      return true;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) {
      return;
    }
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, nextBackoffSeconds(this.retryAttempt) * 1000);
  }

  async pull(): Promise<void> {
    const cursor = (await metaGet<number>(PULL_CURSOR_KEY)) ?? 0;
    const response = await Promise.resolve(apiClient.pullSyncEvents(cursor)).catch(() => null);
    if (!response || !Array.isArray(response.events)) {
      return;
    }
    for (const event of response.events) {
      if (event.status === 'conflict') {
        await this.recordConflict({
          kind: 'pulled_conflict',
          eventId: event.event_id,
          message: '拉取到冲突事件',
          detail: event.conflict,
        });
      }
    }
    await metaSet(PULL_CURSOR_KEY, response.next_cursor);
  }

  startAutoSync(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('online', () => {
      void this.flush();
    });
    void this.flush();
  }
}

export const syncEngine = new SyncEngine();

export async function resetSyncEngineForTests(): Promise<void> {
  syncEngine['retryAttempt'] = 0;
  if (syncEngine['retryTimer'] !== null) {
    window.clearTimeout(syncEngine['retryTimer']);
    syncEngine['retryTimer'] = null;
  }
  syncEngine['cachedConflicts'] = null;
  await metaSet(CONFLICTS_KEY, []);
}
