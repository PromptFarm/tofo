import type { SyntheticNode } from "@/lib/planning/types";
import type { RunSummaryReport, SyntheticOutputJson } from "./server/types";
import { deriveAgentCardViewModel } from "@/components/thinking-graph/OutcomeReport.utils";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function verdictColor(verdict: string): string {
  if (verdict === "go") return "#34d399";
  if (verdict === "no_go") return "#f87171";
  return "#fbbf24";
}

function statusColor(tier: string): string {
  if (tier === "ready") return "#34d399";
  if (tier === "blocked" || tier === "conflict") return "#f87171";
  if (tier === "decision") return "#60a5fa";
  return "#9ca3af";
}

export function exportReportAsHtml(input: {
  ideaPrompt: string;
  synthetics: SyntheticNode[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  summaryReport: RunSummaryReport;
  runVersionLabel?: string;
}): void {
  const { ideaPrompt, synthetics, outputsBySyntheticId, summaryReport, runVersionLabel } = input;

  const verdictCfg = {
    go: { label: "Go", icon: "●" },
    no_go: { label: "No-Go", icon: "●" },
    conditional: { label: "Conditional", icon: "◐" },
  };

  const overallVerdict = summaryReport.overallVerdict ?? "conditional";
  const overallLabel = verdictCfg[overallVerdict as keyof typeof verdictCfg]?.label ?? overallVerdict;

  const agentRows = synthetics.map((s) => {
    const output = outputsBySyntheticId[s.id] ?? null;
    const vm = deriveAgentCardViewModel(output);
    return { name: s.name, code: s.code, vm };
  });

  const allFindings: Array<{ agent: string; text: string }> = [];
  const allRisks: Array<{ agent: string; text: string }> = [];

  for (const s of synthetics) {
    const out = outputsBySyntheticId[s.id];
    if (!out || !("operational" in out) || !out.operational) continue;
    for (const assumption of out.operational.acceptedAssumptions ?? []) {
      allFindings.push({ agent: s.name, text: `Assumption: ${assumption}` });
    }
    for (const f of out.operational.findings ?? []) {
      allFindings.push({ agent: s.name, text: f });
    }
    if ("appliedInputs" in out) {
      for (const appliedInput of out.appliedInputs ?? []) {
        allFindings.push({ agent: s.name, text: `Applied input: ${appliedInput}` });
      }
    }
    for (const r of out.operational.risks ?? []) {
      const text = typeof r === "string" ? r : (r as { description?: string }).description ?? "";
      if (text) allRisks.push({ agent: s.name, text });
    }
  }

  const agentCardsHtml = agentRows
    .map(
      ({ name, code, vm }) => `
    <div class="card">
      <div class="card-header">
        <span class="code">${esc(code)}</span>
        <span class="agent-name">${esc(name)}</span>
        <span class="badge" style="color:${statusColor(vm.statusTier)};border-color:${statusColor(vm.statusTier)}33;background:${statusColor(vm.statusTier)}11">${esc(vm.readiness ?? vm.statusTier)}</span>
      </div>
      ${vm.summary ? `<p class="card-summary">${esc(vm.summary)}</p>` : ""}
      ${vm.action ? `<p class="card-action">→ ${esc(vm.action)}</p>` : ""}
    </div>`,
    )
    .join("");

  const findingsHtml =
    allFindings.length > 0
      ? allFindings
          .map(
            (f) =>
              `<li><span class="agent-tag">${esc(f.agent)}</span> ${esc(f.text)}</li>`,
          )
          .join("")
      : "<li class='muted'>No findings.</li>";

  const risksHtml =
    allRisks.length > 0
      ? allRisks
          .map(
            (r) =>
              `<li><span class="agent-tag">${esc(r.agent)}</span> ${esc(r.text)}</li>`,
          )
          .join("")
      : "<li class='muted'>No risks flagged.</li>";

  const now = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Run Report${runVersionLabel ? ` · ${runVersionLabel}` : ""}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f7f9fb; color: #2a3439; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; padding: 32px 16px; }
  .container { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }
  .header { border-bottom: 1px solid #e8eff3; padding-bottom: 20px; }
  .label { font-family: monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #566166; margin-bottom: 6px; }
  h1 { font-size: 22px; font-weight: 700; color: #2a3439; line-height: 1.25; }
  .meta { font-size: 11px; color: #566166; margin-top: 4px; font-family: monospace; }
  .verdict-bar { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .verdict-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; border: 1px solid; }
  .section-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #566166; font-family: monospace; margin-bottom: 12px; }
  .cards { display: flex; flex-direction: column; gap: 10px; }
  .card { background: #ffffff; border: 1px solid #e8eff3; border-radius: 8px; padding: 14px 16px; }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  .code { font-family: monospace; font-size: 10px; background: #d8e2ff; color: #005ac2; padding: 2px 6px; border-radius: 4px; }
  .agent-name { font-size: 13px; font-weight: 600; color: #2a3439; flex: 1; }
  .badge { font-size: 10px; font-family: monospace; padding: 2px 8px; border-radius: 20px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
  .card-summary { font-size: 13px; color: #566166; margin-bottom: 4px; }
  .card-action { font-size: 12px; color: #8a9299; font-style: italic; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #566166; line-height: 1.5; }
  .agent-tag { font-family: monospace; font-size: 10px; background: #f0f4f7; color: #566166; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
  .muted { color: #8a9299; font-style: italic; }
  .footer { font-size: 11px; color: #8a9299; font-family: monospace; border-top: 1px solid #e8eff3; padding-top: 16px; }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <p class="label">Run Report${runVersionLabel ? ` · ${runVersionLabel}` : ""}</p>
    <h1>${esc(ideaPrompt) || "Thinking Graph Report"}</h1>
    <p class="meta">Exported ${now}</p>
    <div class="verdict-bar">
      <span class="verdict-badge" style="color:${verdictColor(overallVerdict)};border-color:${verdictColor(overallVerdict)}44;background:${verdictColor(overallVerdict)}11">
        ● ${esc(overallLabel)}
      </span>
      ${summaryReport.overallCondition ? `<span style="font-size:13px;color:#566166">${esc(summaryReport.overallCondition)}</span>` : ""}
    </div>
  </div>

  <section>
    <p class="section-title">Agent Verdicts</p>
    <div class="cards">${agentCardsHtml}</div>
  </section>

  ${
    allFindings.length > 0
      ? `<section>
    <p class="section-title">Findings</p>
    <ul>${findingsHtml}</ul>
  </section>`
      : ""
  }

  ${
    allRisks.length > 0
      ? `<section>
    <p class="section-title">Risks</p>
    <ul>${risksHtml}</ul>
  </section>`
      : ""
  }

  <div class="footer">PromptFarm · Run Report</div>

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
