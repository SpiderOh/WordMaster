import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Vocabulary } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listVocabularies: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
}));

const getAuthToken = vi.hoisted(() => vi.fn(() => null as string | null));
const clearAuthToken = vi.hoisted(() => vi.fn());

vi.mock('../lib/apiClient', () => ({ apiClient, getAuthToken, clearAuthToken }));

const downloadJson = vi.hoisted(() => vi.fn());

vi.mock('../lib/download', () => ({ downloadJson }));

import { SettingsView } from '../features/settings/SettingsView';

const settingsFixture: AppSettings = {
  page_size: 15,
  intervals: [0, 1, 4],
  theme: 'system',
  font_size: 'medium',
  vocabulary_priorities: { '1': 0, '2': 1 },
};

const vocabulariesFixture: Vocabulary[] = [
  { id: 1, name: '六级词库', filename: 'cet6.csv', imported_at: '2026-09-01T08:00:00+00:00', total_words: 6550, active: true, priority: 0 },
  { id: 2, name: '考研词库', filename: 'kaoyan.csv', imported_at: '2026-09-02T08:00:00+00:00', total_words: 3000, active: true, priority: 1 },
];

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.dataset.theme = '';
  document.documentElement.dataset.fontSize = '';
  apiClient.getSettings.mockResolvedValue(settingsFixture);
  apiClient.listVocabularies.mockResolvedValue(vocabulariesFixture);
  apiClient.updateSettings.mockImplementation(async (payload: AppSettings) => payload);
  getAuthToken.mockReturnValue(null);
});

describe('设置页', () => {
  it('加载并回显页大小、推荐间隔、主题与字号', async () => {
    renderSettings();
    expect(await screen.findByLabelText('每页单词数')).toHaveValue(15);
    expect(screen.getByLabelText('推荐间隔（天）')).toHaveValue('0,1,4');
    expect(screen.getByLabelText('主题')).toHaveValue('system');
    expect(screen.getByLabelText('字号')).toHaveValue('medium');
  });

  it('保存时提交完整设置并显示成功提示', async () => {
    const user = userEvent.setup();
    renderSettings();
    const pageSize = await screen.findByLabelText('每页单词数');
    await user.clear(pageSize);
    await user.type(pageSize, '20');
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() =>
      expect(apiClient.updateSettings).toHaveBeenCalledWith({
        page_size: 20,
        intervals: [0, 1, 4],
        theme: 'system',
        font_size: 'medium',
        vocabulary_priorities: { '1': 0, '2': 1 },
      }),
    );
    expect(await screen.findByText('设置已保存')).toBeInTheDocument();
  });

  it('主题与字号选择立即应用到文档根元素', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.selectOptions(await screen.findByLabelText('主题'), 'dark');
    await user.selectOptions(screen.getByLabelText('字号'), 'large');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.fontSize).toBe('large');
  });

  it('保存时提交修改后的词库优先级', async () => {
    const user = userEvent.setup();
    renderSettings();
    const priorityInput = await screen.findByLabelText('六级词库 优先级');
    await user.clear(priorityInput);
    await user.type(priorityInput, '3');
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() =>
      expect(apiClient.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ vocabulary_priorities: { '1': 3, '2': 1 } }),
      ),
    );
  });

  it('间隔输入非法时不提交并提示', async () => {
    const user = userEvent.setup();
    renderSettings();
    const intervals = await screen.findByLabelText('推荐间隔（天）');
    await user.clear(intervals);
    await user.type(intervals, '0,,-2');
    await user.click(screen.getByRole('button', { name: '保存设置' }));
    expect(await screen.findByText(/推荐间隔必须是非负整数/)).toBeInTheDocument();
    expect(apiClient.updateSettings).not.toHaveBeenCalled();
  });

  it('服务器模式提供登录并保存 Token', async () => {
    apiClient.login.mockResolvedValue({ access_token: 'jwt-1', token_type: 'bearer', expires_in: 3600 });
    const user = userEvent.setup();
    renderSettings();
    await user.type(await screen.findByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), 'secret');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(apiClient.login).toHaveBeenCalledWith('admin', 'secret'));
    expect(await screen.findByText('登录成功')).toBeInTheDocument();
  });

  it('已有 Token 时显示退出登录', async () => {
    getAuthToken.mockReturnValue('jwt-1');
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: '退出登录' }));
    await waitFor(() => expect(apiClient.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('已退出登录')).toBeInTheDocument();
  });

  it('导出备份调用接口并触发下载', async () => {
    apiClient.exportBackup.mockResolvedValue({ version: 1, data: {} });
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: '导出 JSON 备份' }));
    await waitFor(() => expect(apiClient.exportBackup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(downloadJson).toHaveBeenCalledWith('wordmaster-backup.json', { version: 1, data: {} }));
  });

  it('导入备份上传 JSON 并显示恢复结果', async () => {
    apiClient.importBackup.mockResolvedValue({ status: 'restored' });
    const user = userEvent.setup();
    renderSettings();
    const backupFile = new File([JSON.stringify({ version: 1 })], 'backup.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('导入 JSON 备份'), backupFile);
    await waitFor(() => expect(apiClient.importBackup).toHaveBeenCalledWith({ version: 1 }));
    expect(await screen.findByText('备份已恢复')).toBeInTheDocument();
  });
});
