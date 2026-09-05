import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, forgottenExportUrl } from '../../lib/apiClient';
import type { ForgottenWord, Vocabulary, WordStatus } from '../../lib/types';

const STATUS_OPTIONS: Array<{ value: WordStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'unlearned', label: '未学习' },
  { value: 'learning', label: '学习中' },
  { value: 'mastered', label: '熟' },
];

const SEARCH_DEBOUNCE_MS = 300;

export function ForgottenView() {
  const navigate = useNavigate();
  const [words, setWords] = useState<ForgottenWord[]>([]);
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [search, setSearch] = useState('');
  const [vocabularyId, setVocabularyId] = useState<number | ''>('');
  const [status, setStatus] = useState<WordStatus | ''>('');
  const [forgottenSince, setForgottenSince] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const fetchWords = useCallback(async (filters: {
    search: string;
    vocabularyId: number | '';
    status: WordStatus | '';
    forgottenSince: string;
  }) => {
    setLoading(true);
    try {
      const result = await apiClient.listForgottenWords({
        search: filters.search.trim() || undefined,
        vocabularyId: filters.vocabularyId === '' ? undefined : filters.vocabularyId,
        status: filters.status === '' ? undefined : filters.status,
        forgottenSince: /^\d{4}-\d{2}-\d{2}$/.test(filters.forgottenSince) ? filters.forgottenSince : undefined,
      });
      setWords(result);
      setSelected(new Set());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载遗忘词失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiClient
      .listVocabularies()
      .then(setVocabularies)
      .catch(() => setVocabularies([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void fetchWords({ search, vocabularyId, status, forgottenSince });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [search, vocabularyId, status, forgottenSince, fetchWords]);

  const toggleSelected = useCallback((wordId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(
    async (wordId: number) => {
      setMessage(null);
      try {
        await apiClient.undoForgetting(wordId);
        setMessage('已撤销最近一次遗忘');
        await fetchWords({ search, vocabularyId, status, forgottenSince });
      } catch (error) {
        setMessage(error instanceof Error ? `撤销失败：${error.message}` : '撤销失败');
      }
    },
    [fetchWords, search, vocabularyId, status, forgottenSince],
  );

  const handleCreateSpecialPage = useCallback(async () => {
    setMessage(null);
    if (selected.size === 0) {
      setMessage('至少选择一个单词才能生成专攻页');
      return;
    }
    try {
      const page = await apiClient.createSpecialPage([...selected].sort((a, b) => a - b));
      navigate(`/special/${page.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? `生成专攻页失败：${error.message}` : '生成专攻页失败');
    }
  }, [selected, navigate]);

  return (
    <section>
      <div className="page-heading">
        <h1>遗忘</h1>
        <span className="page-heading__meta">按遗忘次数从高到低</span>
      </div>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="搜索单词"
          aria-label="搜索单词"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select aria-label="词库" value={vocabularyId} onChange={(event) => setVocabularyId(event.target.value === '' ? '' : Number(event.target.value))}>
          <option value="">全部词库</option>
          {vocabularies.map((vocabulary) => (
            <option key={vocabulary.id} value={vocabulary.id}>
              {vocabulary.name}
            </option>
          ))}
        </select>
        <select aria-label="状态" value={status} onChange={(event) => setStatus(event.target.value as WordStatus | '')}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="最近遗忘自 YYYY-MM-DD"
          aria-label="最近遗忘自"
          value={forgottenSince}
          onChange={(event) => setForgottenSince(event.target.value)}
        />
      </div>

      {loadError !== null && <div className="banner banner--warn">{loadError}</div>}
      {message !== null && (
        <div className="banner banner--info" role="status">
          {message}
        </div>
      )}

      {loading && <div className="empty-state">正在加载遗忘词…</div>}

      {!loading && words.length === 0 && loadError === null && (
        <div className="empty-state">目前没有遗忘词，继续保持！</div>
      )}

      {!loading && words.length > 0 && (
        <ul className="page-list">
          {words.map((word) => (
            <li key={word.word_id} className="card forgotten-card">
              <label className="forgotten-card__select">
                <input
                  type="checkbox"
                  checked={selected.has(word.word_id)}
                  onChange={() => toggleSelected(word.word_id)}
                />
                <span className="word-row__word">{word.word}</span>
              </label>
              <span className="word-row__meaning">{word.meaning}</span>
              <span className="word-row__meta">
                {word.vocabulary_name} · 学 {word.study_count} 次 · <span className="badge badge--forget">忘 {word.forget_count}</span>
              </span>
              <span className="word-row__meta">
                {word.last_forgotten_at ? (
                  <Link to={`/history?date=${word.last_forgotten_at.slice(0, 10)}`}>{word.last_forgotten_at.slice(0, 10)}</Link>
                ) : (
                  '—'
                )}
              </span>
              <button type="button" className="btn btn--small btn--ghost-danger" onClick={() => void handleUndo(word.word_id)}>
                撤销遗忘
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="study-footer forgotten-footer">
        <span className="page-heading__meta">已选 {selected.size} 词</span>
        <div className="forgotten-footer__actions">
          <a className="btn btn--ghost" href={forgottenExportUrl()} download="forgotten-words.csv">
            导出 CSV
          </a>
          <button type="button" className="btn" onClick={() => void handleCreateSpecialPage()}>
            生成专攻页
          </button>
        </div>
      </div>
    </section>
  );
}
