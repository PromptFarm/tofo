"use client";

import { useState } from "react";
import { X, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import type { SyntheticIntakeQuestion, SyntheticIntakeAnswer } from "@/lib/thinking-graph/server/types";

type AnswerMap = Record<string, string>;

export type IntakeQuestionsModalProps = {
  questions: SyntheticIntakeQuestion[];
  isLoading: boolean;
  /** Pending questions that block the run (required + unanswered) */
  blockingCount: number;
  onSubmit: (answers: SyntheticIntakeAnswer[]) => void;
  onSkipAll: () => void;
  onClose: () => void;
};

export function IntakeQuestionsModal({
  questions,
  isLoading,
  blockingCount,
  onSubmit,
  onSkipAll,
  onClose,
}: IntakeQuestionsModalProps) {
  const [answers, setAnswers] = useState<AnswerMap>(() => {
    // Pre-fill suggested answers
    const initial: AnswerMap = {};
    for (const q of questions) {
      if (q.suggestedAnswer) {
        initial[q.id] = q.suggestedAnswer;
      }
    }
    return initial;
  });

  const requiredUnanswered = questions.filter(
    (q) => q.required && !answers[q.id]?.trim(),
  );

  function handleSubmit() {
    const result: SyntheticIntakeAnswer[] = Object.entries(answers)
      .filter(([, answer]) => answer.trim().length > 0)
      .map(([questionId, answer]) => ({
        questionId,
        answer: answer.trim(),
        answeredAt: new Date().toISOString(),
      }));
    onSubmit(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--surface-lowest)] border border-[var(--surface-container)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--surface-container)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--on-surface)]">
              Clarify before running
            </h2>
            <p className="mt-0.5 text-sm text-[var(--on-surface-variant)]">
              {blockingCount > 0
                ? `${blockingCount} required question${blockingCount > 1 ? "s" : ""} — answer or skip to proceed.`
                : "Answer what you can — the rest will use defaults."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Questions */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-[var(--on-surface-variant)]">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Generating questions…</span>
            </div>
          ) : (
            questions.map((q, index) => {
              const value = answers[q.id] ?? "";
              const isEmpty = !value.trim();
              return (
                <div key={q.id} className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-xs text-[var(--t3)] font-mono w-5 shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--on-surface)] leading-snug">
                          {q.question}
                        </span>
                        {q.required && isEmpty && (
                          <span className="shrink-0 text-xs font-medium text-[var(--color-warning-text)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded">
                            required
                          </span>
                        )}
                        {q.source === "agent" && (
                          <span className="shrink-0 text-xs text-[var(--on-surface-variant)] bg-[var(--surface-low)] px-1.5 py-0.5 rounded">
                            from agent
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--on-surface-variant)] leading-snug">
                        {q.whyItMatters}
                      </p>
                    </div>
                  </div>
                  <div className="ml-7">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder={
                        q.suggestedAnswer
                          ? `Suggested: ${q.suggestedAnswer}`
                          : "Type your answer or leave blank to skip…"
                      }
                      className="w-full bg-white border border-[var(--surface-container)] rounded-lg px-3 py-2 text-sm text-[var(--on-surface)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--primary-border)] transition-colors"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="flex items-center justify-between p-4 border-t border-[var(--surface-container)]">
            <button
              onClick={onSkipAll}
              className="text-sm text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
            >
              Skip all
            </button>
            <div className="flex items-center gap-2">
              {requiredUnanswered.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-[var(--color-warning-text)]">
                  <AlertTriangle size={12} />
                  <span>{requiredUnanswered.length} required unanswered</span>
                </div>
              )}
              <button
                onClick={handleSubmit}
                className="flex items-center gap-1.5 bg-[var(--primary)] hover:opacity-90 text-[var(--on-primary)] text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Continue
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
