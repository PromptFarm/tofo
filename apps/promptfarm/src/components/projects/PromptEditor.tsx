"use client";

import { useEffect, useState } from "react";

interface PromptEditorProps {
  defaultValue?: string;
  floating?: boolean;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimaryAction?: () => void;
}

export function PromptEditor({
  defaultValue = "",
  floating = false,
  primaryLabel = "Refine Prompt",
  primaryDisabled = false,
  onPrimaryAction,
}: PromptEditorProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <div
      className={`rounded-xl p-6 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200 ease-out ${
        floating
          ? "bg-surface-lowest/55 backdrop-blur-xl border border-surface-container/70 shadow-[0_8px_40px_rgba(15,23,42,0.14)]"
          : "bg-surface-lowest"
      }`}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe your idea..."
        className="w-full min-h-[180px] bg-transparent text-base leading-relaxed text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none"
      />
      <div
        className={`h-px mt-2 mb-3 ${
          floating ? "bg-surface-container/60" : "bg-surface-container"
        }`}
      />
      <div className="flex items-center justify-end gap-4">
        <span className="text-sm text-on-surface-variant">
          {value.length} characters
        </span>
        <button
          type="button"
          disabled={primaryDisabled}
          onClick={() => {
            if (!primaryDisabled) {
              onPrimaryAction?.();
            }
          }}
          className={`flex items-center gap-1.5 text-sm font-medium text-primary px-3 py-1.5 rounded-md transition-all duration-200 ease-out ${
            primaryDisabled
              ? "opacity-50 cursor-not-allowed"
              : floating
                ? "hover:bg-surface-container/60"
                : "hover:bg-surface-container"
          }`}
        >
          <span className="text-xs">✦</span>
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
