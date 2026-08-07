"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

type DeleteRoleDialogProps = {
  open: boolean
  roleName?: string
  linkedEdgeCount: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteRoleDialog({
  open,
  roleName,
  linkedEdgeCount,
  onOpenChange,
  onConfirm,
}: DeleteRoleDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <DialogPrimitive.Popup
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            zIndex: 50,
            width: "min(26rem, calc(100% - 2rem))",
            transform: "translate(-50%, -50%)",
            borderRadius: 10,
            border: "1px solid var(--surface-container)",
            background: "var(--surface-lowest)",
            padding: 20,
          }}
        >
          <DialogPrimitive.Title
            style={{
              fontFamily: "var(--font-manrope), sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--on-surface)",
            }}
          >
            Delete Role
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--on-surface-variant)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
            }}
          >
            {roleName
              ? `Remove "${roleName}" and ${linkedEdgeCount} linked connection(s)?`
              : "Remove selected role and linked connections?"}
          </DialogPrimitive.Description>
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 6,
                border: "1px solid var(--surface-container)",
                background: "none",
                fontSize: 10,
                color: "var(--on-surface-variant)",
                cursor: "pointer",
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 6,
                background: "var(--danger-bg)",
                border: "1px solid rgba(248,113,113,0.35)",
                color: "var(--danger-text)",
                fontSize: 10,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
              onClick={onConfirm}
            >
              Delete
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
