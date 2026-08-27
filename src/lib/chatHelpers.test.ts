import { describe, expect, it } from "vitest";

import {
  CHAT_MIN_WIDTH,
  CHAT_WIDTH,
  chatErrorText,
  chatWindowWidth,
  compactWindowHeight,
  nextChatMessageId,
  popoverPlacement,
} from "./chatHelpers";
import { OctopHttpError } from "./octopHttp";

describe("chatHelpers", () => {
  it("uses the current window width when it is at least the chat minimum", () => {
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 300,
    });
    expect(chatWindowWidth()).toBe(300);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    expect(CHAT_MIN_WIDTH).toBeLessThanOrEqual(300);
    expect(CHAT_WIDTH).toBe(400);
  });

  it("generates unique message ids", () => {
    expect(nextChatMessageId("user")).toMatch(/^user-\d+$/);
    expect(nextChatMessageId("user")).not.toBe(nextChatMessageId("user"));
  });

  it("maps 401 errors to a settings hint", () => {
    expect(chatErrorText(new OctopHttpError(401, "unauthorized"))).toBe(
      "登录已失效，请重新设置账号",
    );
  });

  it("surfaces parsed API error text for non-401 failures", () => {
    expect(
      chatErrorText(new OctopHttpError(500, '{"message":"模型不可用"}')),
    ).toBe("服务请求失败：模型不可用");
  });

  it("does not grow compact height for overflowing popovers", () => {
    const root = {
      getBoundingClientRect: () => ({ top: 100, bottom: 250 }),
      querySelector: () => null,
      classList: { contains: () => false },
    } as unknown as HTMLElement;
    expect(compactWindowHeight(root, 120)).toBe(150);
  });

  it("clamps a popover to the remaining viewport and flips when needed", () => {
    expect(
      popoverPlacement({
        anchor: { top: 160, bottom: 188, left: 40 },
        viewport: { width: 400, height: 220 },
        popoverWidth: 180,
      }),
    ).toEqual({ maxHeight: 146, placeAbove: true, alignRight: false });
    expect(
      popoverPlacement({
        anchor: { top: 24, bottom: 52, left: 40 },
        viewport: { width: 400, height: 220 },
        popoverWidth: 180,
      }),
    ).toEqual({ maxHeight: 154, placeAbove: false, alignRight: false });
    expect(
      popoverPlacement({
        anchor: { top: 160, bottom: 188, left: 280 },
        viewport: { width: 400, height: 220 },
        popoverWidth: 220,
      }).alignRight,
    ).toBe(true);
  });

  it("lets a popover use remaining window height instead of a 12rem cap", () => {
    expect(
      popoverPlacement({
        anchor: { top: 480, bottom: 508, left: 40 },
        viewport: { width: 400, height: 640 },
        popoverWidth: 180,
      }),
    ).toEqual({ maxHeight: 466, placeAbove: true, alignRight: false });
  });

  it("excludes the message body when measuring an expanded card", () => {
    const body = { getBoundingClientRect: () => ({ height: 300 }) };
    const root = {
      getBoundingClientRect: () => ({ top: 0, bottom: 560 }),
      querySelector: (sel: string) => (sel === ".chat-body" ? body : null),
      querySelectorAll: () => [],
      classList: { contains: () => false },
    } as unknown as HTMLElement;
    expect(compactWindowHeight(root, 120)).toBe(260);
  });

  it("keeps a compact error body in the measured height", () => {
    const body = { getBoundingClientRect: () => ({ height: 80 }) };
    const root = {
      getBoundingClientRect: () => ({ top: 0, bottom: 200 }),
      querySelector: () => body,
      querySelectorAll: () => [],
      classList: { contains: (name: string) => name === "is-compact" },
    } as unknown as HTMLElement;
    expect(compactWindowHeight(root, 120)).toBe(200);
  });
});
