import { CalendarCheck, Circle, Clock3 } from "lucide-react";
import { useRef } from "react";

import type { CalendarDay, HistoryPageSummary } from "../../lib/types";

interface HistoryViewProps {
  month: string;
  selectedDate: string;
  days: CalendarDay[];
  pages: HistoryPageSummary[];
  onSelectDate: (date: string) => void;
  onNavigateDate?: (offset: number) => void;
}

function dateLabel(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}月${day}日`;
}

export function HistoryView({ month, selectedDate, days, pages, onSelectDate, onNavigateDate = () => undefined }: HistoryViewProps) {
  const touchStartX = useRef<number | null>(null);
  return (
    <section className="history-view" aria-labelledby="history-title" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStartX.current === null) return; const distance = touchStartX.current - (event.changedTouches[0]?.clientX ?? touchStartX.current); touchStartX.current = null; if (Math.abs(distance) >= 60) onNavigateDate(distance > 0 ? 1 : -1); }}>
      <header className="view-header">
        <div>
          <p className="eyebrow">学习轨迹</p>
          <h1 id="history-title">{month.replace("-", " 年 ")} 月</h1>
        </div>
        <CalendarCheck aria-hidden="true" size={24} />
      </header>

      <div className="calendar-grid" aria-label="学习日历">
        {days.map((day) => {
          const state = day.has_study ? "completed" : day.is_recommended ? "recommended" : "empty";
          return (
            <button
              className={`calendar-day ${selectedDate === day.date ? "selected" : ""}`}
              data-state={state}
              key={day.date}
              type="button"
              aria-label={`${dateLabel(day.date)} ${state}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span>{Number(day.date.slice(-2))}</span>
              {state === "completed" ? <CalendarCheck aria-hidden="true" size={13} /> : state === "recommended" ? <Clock3 aria-hidden="true" size={13} /> : <Circle aria-hidden="true" size={9} />}
            </button>
          );
        })}
      </div>

      <div className="history-pages">
        {pages.map((page) => (
          <article className="history-page-row" key={`${page.page_id}-${page.study_number}`}>
            <div>
              <strong>第 {page.page_number} 页</strong>
              <span>第 {page.study_number} 次</span>
            </div>
            <div className="round-status">
              <span data-complete={page.second_completed}>{page.second_completed ? "第二次已完成" : "第二次未完成"}</span>
              <span data-complete={page.third_completed}>{page.third_completed ? "第三次已完成" : "第三次未完成"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
