import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { StudyPage } from "../lib/types";

function page(id: number, word: string): StudyPage {
  return {
    id,
    page_number: id,
    page_size: 1,
    page_type: "normal",
    status: "in_progress",
    is_short: false,
    words: [{
      word_id: id,
      word,
      meaning: `${word} meaning`,
      vocabulary_id: 1,
      vocabulary_name: "Deck",
      source_page: String(id),
      study_count: 0,
      forget_count: 0,
      status: "unlearned",
      display_order: 1,
      can_mark_mastered: true
    }]
  };
}

describe("App learning flow", () => {
  it("loads the next page after completing the current page", async () => {
    const pages = [page(1, "alpha"), page(2, "beta")];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/settings")) {
        return { ok: true, json: async () => ({ page_size: 15, intervals: [0, 1, 4], theme: "system", font_size: "medium", vocabulary_priorities: {} }) };
      }
      if (url.includes("/study-pages/next")) return { ok: true, json: async () => pages.shift() };
      if (url.endsWith("/study-pages/1/complete")) return { ok: true, json: async () => ({}) };
      return { ok: false, status: 404 };
    }));

    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "完成本页" }));
    await user.click(screen.getByRole("button", { name: "确认完成" }));

    expect(await screen.findByText("beta")).toBeInTheDocument();
  });
});
