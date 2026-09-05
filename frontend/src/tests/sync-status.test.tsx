import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const syncEngine = vi.hoisted(() => ({
  getStatus: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  startAutoSync: vi.fn(),
}));

vi.mock('../lib/sync/syncEngine', () => ({ syncEngine }));

import { SyncStatus } from '../features/sync/SyncStatus';

describe('顶栏同步状态', () => {
  it('有待同步条目时显示徽标', async () => {
    syncEngine.getStatus.mockResolvedValue({
      pending: 3,
      conflicts: [],
      deviceId: 'device-1',
      lastSyncAt: null,
      pullCursor: 0,
      online: true,
    });
    render(<SyncStatus />);
    expect(await screen.findByTestId('sync-status')).toHaveTextContent('待同步 3');
  });

  it('存在同步冲突时显示冲突数量', async () => {
    syncEngine.getStatus.mockResolvedValue({
      pending: 0,
      conflicts: [{ kind: 'sync_conflict', message: '冲突', at: '2026-09-05T10:00:00.000Z' }],
      deviceId: 'device-1',
      lastSyncAt: null,
      pullCursor: 0,
      online: true,
    });
    render(<SyncStatus />);
    expect(await screen.findByTestId('sync-status')).toHaveTextContent('同步冲突 1');
  });

  it('没有待同步与冲突时不显示任何徽标', async () => {
    syncEngine.getStatus.mockResolvedValue({
      pending: 0,
      conflicts: [],
      deviceId: 'device-1',
      lastSyncAt: '2026-09-05T10:00:00.000Z',
      pullCursor: 4,
      online: true,
    });
    render(<SyncStatus />);
    await screen.findByTestId('sync-status');
    expect(screen.getByTestId('sync-status')).toHaveTextContent('');
  });

  it('离线时显示离线标记', async () => {
    syncEngine.getStatus.mockResolvedValue({
      pending: 1,
      conflicts: [],
      deviceId: 'device-1',
      lastSyncAt: null,
      pullCursor: 0,
      online: false,
    });
    render(<SyncStatus />);
    expect(await screen.findByTestId('sync-status')).toHaveTextContent('离线');
  });
});
