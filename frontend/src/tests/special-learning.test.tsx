import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SpecialLearningPage } from "../features/learning/SpecialLearningPage";
import type { StudyPage } from "../lib/types";

const page: StudyPage = {
  id: 9,
  page_number: 4,
  page_size: 2,
  page_type: "special",
  status: "in_progress",
  is_short: false,
  words: ["alpha", "beta"].map((word, index) => ({
    word_id: index + 1,
    word,
    meaning: `${word} meaning`,
    vocabulary_id: 1,
    vocabulary_name: "Deck",
    source_page: null,
    study_count: 1,
    forget_count: 2,
    status: "learning",
    display_order: index + 1,
    can_mark_mastered: false
  }))
};

describe("SpecialLearningPage", () => {
  it("requires an outcome for every word before completion", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SpecialLearningPage page={page} onComplete={onComplete} />);

    const complete = screen.getByRole("button", { name: "完成特殊学习" });
    expect(complete).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "alpha 记得" }));
    await user.click(screen.getByRole("radio", { name: "beta 已熟" }));
    expect(complete).toBeEnabled();
    await user.click(complete);

    expect(onComplete).toHaveBeenCalledWith({ 1: "remembered", 2: "mastered" });
  });
});
