import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForgottenView } from "../features/forgotten/ForgottenView";

describe("ForgottenView", () => {
  it("filters, selects words, and creates a special study page", async () => {
    const user = userEvent.setup();
    const onCreateSpecialPage = vi.fn();
    render(<ForgottenView
      items={[
        { word_id: 1, word: "alpha", meaning: "first", forget_count: 3, vocabulary_id: 1, vocabulary_name: "A", status: "learning", study_count: 2, last_forgotten_at: "2026-09-04T08:00:00Z" },
        { word_id: 2, word: "beta", meaning: "second", forget_count: 1, vocabulary_id: 2, vocabulary_name: "B", status: "mastered", study_count: 1, last_forgotten_at: "2026-09-03T08:00:00Z" }
      ]}
      search=""
      vocabularyId={null}
      status=""
      onSearch={vi.fn()}
      onVocabularyChange={vi.fn()}
      onStatusChange={vi.fn()}
      onCreateSpecialPage={onCreateSpecialPage}
    />);

    await user.selectOptions(screen.getByRole("combobox", { name: "词库筛选" }), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: "状态筛选" }), "learning");
    await user.click(screen.getByRole("checkbox", { name: "选择 alpha" }));
    await user.click(screen.getByRole("button", { name: "开始特殊学习" }));

    expect(onCreateSpecialPage).toHaveBeenCalledWith([1]);
  });
});
