"use client";

import { useEffect, useState } from "react";
import { generateExpertAnswer } from "@/lib/thinking-graph/client";

export function AnswerExpertQuestionModal({
  question,
  whyItMatters,
  syntheticName,
  sessionId,
  onAnswerGenerated,
  onClose,
}: {
  question: string
  whyItMatters?: string
  syntheticName: string
  sessionId: string
  onAnswerGenerated?: (answer: string, improvement: number) => void
  onClose: () => void
}) {
  const [answer, setAnswer] = useState("")
  const [isGenerating, setIsGenerating] = useState(true)
  const [improvement, setImprovement] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const generateAnswer = async () => {
      try {
        setIsGenerating(true)
        setError(null)
        const result = await generateExpertAnswer({
          sessionId,
          syntheticId: `synthetic-${Date.now()}`,
          syntheticName,
          question,
          whyItMatters,
        })
        setAnswer(result.answer)
        setImprovement(result.improvementEstimate)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate answer"
        setError(message)
        setAnswer("")
      } finally {
        setIsGenerating(false)
      }
    }

    generateAnswer()
  }, [sessionId, syntheticName, question, whyItMatters])

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setIsSubmitting(true)
    try {
      onAnswerGenerated?.(answer, improvement)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-high)] rounded-[12px] border border-[var(--surface-container)] p-6 max-w-[600px] w-[90%] shadow-lg max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[var(--text-title)] font-bold text-[18px] text-[var(--on-surface)] mb-2">
          Expert Answer
        </h2>
        <p className="text-[var(--text-caption)] text-[var(--on-surface-variant)] mb-4">
          <strong>{syntheticName}</strong> — {question}
        </p>

        {/* Improvement badge */}
        <div className="mb-4 p-3 rounded-lg bg-[var(--surface-low)] border border-[var(--surface-container)]">
          <p className="text-[11px] font-mono text-[var(--t3)] mb-2">Estimated Improvement:</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--surface-2)] rounded h-2">
              <div
                className="bg-[var(--color-success-text)] h-full rounded transition-all"
                style={{ width: `${improvement}%` }}
              />
            </div>
            <span className="text-[14px] font-bold font-mono text-[var(--color-success-text)]">
              +{improvement}%
            </span>
          </div>
        </div>

        {/* Textarea */}
        <label className="block mb-4">
          <p className="text-[var(--text-label)] text-[var(--on-surface)] mb-2 font-medium text-[12px]">
            Expert Answer
          </p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="AI-generated answer..."
            disabled={isGenerating || isSubmitting}
            className="w-full min-h-[120px] p-3 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] font-mono text-[11px] placeholder-[var(--t3)] disabled:opacity-50 resize-vertical"
          />
        </label>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-2 rounded-lg bg-[var(--color-error-bg)] border border-[var(--color-error-border)]">
            <p className="text-[11px] text-[var(--color-error-text)]">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && (
          <div className="mb-4 p-2 rounded-lg bg-[var(--surface-low)] border border-[var(--surface-container)] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--color-info-text)] animate-pulse" />
            <p className="text-[11px] text-[var(--t3)]">AI is generating answer...</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] text-[12px] font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isGenerating || !answer.trim() || !!error}
            className="px-4 py-2 rounded-lg border-none bg-[var(--color-info-bg)] text-[var(--color-info-text)] text-[12px] font-bold cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : "Use This Answer"}
          </button>
        </div>
      </div>
    </div>
  )
}
