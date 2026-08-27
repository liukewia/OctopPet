// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Composer from "./Composer";
import type { AgentSummary } from "../lib/types";

const agents: AgentSummary[] = [{ id: "agent-1", name: "Default Agent" }];

describe("Composer", () => {
  afterEach(cleanup);

  it("sends trimmed text with default options", () => {
    const onSend = vi.fn();
    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("和 Octop 说点什么"), {
      target: { value: "  hello  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledWith("hello", {
      attachments: [],
      model: null,
      mcpServers: [],
    });
  });

  it("queues while streaming when onQueue is provided", () => {
    const onQueue = vi.fn().mockReturnValue("ok");
    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        streaming
        onSend={vi.fn()}
        onQueue={onQueue}
        onStop={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("和 Octop 说点什么"), {
      target: { value: "queued" },
    });
    fireEvent.click(screen.getByRole("button", { name: "加入队列" }));

    expect(onQueue).toHaveBeenCalledWith("queued", {
      attachments: [],
      model: null,
      mcpServers: [],
    });
  });

  it("opens the model menu and notifies layout change", () => {
    const onLayoutChange = vi.fn();
    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        models={[{ provider_name: "openai", model: "gpt-4o", name: "GPT-4o" }]}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onLayoutChange={onLayoutChange}
      />,
    );

    onLayoutChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "openai / GPT-4o" }),
    ).toBeInTheDocument();
    expect(onLayoutChange).toHaveBeenCalled();
  });

  it("opens the agent menu like the model list", () => {
    const onAgentChange = vi.fn();
    render(
      <Composer
        agents={[
          { id: "agent-1", name: "Default Agent" },
          { id: "agent-2", name: "Research" },
        ]}
        agentId="agent-1"
        onAgentChange={onAgentChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择代理" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Research" }));

    expect(onAgentChange).toHaveBeenCalledWith("agent-2");
  });

  it("clamps an open model menu to the window instead of overflowing", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 200,
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const className = (this as HTMLElement).className ?? "";
        if (String(className).includes("composer-popover")) {
          return {
            width: 220,
            height: 180,
            top: -20,
            left: 200,
            right: 420,
            bottom: 160,
            x: 200,
            y: -20,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          width: 72,
          height: 28,
          top: 150,
          left: 210,
          right: 282,
          bottom: 178,
          x: 210,
          y: 150,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );

    render(
      <Composer
        agents={agents}
        agentId="agent-1"
        onAgentChange={vi.fn()}
        models={[{ provider_name: "openai", model: "gpt-4o", name: "GPT-4o" }]}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));

    const menu = screen.getByRole("menu");
    expect(Number.parseInt(menu.style.maxHeight, 10)).toBeLessThanOrEqual(136);
    expect(menu.style.right).toBe("0px");
  });
});
