// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hideCurrentWindow } from "../lib/tauriWindowApi";

import WindowCloseButton from "./WindowCloseButton";

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

describe("WindowCloseButton", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a start-edge traffic light on macOS", () => {
    setPlatform("MacIntel");
    render(<WindowCloseButton />);

    expect(screen.getByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-close-side",
      "start",
    );
    expect(
      screen.getByRole("button", { name: "关闭" }).querySelector("svg"),
    ).toBeInTheDocument();
  });

  it("renders an end-edge × on Windows", () => {
    setPlatform("Win32");
    render(<WindowCloseButton />);

    expect(screen.getByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-close-side",
      "end",
    );
  });

  it("hides the current window", () => {
    setPlatform("Win32");
    render(<WindowCloseButton />);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(hideCurrentWindow).toHaveBeenCalledOnce();
  });
});
