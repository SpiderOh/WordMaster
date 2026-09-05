import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportResult, Vocabulary } from '../lib/types';

const apiClient = vi.hoisted(() => ({
  listVocabularies: vi.fn(),
  importVocabulary: vi.fn(),
  setVocabularyActive: vi.fn(),
  setVocabularyPriority: vi.fn(),
  renameVocabulary: vi.fn(),
  deleteVocabulary: vi.fn(),
}));

const vocabularyExportUrl = vi.hoisted(() => vi.fn((id: number) => `/api/v1/vocabularies/${id}/export`));

vi.mock('../lib/apiClient', () => ({ apiClient, vocabularyExportUrl }));

import { VocabulariesView } from '../features/vocabularies/VocabulariesView';

const vocabulariesFixture: Vocabulary[] = [
  { id: 1, name: '六级词库', filename: 'cet6.csv', imported_at: '2026-09-01T08:00:00+00:00', total_words: 6550, active: true, priority: 0 },
  { id: 2, name: '考研词库', filename: 'kaoyan.csv', imported_at: '2026-09-02T08:00:00+00:00', total_words: 3000, active: false, priority: 1 },
];

const importResult: ImportResult = {
  vocabulary: { id: 3, name: '新增词库', filename: 'new.csv', imported_at: '2026-09-05T08:00:00+00:00', total_words: 100, active: true, priority: 2 },
  imported_count: 99,
  row_errors: [{ row_number: 7, code: 'missing_meaning', message: '缺少释义' }],
};

function renderVocabularies() {
  return render(
    <MemoryRouter>
      <VocabulariesView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.listVocabularies.mockResolvedValue(vocabulariesFixture);
  apiClient.importVocabulary.mockResolvedValue(importResult);
  apiClient.setVocabularyActive.mockImplementation(async (_id: number, active: boolean) => ({
    ...vocabulariesFixture[0],
    active,
  }));
});

describe('词库管理页', () => {
  it('渲染词库列表：词数、导入日期、激活状态、优先级与导出链接', async () => {
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('六级词库')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/6550 词/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/2026-09-01/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('已激活')).toBeInTheDocument();
    expect(within(rows[1]).getByText('已停用')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: '导出 CSV' })).toHaveAttribute('href', '/api/v1/vocabularies/1/export');
  });

  it('上传 CSV 后展示导入统计与行级错误', async () => {
    const user = userEvent.setup();
    renderVocabularies();
    await user.type(await screen.findByLabelText('词库名称'), '新增词库');
    const csvFile = new File(['number,word,meaning\n1,apple,n. 苹果'], 'new.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('CSV 文件'), csvFile);
    await user.click(screen.getByRole('button', { name: '导入' }));
    await waitFor(() => expect(apiClient.importVocabulary).toHaveBeenCalledWith('新增词库', csvFile));
    expect(await screen.findByText(/成功导入 99 词/)).toBeInTheDocument();
    expect(screen.getByText(/第 7 行/)).toBeInTheDocument();
    expect(screen.getByText(/缺少释义/)).toBeInTheDocument();
    await waitFor(() => expect(apiClient.listVocabularies).toHaveBeenCalledTimes(2));
  });

  it('切换激活状态后刷新列表', async () => {
    const user = userEvent.setup();
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '停用' }));
    await waitFor(() => expect(apiClient.setVocabularyActive).toHaveBeenCalledWith(1, false));
    await waitFor(() => expect(apiClient.listVocabularies).toHaveBeenCalledTimes(2));
  });

  it('修改优先级后保存', async () => {
    apiClient.setVocabularyPriority.mockResolvedValue(vocabulariesFixture[0]);
    const user = userEvent.setup();
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    const input = within(rows[0]).getByLabelText('优先级');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(within(rows[0]).getByRole('button', { name: '保存优先级' }));
    await waitFor(() => expect(apiClient.setVocabularyPriority).toHaveBeenCalledWith(1, 2));
  });

  it('重命名词库', async () => {
    apiClient.renameVocabulary.mockResolvedValue({ ...vocabulariesFixture[0], name: '六级核心' });
    const user = userEvent.setup();
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '重命名' }));
    const nameInput = within(rows[0]).getByLabelText('新名称');
    await user.clear(nameInput);
    await user.type(nameInput, '六级核心');
    await user.click(within(rows[0]).getByRole('button', { name: '保存名称' }));
    await waitFor(() => expect(apiClient.renameVocabulary).toHaveBeenCalledWith(1, '六级核心'));
  });

  it('删除词库需要输入与名称完全一致的确认文本', async () => {
    apiClient.deleteVocabulary.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除词库' });
    expect(dialog).toHaveTextContent('六级词库');
    await user.type(within(dialog).getByLabelText('确认删除，请输入词库名称'), '错误的名称');
    expect(within(dialog).getByRole('button', { name: '确认删除' })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('确认删除，请输入词库名称'));
    await user.type(within(dialog).getByLabelText('确认删除，请输入词库名称'), '六级词库');
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(apiClient.deleteVocabulary).toHaveBeenCalledWith(1, '六级词库'));
  });

  it('删除确认名称不匹配时服务端错误透出', async () => {
    apiClient.deleteVocabulary.mockRejectedValue(Object.assign(new Error('Confirmation name mismatch'), { status: 400 }));
    const user = userEvent.setup();
    renderVocabularies();
    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]).getByRole('button', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除词库' });
    await user.type(within(dialog).getByLabelText('确认删除，请输入词库名称'), '六级词库');
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));
    expect(await screen.findByText(/Confirmation name mismatch/)).toBeInTheDocument();
  });
});
