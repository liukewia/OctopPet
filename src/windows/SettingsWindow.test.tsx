// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../lib/configLogic";
import SettingsWindow from "./SettingsWindow";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  patchConfig: vi.fn(),
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  emitAuthUpdated: vi.fn(),
  reloadHotkeys: vi.fn(),
  placeWindowBottomCenter: vi.fn(),
  placeWindowCentered: vi.fn(),
  login: vi.fn(),
  emitMascotChanged: vi.fn(),
  listenMascotChanged: vi.fn(),
  listenWindowShown: vi.fn(),
  hideCurrentWindow: vi.fn(),
  applyWindowDeactivatePolicy: vi.fn(),
}));

vi.mock("../lib/tauriApi", () => ({
  tauriApi: {
    loadConfig: mocks.loadConfig,
    patchConfig: mocks.patchConfig,
    getSecret: mocks.getSecret,
    setSecret: mocks.setSecret,
    emitAuthUpdated: mocks.emitAuthUpdated,
    reloadHotkeys: mocks.reloadHotkeys,
    placeWindowBottomCenter: mocks.placeWindowBottomCenter,
    placeWindowCentered: mocks.placeWindowCentered,
    emitMascotChanged: mocks.emitMascotChanged,
    listenMascotChanged: mocks.listenMascotChanged,
    listenWindowShown: mocks.listenWindowShown,
    applyWindowDeactivatePolicy: mocks.applyWindowDeactivatePolicy,
  },
}));

vi.mock("../lib/tauriWindowApi", () => ({
  hideCurrentWindow: mocks.hideCurrentWindow.mockResolvedValue(undefined),
  setCurrentWindowSize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/octopHttp", () => ({
  login: mocks.login,
}));

const originalPlatform = navigator.platform;

