// 离线事件队列：API 重放（需要服务端事务语义）与同步事件（计数增量）两类条目
import { outboxAll, outboxClear, outboxDelete, outboxPut, metaGet, metaSet } from './db';
import type { SyncEventInput } from '../types';

export interface ApiReplayPayload {
  method: string;
  path: string;
  body?: unknown;
}

interface OutboxBase {
  id: string;
  seq: number;
  created_at: string;
}

export interface ApiReplayItem extends OutboxBase {
  kind: 'api';
  payload: ApiReplayPayload;
}

export interface SyncEventItem extends OutboxBase {
  kind: 'sync';
  payload: SyncEventInput;
}

export type OutboxItem = ApiReplayItem | SyncEventItem;

const DEVICE_ID_KEY = 'device_id';

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 兜底方案：基于随机数的 v4 形态 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  const existing = await metaGet<string>(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const deviceId = uuid();
  await metaSet(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export type OutboxChange = 'enqueued' | 'removed' | 'cleared';

const changeListeners = new Set<(change: OutboxChange) => void>();

export function onOutboxChange(listener: (change: OutboxChange) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyChange(change: OutboxChange): void {
  for (const listener of changeListeners) {
    listener(change);
  }
}

// 单调递增序号：同一毫秒内入队时仍能保持 FIFO
async function nextSeq(): Promise<number> {
  const current = (await metaGet<number>('outbox_seq')) ?? 0;
  const next = current + 1;
  await metaSet('outbox_seq', next);
  return next;
}

export async function enqueueApiReplay(method: string, path: string, body?: unknown): Promise<void> {
  const item: ApiReplayItem = {
    id: uuid(),
    seq: await nextSeq(),
    kind: 'api',
    created_at: new Date().toISOString(),
    payload: { method, path, body },
  };
  await outboxPut(item);
  notifyChange('enqueued');
}

export async function enqueueSyncEvent(
  operation: string,
  entityId: string,
  changes: Record<string, unknown>,
  eventId?: string,
): Promise<void> {
  const event: SyncEventInput = {
    event_id: eventId ?? uuid(),
    device_id: await getDeviceId(),
    client_timestamp: new Date().toISOString(),
    entity_type: 'word_progress',
    entity_id: entityId,
    operation,
    changes,
  };
  const item: SyncEventItem = {
    id: uuid(),
    seq: await nextSeq(),
    kind: 'sync',
    created_at: event.client_timestamp,
    payload: event,
  };
  await outboxPut(item);
  notifyChange('enqueued');
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await outboxAll<OutboxItem>();
  return items.sort((a, b) => a.seq - b.seq);
}

export async function removeOutboxItem(id: string): Promise<void> {
  await outboxDelete(id);
  notifyChange('removed');
}

export async function clearOutbox(): Promise<void> {
  await outboxClear();
  notifyChange('cleared');
}
