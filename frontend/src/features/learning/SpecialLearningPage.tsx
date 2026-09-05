import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import type { SpecialOutcome, StudyPage, StudyPageWord } from '../../lib/types';

const OUTCOME_OPTIONS: Array<{ value: SpecialOutcome; label: string }> = [
  { value: 'remembered', label: '记得' },
  { value: 'forgotten', label: '遗忘' },
  { value: 'mastered', label: '熟' },
];

type PageState =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; page: StudyPage };

export function SpecialLearningPage() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [outcomes, setOutcomes] = useState<Record<number, SpecialOutcome>>({});
  const [confirming, setConfirming] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = Number(pageId);
    if (!Number.isInteger(id) || id <= 0) {
      setState({ phase: 'missing' });
      return () => {
        cancelled = true;
      };
    }
    apiClient
      .getStudyPage(id)
      .then((page) => {
        if (!cancelled) {
          setState({ phase: 'ready', page });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 404) {
          setState({ phase: 'missing' });
        } else {
          setState({ phase: 'error', message: error instanceof Error ? error.message : '加载专攻页失败' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const chooseOutcome = useCallback((wordId: number, outcome: SpecialOutcome) => {
    setOutcomes((current) => ({ ...current, [wordId]: outcome }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (state.phase !== 'ready') {
      return;
    }
    const missing = state.page.words.some((word) => outcomes[word.word_id] === undefined);
    if (missing) {
      setValidationMessage('请为每个单词选择结果');
      return;
    }
    setValidationMessage(null);
    try {
      await apiClient.completeSpecialPage(state.page.id, outcomes, new Date().toISOString());
      navigate('/forgotten');
    } catch (error) {
      setSubmitError(error instanceof Error ? `提交失败：${error.message}` : '提交失败');
    }
  }, [state, outcomes, navigate]);

  return (
    <section>
      <div className="page-heading">
        <h1>专攻学习</h1>
        {state.phase === 'ready' && (
          <span className="page-heading__meta">第 {state.page.page_number} 页 · 共 {state.page.words.length} 词</span>
        )}
      </div>

      {state.phase === 'loading' && <div className="empty-state">正在加载专攻页…</div>}

      {state.phase === 'missing' && (
        <div className="empty-state">
          <p>专攻页不存在或已完成</p>
          <div className="empty-state__actions">
            <Link className="btn" to="/forgotten">
              返回遗忘列表
            </Link>
          </div>
        </div>
      )}

      {state.phase === 'error' && <div className="banner banner--warn">{state.message}</div>}

      {state.phase === 'ready' && (
        <>
          <div className="banner banner--info">逐词选择结果：记得恢复普通学习；遗忘继续累加；熟移出普通学习。</div>
          <ol className="word-list">
            {state.page.words.map((word: StudyPageWord) => (
              <li key={word.word_id} className="word-row word-row--static">
                <span className="word-row__main">
                  <span className="word-row__word">{word.word}</span>
                  <span className="word-row__meta">
                    学 {word.study_count} · 忘 {word.forget_count}
                  </span>
                </span>
                <span className="word-row__meaning">{word.meaning}</span>
                <span className="word-row__actions outcome-group" role="group" aria-label={`${word.word} 的结果`}>
                  {OUTCOME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`btn btn--small${outcomes[word.word_id] === option.value ? ' is-selected' : ''}`}
                      onClick={() => chooseOutcome(word.word_id, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          <div className="study-footer">
            <button type="button" className="btn btn--block" onClick={() => setConfirming(true)}>
              完成专攻
            </button>
          </div>
        </>
      )}

      {confirming && state.phase === 'ready' && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="完成专攻">
            <p className="dialog__title">提交专攻结果？</p>
            <p className="word-row__meta">提交后本页完成，记得的词恢复普通学习。</p>
            {validationMessage !== null && <div className="banner banner--warn">{validationMessage}</div>}
            {submitError !== null && <div className="banner banner--warn">{submitError}</div>}
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="btn" onClick={() => void handleSubmit()}>
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
