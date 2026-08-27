import { describe, expect, it } from "vitest";

import { isMacPlatform, windowCloseSide } from "./platform";

describe("isMacPlatform", () => {
  it("matches macOS and iOS platform strings", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("iPhone")).toBe(true);
    expect(isMacPlatform("iPad")).toBe(true);
  });

  it("rejects Windows and Linux", () => {
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
  });
});

describe("windowCloseSide", () => {
  it("puts the close control on the start edge on macOS", () => {
    expect(windowCloseSide("MacIntel")).toBe("start");
  });

  it("puts the close control on the end edge on Windows and Linux", () => {
    expect(windowCloseSide("Win32")).toBe("end");
    expect(windowCloseSide("Linux x86_64")).toBe("end");
  });
});
