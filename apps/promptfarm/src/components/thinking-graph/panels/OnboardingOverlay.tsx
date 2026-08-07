"use client";

import { useState } from "react";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

const DOMAINS: { emoji: string; label: string }[] = [
  { emoji: "💻", label: "SaaS / B2B" },
  { emoji: "📱", label: "Consumer App" },
  { emoji: "🤖", label: "AI / Automation" },
  { emoji: "🛠️", label: "Developer Tools" },
  { emoji: "🏥", label: "Healthcare" },
  { emoji: "🎓", label: "Education" },
  { emoji: "💰", label: "Fintech" },
  { emoji: "🛒", label: "E-commerce" },
  { emoji: "🎮", label: "Gaming" },
  { emoji: "📰", label: "Media / Content" },
  { emoji: "🏭", label: "Hardware / IoT" },
  { emoji: "🌐", label: "Other" },
];


export interface OnboardingOverlayProps {
  domainCategory: string | null;
  setDomainCategory: (category: string | null) => void;
}

export function OnboardingOverlay({
  domainCategory,
  setDomainCategory,
}: OnboardingOverlayProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        paddingTop: 48,
        paddingBottom: 160,
        gap: 20,
      }}
    >
      {/* Hero headline */}
      <div style={{ textAlign: "center", pointerEvents: "none" }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: "var(--on-surface)",
            fontFamily: SANS,
            letterSpacing: "-0.5px",
            marginBottom: 6,
            lineHeight: 1.2,
          }}
        >
          Build smarter with your AI team
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--on-surface-variant)",
            fontFamily: SANS,
            lineHeight: 1.5,
          }}
        >
          Simulate multi-disciplinary feedback on any idea — before you commit to it.
        </p>
      </div>

      {/* Domain picker */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          pointerEvents: "auto",
        }}
      >

        {/* Category grid — fixed item sizes, only paint changes on select */}
        <div
          style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 92px)",
          justifyContent: "center",
          width: "min(600px, calc(100vw - 3rem))",
            gap: 7,
          }}
        >
          {DOMAINS.map((domain) => {
            const isSelected = domainCategory === domain.label;
            const isHovered = hovered === domain.label;
            const isDimmed = !!domainCategory && !isSelected;
            return (
              <button
                key={domain.label}
                type="button"
                onClick={() =>
                  setDomainCategory(isSelected ? null : domain.label)
                }
                onMouseEnter={() => setHovered(domain.label)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  /* fixed size — never changes layout */
                  width: 92,
                  height: 64,
                  borderRadius: 10,
                  border: isSelected
                    ? "1.5px solid rgba(167,139,250,0.75)"
                    : isHovered
                      ? "1px solid rgba(167,139,250,0.35)"
                      : "1px solid var(--surface-container)",
                  background: isSelected
                    ? "rgba(167,139,250,0.14)"
                    : isHovered
                      ? "rgba(167,139,250,0.06)"
                      : "var(--surface-low)",
                  boxShadow: isSelected
                    ? "0 0 0 3px rgba(167,139,250,0.12), 0 4px 16px rgba(167,139,250,0.1)"
                    : "none",
                  opacity: isDimmed ? 0.4 : 1,
                  cursor: "pointer",
                  /* only paint transitions — no layout */
                  transition:
                    "border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.2s",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>
                  {domain.emoji}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isSelected ? 700 : 400,
                    color: isSelected ? "#a78bfa" : "var(--on-surface-variant)",
                    fontFamily: SANS,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    transition: "color 0.15s",
                  }}
                >
                  {domain.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Confirmation row — fixed height, overflow hidden, no reflow */}
        <div
          style={{
            height: 24,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {domainCategory ? (
            <>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px 3px 8px",
                  borderRadius: 999,
                  background: "rgba(167,139,250,0.1)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: MONO }}>✓</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#a78bfa",
                    fontFamily: SANS,
                  }}
                >
                  {domainCategory}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDomainCategory(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  padding: "2px 4px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "var(--t3)",
                fontFamily: SANS,
              }}
            >
              Pick a domain so your agents give focused, relevant feedback
            </span>
          )}
        </div>
      </div>


      {/* Arrow down to textarea */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 1,
            height: 18,
            background: "var(--surface-container)",
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "5px solid var(--surface-container)",
          }}
        />
      </div>
    </div>
  );
}
