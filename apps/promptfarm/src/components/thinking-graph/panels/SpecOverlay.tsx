"use client"

import { useState } from "react"
import type { ProjectSpec, SpecSection } from "@/lib/thinking-graph/server/types"

const MONO = "var(--font-jetbrains-mono), monospace"
const SANS = "var(--font-manrope), system-ui, sans-serif"

function toLatinSlug(text: string, maxLen = 100): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .replace(/[а-яёА-ЯЁ]/g, (c) => {  // transliterate cyrillic
      const map: Record<string, string> = {
        а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",
        к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
        х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
      }
      return map[c.toLowerCase()] ?? ""
    })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen)
}

function buildSpecMarkdown(spec: ProjectSpec): string {
  const lines: string[] = []
  lines.push(`# Project Spec`)
  lines.push(``)
  lines.push(`**Idea:** ${spec.ideaPrompt}`)
  lines.push(`**Generated:** ${spec.generatedAt}`)
  lines.push(`**All gaps closed:** ${spec.allClosed ? "yes" : "no"}`)
  lines.push(``)

  for (const section of spec.sections) {
    lines.push(`## ${section.agentName}`)
    lines.push(``)
    if (section.content) {
      lines.push(section.content)
      lines.push(``)
    }
    if (section.decisions.length > 0) {
      lines.push(`### Decisions`)
      for (const d of section.decisions) {
        const tag = d.chosenBy === "ai_default" ? " *(AI default)*" : ""
        lines.push(`- **${d.title}:** ${d.chosenOption}${tag}`)
      }
      lines.push(``)
    }
    if (section.filledByAI.length > 0) {
      lines.push(`### AI-filled gaps`)
      for (const item of section.filledByAI) {
        lines.push(`- ✦ ${item}`)
      }
      lines.push(``)
    }
    if (section.openQuestions.length > 0) {
      lines.push(`### Open questions`)
      for (const q of section.openQuestions) {
        lines.push(`- ? ${q}`)
      }
      lines.push(``)
    }
  }

  return lines.join("\n")
}

function downloadSpecMarkdown(spec: ProjectSpec): void {
  const slug = toLatinSlug(spec.ideaPrompt) || "spec"
  const ts = new Date(spec.generatedAt)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15)
  const filename = `${slug}_${ts}.md`
  const content = buildSpecMarkdown(spec)
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function SectionCard({ section }: { section: SpecSection }) {
  const [expanded, setExpanded] = useState(true)
  const hasAiFilled = section.filledByAI.length > 0
  const hasDecisions = section.decisions.length > 0

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        background: "var(--surface-low)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--on-surface)",
              fontFamily: MONO,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {section.agentName}
          </span>
          {section.readyForPlan && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(52,211,153,0.15)",
                color: "#34d399",
                fontFamily: MONO,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              ready
            </span>
          )}
          {hasAiFilled && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(251,191,36,0.15)",
                color: "#fbbf24",
                fontFamily: MONO,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              AI filled
            </span>
          )}
        </div>
        <span style={{ color: "var(--t3)", fontSize: 10, fontFamily: MONO }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Content */}
          {section.content && (
            <p
              style={{
                fontSize: 12,
                color: "var(--on-surface-variant)",
                lineHeight: 1.7,
                fontFamily: SANS,
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {section.content}
            </p>
          )}

          {/* Decisions */}
          {hasDecisions && (
            <div>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  marginBottom: 6,
                  fontFamily: MONO,
                }}
              >
                Decisions
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.decisions.map((d) => (
                  <div
                    key={d.decisionId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 12,
                      fontFamily: SANS,
                    }}
                  >
                    <span style={{ color: "var(--t3)", flexShrink: 0 }}>•</span>
                    <span style={{ color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--on-surface)", fontWeight: 500 }}>
                        {d.title}:
                      </span>{" "}
                      {d.chosenOption}
                      {d.chosenBy === "ai_default" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: "rgba(251,191,36,0.15)",
                            color: "#fbbf24",
                            fontFamily: MONO,
                            verticalAlign: "middle",
                          }}
                        >
                          AI default
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI-filled gaps */}
          {hasAiFilled && (
            <div>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "#fbbf24",
                  marginBottom: 6,
                  fontFamily: MONO,
                  opacity: 0.8,
                }}
              >
                AI-filled gaps
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.filledByAI.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 12,
                      fontFamily: SANS,
                      padding: "6px 10px",
                      borderRadius: 5,
                      background: "rgba(251,191,36,0.06)",
                      border: "1px solid rgba(251,191,36,0.15)",
                    }}
                  >
                    <span style={{ color: "#fbbf24", flexShrink: 0, fontSize: 10 }}>✦</span>
                    <span style={{ color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining open questions (shouldn't exist after buildSpec, but just in case) */}
          {section.openQuestions.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "#f87171",
                  marginBottom: 6,
                  fontFamily: MONO,
                  opacity: 0.8,
                }}
              >
                Still open
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.openQuestions.map((q, idx) => (
                  <p
                    key={idx}
                    style={{
                      fontSize: 12,
                      color: "#f87171",
                      fontFamily: SANS,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    ? {q}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SpecOverlay({
  spec,
  loading = false,
  onClose,
}: {
  spec: ProjectSpec | null
  loading?: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.55)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          width: "min(600px, 92vw)",
          background: "var(--surface)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 9,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--t3)",
                fontFamily: MONO,
                marginBottom: 3,
              }}
            >
              {loading ? "Building Spec..." : "Project Spec"}
            </p>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: loading ? "var(--t3)" : "var(--on-surface)",
                fontFamily: SANS,
                margin: 0,
                maxWidth: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {spec?.ideaPrompt || "Analysing project..."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {spec && !loading && (
              <button
                type="button"
                onClick={() => downloadSpecMarkdown(spec)}
                style={{
                  background: "none",
                  border: "1px solid rgba(251,191,36,0.3)",
                  borderRadius: 5,
                  cursor: "pointer",
                  color: "#fbbf24",
                  fontSize: 10,
                  fontFamily: MONO,
                  fontWeight: 600,
                  padding: "4px 10px",
                  letterSpacing: "0.5px",
                }}
              >
                ↓ .md
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--t3)",
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {loading ? (
          /* Loading state */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: 32,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "2px solid rgba(251,191,36,0.15)",
                borderTopColor: "#fbbf24",
                animation: "spin 0.9s linear infinite",
              }}
            />
            <p style={{ fontSize: 11, color: "var(--t3)", fontFamily: MONO, textAlign: "center" }}>
              Filling gaps with AI defaults...
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : spec ? (
          <>
            {/* Meta row */}
            <div
              style={{
                padding: "8px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                gap: 16,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: MONO }}>
                {spec.sections.length} sections
              </span>
              <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: MONO }}>
                {spec.sections.filter((s) => s.filledByAI.length > 0).length} AI-filled
              </span>
              {spec.allClosed && (
                <span style={{ fontSize: 10, color: "#34d399", fontFamily: MONO }}>
                  all gaps closed
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: MONO, marginLeft: "auto" }}>
                {new Date(spec.generatedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Sections scroll area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {spec.sections.map((section) => (
                <SectionCard key={section.agentId} section={section} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
