// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChatChrome from "./ChatChrome";

vi.mock("../lib/tauriWindowApi", () => ({
  hideCurrentWindow: vi.fn().mockResolvedValue(undefined),
}));

function setPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
}

const originalPlatform = navigator.platform;

describe("ChatChrome", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    cleanup();
  });

  it("places close on the left and new session on the right on macOS", () => {
    setPlatform("MacIntel");
    const { container } = render(<ChatChrome onNewSession={() => undefined} />);
    const header = container.querySelector(".chat-chrome");

    expect(header).toHaveAttribute("data-close-side", "start");
    expect(header?.firstElementChild).toBe(
      screen.getByRole("button", { name: "关闭" }),
    );
    expect(header?.lastElementChild).toBe(
      screen.getByRole("button", { name: "新建会话" }),
    );
  });

  it("places new session on the left and close on the right on Windows", () => {
    setPlatform("Win32");
    const { container } = render(<ChatChrome onNewSession={() => undefined} />);
    const header = container.querySelector(".chat-chrome");

    expect(header).toHaveAttribute("data-close-side", "end");
    expect(header?.firstElementChild).toBe(
      screen.getByRole("button", { name: "新建会话" }),
    );
    expect(header?.lastElementChild).toBe(
      screen.getByRole("button", { name: "关闭" }),
    );
  });
});
