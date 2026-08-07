"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DirectorOutput,
  PersonaSuggestion,
  SyntheticIntakeAnswer,
} from "@/lib/thinking-graph/server/types";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

export interface DirectorNodePanelProps {
  directorOutput: DirectorOutput | null;
  /** "running" while LLM analysis is in flight */
  isLoading: boolean;
  isConfirming: boolean;
  /** Controlled: which persona IDs are currently selected (shown on canvas) */
  selectedIds: Set<string>;
  /** Controlled: toggle a persona on/off */
  onTogglePersona: (personaId: string) => void;
  onConfirm: (
    confirmedPersonaIds: string[],
    intakeAnswers: SyntheticIntakeAnswer[],
  ) => void;
  onSkip: () => void;
}

export function DirectorNodePanel({
  directorOutput,
  isLoading,
  isConfirming,
  selectedIds,
  onTogglePersona,
  onConfirm,
  onSkip,
}: DirectorNodePanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [allRolesSearch, setAllRolesSearch] = useState("");
  const seededRef = useRef(false);

  // Pre-fill suggested answers once when directorOutput arrives
  useEffect(() => {
    if (seededRef.current || !directorOutput) return;
    seededRef.current = true;
    const prefilled: Record<string, string> = {};
    for (const q of directorOutput.groundedQuestions) {
      if (q.suggestedAnswer) prefilled[q.id] = q.suggestedAnswer;
    }
    setAnswers(prefilled);
  }, [directorOutput]);

  function handleConfirm() {
    const answerList = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([questionId, answer]) => ({
        questionId,
        answer: answer.trim(),
        answeredAt: new Date().toISOString(),
      }));
    onConfirm([...selectedIds], answerList);
  }

  const disabled = isConfirming || isLoading;

  // Personas not already in the suggested list, for the "Browse all" section
  const suggestedIds = new Set(
    (directorOutput?.personaSuggestions ?? []).map((s) => s.personaId),
  );
  const allPersonas: PersonaSuggestion[] = directorOutput?.personaRoster ?? [];
  const extraPersonas = allPersonas.filter((p) => !suggestedIds.has(p.personaId));

  // Group extra personas by domain for easier browsing
  const extraByDomain = extraPersonas.reduce<Record<string, PersonaSuggestion[]>>(
    (acc, p) => {
      const d = p.domain || "other";
      (acc[d] ??= []).push(p);
      return acc;
    },
    {},
  );

  const filteredExtraByDomain = Object.entries(extraByDomain).reduce<Record<string, PersonaSuggestion[]>>(
    (acc, [domain, personas]) => {
      const filtered: PersonaSuggestion[] = allRolesSearch.trim()
        ? personas.filter(
            (p) =>
              p.name.toLowerCase().includes(allRolesSearch.toLowerCase()) ||
              p.reason.toLowerCase().includes(allRolesSearch.toLowerCase()),
          )
        : personas;
      if (filtered.length > 0) acc[domain] = filtered;
      return acc;
    },
    {},
  );

  return (
    <>
      <style>{`
        @keyframes director-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes director-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          animation: "director-slide-in 0.22s ease forwards",
          borderRadius: 8,
          border: `1px solid ${isLoading ? "rgba(167,139,250,0.25)" : "rgba(52,211,153,0.2)"}`,
          background: "var(--surface-low)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid var(--surface-container)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isLoading ? "#a78bfa" : "#34d399",
                flexShrink: 0,
                boxShadow: isLoading ? "0 0 6px #a78bfa" : "0 0 6px #34d399",
                animation: isLoading ? "director-pulse 1.2s ease infinite" : "none",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--on-surface)",
                fontFamily: MONO,
                letterSpacing: "0.3px",
              }}
            >
              {isLoading ? "Preparing your run…" : "Run setup"}
            </span>
            {!isLoading && directorOutput && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 8,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "rgba(52,211,153,0.1)",
                  border: "1px solid rgba(52,211,153,0.3)",
                  color: "#34d399",
                  fontFamily: MONO,
                }}
              >
                {directorOutput.identifiedDomain}
              </span>
            )}
          </div>

        {isLoading ? (
          <p
            style={{
              fontSize: 10,
              color: "var(--t3)",
              fontFamily: MONO,
              margin: 0,
            }}
          >
            Analyzing your idea and selecting the right team…
          </p>
        ) : directorOutput?.domainSummary ? (
          <p
            style={{
              fontSize: 10,
              color: "var(--on-surface-variant)",
              fontFamily: SANS,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {directorOutput.domainSummary}
          </p>
        ) : null}
        </div>

        {/* ── Persona chip-select ── */}
        {!isLoading && directorOutput && directorOutput.personaSuggestions.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--surface-container)",
            }}
          >
            <p
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--t3)",
                fontFamily: MONO,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                margin: "0 0 8px",
              }}
            >
              Suggested team · click to adjust
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {directorOutput.personaSuggestions.map((s) => {
                const active = selectedIds.has(s.personaId);
                return (
                  <button
                    key={s.personaId}
                    type="button"
                    disabled={disabled}
                    title={s.reason}
                    onClick={() => onTogglePersona(s.personaId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: active
                        ? "1px solid rgba(167,139,250,0.5)"
                        : "1px solid var(--surface-container)",
                      background: active
                        ? "rgba(167,139,250,0.12)"
                        : "var(--surface-low)",
                      color: active ? "#a78bfa" : "var(--t3)",
                      fontSize: 9,
                      fontFamily: MONO,
                      fontWeight: 600,
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.6 : 1,
                      transition: "all 0.14s",
                    }}
                  >
                    {active && (
                      <span style={{ fontSize: 8, lineHeight: 1 }}>✓</span>
                    )}
                    {s.name.split("/")[0]?.trim() ?? s.name}
                    <span
                      style={{
                        fontSize: 7,
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: active
                          ? "rgba(167,139,250,0.2)"
                          : "var(--surface-container)",
                        color: active
                          ? "rgba(167,139,250,0.8)"
                          : "var(--t3)",
                      }}
                    >
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Browse all roles ── */}
        {!isLoading && directorOutput && extraPersonas.length > 0 && (
          <div
            style={{
              borderBottom: "1px solid var(--surface-container)",
            }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowAllRoles((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: disabled ? "default" : "pointer",
                color: "var(--t3)",
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              <span>Browse all roles ({extraPersonas.length} more)</span>
              <span style={{ fontSize: 10 }}>{showAllRoles ? "▲" : "▼"}</span>
            </button>

            {showAllRoles && (
              <div style={{ padding: "0 16px 12px" }}>
                <input
                  type="text"
                  placeholder="Search roles…"
                  value={allRolesSearch}
                  onChange={(e) => setAllRolesSearch(e.target.value)}
                  style={{
                    width: "100%",
                    borderRadius: 5,
                    border: "1px solid var(--surface-container)",
                    background: "var(--surface-low)",
                    color: "var(--on-surface)",
                    padding: "4px 8px",
                    fontSize: 10,
                    fontFamily: SANS,
                    outline: "none",
                    marginBottom: 8,
                    boxSizing: "border-box",
                  }}
                />
                {Object.entries(filteredExtraByDomain).map(([domain, personas]) => (
                  <div key={domain} style={{ marginBottom: 10 }}>
                    <p
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: "var(--t3)",
                        fontFamily: MONO,
                        letterSpacing: "0.6px",
                        textTransform: "uppercase",
                        margin: "0 0 5px",
                      }}
                    >
                      {domain.replace(/_/g, " ")}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {personas.map((p) => {
                        const active = selectedIds.has(p.personaId);
                        return (
                          <button
                            key={p.personaId}
                            type="button"
                            disabled={disabled}
                            title={p.reason}
                            onClick={() => onTogglePersona(p.personaId)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "3px 8px",
                              borderRadius: 5,
                              border: active
                                ? "1px solid rgba(52,211,153,0.5)"
                                : "1px solid var(--surface-container)",
                              background: active
                                ? "rgba(52,211,153,0.1)"
                                : "var(--surface-low)",
                              color: active ? "#34d399" : "var(--t3)",
                              fontSize: 9,
                              fontFamily: MONO,
                              fontWeight: 600,
                              cursor: disabled ? "default" : "pointer",
                              transition: "all 0.12s",
                            }}
                          >
                            {active && <span style={{ fontSize: 7 }}>✓</span>}
                            {p.name.split("/")[0]?.trim() ?? p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Grounded questions ── */}
        {!isLoading && directorOutput && directorOutput.groundedQuestions.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--surface-container)",
            }}
          >
            <p
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--t3)",
                fontFamily: MONO,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                margin: "0 0 8px",
              }}
            >
              Context questions
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {directorOutput.groundedQuestions.map((q) => (
                <div key={q.id}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--on-surface)",
                      fontFamily: SANS,
                      margin: "0 0 3px",
                      lineHeight: 1.4,
                    }}
                  >
                    {q.question}
                  </p>
                  {q.whyItMatters && (
                    <p
                      style={{
                        fontSize: 9,
                        color: "var(--t3)",
                        fontFamily: SANS,
                        margin: "0 0 4px",
                        lineHeight: 1.4,
                      }}
                    >
                      {q.whyItMatters}
                    </p>
                  )}
                  <input
                    type="text"
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      q.suggestedAnswer ? `e.g. ${q.suggestedAnswer}` : "Optional…"
                    }
                    disabled={disabled}
                    style={{
                      width: "100%",
                      borderRadius: 5,
                      border: "1px solid rgba(167,139,250,0.25)",
                      background: "rgba(167,139,250,0.05)",
                      color: "var(--on-surface)",
                      padding: "5px 10px",
                      fontSize: 10,
                      fontFamily: SANS,
                      outline: "none",
                      lineHeight: 1.5,
                      boxSizing: "border-box",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        {!isLoading && (
          <div
            style={{
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              style={{
                background: "none",
                border: "none",
                cursor: disabled ? "default" : "pointer",
                fontSize: 10,
                color: "var(--t3)",
                fontFamily: MONO,
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              Skip setup
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={disabled || selectedIds.size === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid rgba(167,139,250,0.5)",
                background: "rgba(167,139,250,0.13)",
                color: "#a78bfa",
                fontSize: 10,
                fontFamily: MONO,
                cursor: disabled || selectedIds.size === 0 ? "default" : "pointer",
                fontWeight: 700,
                opacity: disabled || selectedIds.size === 0 ? 0.5 : 1,
                transition: "opacity 0.14s",
              }}
            >
              {isConfirming
                ? "Applying…"
                : `Start with ${selectedIds.size} agent${selectedIds.size !== 1 ? "s" : ""} →`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

