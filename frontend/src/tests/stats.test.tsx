import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayStats } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  getTodayStats: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({ apiClient }));

import { StatsView } from '../features/stats/StatsView';

const statsFixture: TodayStats = {
  date: '2026-09-05',
  study_word_count: 12,
  forgetting_count: 3,
  repeated_forgetting_count: 2,
  streak_days: 4,
  total_study_count: 100,
  learning_word_count: 30,
  mastered_word_count: 60,
  forgotten_word_count: 40,
  repeated_forgetting_words: [
    { word_id: 1, word: 'panorama', forget_count_today: 2, total_forget_count: 5 },
    { word_id: 2, word: 'scenery', forget_count_today: 1, total_forget_count: 3 },
  ],
};

function renderStats() {
  return render(
    <MemoryRouter>
      <StatsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.getTodayStats.mockResolvedValue(statsFixture);
});

describe('统计页', () => {
  it('渲染今日学习、遗忘、再次遗忘、连续天数与累计状态', async () => {
    renderStats();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('今日学习')).toBeInTheDocument();
    expect(screen.getByText('连续学习天数')).toBeInTheDocument();
    expect(apiClient.getTodayStats).toHaveBeenCalledWith();
  });

  it('点击再次遗忘卡片展开明细列表', async () => {
    const user = userEvent.setup();
    renderStats();
    await user.click(await screen.findByRole('button', { name: /今日再次遗忘/ }));
    const detail = screen.getByRole('list', { name: '再次遗忘明细' });
    expect(detail).toHaveTextContent('panorama');
    expect(detail).toHaveTextContent('今日 2 次');
    expect(detail).toHaveTextContent('累计 5 次');
    expect(detail).toHaveTextContent('scenery');
  });

  it('没有再次遗忘时不显示明细入口', async () => {
    apiClient.getTodayStats.mockResolvedValue({ ...statsFixture, repeated_forgetting_count: 0, repeated_forgetting_words: [] });
    renderStats();
    await screen.findByText('0');
    expect(screen.queryByRole('button', { name: /今日再次遗忘/ })).not.toBeInTheDocument();
  });
});
