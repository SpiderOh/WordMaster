import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";

describe("App navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  });

  it("offers five mobile sections and opens forgotten-word search", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(学习|日期|遗忘|统计|设置)$/ })).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "遗忘" }));
    expect(screen.getByRole("searchbox", { name: "搜索遗忘单词" })).toBeInTheDocument();
  });
});
