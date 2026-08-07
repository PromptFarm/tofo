"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SyntheticIntakeQuestion,
  SyntheticGraphPayload,
} from "@/lib/thinking-graph/server/types";
import {
  streamThinkingGraphIntakeQuestions,
  saveThinkingGraphIntakeAnswers,
} from "@/lib/thinking-graph/client";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

type PanelPhase = "loading" | "ready" | "expanded" | "saving" | "saved" | "dismissed";

export interface IntakeInlinePanelProps {
  sessionId: string;
  ideaPrompt: string;
  onPayloadUpdate: (payload: SyntheticGraphPayload) => void;
  preloadedQuestions?: SyntheticIntakeQuestion[];
}

export function IntakeInlinePanel({
  sessionId,
  ideaPrompt,
  onPayloadUpdate,
  preloadedQuestions,
}: IntakeInlinePanelProps) {
  const [phase, setPhase] = useState<PanelPhase>(preloadedQuestions && preloadedQuestions.length > 0 ? "ready" : "loading");
  const [questions, setQuestions] = useState<SyntheticIntakeQuestion[]>(preloadedQuestions ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (preloadedQuestions && preloadedQuestions.length > 0) return;
    cancelledRef.current = false;
    async function load() {
      try {
        const qs = (await streamThinkingGraphIntakeQuestions(
          { sessionId, ideaPrompt },
          () => {},
        )) ?? [];
        if (cancelledRef.current) return;
        if (qs.length === 0) { setPhase("dismissed"); return; }
        const prefilled: Record<string, string> = {};
        for (const q of qs) {
          if (q.suggestedAnswer) prefilled[q.id] = q.suggestedAnswer;
        }
        setQuestions(qs.slice(0, 5));
        setAnswers(prefilled);
        setPhase("ready");
      } catch {
        if (!cancelledRef.current) setPhase("dismissed");
      }
    }
    void load();
    return () => { cancelledRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setPhase("saving");
    try {
      const answerList = Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([questionId, answer]) => ({
          questionId,
          answer: answer.trim(),
          answeredAt: new Date().toISOString(),
        }));
      const payload = await saveThinkingGraphIntakeAnswers({ sessionId, answers: answerList });
      onPayloadUpdate(payload);
      setPhase("saved");
    } catch {
      setPhase("expanded");
    }
  }

  if (phase === "dismissed" || phase === "saved") return null;

  const isExpanded = phase === "expanded" || phase === "saving";

  return (
    <>
      <style>{`
        @keyframes intake-slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes intake-pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div
        style={{
          animation: "intake-slide-up 0.25s ease forwards",
          borderBottom: "1px solid rgba(167,139,250,0.3)",
          borderTop: "1px solid rgba(167,139,250,0.2)",
          background: "rgba(167,139,250,0.06)",
          boxShadow: "inset 3px 0 0 #a78bfa",
        }}
      >
        {/* Header row — always visible */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            cursor: phase === "loading" ? "default" : "pointer",
          }}
          onClick={() => {
            if (phase === "ready") setPhase("expanded");
            else if (phase === "expanded") setPhase("ready");
          }}
        >
          {/* Pulsing dot */}
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#a78bfa",
              flexShrink: 0,
              boxShadow: "0 0 6px #a78bfa",
              animation: phase === "loading" ? "intake-pulse-dot 1.2s ease infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#a78bfa",
              fontFamily: MONO,
              flex: 1,
            }}
          >
            {phase === "loading"
              ? "Generating context questions…"
              : `${questions.length} quick question${questions.length !== 1 ? "s" : ""} to sharpen your run`}
          </span>
          {phase !== "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(167,139,250,0.7)",
                  fontFamily: MONO,
                }}
              >
                {isExpanded ? "collapse ▲" : "answer ▼"}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPhase("dismissed"); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, color: "var(--t3)", fontFamily: MONO, padding: "0 2px", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Expanded questions */}
        {isExpanded && (
          <div style={{ padding: "0 14px 12px" }}>
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {questions.map((q) => (
                <div key={q.id}>
                  <p style={{
                    fontSize: 10, fontWeight: 600, color: "var(--on-surface)",
                    fontFamily: SANS, margin: "0 0 3px", lineHeight: 1.4,
                  }}>
                    {q.question}
                  </p>
                  <input
                    type="text"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder={q.suggestedAnswer ? `e.g. ${q.suggestedAnswer}` : "Optional…"}
                    disabled={phase === "saving"}
                    style={{
                      width: "100%", borderRadius: 5,
                      border: "1px solid rgba(167,139,250,0.25)",
                      background: "rgba(167,139,250,0.06)",
                      color: "var(--on-surface)", padding: "5px 10px",
                      fontSize: 10, fontFamily: SANS, outline: "none",
                      lineHeight: 1.5, boxSizing: "border-box",
                      opacity: phase === "saving" ? 0.6 : 1,
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => setPhase("dismissed")}
                disabled={phase === "saving"}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, color: "var(--t3)", fontFamily: MONO, padding: 0,
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={phase === "saving"}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 14px", borderRadius: 6,
                  border: "1px solid rgba(167,139,250,0.45)",
                  background: "rgba(167,139,250,0.12)",
                  color: "#a78bfa", fontSize: 10, fontFamily: MONO,
                  cursor: phase === "saving" ? "default" : "pointer",
                  fontWeight: 600, opacity: phase === "saving" ? 0.6 : 1,
                }}
              >
                {phase === "saving" ? "Saving…" : "Save context ↑"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function LoadingDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const id = setInterval(
      () => setDots((d) => (d.length >= 3 ? "." : `${d}.`)),
      500,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <span
      style={{
        fontSize: 9,
        color: "var(--t3)",
        fontFamily: MONO,
        width: 16,
        display: "inline-block",
      }}
    >
      {dots}
    </span>
  );
}
