import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyPage, StudyPageWord } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getNextStudyPage: vi.fn(),
  getStudyPage: vi.fn(),
  markWordMastered: vi.fn(),
  markWordForgotten: vi.fn(),
  completePage: vi.fn(),
  undoPageCompletion: vi.fn(),
}));

const enqueueSyncEvent = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const enqueueApiReplay = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../lib/apiClient', () => ({
  apiClient,
  isNetworkError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'kind' in error && (error as { kind?: unknown }).kind === 'network',
}));
vi.mock('../lib/offline/outbox', () => ({ enqueueSyncEvent, enqueueApiReplay }));

import { LearningPage } from '../features/learning/LearningPage';

function makeWord(overrides: Partial<StudyPageWord> = {}): StudyPageWord {
  return {
    word_id: 1,
    word: 'panorama',
    meaning: 'n. 全景',
    vocabulary_id: 1,
    vocabulary_name: '六级词库',
    source_page: '1',
    study_count: 0,
    forget_count: 0,
    status: 'unlearned',
    display_order: 1,
    can_mark_mastered: true,
    ...overrides,
  };
}

function makePage(): StudyPage {
  return {
    id: 3,
    page_number: 1,
    page_size: 15,
    page_type: 'normal',
    status: 'in_progress',
    is_short: false,
    words: [makeWord()],
  };
}

function networkError() {
  return Object.assign(new Error('网络不可用，请稍后重试'), { status: 0, kind: 'network' });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.getSettings.mockResolvedValue({
    page_size: 15,
    intervals: [0, 1, 4],
    theme: 'system',
    font_size: 'medium',
    vocabulary_priorities: {},
  });
  apiClient.getNextStudyPage.mockResolvedValue(makePage());
});

describe('学习页离线记录', () => {
  it('离线时遗忘写入同步队列并乐观更新行内计数', async () => {
    apiClient.markWordForgotten.mockRejectedValue(networkError());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LearningPage />
      </MemoryRouter>,
    );
    const row = await screen.findByRole('listitem');
    await user.click(within(row).getByRole('button', { name: '遗忘' }));
    await waitFor(() => expect(enqueueSyncEvent).toHaveBeenCalledWith('forget', '1', { forget_count_delta: 1 }));
    await waitFor(() => expect(within(row).getByText(/忘 1/)).toBeInTheDocument());
    expect(screen.getByText(/联网后自动同步/)).toBeInTheDocument();
  });

  it('离线时标熟写入 API 重放队列并从页面移除该词', async () => {
    apiClient.markWordMastered.mockRejectedValue(networkError());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LearningPage />
      </MemoryRouter>,
    );
    const row = await screen.findByRole('listitem');
    await user.click(within(row).getByRole('button', { name: '熟' }));
    await waitFor(() => expect(enqueueApiReplay).toHaveBeenCalledWith('POST', '/study-pages/3/words/1/master'));
    await waitFor(() => expect(screen.queryByText('panorama')).not.toBeInTheDocument());
  });

  it('离线完成本页写入重放队列，提示待同步且无撤销入口', async () => {
    apiClient.completePage.mockRejectedValue(networkError());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LearningPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    await user.click(within(screen.getByRole('dialog', { name: '完成本页' })).getByRole('button', { name: '确认完成' }));
    await waitFor(() =>
      expect(enqueueApiReplay).toHaveBeenCalledWith('POST', '/study-pages/3/complete', { completed_at: expect.any(String) }),
    );
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('离线');
    expect(within(toast).queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
    expect(within(toast).getByRole('button', { name: '下一页' })).toBeInTheDocument();
  });

  it('离线撤销完成被拒绝并提示需要联网', async () => {
    apiClient.completePage.mockResolvedValue({
      id: 77,
      page_id: 3,
      completed_at: '2026-09-05T08:00:00Z',
      snapshot: { page_id: 3, words: [] },
    });
    apiClient.undoPageCompletion.mockRejectedValue(networkError());
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LearningPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认完成' }));
    await user.click(await screen.findByRole('button', { name: '撤销' }));
    expect(await screen.findByText(/撤销需要联网/)).toBeInTheDocument();
    expect(enqueueSyncEvent).not.toHaveBeenCalled();
    expect(enqueueApiReplay).not.toHaveBeenCalled();
  });
});
