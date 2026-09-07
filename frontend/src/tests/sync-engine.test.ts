import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOutbox, enqueueApiReplay, enqueueSyncEvent, listOutbox } from '../lib/offline/outbox';
import { nextBackoffSeconds, resetSyncEngineForTests, syncEngine } from '../lib/sync/syncEngine';

const apiClient = vi.hoisted(() => ({
  replayRequest: vi.fn(),
  pushSyncEvents: vi.fn(),
  pullSyncEvents: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({ apiClient }));

function networkError() {
  return Object.assign(new Error('网络不可用，请稍后重试'), { status: 0, kind: 'network' });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  apiClient.pullSyncEvents.mockResolvedValue({ events: [], next_cursor: 0 });
  await clearOutbox();
  await resetSyncEngineForTests();
});

describe('同步引擎', () => {
  it('自动同步只启动一次，并在新条目入队后主动刷新', async () => {
    const flush = vi.spyOn(syncEngine, 'flush').mockResolvedValue({ status: 'flushed', pushed: 0 });
    syncEngine.startAutoSync();
    syncEngine.startAutoSync();
    await waitForMockCall(flush, 1);

    await enqueueApiReplay('POST', '/study-pages/3/complete', {});
    await waitForMockCall(flush, 2);
    expect(flush).toHaveBeenCalledTimes(2);
    flush.mockRestore();
  });

  it('同步进行中入队会在当前刷新结束后再次刷新', async () => {
    let finishPull!: (value: { events: never[]; next_cursor: number }) => void;
    apiClient.pullSyncEvents.mockReturnValue(
      new Promise((resolve) => {
        finishPull = resolve;
      }),
    );
    apiClient.replayRequest.mockResolvedValue({});

    syncEngine.startAutoSync();
    await vi.waitFor(() => expect(apiClient.pullSyncEvents).toHaveBeenCalledTimes(1));
    await enqueueApiReplay('POST', '/study-pages/3/complete', {});
    finishPull({ events: [], next_cursor: 0 });

    await vi.waitFor(() => expect(apiClient.replayRequest).toHaveBeenCalledTimes(1));
    expect(await listOutbox()).toHaveLength(0);
  });

  it('退避时间按指数增长且封顶 60 秒', () => {
    expect(nextBackoffSeconds(1)).toBe(2);
    expect(nextBackoffSeconds(2)).toBe(4);
    expect(nextBackoffSeconds(3)).toBe(8);
    expect(nextBackoffSeconds(6)).toBe(60);
    expect(nextBackoffSeconds(7)).toBe(60);
  });

  it('网络恢复时按顺序重放 API 队列并删除已成功条目', async () => {
    await enqueueApiReplay('POST', '/study-pages/3/complete', { completed_at: '2026-09-05T10:00:00.000Z' });
    await enqueueApiReplay('POST', '/study-pages/3/words/5/master', {});
    apiClient.replayRequest.mockResolvedValue({});

    const result = await syncEngine.flush();

    expect(result.status).toBe('flushed');
    expect(apiClient.replayRequest).toHaveBeenNthCalledWith(1, 'POST', '/study-pages/3/complete', { completed_at: '2026-09-05T10:00:00.000Z' });
    expect(apiClient.replayRequest).toHaveBeenNthCalledWith(2, 'POST', '/study-pages/3/words/5/master', {});
    expect(await listOutbox()).toHaveLength(0);
  });

  it('网络失败时保留队列、按 2 秒指数退避调度重试', async () => {
    await enqueueApiReplay('POST', '/study-pages/3/complete', {});
    await enqueueApiReplay('POST', '/study-pages/3/words/5/master', {});
    apiClient.replayRequest.mockRejectedValue(networkError());
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const result = await syncEngine.flush();
    expect(result.status).toBe('offline');
    expect(await listOutbox()).toHaveLength(2);
    expect(syncEngine.getRetryAttempt()).toBe(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    setTimeoutSpy.mockRestore();

    // 模拟退避到期：手动再次触发 flush，队列按序重放并清空
    apiClient.replayRequest.mockResolvedValue({});
    const retry = await syncEngine.flush();
    expect(retry.status).toBe('flushed');
    expect(await listOutbox()).toHaveLength(0);
    expect(syncEngine.getRetryAttempt()).toBe(0);
  });

  it('业务错误（非网络）丢弃重放条目并记录到冲突信息', async () => {
    await enqueueApiReplay('POST', '/study-pages/3/undo-complete', { session_id: 77 });
    apiClient.replayRequest.mockRejectedValue(Object.assign(new Error('撤销窗口已过期'), { status: 400, kind: 'http' }));

    const result = await syncEngine.flush();
    expect(result.status).toBe('flushed');
    expect(await listOutbox()).toHaveLength(0);
    const status = await syncEngine.getStatus();
    expect(status.conflicts.length).toBe(1);
    expect(status.conflicts[0]).toMatchObject({ kind: 'api_replay', path: '/study-pages/3/undo-complete' });
  });

  it('同步事件按服务端结果清理：applied/duplicate 移除，conflict 记录', async () => {
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, 'event-applied');
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, 'event-duplicate');
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, 'event-conflict');
    apiClient.pushSyncEvents.mockResolvedValue({
      results: [
        { event_id: 'event-applied', status: 'applied', conflict: null },
        { event_id: 'event-duplicate', status: 'duplicate', conflict: null },
        { event_id: 'event-conflict', status: 'conflict', conflict: { field: 'status', server_value: 'learning' } },
      ],
    });

    const result = await syncEngine.flush();
    expect(result.status).toBe('flushed');
    const remaining = await listOutbox();
    expect(remaining).toHaveLength(0);
    const status = await syncEngine.getStatus();
    expect(status.conflicts.some((item) => item.kind === 'sync_conflict' && item.eventId === 'event-conflict')).toBe(true);
    expect(apiClient.pushSyncEvents).toHaveBeenCalledTimes(1);
  });

  it('推送网络失败时保留全部同步事件', async () => {
    await enqueueSyncEvent('forget', '5', { forget_count_delta: 1 }, 'event-1');
    apiClient.pushSyncEvents.mockRejectedValue(networkError());

    const result = await syncEngine.flush();
    expect(result.status).toBe('offline');
    expect(await listOutbox()).toHaveLength(1);
  });

  it('拉取远端事件后保存游标并记录冲突', async () => {
    apiClient.pullSyncEvents.mockResolvedValue({
      events: [
        {
          cursor: 9,
          event_id: 'remote-1',
          device_id: 'device-2',
          client_timestamp: '2026-09-05T09:00:00.000Z',
          server_timestamp: '2026-09-05T09:00:01.000Z',
          entity_type: 'word_progress',
          entity_id: '6',
          operation: 'forget',
          changes: { forget_count_delta: 1 },
          status: 'conflict',
          conflict: { field: 'status' },
        },
      ],
      next_cursor: 9,
    });

    await syncEngine.pull();
    const status = await syncEngine.getStatus();
    expect(status.pullCursor).toBe(9);
    expect(status.conflicts.some((item) => item.kind === 'pulled_conflict')).toBe(true);
    // 再次拉取使用已保存的游标
    await syncEngine.pull();
    expect(apiClient.pullSyncEvents).toHaveBeenLastCalledWith(9);
  });

  it('设备 ID 生成后保持稳定', async () => {
    const first = await syncEngine.getDeviceId();
    const second = await syncEngine.getDeviceId();
    expect(first).toBe(second);
    expect(first).toHaveLength(36);
  });
});

async function waitForMockCall(mock: ReturnType<typeof vi.fn> | ReturnType<typeof vi.spyOn>, count: number): Promise<void> {
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(count));
}
