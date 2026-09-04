import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthView } from "../features/auth/AuthView";

describe("AuthView", () => {
  it("submits username and password", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<AuthView onLogin={onLogin} error="" />);

    await user.type(screen.getByRole("textbox", { name: "用户名" }), "owner");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(onLogin).toHaveBeenCalledWith("owner", "secret123");
  });
});
