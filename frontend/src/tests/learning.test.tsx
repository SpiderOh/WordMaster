import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, StudyPage, StudyPageWord } from '../lib/types';

const { apiClient, ApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    kind: string;
    constructor(message: string, status: number, kind: string) {
      super(message);
      this.status = status;
      this.kind = kind;
    }
  }
  return {
    ApiError: MockApiError,
    apiClient: {
      getSettings: vi.fn(),
      getNextStudyPage: vi.fn(),
      getStudyPage: vi.fn(),
      markWordMastered: vi.fn(),
      markWordForgotten: vi.fn(),
      completePage: vi.fn(),
      undoPageCompletion: vi.fn(),
    },
  };
});

vi.mock('../lib/apiClient', () => ({ ApiError, apiClient }));

import { LearningPage } from '../features/learning/LearningPage';

function makeWord(overrides: Partial<StudyPageWord> = {}): StudyPageWord {
  return {
    word_id: 1,
    word: 'panorama',
    meaning: 'n. 全景,全景图;全貌,概述',
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

function makePage(overrides: Partial<StudyPage> = {}): StudyPage {
  return {
    id: 3,
    page_number: 2,
    page_size: 15,
    page_type: 'normal',
    status: 'in_progress',
    is_short: false,
    words: Array.from({ length: 15 }, (_, index) =>
      makeWord({ word_id: index + 1, display_order: index + 1 }),
    ),
    ...overrides,
  };
}

const settingsFixture: AppSettings = {
  page_size: 15,
  intervals: [0, 1, 4],
  theme: 'system',
  font_size: 'medium',
  vocabulary_priorities: {},
};

function renderLearning() {
  return render(
    <MemoryRouter>
      <LearningPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.getSettings.mockResolvedValue(settingsFixture);
  apiClient.getNextStudyPage.mockResolvedValue(makePage());
  apiClient.markWordForgotten.mockResolvedValue({
    word_id: 1,
    status: 'learning',
    study_count: 0,
    forget_count: 1,
    has_forgotten: true,
    needs_special_attention: true,
  });
});

describe('学习页', () => {
  it('按设置的页大小竖向渲染 15 个单词行并显示页码', async () => {
    renderLearning();
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(15);
    expect(apiClient.getSettings).toHaveBeenCalledTimes(1);
    expect(apiClient.getNextStudyPage).toHaveBeenCalledWith(15);
    expect(screen.getByText(/第 2 页/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/panorama/)).toBeInTheDocument();
    // 简洁模式：行内不展示词库名与源页
    expect(within(rows[0]).queryByText(/六级词库/)).not.toBeInTheDocument();
    expect(within(rows[0]).queryByText(/源页/)).not.toBeInTheDocument();
  });

  it('点击单词行后在单词右侧显示释义，默认不显示', async () => {
    const user = userEvent.setup();
    renderLearning();
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]).queryByText('n. 全景,全景图;全貌,概述')).not.toBeInTheDocument();
    await user.click(within(rows[0]).getByText('panorama'));
    const meaning = within(rows[0]).getByText('n. 全景,全景图;全貌,概述');
    const word = within(rows[0]).getByText('panorama');
    expect(meaning).toHaveClass('word-row__meaning');
    expect(word.compareDocumentPosition(meaning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('第一次学习的词显示熟和遗忘按钮', async () => {
    renderLearning();
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]).getByRole('button', { name: '熟' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '遗忘' })).toBeInTheDocument();
  });

  it('非首次学习的词隐藏熟按钮，只允许遗忘，并显示学习次数', async () => {
    apiClient.getNextStudyPage.mockResolvedValue(
      makePage({ words: [makeWord({ study_count: 2, status: 'learning', can_mark_mastered: false })] }),
    );
    renderLearning();
    const row = await screen.findByRole('listitem');
    expect(within(row).queryByRole('button', { name: '熟' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '遗忘' })).toBeInTheDocument();
    expect(within(row).getByText(/学 2/)).toBeInTheDocument();
    expect(within(row).queryByText(/忘 \d/)).not.toBeInTheDocument();
  });

  it('标记熟后用服务端返回的页面整体替换，补入新词', async () => {
    apiClient.getNextStudyPage.mockResolvedValue(makePage({ words: [makeWord()] }));
    apiClient.markWordMastered.mockResolvedValue(
      makePage({ words: [makeWord({ word_id: 99, word: 'replaced', display_order: 2 })] }),
    );
    const user = userEvent.setup();
    renderLearning();
    const row = await screen.findByRole('listitem');
    await user.click(within(row).getByRole('button', { name: '熟' }));
    await waitFor(() => expect(screen.getByText('replaced')).toBeInTheDocument());
    expect(apiClient.markWordMastered).toHaveBeenCalledWith(3, 1);
    expect(screen.queryByText('panorama')).not.toBeInTheDocument();
  });

  it('遗忘后立即更新该行的遗忘次数，全零时不显示计数', async () => {
    const user = userEvent.setup();
    renderLearning();
    const row = (await screen.findAllByRole('listitem'))[0];
    expect(within(row).queryByText(/忘 \d/)).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: '遗忘' }));
    await waitFor(() => expect(within(row).getByText(/忘 1/)).toBeInTheDocument());
    expect(apiClient.markWordForgotten).toHaveBeenCalledWith(3, 1);
  });

  it('完成本页需要二次确认，取消时不调用接口', async () => {
    const user = userEvent.setup();
    renderLearning();
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    const dialog = screen.getByRole('dialog', { name: '完成本页' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(apiClient.completePage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('确认完成后显示撤销与下一页入口', async () => {
    apiClient.completePage.mockResolvedValue({
      id: 77,
      page_id: 3,
      completed_at: '2026-09-05T08:00:00Z',
      snapshot: { page_id: 3, words: [] },
    });
    const user = userEvent.setup();
    renderLearning();
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    const dialog = screen.getByRole('dialog', { name: '完成本页' });
    await user.click(within(dialog).getByRole('button', { name: '确认完成' }));
    await waitFor(() => expect(apiClient.completePage).toHaveBeenCalledWith(3));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('本页已完成');
    expect(within(toast).getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(within(toast).getByRole('button', { name: '下一页' })).toBeInTheDocument();
  });

  it('撤销完成调用接口并恢复当前页面', async () => {
    apiClient.completePage.mockResolvedValue({
      id: 77,
      page_id: 3,
      completed_at: '2026-09-05T08:00:00Z',
      snapshot: { page_id: 3, words: [] },
    });
    apiClient.getStudyPage.mockResolvedValue(makePage());
    const user = userEvent.setup();
    renderLearning();
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认完成' }));
    await user.click(await screen.findByRole('button', { name: '撤销' }));
    await waitFor(() => expect(apiClient.undoPageCompletion).toHaveBeenCalledWith(3, 77));
    await waitFor(() => expect(apiClient.getStudyPage).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('点击下一页后加载后续学习页', async () => {
    apiClient.completePage.mockResolvedValue({
      id: 77,
      page_id: 3,
      completed_at: '2026-09-05T08:00:00Z',
      snapshot: { page_id: 3, words: [] },
    });
    const user = userEvent.setup();
    renderLearning();
    await user.click(await screen.findByRole('button', { name: '完成本页' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认完成' }));
    await user.click(await screen.findByRole('button', { name: '下一页' }));
    await waitFor(() => expect(apiClient.getNextStudyPage).toHaveBeenCalledTimes(2));
  });

  it('词库不足时显示空状态并引导到词库管理', async () => {
    apiClient.getNextStudyPage.mockRejectedValue(new ApiError('No eligible words available', 404, 'http'));
    renderLearning();
    expect(await screen.findByText('没有可学习的新词')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往词库管理' })).toHaveAttribute('href', '/vocabularies');
  });

  it('短页时提示词库接近学完', async () => {
    apiClient.getNextStudyPage.mockResolvedValue(makePage({ is_short: true, words: [makeWord()] }));
    renderLearning();
    expect(await screen.findByText(/词库接近学完/)).toBeInTheDocument();
  });

  it('接口异常时显示错误提示', async () => {
    apiClient.getNextStudyPage.mockRejectedValue(new ApiError('服务器开小差了', 500, 'http'));
    renderLearning();
    expect(await screen.findByText(/服务器开小差了/)).toBeInTheDocument();
  });
});
