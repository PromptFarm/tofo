"use client";

import type { PersistentItem } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";
import {
  selectOpenItems,
  useThinkingGraphPersistenceStore,
} from "../state/useThinkingGraphPersistenceStore";
import { useThinkingGraphVersionStore } from "../state/useThinkingGraphVersionStore";

const TYPE_CONFIG = {
  "clarification": {
    label: "Clarification needed",
    icon: "?",
    iconColor: "var(--primary)",
  },
  "risk-fact": {
    label: "Persistent risk",
    icon: "⚠",
    iconColor: "var(--color-warning-text, #fbbf24)",
  },
  "missing-info": {
    label: "Missing info",
    icon: "○",
    iconColor: "var(--on-surface-variant)",
  },
} satisfies Record<PersistentItem["type"], { label: string; icon: string; iconColor: string }>;

function TypeBadge({ type }: { type: PersistentItem["type"] }) {
  const { label, iconColor } = TYPE_CONFIG[type];
  return (
    <span
      className="inline-flex items-center shrink-0 whitespace-nowrap rounded px-[5px] py-[1px] border text-[length:var(--text-label)] leading-[1.4]"
      style={{
        borderColor: "var(--surface-container)",
        background: "var(--surface-high)",
        color: iconColor,
        fontFamily: MONO,
      }}
    >
      {label}
    </span>
  );
}

function AgentChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center shrink-0 whitespace-nowrap rounded px-[5px] py-[1px] border text-[length:var(--text-label)] leading-[1.4]"
      style={{
        borderColor: "var(--surface-container)",
        background: "var(--surface-high)",
        color: "var(--t3)",
        fontFamily: MONO,
      }}
    >
      {name}
    </span>
  );
}

export function PersistentItemsSection() {
  const openItems = useThinkingGraphPersistenceStore(selectOpenItems);
  const activeRunId = useThinkingGraphVersionStore((s) => s.activeRunId);
  const closePersistentItem = useThinkingGraphPersistenceStore(
    (s) => s.closePersistentItem,
  );

  if (openItems.length === 0) return null;

  const handleDismiss = (item: PersistentItem) => {
    closePersistentItem(
      item.id,
      activeRunId ?? "dismissed",
      "user-dismissed",
    );
  };

  return (
    <section>
      <p
        className="text-[length:var(--text-label)] tracking-[1px] uppercase m-0 mb-2 pb-2 border-b"
        style={{
          color: "var(--primary)",
          fontFamily: MONO,
          borderColor: "var(--surface-container)",
        }}
      >
        Open items · {openItems.length}
      </p>

      <div className="flex flex-col gap-0">
        {openItems.map((item, index) => (
          <div
            key={item.id}
            className="flex items-start gap-2 py-[6px]"
            style={{
              borderBottom:
                index < openItems.length - 1
                  ? "1px solid var(--surface-container)"
                  : "none",
            }}
          >
            {/* Type + agent chips */}
            <div className="flex items-center gap-1 shrink-0 pt-[2px]">
              <TypeBadge type={item.type} />
              <AgentChip name={item.raisedByName} />
            </div>

            {/* Item text */}
            <p
              className="flex-1 m-0 leading-[1.55] overflow-wrap-anywhere"
              style={{
                fontSize: "var(--text-caption)",
                fontFamily: SANS,
                color: "var(--on-surface-variant)",
              }}
            >
              {item.text}
            </p>

            {/* Dismiss button */}
            <button
              type="button"
              title="Dismiss — remove from next run"
              onClick={() => handleDismiss(item)}
              className="shrink-0 flex items-center justify-center w-5 h-5 rounded border cursor-pointer pt-[2px] transition-colors hover:border-[var(--danger-border)] hover:text-[var(--danger-text)]"
              style={{
                border: "1px solid var(--surface-container)",
                background: "transparent",
                color: "var(--t3)",
                fontSize: 11,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
