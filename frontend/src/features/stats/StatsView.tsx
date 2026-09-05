import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import type { TodayStats } from '../../lib/types';

interface StatCard {
  label: string;
  value: number;
  modifier?: string;
}

export function StatsView() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRepeated, setShowRepeated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getTodayStats()
      .then((result) => {
        if (!cancelled) {
          setStats(result);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '加载统计失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return (
      <section>
        <div className="page-heading">
          <h1>统计</h1>
        </div>
        <div className="banner banner--warn">{error}</div>
      </section>
    );
  }

  if (stats === null) {
    return (
      <section>
        <div className="page-heading">
          <h1>统计</h1>
        </div>
        <div className="empty-state">正在加载统计…</div>
      </section>
    );
  }

  const topCards: StatCard[] = [
    { label: '今日学习', value: stats.study_word_count, modifier: 'stat-card--accent' },
    { label: '今日遗忘', value: stats.forgetting_count, modifier: 'stat-card--danger' },
    { label: '连续学习天数', value: stats.streak_days, modifier: 'stat-card--accent' },
  ];
  const totalCards: StatCard[] = [
    { label: '累计学习次数', value: stats.total_study_count },
    { label: '学习中', value: stats.learning_word_count },
    { label: '熟词', value: stats.mastered_word_count },
    { label: '遗忘词', value: stats.forgotten_word_count },
  ];

  return (
    <section>
      <div className="page-heading">
        <h1>统计</h1>
        <span className="page-heading__meta">统计日期 {stats.date}</span>
      </div>

      <div className="stat-grid">
        {topCards.map((card) => (
          <div key={card.label} className={`stat-card ${card.modifier ?? ''}`}>
            <div className="stat-card__value">{card.value}</div>
            <div className="stat-card__label">{card.label}</div>
          </div>
        ))}
        {stats.repeated_forgetting_count > 0 ? (
          <button
            type="button"
            className="stat-card stat-card--danger"
            aria-expanded={showRepeated}
            onClick={() => setShowRepeated((current) => !current)}
          >
            <div className="stat-card__value">{stats.repeated_forgetting_count}</div>
            <div className="stat-card__label">今日再次遗忘（点击{showRepeated ? '收起' : '查看'}明细）</div>
          </button>
        ) : (
          <div className="stat-card stat-card--danger">
            <div className="stat-card__value">0</div>
            <div className="stat-card__label">今日再次遗忘</div>
          </div>
        )}
      </div>

      {showRepeated && (
        <ul className="page-list" aria-label="再次遗忘明细">
          {stats.repeated_forgetting_words.map((word) => (
            <li key={word.word_id} className="card">
              <span className="word-row__word">{word.word}</span>
              <span className="word-row__meta">
                今日 {word.forget_count_today} 次 · 累计 {word.total_forget_count} 次
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="stat-grid" style={{ marginTop: '0.75rem' }}>
        {totalCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-card__value">{card.value}</div>
            <div className="stat-card__label">{card.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
