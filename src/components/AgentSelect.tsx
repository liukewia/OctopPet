import type { RefObject } from "react";

import type { AgentSummary } from "../lib/types";

interface AgentSelectProps {
  agents: AgentSummary[];
  value: string;
  disabled?: boolean;
  open: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onChange: (agentId: string) => void;
}

export default function AgentSelect({
  agents,
  value,
  disabled = false,
  open,
  menuRef,
  onOpenChange,
  onChange,
}: AgentSelectProps) {
  const selected = agents.find((agent) => agent.id === value);
  const label = selected?.name ?? "选择代理";

  return (
    <div className="composer-menu" ref={menuRef}>
      <button
        type="button"
        className="composer-chip-btn"
        aria-label="选择代理"
        title="选择代理"
        disabled={disabled || agents.length === 0}
        onClick={() => onOpenChange(!open)}
      >
        <span className="composer-model-label">{label}</span>
      </button>
      {open ? (
        <div className="composer-popover composer-popover-model" role="menu">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === agent.id}
              className={`composer-popover-item${value === agent.id ? " is-selected" : ""}`}
              onClick={() => {
                onChange(agent.id);
                onOpenChange(false);
              }}
            >
              {agent.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
