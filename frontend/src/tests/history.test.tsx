import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HistoryView } from "../features/history/HistoryView";

describe("HistoryView", () => {
  it("distinguishes gray, recommended and completed dates with round status", () => {
    render(
      <HistoryView
        month="2026-09"
        selectedDate="2026-09-05"
        days={[
          { date: "2026-09-04", has_study: true, is_recommended: true, completion_count: 1 },
          { date: "2026-09-05", has_study: false, is_recommended: true, completion_count: 0 },
          { date: "2026-09-06", has_study: false, is_recommended: false, completion_count: 0 }
        ]}
        pages={[
          {
            page_id: 1,
            page_number: 3,
            session_id: null,
            study_number: 2,
            completed_on_date: false,
            is_recommended: true,
            second_completed: false,
            third_completed: false,
            remaining_recommended_rounds: 2
          }
        ]}
        onSelectDate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /9月4日/ })).toHaveAttribute("data-state", "completed");
    expect(screen.getByRole("button", { name: /9月5日/ })).toHaveAttribute("data-state", "recommended");
    expect(screen.getByRole("button", { name: /9月6日/ })).toHaveAttribute("data-state", "empty");
    expect(screen.getByText("第 2 次")).toBeInTheDocument();
    expect(screen.getByText("第二次未完成")).toBeInTheDocument();
    expect(screen.getByText("第三次未完成")).toBeInTheDocument();
  });

  it("navigates dates with horizontal swipes", () => {
    const onNavigateDate = vi.fn();
    render(<HistoryView month="2026-09" selectedDate="2026-09-05" days={[]} pages={[]} onSelectDate={vi.fn()} onNavigateDate={onNavigateDate} />);

    const view = screen.getByRole("region", { name: "2026 年 09 月" });
    fireEvent.touchStart(view, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(view, { changedTouches: [{ clientX: 90 }] });
    fireEvent.touchStart(view, { touches: [{ clientX: 80 }] });
    fireEvent.touchEnd(view, { changedTouches: [{ clientX: 210 }] });

    expect(onNavigateDate).toHaveBeenNthCalledWith(1, 1);
    expect(onNavigateDate).toHaveBeenNthCalledWith(2, -1);
  });
});
