"use client";

import { useState, useEffect } from "react";
import { Check, Upload, X, ExternalLink } from "lucide-react";
import { hexRgba } from "@/components/project-screen/tagColors";
import type { GeneratedPlanOutput, PlanFormatId } from "@/lib/thinking-graph/plan/planTypes";
import { generateJiraCsv } from "@/lib/thinking-graph/plan/planExportGenerators";

const EXPORT_TARGETS = [
  { id: "jira",   label: "Jira",   color: "#0052CC" },
  { id: "notion", label: "Notion", color: "#8b5cf6" },
  { id: "pdf",    label: "PDF",    color: "#6b7280" },
] as const;

type ExportTarget = typeof EXPORT_TARGETS[number];
type ExportState = "idle" | "loading" | "done";

const JIRA_META = {
  items: ["All tasks as Jira issues", "Epic / Story / Task hierarchy", "Story points per issue", "Owner as label"],
  hint: "Downloads a .csv file. Go to Jira → Projects → Import → CSV to upload.",
};
const PDF_META = {
  items: ["All tasks with descriptions", "Full plan layout", "Story points and types", "Owners from synthetic team"],
  hint: "",
};

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Notion form ────────────────────────────────────────────────────────────────

function NotionExportBody({ plan, onClose }: { plan: GeneratedPlanOutput; onClose: () => void }) {
  const [token,  setToken]  = useState("");
  const [pageId, setPageId] = useState("");
  const [state,  setState]  = useState<"idle" | "loading" | "done" | "error">("idle");
  const [pageUrl,   setPageUrl]   = useState("");
  const [errorMsg,  setErrorMsg]  = useState("");

  useEffect(() => {
    setToken(localStorage.getItem("pf_notion_token") ?? "");
    setPageId(localStorage.getItem("pf_notion_page")  ?? "");
  }, []);

  const handleExport = async () => {
    if (!token.trim() || !pageId.trim()) return;
    setState("loading");
    try {
      localStorage.setItem("pf_notion_token", token.trim());
      localStorage.setItem("pf_notion_page",  pageId.trim());
      const res = await fetch("/api/thinking-graph/export/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, accessToken: token.trim(), pageId: pageId.trim() }),
      });
      const data = await res.json() as { pageUrl?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Export failed");
      setPageUrl(data.pageUrl ?? "");
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Export failed");
      setState("error");
    }
  };

  const inputCls = "w-full px-3 py-[7px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--on-surface)] placeholder:text-[var(--t3)] outline-none focus:border-[var(--primary-border)] font-[var(--font-jetbrains-mono)] transition-colors";
  const labelCls = "block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--t3)] mb-[5px]";

  if (state === "done") {
    return (
      <>
        <div className="px-5 py-6 flex flex-col items-center gap-3 text-center">
          <div className="w-[44px] h-[44px] rounded-full flex items-center justify-center" style={{ background: "#d1fae5" }}>
            <Check size={20} style={{ color: "#065f46" }} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-[var(--on-surface)] mb-1">Plan exported to Notion!</div>
            <div className="text-[12px] text-[var(--t3)]">A new page with a task database was created.</div>
          </div>
          {pageUrl && (
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-[6px] px-4 py-[7px] rounded-[8px] border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[12px] font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              <ExternalLink size={12} />
              View in Notion
            </a>
          )}
        </div>
        <div className="px-5 pb-[18px] flex justify-end">
          <button type="button" onClick={onClose} className="px-[18px] py-[7px] rounded-[8px] border-none text-white text-[12px] font-semibold font-[var(--font-body)]" style={{ background: "#10b981" }}>
            Done
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="px-5 py-4 flex flex-col gap-4">
        <div>
          <label className={labelCls}>Integration Token</label>
          <input
            type="password"
            className={inputCls}
            placeholder="secret_xxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={state === "loading"}
          />
          <p className="mt-[5px] text-[10px] text-[var(--t3)] leading-[1.55]">
            Create at <span className="text-[var(--on-surface-variant)]">notion.so/my-integrations</span> → New integration → copy the token.
          </p>
        </div>
        <div>
          <label className={labelCls}>Parent Page ID</label>
          <input
            type="text"
            className={inputCls}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            disabled={state === "loading"}
          />
          <p className="mt-[5px] text-[10px] text-[var(--t3)] leading-[1.55]">
            Open the destination page in Notion → copy the 32-char ID from the URL. Share that page with your integration first.
          </p>
        </div>
        {state === "error" && (
          <p className="text-[11px] text-[#f87171] leading-[1.55]">{errorMsg}</p>
        )}
      </div>
      <div className="px-5 pb-[18px] flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="px-4 py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[var(--on-surface-variant)] text-[12px] font-medium cursor-pointer font-[var(--font-body)]">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={state === "loading" || !token.trim() || !pageId.trim()}
          className="px-[18px] py-[7px] rounded-[8px] border-none bg-[var(--primary)] text-white text-[12px] font-semibold cursor-pointer flex items-center gap-[6px] font-[var(--font-body)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "loading"
            ? <span className="w-[12px] h-[12px] border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Upload size={12} />}
          {state === "loading" ? "Exporting…" : "Export to Notion"}
        </button>
      </div>
    </>
  );
}

// ── Generic dialog ─────────────────────────────────────────────────────────────

function ExportDialog({ target, formatLabel, plan, onClose }: {
  target: ExportTarget;
  formatLabel: string;
  plan: GeneratedPlanOutput;
  onClose: () => void;
}) {
  const [state, setState] = useState<ExportState>("idle");
  const meta = target.id === "jira" ? JIRA_META : PDF_META;

  const handleExport = async () => {
    setState("loading");
    try {
      if (target.id === "jira") {
        downloadText(generateJiraCsv(plan), `plan-${plan.format}.csv`, "text/csv;charset=utf-8;");
        setState("done");
      } else if (target.id === "pdf") {
        const { generatePlanPdf } = await import("./PlanPdfDocument");
        const blob = await generatePlanPdf(plan);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `plan-${plan.format}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setState("done");
      }
    } catch {
      setState("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/65 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border-solid)] rounded-[16px] w-[440px] max-w-[calc(100vw-32px)] shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
          <div
            className="w-[36px] h-[36px] rounded-[9px] flex items-center justify-center text-[15px] font-extrabold font-[var(--font-head)]"
            style={{ background: hexRgba(target.color, 0.1), border: `0.5px solid ${hexRgba(target.color, 0.25)}`, color: target.color }}
          >
            {target.label[0]}
          </div>
          <div>
            <div className="font-[var(--font-head)] font-bold text-[14px] text-[var(--on-surface)]">Export to {target.label}</div>
            <div className="text-[11px] text-[var(--t3)]">{formatLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer p-1 flex items-center">
            <X size={14} />
          </button>
        </div>

        {target.id === "notion" ? (
          <NotionExportBody plan={plan} onClose={onClose} />
        ) : (
          <>
            <div className="px-5 py-4">
              <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--t3)] mb-[10px]">What will be exported</div>
              <div className="rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden">
                {meta.items.map((line, i) => (
                  <div
                    key={i}
                    className="px-[14px] py-[9px] flex items-center gap-[9px] text-[12px] text-[var(--on-surface-variant)]"
                    style={{ borderBottom: i < meta.items.length - 1 ? "0.5px solid var(--border)" : "none" }}
                  >
                    <Check size={12} className="shrink-0 text-[#10b981]" />
                    {line}
                  </div>
                ))}
              </div>
              {meta.hint !== "" && (
                <p className="mt-[10px] text-[11px] text-[var(--t3)] leading-[1.6]">{meta.hint}</p>
              )}
            </div>
            <div className="px-5 pb-[18px] flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-4 py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[var(--on-surface-variant)] text-[12px] font-medium cursor-pointer font-[var(--font-body)]">
                Cancel
              </button>
              {state === "done" ? (
                <button type="button" className="px-[18px] py-[7px] rounded-[8px] border-none text-white text-[12px] font-semibold flex items-center gap-[6px] font-[var(--font-body)]" style={{ background: "#10b981" }}>
                  <Check size={12} />Done
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={state === "loading"}
                  className="px-[18px] py-[7px] rounded-[8px] border-none bg-[var(--primary)] text-white text-[12px] font-semibold cursor-pointer flex items-center gap-[6px] font-[var(--font-body)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {state === "loading"
                    ? <span className="w-[12px] h-[12px] border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Upload size={12} />}
                  {state === "loading" ? "Generating…" : "Export"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ExportBar({ format, formatLabel, plan }: {
  format: PlanFormatId;
  formatLabel: string;
  plan: GeneratedPlanOutput;
}) {
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  return (
    <>
      <div className="pt-[14px] pb-[2px] flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--t3)]">Export</span>
        <div className="flex gap-[7px] flex-wrap">
          {EXPORT_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setExportTarget(t)}
              className="flex items-center gap-[7px] px-[13px] py-[6px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--on-surface-variant)] text-[12px] font-medium cursor-pointer hover:border-[var(--border-solid)] hover:bg-[var(--surface-2)] transition-all font-[var(--font-body)]"
            >
              <span
                className="w-[16px] h-[16px] rounded-[4px] flex items-center justify-center text-[9px] font-extrabold font-[var(--font-head)]"
                style={{ background: hexRgba(t.color, 0.13), border: `0.5px solid ${hexRgba(t.color, 0.3)}`, color: t.color }}
              >
                {t.label[0]}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {exportTarget != null && (
        <ExportDialog
          target={exportTarget}
          formatLabel={formatLabel}
          plan={plan}
          onClose={() => setExportTarget(null)}
        />
      )}
    </>
  );
}
