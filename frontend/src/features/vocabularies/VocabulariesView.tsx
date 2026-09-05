import { useCallback, useEffect, useState } from 'react';
import { apiClient, vocabularyExportUrl } from '../../lib/apiClient';
import type { ImportResult, Vocabulary } from '../../lib/types';

type EditState = { vocabularyId: number; name: string } | null;
type DeleteState = { vocabulary: Vocabulary; confirm: string } | null;

export function VocabulariesView() {
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importName, setImportName] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState>(null);
  const [deleting, setDeleting] = useState<DeleteState>(null);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await apiClient.listVocabularies();
      setVocabularies(items);
      setPriorityDrafts(Object.fromEntries(items.map((item) => [item.id, String(item.priority)])));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载词库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleImport = useCallback(async () => {
    const input = document.getElementById('vocabulary-file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    setMessage(null);
    setError(null);
    setImportResult(null);
    if (importName.trim().length === 0) {
      setError('请填写词库名称');
      return;
    }
    if (!file) {
      setError('请选择 CSV 文件');
      return;
    }
    try {
      const result = await apiClient.importVocabulary(importName.trim(), file);
      setImportResult(result);
      setImportName('');
      if (input) {
        input.value = '';
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? `导入失败：${cause.message}` : '导入失败');
    }
  }, [importName, refresh]);

  const handleToggleActive = useCallback(
    async (vocabulary: Vocabulary) => {
      setMessage(null);
      setError(null);
      try {
        await apiClient.setVocabularyActive(vocabulary.id, !vocabulary.active);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '切换状态失败');
      }
    },
    [refresh],
  );

  const handleSavePriority = useCallback(
    async (vocabulary: Vocabulary, priority: number) => {
      setMessage(null);
      setError(null);
      if (!Number.isInteger(priority) || priority < 0) {
        setError('优先级必须是非负整数');
        return;
      }
      try {
        await apiClient.setVocabularyPriority(vocabulary.id, priority);
        setMessage('优先级已保存');
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '保存优先级失败');
      }
    },
    [refresh],
  );

  const handleRename = useCallback(
    async (vocabularyId: number, name: string) => {
      setMessage(null);
      setError(null);
      if (name.trim().length === 0) {
        setError('名称不能为空');
        return;
      }
      try {
        await apiClient.renameVocabulary(vocabularyId, name.trim());
        setEditing(null);
        setMessage('名称已更新');
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '重命名失败');
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(async () => {
    if (deleting === null) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await apiClient.deleteVocabulary(deleting.vocabulary.id, deleting.confirm);
      setDeleting(null);
      setMessage('词库已删除');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败');
    }
  }, [deleting, refresh]);

  return (
    <section>
      <div className="page-heading">
        <h1>词库管理</h1>
        <span className="page-heading__meta">共 {vocabularies.length} 个词库</span>
      </div>

      {message !== null && (
        <div className="banner banner--info" role="status">
          {message}
        </div>
      )}
      {error !== null && (
        <div className="banner banner--warn" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <h2 className="card__title">导入新词库</h2>
        <div className="field">
          <label className="field__label" htmlFor="vocabulary-name">
            词库名称
          </label>
          <input id="vocabulary-name" type="text" value={importName} onChange={(event) => setImportName(event.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="vocabulary-file">
            CSV 文件
          </label>
          <input id="vocabulary-file" type="file" accept=".csv,text/csv" />
        </div>
        <button type="button" className="btn" onClick={() => void handleImport()}>
          导入
        </button>
        {importResult !== null && (
          <div className="import-result">
            <div className="banner banner--info">
              成功导入 {importResult.imported_count} 词{importResult.row_errors.length > 0 ? `，${importResult.row_errors.length} 行被跳过` : ''}
            </div>
            {importResult.row_errors.map((row) => (
              <div key={`${row.row_number}-${row.code}`} className="word-row__meta">
                第 {row.row_number} 行 · {row.message}（{row.code}）
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="empty-state">正在加载词库…</div>}

      {!loading && (
        <ul className="page-list">
          {vocabularies.map((vocabulary) => (
            <li key={vocabulary.id} className="card vocabulary-card">
              {editing !== null && editing.vocabularyId === vocabulary.id ? (
                <div className="vocabulary-card__row">
                  <input
                    aria-label="新名称"
                    type="text"
                    value={editing.name}
                    onChange={(event) => setEditing({ vocabularyId: vocabulary.id, name: event.target.value })}
                  />
                  <button type="button" className="btn btn--small" onClick={() => void handleRename(vocabulary.id, editing.name)}>
                    保存名称
                  </button>
                </div>
              ) : (
                <div className="vocabulary-card__row">
                  <strong>{vocabulary.name}</strong>
                  <span className={`badge${vocabulary.active ? ' badge--mastered' : ''}`}>{vocabulary.active ? '已激活' : '已停用'}</span>
                </div>
              )}
              <div className="word-row__meta">
                {vocabulary.filename} · {vocabulary.total_words} 词 · 导入于 {vocabulary.imported_at.slice(0, 10)}
              </div>
              <div className="vocabulary-card__row">
                <input
                  aria-label="优先级"
                  type="number"
                  min={0}
                  value={priorityDrafts[vocabulary.id] ?? String(vocabulary.priority)}
                  onChange={(event) => setPriorityDrafts((current) => ({ ...current, [vocabulary.id]: event.target.value }))}
                />
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => void handleSavePriority(vocabulary, Number(priorityDrafts[vocabulary.id]))}
                >
                  保存优先级
                </button>
                <button type="button" className="btn btn--small btn--ghost" onClick={() => void handleToggleActive(vocabulary)}>
                  {vocabulary.active ? '停用' : '激活'}
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => setEditing({ vocabularyId: vocabulary.id, name: vocabulary.name })}
                >
                  重命名
                </button>
                <a className="btn btn--small btn--ghost" href={vocabularyExportUrl(vocabulary.id)} download={`vocabulary-${vocabulary.id}.csv`}>
                  导出 CSV
                </a>
                <button
                  type="button"
                  className="btn btn--small btn--ghost-danger"
                  onClick={() => setDeleting({ vocabulary, confirm: '' })}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleting !== null && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="删除词库">
            <p className="dialog__title">删除词库“{deleting.vocabulary.name}”？</p>
            <p className="word-row__meta">删除后词库及其学习记录不可恢复，且进入审计日志。</p>
            <div className="field">
              <label className="field__label" htmlFor="delete-confirm">
                确认删除，请输入词库名称
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleting.confirm}
                onChange={(event) => setDeleting({ ...deleting, confirm: event.target.value })}
              />
            </div>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={deleting.confirm !== deleting.vocabulary.name}
                onClick={() => void handleDelete()}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
