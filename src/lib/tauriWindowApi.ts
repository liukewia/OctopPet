import {
  LogicalSize,
  PhysicalPosition,
  getCurrentWindow,
} from "@tauri-apps/api/window";

import { tauriApi } from "./tauriApi";

export type ResizeEdge = "South" | "East" | "SouthEast";

export function getWindowLabel(): string {
  return getCurrentWindow().label;
}

export async function hideCurrentWindow(): Promise<void> {
  await getCurrentWindow().hide();
}

export async function applyBottomAnchoredSize(size: {
  width: number;
  height: number;
  animate?: boolean;
}): Promise<void> {
  await tauriApi.applyBottomAnchoredSize(
    size.width,
    size.height,
    Boolean(size.animate),
  );
}

export async function setCurrentWindowResizable(
  resizable: boolean,
): Promise<void> {
  await getCurrentWindow()
    .setResizable(resizable)
    .catch(() => undefined);
}

export async function clearCurrentWindowMaxSize(): Promise<void> {
  await getCurrentWindow()
    .setMaxSize(null)
    .catch(() => undefined);
}

export async function setCurrentWindowMinSize(
  width: number,
  height: number,
): Promise<void> {
  await getCurrentWindow()
    .setMinSize(new LogicalSize(width, height))
    .catch(() => undefined);
}

export async function setCurrentWindowSize(
  width: number,
  height: number,
): Promise<void> {
  await getCurrentWindow()
    .setSize(new LogicalSize(width, height))
    .catch(() => undefined);
}

export async function startCurrentWindowResize(
  edge: ResizeEdge,
): Promise<void> {
  await getCurrentWindow()
    .startResizeDragging(edge)
    .catch(() => undefined);
}

export async function startCurrentWindowDrag(): Promise<void> {
  await getCurrentWindow()
    .startDragging()
    .catch(() => undefined);
}

export async function getCurrentWindowOuterPosition(): Promise<PhysicalPosition> {
  return getCurrentWindow().outerPosition();
}

export async function setCurrentWindowOuterPosition(
  position: PhysicalPosition,
): Promise<void> {
  await getCurrentWindow()
    .setPosition(position)
    .catch(() => undefined);
}
