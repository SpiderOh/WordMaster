import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../App';

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

const NAV_ITEMS = ['学习', '日期', '遗忘', '统计', '设置'] as const;

describe('底部导航', () => {
  it('默认渲染学习页和五个主入口', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: '学习' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    for (const label of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('学习入口默认高亮当前路由', () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: '学习' })).toHaveClass('is-active');
  });

  it.each(NAV_ITEMS.slice(1))('点击“%s”切换到对应页面', async (label) => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('link', { name: label }));
    expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument();
  });

  it('未知路由重定向回学习页', () => {
    renderApp('/unknown-place');
    expect(screen.getByRole('heading', { level: 1, name: '学习' })).toBeInTheDocument();
  });
});
