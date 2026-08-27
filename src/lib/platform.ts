export function isMacPlatform(platform = navigator.platform): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export type WindowCloseSide = "start" | "end";

/** macOS: traffic-light close on the left. Windows/Linux: × on the right. */
export function windowCloseSide(
  platform = navigator.platform,
): WindowCloseSide {
  return isMacPlatform(platform) ? "start" : "end";
}
