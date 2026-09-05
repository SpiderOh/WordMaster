import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSummary, DateHistory, HistoryPageSnapshot } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  getCalendar: vi.fn(),
  getHistoryForDate: vi.fn(),
  getHistoryPageSnapshot: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({ apiClient }));

import { HistoryView } from '../features/history/HistoryView';

const calendarFixture: CalendarSummary = {
  month: '2026-09',
  days: [
    { date: '2026-09-01', has_study: false, is_recommended: true, completion_count: 0 },
    { date: '2026-09-03', has_study: true, is_recommended: false, completion_count: 2 },
    { date: '2026-09-05', has_study: true, is_recommended: true, completion_count: 1 },
    { date: '2026-09-08', has_study: false, is_recommended: false, completion_count: 0 },
  ],
};

const dateHistoryFixture: DateHistory = {
  date: '2026-09-03',
  pages: [
    {
      page_id: 3,
      page_number: 1,
      session_id: 77,
      study_number: 2,
      completed_on_date: true,
      is_recommended: true,
      second_completed: true,
      third_completed: false,
      remaining_recommended_rounds: 1,
    },
    {
      page_id: 9,
      page_number: 2,
      session_id: null,
      study_number: 2,
      completed_on_date: false,
      is_recommended: true,
      second_completed: false,
      third_completed: false,
      remaining_recommended_rounds: 2,
    },
  ],
};

const snapshotFixture: HistoryPageSnapshot = {
  session_id: 77,
  page_id: 3,
  completed_at: '2026-09-03T08:30:00+00:00',
  snapshot: {
    page_id: 3,
    page_size: 2,
    words: [
      {
        word_id: 1,
        word: 'panorama',
        meaning: 'n. 全景',
        display_order: 1,
        status_before: 'learning',
        study_count_before: 1,
        forget_count: 0,
      },
      {
        word_id: 2,
        word: 'scenery',
        meaning: 'n. 风景',
        display_order: 2,
        status_before: 'learning',
        study_count_before: 1,
        forget_count: 1,
      },
    ],
  },
  previous_session_id: null,
  next_session_id: 90,
};

function renderHistory(initialEntry = '/history') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HistoryView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.getCalendar.mockResolvedValue(calendarFixture);
  apiClient.getHistoryForDate.mockResolvedValue(dateHistoryFixture);
  apiClient.getHistoryPageSnapshot.mockResolvedValue(snapshotFixture);
});

describe('日期历史页', () => {
  it('渲染整月日历并区分灰色、推荐与已完成日期', async () => {
    renderHistory();
    expect(await screen.findByRole('button', { name: '2026-09-03' })).toHaveClass('calendar-day--studied');
    expect(screen.getByRole('button', { name: '2026-09-01' })).toHaveClass('calendar-day--recommended');
    expect(screen.getByRole('button', { name: '2026-09-08' })).toHaveClass('calendar-day--empty');
    expect(apiClient.getCalendar).toHaveBeenCalledWith('2026-09');
  });

  it('上个月和下个月按钮切换月份查询', async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: '上个月' }));
    await waitFor(() => expect(apiClient.getCalendar).toHaveBeenCalledWith('2026-08'));
    await user.click(screen.getByRole('button', { name: '下个月' }));
    await waitFor(() => expect(apiClient.getCalendar).toHaveBeenCalledWith('2026-09'));
  });

  it('选择日期后展示当天的页面与学习轮次状态', async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: '2026-09-03' }));
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-03'));
    const completedCard = screen.getByText(/第 1 页/).closest('li') as HTMLElement;
    expect(completedCard).toHaveTextContent('第 2 次学习');
    expect(completedCard).toHaveTextContent('已完成');
    expect(completedCard).toHaveTextContent('第二次已完成');
    expect(completedCard).toHaveTextContent('待完成 1 轮');
    const recommendedCard = screen.getByText(/第 2 页/).closest('li') as HTMLElement;
    expect(recommendedCard).toHaveTextContent('推荐复习');
    expect(recommendedCard).toHaveTextContent('待完成 2 轮');
  });

  it('查看快照弹窗展示单词顺序和完成前状态', async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: '2026-09-03' }));
    await user.click(await screen.findByRole('button', { name: '查看快照' }));
    const dialog = screen.getByRole('dialog', { name: '页面快照' });
    expect(within(dialog).getByText('panorama')).toBeInTheDocument();
    expect(within(dialog).getByText('n. 全景')).toBeInTheDocument();
    expect(within(dialog).getByText('scenery')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '下一份快照' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '上一份快照' })).toBeDisabled();
  });

  it('快照弹窗可切换到下一份会话快照', async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(await screen.findByRole('button', { name: '2026-09-03' }));
    await user.click(await screen.findByRole('button', { name: '查看快照' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '下一份快照' }));
    await waitFor(() => expect(apiClient.getHistoryPageSnapshot).toHaveBeenLastCalledWith(90));
  });

  it('向前向后滑动切换相邻日期', async () => {
    renderHistory();
    const swipeArea = await screen.findByTestId('date-swipe-area');
    fireEvent.touchStart(swipeArea, { touches: [{ clientX: 220, clientY: 300 }] });
    fireEvent.touchEnd(swipeArea, { changedTouches: [{ clientX: 80, clientY: 300 }] });
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-06'));

    fireEvent.touchStart(swipeArea, { touches: [{ clientX: 80, clientY: 300 }] });
    fireEvent.touchEnd(swipeArea, { changedTouches: [{ clientX: 220, clientY: 300 }] });
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-05'));
  });

  it('前后一天按钮切换相邻日期', async () => {
    const user = userEvent.setup();
    renderHistory();
    await screen.findByTestId('date-swipe-area');
    await user.click(screen.getByRole('button', { name: '后一天' }));
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-06'));
    await user.click(screen.getByRole('button', { name: '前一天' }));
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-05'));
  });

  it('支持从 URL 参数初始化日期', async () => {
    renderHistory('/history?date=2026-09-01');
    await waitFor(() => expect(apiClient.getHistoryForDate).toHaveBeenCalledWith('2026-09-01'));
    expect(screen.getByRole('button', { name: '2026-09-01' })).toHaveClass('calendar-day--selected');
  });

  it('当天没有页面时显示空状态', async () => {
    apiClient.getHistoryForDate.mockResolvedValue({ date: '2026-09-05', pages: [] });
    renderHistory();
    expect(await screen.findByText('当天没有学习记录')).toBeInTheDocument();
  });
});
