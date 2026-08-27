// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, FeedbackNotice, SidePanel } from "./components";

afterEach(() => cleanup());

describe("ConfirmDialog", () => {
  it("renders an accessible dialog and confirms the action", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        title="发布新版本？"
        description="发布后将生成官网安装链接。"
        confirmLabel="确认发布"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen
        .getByRole("dialog", { name: "发布新版本？" })
        .getAttribute("aria-modal"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "确认发布" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes with Escape and disables actions while loading", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ConfirmDialog
        open
        title="保存配置？"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <ConfirmDialog
        open
        title="保存配置？"
        loading
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "取消" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "处理中…" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("SidePanel", () => {
  it("renders accessible content and closes with Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SidePanel
        open
        title="添加文案"
        description="填写 Key 与各语言文案"
        onClose={onClose}
      >
        <input aria-label="文案 Key" />
      </SidePanel>,
    );

    expect(screen.getByRole("dialog", { name: "添加文案" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("FeedbackNotice", () => {
  it("renders viewport errors as an assertive dismissible alert", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <FeedbackNotice
        kind="error"
        message="请填写修改原因"
        placement="viewport"
        onDismiss={onDismiss}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("请填写修改原因");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    await user.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("announces success without stealing focus", () => {
    render(<FeedbackNotice kind="success" message="保存成功" />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });
});
