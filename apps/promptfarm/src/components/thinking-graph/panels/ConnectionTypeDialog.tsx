"use client"

import type { SyntheticEdge } from "@/lib/planning/types"

type EdgeTypeOption = {
  type: SyntheticEdge["type"]
  label: string
  description: string
  color: string
}

type ConnectionTypeDialogProps = {
  open: boolean
  options: EdgeTypeOption[]
  onClose: () => void
  onConfirm: (type: SyntheticEdge["type"]) => void
}

export function ConnectionTypeDialog({
  open,
  options,
  onClose,
  onConfirm,
}: ConnectionTypeDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(22rem, calc(100% - 2rem))",
          borderRadius: 10,
          border: "1px solid var(--surface-container)",
          background: "var(--surface-lowest)",
          padding: 20,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--on-surface)",
            fontFamily: "var(--font-manrope), sans-serif",
            marginBottom: 5,
          }}
        >
          What is the relationship?
        </p>
        <p
          style={{
            fontSize: 10,
            color: "var(--on-surface-variant)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Choose how these two roles are connected.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {options.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => onConfirm(option.type)}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = `${option.color}66`
                event.currentTarget.style.background = `${option.color}12`
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor =
                  "var(--surface-container)"
                event.currentTarget.style.background = "var(--surface-low)"
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--surface-container)",
                background: "var(--surface-low)",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.12s, background 0.12s",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: option.color,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <div>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--on-surface)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  {option.label}
                </p>
                <p
                  style={{
                    fontSize: 9,
                    color: "var(--on-surface-variant)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    marginTop: 3,
                    lineHeight: 1.55,
                  }}
                >
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 12,
            width: "100%",
            height: 30,
            borderRadius: 6,
            border: "1px solid var(--surface-container)",
            background: "none",
            fontSize: 10,
            color: "var(--on-surface-variant)",
            cursor: "pointer",
            fontFamily: "var(--font-jetbrains-mono), monospace",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
