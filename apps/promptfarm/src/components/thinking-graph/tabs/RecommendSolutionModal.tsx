"use client";

import { useEffect, useState } from "react";
import { generateRiskProposal, appendProposedImprovement } from "@/lib/thinking-graph/client";
import type { ProposedImprovement } from "@/lib/thinking-graph/server/types";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";

export function RecommendSolutionModal({
  synthetic,
  risk,
  priorRisk,
  sessionId,
  proposedImprovements = [],
  onSubmit,
  onClose,
}: {
  synthetic: { id: string; name: string }
  risk: string
  priorRisk: number
  sessionId: string
  proposedImprovements?: ProposedImprovement[]
  onSubmit?: (payload: SyntheticGraphPayload) => void
  onClose: () => void
}) {
  const [proposal, setProposal] = useState("")
  const [isGenerating, setIsGenerating] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetRisk = 40

  useEffect(() => {
    const generateProposal = async () => {
      try {
        // Check if a proposal already exists for this synthetic + risk
        const existing = proposedImprovements.find(
          (p) => p.syntheticId === synthetic.id && p.riskDescription === risk
        )

        console.log("[Modal] proposedImprovements:", proposedImprovements, "existing:", existing);

        if (existing) {
          // Use existing proposal, don't regenerate
          console.log("[Modal] Using cached proposal:", existing.proposal);
          setProposal(existing.proposal)
          setIsGenerating(false)
          return
        }

        console.log("[Modal] No cache found, generating...");
        setIsGenerating(true)
        setError(null)
        const generated = await generateRiskProposal({
          sessionId,
          syntheticId: synthetic.id,
          riskDescription: risk,
          currentRisk: priorRisk,
        })
        setProposal(generated)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate proposal"
        setError(message)
        setProposal("")
      } finally {
        setIsGenerating(false)
      }
    }

    generateProposal()
  }, [sessionId, synthetic.id, risk, priorRisk, proposedImprovements])

  const handleSubmit = async () => {
    if (!proposal.trim()) return
    setIsSubmitting(true)
    try {
      const updatedPayload = await appendProposedImprovement({
        sessionId,
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        riskDescription: risk,
        proposal,
        priorRisk,
      })

      // Update parent AND manually set proposals in modal before closing
      // This ensures if user opens modal again, proposals are in cache
      setProposal("")
      onSubmit?.(updatedPayload)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save proposal"
      setError(message)
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
        className="bg-[var(--surface-high)] rounded-[12px] border border-[var(--surface-container)] p-6 max-w-[500px] w-[90%] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[var(--text-title)] font-bold text-[18px] text-[var(--on-surface)] mb-2">
          Recommend Solution
        </h2>
        <p className="text-[var(--text-caption)] text-[var(--on-surface-variant)] mb-4">
          <strong>{synthetic.name}</strong> — {risk}
        </p>

        {/* Delta badge */}
        <div className="mb-4 p-3 rounded-lg bg-[var(--surface-low)] border border-[var(--surface-container)]">
          <p className="text-[11px] font-mono text-[var(--t3)] mb-2">Expected Improvement:</p>
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold font-mono text-[var(--color-error-text)]">
              {priorRisk}%
            </span>
            <span className="text-[var(--t3)]">→</span>
            <span className="text-[14px] font-bold font-mono text-[var(--color-success-text)]">
              ~{targetRisk}%
            </span>
            <span className="text-[11px] text-[var(--t3)]">(−{priorRisk - targetRisk} pts)</span>
          </div>
        </div>

        {/* Textarea */}
        <label className="block mb-4">
          <p className="text-[var(--text-label)] text-[var(--on-surface)] mb-2 font-medium text-[12px]">
            Proposed solution
          </p>
          <textarea
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="Describe how to address this risk..."
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
            <p className="text-[11px] text-[var(--t3)]">AI is generating solution...</p>
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
            disabled={isSubmitting || isGenerating || !proposal.trim() || !!error}
            className="px-4 py-2 rounded-lg border-none bg-[var(--color-info-bg)] text-[var(--color-info-text)] text-[12px] font-bold cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : "Save Solution"}
          </button>
        </div>
      </div>
    </div>
  )
}
