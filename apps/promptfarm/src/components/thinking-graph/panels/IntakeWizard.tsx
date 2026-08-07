"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
} from "@/lib/thinking-graph/server/types";
import {
  streamThinkingGraphIntakeQuestions,
  saveThinkingGraphIntakeAnswers,
} from "@/lib/thinking-graph/client";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

type Phase = "thinking" | "questions" | "assembling";

export type IntakeWizardProps = {
  sessionId: string;
  ideaPrompt: string;
  onComplete: (
    payload: import("@/lib/thinking-graph/server/types").SyntheticGraphPayload,
  ) => void;
  onSkip: () => void;
};

export function IntakeWizard({
  sessionId,
  ideaPrompt,
  onComplete,
  onSkip,
}: IntakeWizardProps) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [logText, setLogText] = useState("");
  const [logExpanded, setLogExpanded] = useState(false);
  const [questions, setQuestions] = useState<SyntheticIntakeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<SyntheticIntakeAnswer[]>([]);
  const [dots, setDots] = useState(".");
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Animated dots
  useEffect(() => {
    if (phase !== "thinking" && phase !== "assembling") return;
    const id = setInterval(
      () => setDots((d) => (d.length >= 3 ? "." : d + ".")),
      500,
    );
    return () => clearInterval(id);
  }, [phase]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  // Focus textarea when question changes
  useEffect(() => {
    if (phase === "questions") {
      textareaRef.current?.focus();
    }
  }, [phase, currentIndex]);

  // Pre-fill suggested answer when question changes
  useEffect(() => {
    if (phase !== "questions") return;
    const q = questions[currentIndex];
    if (q?.suggestedAnswer) {
      setAnswer(q.suggestedAnswer);
    } else {
      setAnswer("");
    }
  }, [currentIndex, phase, questions]);

  // Start streaming on mount
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const qs = await streamThinkingGraphIntakeQuestions(
          { sessionId, ideaPrompt },
          (delta) => {
            if (cancelled) return;
            setLogText((prev) => prev + delta);
          },
        );
        if (cancelled) return;
        if (qs.length === 0) {
          // No questions — go straight to assembling
          setPhase("assembling");
          setTimeout(() => {
            if (!cancelled) onSkip();
          }, 1200);
          return;
        }
        setQuestions(qs);
        setPhase("questions");
      } catch {
        if (cancelled) return;
        // On error — skip intake entirely
        onSkip();
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleContinue() {
    const q = questions[currentIndex];
    const trimmed = answer.trim();
    const newAnswers = trimmed
      ? [
          ...answers,
          {
            questionId: q.id,
            answer: trimmed,
            answeredAt: new Date().toISOString(),
          },
        ]
      : answers;

    if (currentIndex < questions.length - 1) {
      setAnswers(newAnswers);
      setCurrentIndex((i) => i + 1);
      return;
    }

    // Last question — save answers and proceed
    setAnswers(newAnswers);
    setPhase("assembling");
    try {
      const payload = await saveThinkingGraphIntakeAnswers({
        sessionId,
        answers: newAnswers,
      });
      onComplete(payload);
    } catch {
      onSkip();
    }
  }

  function handleSkip() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    // Last question skipped — save what we have and proceed
    setPhase("assembling");
    saveThinkingGraphIntakeAnswers({ sessionId, answers })
      .then(onComplete)
      .catch(() => onSkip());
  }

  const q = questions[currentIndex];
  const progress =
    questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          width: "min(560px, calc(100vw - 32px))",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Thinking phase */}
        {phase === "thinking" && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "28px 28px 20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 12,
                }}
              >
                <ThinkingSpinner />
                <div>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--on-surface)",
                      fontFamily: SANS,
                      margin: 0,
                    }}
                  >
                    Reading the idea{dots}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--t3)",
                      fontFamily: MONO,
                      margin: "4px 0 0",
                    }}
                  >
                    Gathering questions
                  </p>
                </div>
              </div>

              {/* Skip link */}
              <button
                type="button"
                onClick={onSkip}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  padding: 0,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Skip questions →
              </button>
            </div>

            {/* Log */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                type="button"
                onClick={() => setLogExpanded((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--t3)",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: MONO,
                    letterSpacing: "0.8px",
                    textTransform: "uppercase",
                  }}
                >
                  Model log
                </span>
                <span style={{ fontSize: 10, fontFamily: MONO }}>
                  {logExpanded ? "▲" : "▼"}
                </span>
              </button>
              {logExpanded && (
                <div
                  ref={logRef}
                  style={{
                    padding: "8px 16px 14px",
                    maxHeight: 160,
                    overflowY: "auto",
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "black",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {logText || "…"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions phase */}
        {phase === "questions" && q && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Progress bar */}
            <div style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--primary)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <div style={{ padding: "24px 28px 28px" }}>
              {/* Counter */}
              <p
                style={{
                  fontSize: 9,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  margin: "0 0 16px",
                }}
              >
                Question {currentIndex + 1} from {questions.length}
              </p>

              {/* Question */}
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--on-surface)",
                  fontFamily: SANS,
                  lineHeight: 1.5,
                  margin: "0 0 6px",
                }}
              >
                {q.question}
              </p>

              {/* Why it matters */}
              <p
                style={{
                  fontSize: 11,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  lineHeight: 1.6,
                  margin: "0 0 20px",
                }}
              >
                {q.whyItMatters}
              </p>

              {/* Input */}
              <textarea
                ref={textareaRef}
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    void handleContinue();
                  }
                }}
                placeholder={
                  q.suggestedAnswer
                    ? `Suggestion: ${q.suggestedAnswer}`
                    : "Enter your answer or skip…"
                }
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--on-surface)",
                  padding: "12px 14px",
                  fontSize: 13,
                  fontFamily: SANS,
                  resize: "none",
                  outline: "none",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
              />

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  onClick={handleSkip}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--t3)",
                    fontFamily: MONO,
                    padding: 0,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Skip
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleContinue();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "1px solid rgba(167,139,250,0.4)",
                    background: "rgba(167,139,250,0.12)",
                    color: "#a78bfa",
                    fontSize: 12,
                    fontFamily: MONO,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {currentIndex < questions.length - 1 ? "Next →" : "Done →"}
                </button>
              </div>

              {/* Cmd+Enter hint */}
              <p
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.2)",
                  fontFamily: MONO,
                  textAlign: "right",
                  marginTop: 6,
                }}
              >
                ⌘ Enter to proceed
              </p>
            </div>
          </div>
        )}

        {/* Assembling phase */}
        {phase === "assembling" && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "36px 28px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <ThinkingSpinner />
            <div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--on-surface)",
                  fontFamily: SANS,
                  margin: 0,
                }}
              >
                Creating your team{dots}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  margin: "4px 0 0",
                }}
              >
                Gathering your syntetic team
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingSpinner() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "2px solid rgba(167,139,250,0.15)",
        borderTopColor: "#a78bfa",
        animation: "intake-spin 0.9s linear infinite",
        flexShrink: 0,
      }}
    >
      <style>{`@keyframes intake-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
