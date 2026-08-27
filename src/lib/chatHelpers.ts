import { OctopHttpError, extractTextContent } from "./octopHttp";
import type { ChatMessage } from "./types";

export const CHAT_WIDTH = 400;
export const CHAT_INITIAL_HEIGHT = 400;
export const CHAT_EXPANDED_HEIGHT = 560;
export const CHAT_COMPACT_MIN_HEIGHT = 120;
export const CHAT_MIN_WIDTH = 280;

export function chatWindowWidth(): number {
  const inner = Math.ceil(window.innerWidth);
  return Number.isFinite(inner) && inner >= CHAT_MIN_WIDTH ? inner : CHAT_WIDTH;
}
export const CHAT_MIN_HEIGHT = 200;
/** Keep in sync with `RESIZE_ANIMATION_DURATION` in window_cmd.rs. */
export const CHAT_RESIZE_DURATION_MS = 360;
export const POPOVER_GAP_PX = 6;
export const POPOVER_VIEWPORT_PAD_PX = 8;

export type PopoverPlacement = {
  maxHeight: number;
  placeAbove: boolean;
  alignRight: boolean;
};

export function popoverPlacement(args: {
  anchor: { top: number; bottom: number; left: number };
  viewport: { width: number; height: number };
  popoverWidth: number;
}): PopoverPlacement {
  const spaceAbove = args.anchor.top - POPOVER_VIEWPORT_PAD_PX - POPOVER_GAP_PX;
  const spaceBelow =
    args.viewport.height -
    args.anchor.bottom -
    POPOVER_VIEWPORT_PAD_PX -
    POPOVER_GAP_PX;
  const placeAbove = spaceAbove >= spaceBelow;
  const available = placeAbove ? spaceAbove : spaceBelow;
  return {
    maxHeight: Math.max(0, Math.floor(available)),
    placeAbove,
    alignRight:
      args.anchor.left + args.popoverWidth + POPOVER_VIEWPORT_PAD_PX >
      args.viewport.width,
  };
}

export function applyPopoverPlacement(
  popover: HTMLElement,
  placement: PopoverPlacement,
): void {
  popover.style.maxHeight = `${placement.maxHeight}px`;
  if (placement.placeAbove) {
    popover.style.bottom = `calc(100% + ${POPOVER_GAP_PX}px)`;
    popover.style.top = "auto";
  } else {
    popover.style.top = `calc(100% + ${POPOVER_GAP_PX}px)`;
    popover.style.bottom = "auto";
  }
  if (placement.alignRight) {
    popover.style.left = "auto";
    popover.style.right = "0";
  } else {
    popover.style.left = "0";
    popover.style.right = "auto";
  }
}

export function compactWindowHeight(
  root: HTMLElement,
  minHeight = CHAT_COMPACT_MIN_HEIGHT,
): number {
  const rootRect = root.getBoundingClientRect();
  const top = rootRect.top;
  let bottom = rootRect.bottom;
  const body = root.querySelector(".chat-body");
  if (body && !root.classList.contains("is-compact")) {
    bottom -= body.getBoundingClientRect().height;
  }
  return Math.max(minHeight, Math.ceil(bottom - top));
}

let nextMessageId = 0;

export function nextChatMessageId(prefix: string): string {
  nextMessageId += 1;
  return `${prefix}-${nextMessageId}`;
}

export function historyMessages(
  rows: Array<{ role: string; content: unknown }>,
): ChatMessage[] {
  return rows.flatMap((row) => {
    if (
      row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system"
    ) {
      return [];
    }
    const content = extractTextContent(row.content);
    if (!content) return [];
    return [{ id: nextChatMessageId("history"), role: row.role, content }];
  });
}

export function chatErrorText(error: unknown): string {
  if (error instanceof OctopHttpError) {
    if (error.status === 401) return "登录已失效，请重新设置账号";
    if (!error.message.startsWith("HTTP ")) {
      return `服务请求失败：${error.message}`;
    }
    return `服务请求失败（${error.status}）`;
  }
  return error instanceof Error ? error.message : "连接服务失败";
}
