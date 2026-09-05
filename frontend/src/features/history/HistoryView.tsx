import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { addDays, formatMonthLabel, monthGrid, monthOf, todayISO } from '../../lib/calendar';
import type { CalendarSummary, CalendarDay, DateHistory, HistoryPageSnapshot } from '../../lib/types';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const SWIPE_THRESHOLD_PX = 40;

function dayStateClass(info: CalendarDay | undefined): string {
  if (!info) {
    return 'calendar-day--empty';
  }
  if (info.has_study) {
    return 'calendar-day--studied';
  }
  if (info.is_recommended) {
    return 'calendar-day--recommended';
  }
  return 'calendar-day--empty';
}

export function HistoryView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<string>(() => searchParams.get('date') ?? todayISO());
  const [viewedMonth, setViewedMonth] = useState<string>(() => monthOf(searchParams.get('date') ?? todayISO()));
  const [calendar, setCalendar] = useState<CalendarSummary | null>(null);
  const [history, setHistory] = useState<DateHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<HistoryPageSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getCalendar(viewedMonth)
      .then((summary) => {
        if (!cancelled) {
          setCalendar(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCalendar(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewedMonth]);

  useEffect(() => {
    let cancelled = false;
    setHistoryError(null);
    apiClient
      .getHistoryForDate(selectedDate)
      .then((result) => {
        if (!cancelled) {
          setHistory(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistory(null);
          setHistoryError(error instanceof Error ? error.message : '加载日期历史失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const selectDate = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setViewedMonth(monthOf(date));
      setSearchParams(date === todayISO() ? {} : { date });
    },
    [setSearchParams],
  );

  const changeMonth = useCallback((delta: number) => {
    setViewedMonth((current) => {
      const [year, monthIndex] = current.split('-').map(Number);
      const shifted = new Date(year, monthIndex - 1 + delta, 1);
      return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (touchStartX.current === null) {
        return;
      }
      const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
      touchStartX.current = null;
      if (deltaX <= -SWIPE_THRESHOLD_PX) {
        selectDate(addDays(selectedDate, 1));
      } else if (deltaX >= SWIPE_THRESHOLD_PX) {
        selectDate(addDays(selectedDate, -1));
      }
    },
    [selectedDate, selectDate],
  );

  const openSnapshot = useCallback(async (sessionId: number) => {
    setSnapshotError(null);
    try {
      setSnapshot(await apiClient.getHistoryPageSnapshot(sessionId));
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : '加载快照失败');
    }
  }, []);

  const daysByDate = new Map((calendar?.days ?? []).map((day) => [day.date, day]));
  const grid = monthGrid(viewedMonth);

  return (
    <section>
      <div className="page-heading">
        <h1>日期</h1>
        <span className="page-heading__meta">灰色无记录 · 浅色为推荐 · 深色已完成</span>
      </div>

      <div className="calendar card">
        <div className="calendar__toolbar">
          <button type="button" className="btn btn--small btn--ghost" aria-label="上个月" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <strong>{formatMonthLabel(viewedMonth)}</strong>
          <button type="button" className="btn btn--small btn--ghost" aria-label="下个月" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <div className="calendar__head">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="calendar__weekday">
              {label}
            </span>
          ))}
        </div>
        <div className="calendar__grid">
          {grid.map((cell) => {
            if (!cell.inMonth) {
              return <span key={cell.date} className="calendar-day calendar-day--empty" aria-hidden="true" />;
            }
            const info = daysByDate.get(cell.date);
            const classes = ['calendar-day', dayStateClass(info)];
            if (cell.date === selectedDate) {
              classes.push('calendar-day--selected');
            }
            return (
              <button
                key={cell.date}
                type="button"
                className={classes.join(' ')}
                aria-label={cell.date}
                onClick={() => selectDate(cell.date)}
              >
                <span>{Number(cell.date.slice(8))}</span>
                {info && info.completion_count > 0 && <span className="calendar-day__count">×{info.completion_count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-testid="date-swipe-area"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="page-heading">
          <button type="button" className="btn btn--small btn--ghost" aria-label="前一天" onClick={() => selectDate(addDays(selectedDate, -1))}>
            ‹
          </button>
          <strong>{selectedDate}</strong>
          <button type="button" className="btn btn--small btn--ghost" aria-label="后一天" onClick={() => selectDate(addDays(selectedDate, 1))}>
            ›
          </button>
        </div>

        {historyError !== null && <div className="banner banner--warn">{historyError}</div>}

        {history !== null && history.pages.length === 0 && <div className="empty-state">当天没有学习记录</div>}

        {history !== null && history.pages.length > 0 && (
          <ul className="page-list">
            {history.pages.map((page) => (
              <li key={`${page.page_id}-${page.session_id ?? 'recommended'}`} className="card history-card">
                <div className="history-card__title">
                  第 {page.page_number} 页 · 第 {page.study_number} 次学习
                </div>
                <div className="history-card__badges">
                  {page.completed_on_date ? <span className="badge badge--mastered">已完成</span> : null}
                  {!page.completed_on_date && page.is_recommended ? <span className="badge badge--recommended">推荐复习</span> : null}
                  {page.second_completed ? <span className="badge">第二次已完成</span> : null}
                  {page.third_completed ? <span className="badge">第三次已完成</span> : null}
                  {page.remaining_recommended_rounds > 0 ? <span className="badge">待完成 {page.remaining_recommended_rounds} 轮</span> : null}
                </div>
                {page.session_id !== null && (
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => void openSnapshot(page.session_id as number)}>
                    查看快照
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {snapshot !== null && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="页面快照">
            <p className="dialog__title">第 {snapshot.page_id} 页快照</p>
            <p className="word-row__meta">完成时间：{snapshot.completed_at}</p>
            <ol className="snapshot-list">
              {snapshot.snapshot.words.map((word) => (
                <li key={word.word_id} className="snapshot-list__item">
                  <span className="snapshot-list__order">{word.display_order}.</span>{' '}
                  <span className="word-row__word">{word.word}</span>
                  <span className="word-row__meaning">{word.meaning}</span>
                  <span className="word-row__meta">
                    学前 学 {word.study_count_before ?? '—'} 次 · 忘 {word.forget_count ?? 0} 次
                    {word.outcome ? ` · 结果 ${word.outcome}` : ''}
                  </span>
                </li>
              ))}
            </ol>
            {snapshotError !== null && <div className="banner banner--warn">{snapshotError}</div>}
            <div className="dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                aria-label="上一份快照"
                disabled={snapshot.previous_session_id === null}
                onClick={() => void openSnapshot(snapshot.previous_session_id as number)}
              >
                ‹
              </button>
              <button type="button" className="btn" onClick={() => setSnapshot(null)}>
                关闭
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label="下一份快照"
                disabled={snapshot.next_session_id === null}
                onClick={() => void openSnapshot(snapshot.next_session_id as number)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