describe("SettingsWindow", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: originalPlatform,
    });
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      baseUrl: "https://octop.example",
      username: "octopus",
      mascotId: "type",
    });
    mocks.getSecret.mockImplementation(async (key: string) =>
      key === "password" ? "secret-password" : null,
    );
    mocks.patchConfig.mockResolvedValue(undefined);
    mocks.setSecret.mockResolvedValue(undefined);
    mocks.emitAuthUpdated.mockResolvedValue(undefined);
    mocks.reloadHotkeys.mockResolvedValue(undefined);
    mocks.placeWindowBottomCenter.mockResolvedValue(undefined);
    mocks.placeWindowCentered.mockResolvedValue(undefined);
    mocks.emitMascotChanged.mockResolvedValue(undefined);
    mocks.listenMascotChanged.mockResolvedValue(vi.fn());
    mocks.listenWindowShown.mockResolvedValue(vi.fn());
    mocks.applyWindowDeactivatePolicy.mockResolvedValue(undefined);
    mocks.login.mockResolvedValue({
      access_token: "hidden-access-token",
      expires_in: 3600,
    });
  });

  it("places the close control on the left on macOS", async () => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
    render(<SettingsWindow />);

    expect(await screen.findByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-close-side",
      "start",
    );
  });

  it("places the close control on the right on Windows", async () => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    render(<SettingsWindow />);

    expect(await screen.findByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-close-side",
      "end",
    );
  });

  it("loads config and password without rendering an access token", async () => {
    render(<SettingsWindow />);

    expect(await screen.findByLabelText("服务地址")).toHaveValue(
      "https://octop.example",
    );
    expect(screen.getByLabelText("用户")).toHaveValue("octopus");
    expect(screen.getByLabelText("密码")).toHaveValue("secret-password");
    expect(screen.getByText("连接")).toBeInTheDocument();
    expect(screen.getByText("桌宠形象")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Type" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByLabelText("点击其他应用时保持窗口显示"),
    ).not.toBeInTheDocument();
    expect(mocks.getSecret).toHaveBeenCalledWith("password");
    expect(screen.queryByText("hidden-access-token")).not.toBeInTheDocument();
  });

  it("switches mascot immediately and emits change", async () => {
    render(<SettingsWindow />);
    await screen.findByLabelText("服务地址");

    fireEvent.click(screen.getByRole("option", { name: "Peek" }));

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({ mascotId: "peek" }),
    );
    expect(mocks.emitMascotChanged).toHaveBeenCalledWith("peek");
  });

  it("first run loads config and enables actions without reading an unscoped password", async () => {
    mocks.loadConfig.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mocks.getSecret.mockRejectedValue(new Error("username is not configured"));

    render(<SettingsWindow />);

    expect(await screen.findByLabelText("用户")).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled();
    expect(mocks.getSecret).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("normalizes and patches only credentials", async () => {
    render(<SettingsWindow />);
    const baseUrl = await screen.findByLabelText("服务地址");

    fireEvent.change(baseUrl, {
      target: { value: " https://new.example/// " },
    });
    fireEvent.change(screen.getByLabelText("用户"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({
        baseUrl: "https://new.example",
        username: "new-user",
        mascotId: "type",
        shortcutOpenPet: "CmdOrCtrl+Shift+O",
        shortcutOpenHome: "CmdOrCtrl+Shift+H",
        keepWindowsVisible: true,
      }),
    );
    expect(mocks.setSecret).toHaveBeenCalledWith("password", "new-password");
    expect(mocks.login).toHaveBeenCalledWith(
      "https://new.example",
      "new-user",
      "new-password",
    );
    expect(mocks.setSecret).toHaveBeenCalledWith(
      "access_token",
      "hidden-access-token",
    );
    expect(mocks.reloadHotkeys).toHaveBeenCalledOnce();
    expect(mocks.applyWindowDeactivatePolicy).toHaveBeenCalledOnce();
    expect(mocks.emitAuthUpdated).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.hideCurrentWindow).toHaveBeenCalledOnce());
  });

  it("records a shortcut after clicking the hotkey field", async () => {
    render(<SettingsWindow />);
    await screen.findByLabelText("服务地址");

    fireEvent.click(screen.getByRole("tab", { name: "快捷键" }));
    fireEvent.click(screen.getByLabelText("打开桌宠"));

    fireEvent.keyDown(window, {
      key: "p",
      code: "KeyP",
      metaKey: true,
      shiftKey: true,
    });

    expect(screen.getByLabelText("打开桌宠").textContent).toMatch(
      /⇧P|Shift\+P/,
    );
  });

  it("stores the token after a successful connection test and reports errors", async () => {
    render(<SettingsWindow />);
    await screen.findByDisplayValue("https://octop.example");

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith(
        "https://octop.example",
        "octopus",
        "secret-password",
      ),
    );
    expect(mocks.patchConfig).toHaveBeenCalledWith({
      baseUrl: "https://octop.example",
      username: "octopus",
      mascotId: "type",
    });
    expect(mocks.patchConfig.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSecret.mock.invocationCallOrder[0],
    );
    expect(mocks.setSecret).toHaveBeenCalledWith("password", "secret-password");
    expect(mocks.setSecret).toHaveBeenCalledWith(
      "access_token",
      "hidden-access-token",
    );
    expect(mocks.emitAuthUpdated).toHaveBeenCalledOnce();
    expect(await screen.findByText("连接成功")).toBeInTheDocument();
    expect(screen.queryByText("hidden-access-token")).not.toBeInTheDocument();

    mocks.login.mockRejectedValueOnce(new Error("用户名或密码错误"));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("连接失败：用户名或密码错误"),
    ).toBeInTheDocument();
  });

  it("toggles click-away visibility immediately", async () => {
    render(<SettingsWindow />);
    await screen.findByLabelText("服务地址");
    fireEvent.click(screen.getByRole("tab", { name: "窗口" }));
    const checkbox = await screen.findByLabelText("点击其他应用时保持窗口显示");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(mocks.patchConfig).toHaveBeenCalledWith({
        keepWindowsVisible: false,
      }),
    );
    expect(mocks.applyWindowDeactivatePolicy).toHaveBeenCalledOnce();
    expect(checkbox).not.toBeChecked();
  });
});
