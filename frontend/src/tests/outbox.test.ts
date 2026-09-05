import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOutbox, enqueueApiReplay, enqueueSyncEvent, listOutbox, onOutboxChange, removeOutboxItem } from '../lib/offline/outbox';
import type { ApiReplayItem, SyncEventItem } from '../lib/offline/outbox';

function makeSyncEvent(eventId: string) {
  return {
    event_id: eventId,
    device_id: 'device-1',
    client_timestamp: '2026-09-05T10:00:00.000Z',
    entity_type: 'word_progress' as const,
    entity_id: '5',
    operation: 'forget',
    changes: { forget_count_delta: 1 },
  };
}

beforeEach(async () => {
  await clearOutbox();
});

describe('离线事件队列', () => {
  it('API 重放入队后写入 IndexedDB 并可查询', async () => {
    await enqueueApiReplay('POST', '/study-pages/3/complete', { completed_at: '2026-09-05T10:00:00.000Z' });
    const items = await listOutbox();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('api');
    expect((items[0] as ApiReplayItem).payload).toMatchObject({ method: 'POST', path: '/study-pages/3/complete' });
  });

  it('同步事件入队携带唯一 ID 与设备信息', async () => {
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 });
    const items = await listOutbox();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('sync');
    const event = (items[0] as SyncEventItem).payload;
    expect(event.event_id).toBeTruthy();
    expect(event.device_id).toBeTruthy();
    expect(event.client_timestamp).toBeTruthy();
  });

  it('入队顺序在出队时保持 FIFO', async () => {
    await enqueueApiReplay('POST', '/study-pages/3/complete', {});
    await enqueueApiReplay('POST', '/study-pages/3/words/5/master', {});
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 });
    const items = await listOutbox();
    expect(items.map((item) => item.kind)).toEqual(['api', 'api', 'sync']);
  });

  it('删除条目后队列变短，通知已订阅的监听器', async () => {
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 });
    const items = await listOutbox();
    const listener = vi.fn();
    const unsubscribe = onOutboxChange(listener);
    await removeOutboxItem(items[0].id);
    expect(await listOutbox()).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('事件 ID 使用服务端幂等键：重复入队的相同事件保留各自条目', async () => {
    // 两个条目都携带相同的 event_id，推送时服务端按 event_id 去重并返回 duplicate
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, makeSyncEvent('same-event-id').event_id);
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, makeSyncEvent('same-event-id').event_id);
    const items = await listOutbox();
    expect(items).toHaveLength(2);
    expect((items[0] as SyncEventItem).payload.event_id).toBe('same-event-id');
  });
});
