import { describe, expect, it } from "vitest";

import {
  chatErrorText,
  compactWindowHeight,
  nextChatMessageId,
} from "./chatHelpers";
import { OctopHttpError } from "./octopHttp";

describe("chatHelpers", () => {
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

  it("measures compact height including overflowing popovers", () => {
    const popover = {
      getBoundingClientRect: () => ({ top: 20 }),
    };
    const root = {
      getBoundingClientRect: () => ({ top: 100, bottom: 250 }),
      querySelectorAll: () => [popover],
    } as unknown as HTMLElement;
    expect(compactWindowHeight(root, 120)).toBe(230);
  });
});
