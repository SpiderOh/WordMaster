import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgottenWord, Vocabulary } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  listForgottenWords: vi.fn(),
  listVocabularies: vi.fn(),
  createSpecialPage: vi.fn(),
  undoForgetting: vi.fn(),
  forgottenExportUrl: vi.fn(() => '/api/v1/forgotten-words/export'),
}));

vi.mock('../lib/apiClient', () => ({
  apiClient,
  forgottenExportUrl: () => '/api/v1/forgotten-words/export',
}));

import { ForgottenView } from '../features/forgotten/ForgottenView';

function makeWord(overrides: Partial<ForgottenWord> = {}): ForgottenWord {
  return {
    word_id: 1,
    word: 'panorama',
    meaning: 'n. 全景',
    vocabulary_id: 1,
    vocabulary_name: '六级词库',
    status: 'learning',
    study_count: 2,
    forget_count: 3,
    last_forgotten_at: '2026-09-04T10:00:00+00:00',
    ...overrides,
  };
}

const vocabulariesFixture: Vocabulary[] = [
  { id: 1, name: '六级词库', filename: 'cet6.csv', imported_at: '2026-09-01T08:00:00+00:00', total_words: 6550, active: true, priority: 0 },
  { id: 2, name: '考研词库', filename: 'kaoyan.csv', imported_at: '2026-09-02T08:00:00+00:00', total_words: 3000, active: true, priority: 1 },
];

const forgottenFixture: ForgottenWord[] = [
  makeWord({ word_id: 2, word: 'scenery', meaning: 'n. 风景', forget_count: 5, study_count: 4, vocabulary_id: 2, vocabulary_name: '考研词库' }),
  makeWord(),
];

function renderForgotten(initialEntry = '/forgotten') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ForgottenView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.listForgottenWords.mockResolvedValue(forgottenFixture);
  apiClient.listVocabularies.mockResolvedValue(vocabulariesFixture);
});

describe('遗忘词入口', () => {
  it('按遗忘次数降序渲染列表并展示词库与次数', async () => {
    renderForgotten();
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('scenery')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/忘 5/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('panorama')).toBeInTheDocument();
    expect(apiClient.listForgottenWords).toHaveBeenCalledWith({});
  });

  it('搜索与筛选条件变化后重新查询', async () => {
    const user = userEvent.setup();
    renderForgotten();
    await screen.findAllByRole('listitem');
    await user.type(screen.getByPlaceholderText('搜索单词'), 'pan');
    await waitFor(() => expect(apiClient.listForgottenWords).toHaveBeenLastCalledWith({ search: 'pan' }));
    await user.selectOptions(screen.getByLabelText('词库'), '2');
    await waitFor(() => expect(apiClient.listForgottenWords).toHaveBeenLastCalledWith({ search: 'pan', vocabularyId: 2 }));
    await user.selectOptions(screen.getByLabelText('状态'), 'learning');
    await waitFor(() =>
      expect(apiClient.listForgottenWords).toHaveBeenLastCalledWith({ search: 'pan', vocabularyId: 2, status: 'learning' }),
    );
    await user.type(screen.getByLabelText('最近遗忘自'), '2026-09-01');
    await waitFor(() =>
      expect(apiClient.listForgottenWords).toHaveBeenLastCalledWith({
        search: 'pan',
        vocabularyId: 2,
        status: 'learning',
        forgottenSince: '2026-09-01',
      }),
    );
  });

  it('较早的搜索响应晚到时不会覆盖最新结果', async () => {
    let resolveFirstSearch!: (words: ForgottenWord[]) => void;
    let resolveSecondSearch!: (words: ForgottenWord[]) => void;
    apiClient.listForgottenWords.mockImplementation((filters: { search?: string }) => {
      if (filters.search === 'pan') {
        return new Promise((resolve) => {
          resolveFirstSearch = resolve;
        });
      }
      if (filters.search === 'pano') {
        return new Promise((resolve) => {
          resolveSecondSearch = resolve;
        });
      }
      return Promise.resolve(forgottenFixture);
    });
    renderForgotten();
    await screen.findAllByRole('listitem');

    const searchInput = screen.getByPlaceholderText('搜索单词');
    fireEvent.change(searchInput, { target: { value: 'pan' } });
    await waitFor(() => expect(apiClient.listForgottenWords).toHaveBeenCalledWith({ search: 'pan' }));
    fireEvent.change(searchInput, { target: { value: 'pano' } });
    await waitFor(() => expect(apiClient.listForgottenWords).toHaveBeenCalledWith({ search: 'pano' }));

    await act(async () => {
      resolveSecondSearch([makeWord({ word_id: 3, word: 'new-result' })]);
    });
    expect(await screen.findByText('new-result')).toBeInTheDocument();

    await act(async () => {
      resolveFirstSearch([makeWord({ word_id: 4, word: 'stale-result' })]);
    });
    expect(screen.getByText('new-result')).toBeInTheDocument();
    expect(screen.queryByText('stale-result')).not.toBeInTheDocument();
  });

  it('勾选单词后可批量生成专攻页并自动跳转', async () => {
    apiClient.createSpecialPage.mockResolvedValue({
      id: 12,
      page_number: 4,
      page_size: 2,
      page_type: 'special',
      status: 'in_progress',
      is_short: false,
      words: [],
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/forgotten']}>
        <Routes>
          <Route path="/forgotten" element={<ForgottenView />} />
          <Route path="/special/:pageId" element={<div>专攻页 12 已就绪</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    expect(screen.getByText(/已选 2 词/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成专攻页' }));
    await waitFor(() => expect(apiClient.createSpecialPage).toHaveBeenCalledWith([1, 2]));
    expect(await screen.findByText('专攻页 12 已就绪')).toBeInTheDocument();
  });

  it('未勾选单词时提示至少选择一个', async () => {
    const user = userEvent.setup();
    renderForgotten();
    await screen.findAllByRole('listitem');
    await user.click(screen.getByRole('button', { name: '生成专攻页' }));
    expect(await screen.findByText(/至少选择一个单词/)).toBeInTheDocument();
    expect(apiClient.createSpecialPage).not.toHaveBeenCalled();
  });

  it('撤销遗忘后刷新当前列表', async () => {
    apiClient.undoForgetting.mockResolvedValue({
      word_id: 2,
      status: 'learning',
      study_count: 4,
      forget_count: 4,
      has_forgotten: true,
      needs_special_attention: true,
    });
    const user = userEvent.setup();
    renderForgotten();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '撤销遗忘' }));
    await waitFor(() => expect(apiClient.undoForgetting).toHaveBeenCalledWith(2));
    await waitFor(() => expect(apiClient.listForgottenWords).toHaveBeenCalledTimes(2));
  });

  it('导出按钮指向 CSV 导出链接', async () => {
    renderForgotten();
    await screen.findAllByRole('listitem');
    const exportLink = screen.getByRole('link', { name: '导出 CSV' });
    expect(exportLink).toHaveAttribute('href', '/api/v1/forgotten-words/export');
    expect(exportLink).toHaveAttribute('download');
  });

  it('最近遗忘日期可跳转对应日期历史', async () => {
    renderForgotten();
    const rows = await screen.findAllByRole('listitem');
    const dateLink = within(rows[0]).getByRole('link', { name: '2026-09-04' });
    expect(dateLink).toHaveAttribute('href', '/history?date=2026-09-04');
  });

  it('没有遗忘词时显示空状态', async () => {
    apiClient.listForgottenWords.mockResolvedValue([]);
    renderForgotten();
    expect(await screen.findByText('目前没有遗忘词，继续保持！')).toBeInTheDocument();
  });
});
