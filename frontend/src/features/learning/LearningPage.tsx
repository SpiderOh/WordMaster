import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiClient, isNetworkError } from '../../lib/apiClient';
import { enqueueApiReplay, enqueueSyncEvent } from '../../lib/offline/outbox';
import type { StudyPage, StudyPageWord } from '../../lib/types';

type PageState =
  | { phase: 'loading' }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; page: StudyPage };

interface CompletionToast {
  // sessionId 为 0 表示离线记录，服务端尚未生成学习会话
  sessionId: number;
}

export function LearningPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [completion, setCompletion] = useState<CompletionToast | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setErrorToast(message);
    if (errorTimer.current !== null) {
      window.clearTimeout(errorTimer.current);
    }
    errorTimer.current = window.setTimeout(() => setErrorToast(null), 4000);
  }, []);

  useEffect(() => () => {
    if (errorTimer.current !== null) {
      window.clearTimeout(errorTimer.current);
    }
  }, []);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    setCompletion(null);
    setRevealed(new Set());
    try {
      let pageSize = 15;
      try {
        const settings = await apiClient.getSettings();
        pageSize = settings.page_size;
      } catch {
        /* 设置不可用时使用默认页大小 */
      }
      const page = await apiClient.getNextStudyPage(pageSize);
      setState({ phase: 'ready', page });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setState({ phase: 'empty' });
      } else if (error instanceof ApiError) {
        setState({ phase: 'error', message: error.message });
      } else {
        setState({ phase: 'error', message: '加载学习页失败' });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyProgress = useCallback((wordId: number, progress: { status: StudyPageWord['status']; study_count: number; forget_count: number }) => {
    setState((current) => {
      if (current.phase !== 'ready') {
        return current;
      }
      return {
        ...current,
        page: {
          ...current.page,
          words: current.page.words.map((word) =>
            word.word_id === wordId
              ? { ...word, status: progress.status, study_count: progress.study_count, forget_count: progress.forget_count, can_mark_mastered: progress.study_count === 0 }
              : word,
          ),
        },
      };
    });
  }, []);

  const handleForget = useCallback(
    async (word: StudyPageWord) => {
      if (state.phase !== 'ready') {
        return;
      }
      try {
        const progress = await apiClient.markWordForgotten(state.page.id, word.word_id);
        applyProgress(word.word_id, progress);
      } catch (error) {
        if (isNetworkError(error)) {
          await enqueueSyncEvent('forget', String(word.word_id), { forget_count_delta: 1 });
          applyProgress(word.word_id, {
            status: word.status,
            study_count: word.study_count,
            forget_count: word.forget_count + 1,
          });
          setOfflineNotice('当前离线：遗忘已记录，联网后自动同步');
          return;
        }
        showToast(error instanceof Error ? `遗忘失败：${error.message}` : '遗忘失败');
      }
    },
    [state, applyProgress, showToast],
  );

  const handleMaster = useCallback(
    async (word: StudyPageWord) => {
      if (state.phase !== 'ready') {
        return;
      }
      try {
        const page = await apiClient.markWordMastered(state.page.id, word.word_id);
        setRevealed(new Set());
        setState({ phase: 'ready', page });
      } catch (error) {
        if (isNetworkError(error)) {
          await enqueueApiReplay('POST', `/study-pages/${state.page.id}/words/${word.word_id}/master`);
          setState((current) => {
            if (current.phase !== 'ready') {
              return current;
            }
            return {
              ...current,
              page: { ...current.page, words: current.page.words.filter((item) => item.word_id !== word.word_id) },
            };
          });
          setOfflineNotice('当前离线：标熟已记录，联网后自动补词');
          return;
        }
        showToast(error instanceof Error ? `标熟失败：${error.message}` : '标熟失败');
      }
    },
    [state, showToast],
  );

  const handleConfirmComplete = useCallback(async () => {
    if (state.phase !== 'ready') {
      return;
    }
    try {
      const session = await apiClient.completePage(state.page.id);
      setCompletion({ sessionId: session.id });
      setState({ phase: 'ready', page: { ...state.page, status: 'completed' } });
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueApiReplay('POST', `/study-pages/${state.page.id}/complete`, {
          completed_at: new Date().toISOString(),
        });
        setCompletion({ sessionId: 0 });
        setState({ phase: 'ready', page: { ...state.page, status: 'completed' } });
      } else {
        showToast(error instanceof Error ? `完成失败：${error.message}` : '完成失败');
      }
    } finally {
      setConfirming(false);
    }
  }, [state, showToast]);

  const handleUndo = useCallback(async () => {
    if (state.phase !== 'ready' || completion === null) {
      return;
    }
    if (completion.sessionId === 0) {
      showToast('离线记录的完成无法撤销，需联网后重试');
      return;
    }
    try {
      await apiClient.undoPageCompletion(state.page.id, completion.sessionId);
      const page = await apiClient.getStudyPage(state.page.id);
      setCompletion(null);
      setState({ phase: 'ready', page });
    } catch (error) {
      setCompletion(null);
      if (isNetworkError(error)) {
        showToast('撤销需要联网后重试');
        return;
      }
      showToast(error instanceof Error ? `撤销失败：${error.message}` : '撤销失败');
    }
  }, [state, completion, showToast]);

  const toggleReveal = useCallback((wordId: number) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  }, []);

  return (
    <section>
      <div className="page-heading">
        <h1>学习</h1>
        {state.phase === 'ready' && (
          <span className="page-heading__meta">
            第 {state.page.page_number} 页 · 共 {state.page.words.length} 词
            {state.page.status === 'completed' && ' · 已完成'}
          </span>
        )}
      </div>

      {state.phase === 'loading' && <div className="empty-state">正在加载学习页…</div>}

      {state.phase === 'empty' && (
        <div className="empty-state">
          <p>没有可学习的新词</p>
          <p className="word-row__meta">词库可能已学完或尚未导入</p>
          <div className="empty-state__actions">
            <Link className="btn" to="/vocabularies">
              前往词库管理
            </Link>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="empty-state">
          <p>加载失败：{state.message}</p>
          <div className="empty-state__actions">
            <button type="button" className="btn" onClick={() => void load()}>
              重试
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          {offlineNotice !== null && (
            <div className="banner banner--info" role="status">
              {offlineNotice}
            </div>
          )}
          {state.page.is_short && <div className="banner banner--warn">词库接近学完，本页仅 {state.page.words.length} 词</div>}
          {state.page.status === 'exhausted' && (
            <div className="banner banner--info">
              本页单词已全部标熟
              <button type="button" className="btn btn--small" onClick={() => void load()}>
                下一页
              </button>
            </div>
          )}

          <ol className="word-list">
            {state.page.words.map((word) => {
              const isRevealed = revealed.has(word.word_id);
              const actionable = state.page.status === 'in_progress';
              return (
                <li key={word.word_id} className="word-row" onClick={() => toggleReveal(word.word_id)}>
                  <span className={`word-row__meaning${isRevealed ? '' : ' word-row__meaning--hidden'}`} aria-hidden={!isRevealed}>
                    {isRevealed ? word.meaning : '?????'}
                  </span>
                  <span className="word-row__main">
                    <span className="word-row__word">{word.word}</span>
                    <span className="word-row__meta">
                      {word.vocabulary_name} · 源页 {word.source_page ?? '—'} · 学 {word.study_count} 次 · 忘 {word.forget_count} 次
                      {word.status === 'mastered' && ' · 已熟'}
                    </span>
                  </span>
                  <span className="word-row__actions">
                    {actionable && (
                      <>
                        {word.can_mark_mastered && (
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleMaster(word);
                            }}
                          >
                            熟
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--small btn--ghost-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleForget(word);
                          }}
                        >
                          遗忘
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>

          {state.page.status === 'in_progress' && (
            <div className="study-footer">
              <button type="button" className="btn btn--block" onClick={() => setConfirming(true)}>
                完成本页
              </button>
            </div>
          )}
        </>
      )}

      {confirming && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="完成本页">
            <p className="dialog__title">确认完成本页？</p>
            <p className="word-row__meta">未熟词学习次数将 +1，并记录完成时间；5 分钟内可以撤销。</p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="btn" onClick={() => void handleConfirmComplete()}>
                确认完成
              </button>
            </div>
          </div>
        </div>
      )}

      {completion !== null && (
        <div className="toast" role="status">
          <span>{completion.sessionId === 0 ? '当前离线：本页完成已记录，联网后自动同步' : '本页已完成，未熟词学习次数 +1'}</span>
          {completion.sessionId !== 0 && (
            <button type="button" className="btn btn--small" onClick={() => void handleUndo()}>
              撤销
            </button>
          )}
          <button type="button" className="btn btn--small" onClick={() => void load()}>
            下一页
          </button>
        </div>
      )}

      {errorToast !== null && (
        <div className="toast toast--error" role="alert">
          <span>{errorToast}</span>
        </div>
      )}
    </section>
  );
}
