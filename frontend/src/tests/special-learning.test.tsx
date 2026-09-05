import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyPage } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  getStudyPage: vi.fn(),
  completeSpecialPage: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({ apiClient }));

import { SpecialLearningPage } from '../features/learning/SpecialLearningPage';

const specialPageFixture: StudyPage = {
  id: 12,
  page_number: 4,
  page_size: 3,
  page_type: 'special',
  status: 'in_progress',
  is_short: false,
  words: [
    { word_id: 1, word: 'panorama', meaning: 'n. 全景', vocabulary_id: 1, vocabulary_name: '六级词库', source_page: '1', study_count: 2, forget_count: 3, status: 'learning', display_order: 1, can_mark_mastered: false },
    { word_id: 2, word: 'scenery', meaning: 'n. 风景', vocabulary_id: 1, vocabulary_name: '六级词库', source_page: '1', study_count: 2, forget_count: 2, status: 'learning', display_order: 2, can_mark_mastered: false },
    { word_id: 3, word: 'lawsuit', meaning: 'n. 诉讼', vocabulary_id: 1, vocabulary_name: '六级词库', source_page: '1', study_count: 2, forget_count: 1, status: 'learning', display_order: 3, can_mark_mastered: false },
  ],
};

function renderSpecial() {
  return render(
    <MemoryRouter initialEntries={['/special/12']}>
      <Routes>
        <Route path="/special/:pageId" element={<SpecialLearningPage />} />
        <Route path="/forgotten" element={<div>返回遗忘列表</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.getStudyPage.mockResolvedValue(specialPageFixture);
});

describe('专攻学习页', () => {
  it('加载专攻页并逐词提供记得/遗忘/熟三种结果', async () => {
    renderSpecial();
    expect(await screen.findByText('panorama')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole('button', { name: '记得' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '遗忘' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '熟' })).toBeInTheDocument();
  });

  it('未逐词选择完成结果前不能提交', async () => {
    const user = userEvent.setup();
    renderSpecial();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '记得' }));
    await user.click(screen.getByRole('button', { name: '完成专攻' }));
    await user.click(within(screen.getByRole('dialog', { name: '完成专攻' })).getByRole('button', { name: '确认提交' }));
    expect(await screen.findByText(/请为每个单词选择结果/)).toBeInTheDocument();
    expect(apiClient.completeSpecialPage).not.toHaveBeenCalled();
  });

  it('逐词选择后提交三种结果并返回遗忘列表', async () => {
    apiClient.completeSpecialPage.mockResolvedValue({
      id: 33,
      page_id: 12,
      completed_at: '2026-09-05T09:00:00+00:00',
      snapshot: { page_id: 12, words: [] },
    });
    const user = userEvent.setup();
    renderSpecial();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '记得' }));
    await user.click(within(rows[1]).getByRole('button', { name: '遗忘' }));
    await user.click(within(rows[2]).getByRole('button', { name: '熟' }));
    await user.click(screen.getByRole('button', { name: '完成专攻' }));
    await user.click(within(screen.getByRole('dialog', { name: '完成专攻' })).getByRole('button', { name: '确认提交' }));
    await waitFor(() => {
      expect(apiClient.completeSpecialPage).toHaveBeenCalledWith(
        12,
        { 1: 'remembered', 2: 'forgotten', 3: 'mastered' },
        expect.any(String),
      );
    });
    expect(await screen.findByText('返回遗忘列表')).toBeInTheDocument();
  });

  it('已提交的单词行高亮所选结果且可改选', async () => {
    const user = userEvent.setup();
    renderSpecial();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '记得' }));
    expect(within(rows[0]).getByRole('button', { name: '记得' })).toHaveClass('is-selected');
    await user.click(within(rows[0]).getByRole('button', { name: '遗忘' }));
    expect(within(rows[0]).getByRole('button', { name: '遗忘' })).toHaveClass('is-selected');
    expect(within(rows[0]).getByRole('button', { name: '记得' })).not.toHaveClass('is-selected');
  });

  it('专攻页不存在时给出提示与返回入口', async () => {
    apiClient.getStudyPage.mockRejectedValue(Object.assign(new Error('Study page not found'), { status: 404 }));
    renderSpecial();
    expect(await screen.findByText('专攻页不存在或已完成')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回遗忘列表' })).toHaveAttribute('href', '/forgotten');
  });
});
