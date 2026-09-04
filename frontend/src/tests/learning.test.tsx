import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LearningPage } from "../features/learning/LearningPage";
import type { StudyPage } from "../lib/types";

const page: StudyPage = {
  id: 1,
  page_number: 3,
  page_size: 15,
  page_type: "normal",
  status: "in_progress",
  is_short: false,
  words: Array.from({ length: 15 }, (_, index) => ({
    word_id: index + 1,
    word: `word-${index + 1}`,
    meaning: `meaning-${index + 1}`,
    vocabulary_id: 1,
    vocabulary_name: "Deck",
    source_page: String(index + 10),
    study_count: index === 14 ? 1 : 0,
    forget_count: 0,
    status: "unlearned",
    display_order: index + 1,
    can_mark_mastered: index !== 14
  }))
};

describe("LearningPage", () => {
  it("renders stable rows, reveals meaning, limits master actions, and confirms completion", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <LearningPage
        page={page}
        onComplete={onComplete}
        onForget={vi.fn()}
        onMaster={vi.fn()}
      />
    );

    expect(screen.getAllByTestId("word-row")).toHaveLength(15);
    expect(screen.queryByText("meaning-1")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("word-row")[0].querySelector("small")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "标记熟" })).toHaveLength(14);

    await user.click(screen.getByText("word-1"));
    expect(screen.getByText("meaning-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("meaning-slot")[0]).toHaveAttribute("data-position", "right");

    await user.click(screen.getByRole("button", { name: "完成本页" }));
    expect(screen.getByRole("dialog", { name: "确认完成" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认完成" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
