"use client";

import { type LucideIcon } from "lucide-react";

interface PerspectiveCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  name: string;
  keyInsight: string;
  mainConcern: string;
  suggestion: string;
  suggestionColor: string;
  active?: boolean;
  onClick?: () => void;
}

export function PerspectiveCard({
  icon: Icon,
  iconBg,
  iconColor,
  name,
  keyInsight,
  mainConcern,
  suggestion,
  suggestionColor,
  active,
  onClick,
}: PerspectiveCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-lowest rounded-xl p-5 shadow-[0_2px_12px_rgba(42,52,57,0.06)] cursor-pointer transition-all duration-200 ease-out hover:shadow-[0_4px_16px_rgba(42,52,57,0.09)] ${
        active ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        <span className="font-display font-semibold text-on-surface">
          {name}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
            Key Insight
          </span>
          <p className="font-semibold text-on-surface text-sm mt-1">
            &ldquo;{keyInsight}&rdquo;
          </p>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
            Main Concern
          </span>
          <p className="text-sm text-on-surface mt-1">{mainConcern}</p>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
            Suggestion
          </span>
          <p
            className="text-sm font-semibold mt-1"
            style={{ color: suggestionColor }}
          >
            {suggestion}
          </p>
        </div>
      </div>
    </div>
  );
}
