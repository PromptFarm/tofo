import type {
  GeneratedPlanOutput,
  PlanSprintGroup,
  PlanPhaseGroup,
  BacklogGroup,
  RoleGroup,
} from "./planTypes";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

const PRIORITY_MAP: Record<string, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

// ── Jira CSV ──────────────────────────────────────────────────────────────────
// Produces a CSV compatible with Jira's "External System Import → CSV" feature.
// Columns: Issue Type | Summary | Description | Priority | Story Points | Labels | Epic Link

const JIRA_HEADER = ["Issue Type", "Summary", "Description", "Priority", "Story Points", "Labels", "Epic Link"];

export function generateJiraCsv(plan: GeneratedPlanOutput): string {
  const rows: (string | number)[][] = [JIRA_HEADER];

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  if (plan.format === "sprints") {
    for (const sprint of (plan.groups as PlanSprintGroup[])) {
      rows.push([
        "Epic",
        sprint.title,
        sprint.goal ?? "",
        "Medium",
        sprint.total_points,
        "promptfarm",
        "",
      ]);
      for (const t of sprint.items) {
        rows.push([
          t.type.charAt(0).toUpperCase() + t.type.slice(1),
          t.title,
          t.description ?? "",
          "Medium",
          t.story_points,
          `promptfarm ${slug(t.source_synthetic)}`,
          sprint.title,
        ]);
      }
    }
  }

  if (plan.format === "phases") {
    for (const phase of (plan.groups as PlanPhaseGroup[])) {
      rows.push([
        "Epic",
        phase.title,
        phase.description ?? "",
        "Medium",
        "",
        "promptfarm",
        "",
      ]);
      for (const t of phase.items) {
        rows.push([
          t.type.charAt(0).toUpperCase() + t.type.slice(1),
          t.title,
          t.description ?? "",
          "Medium",
          t.story_points ?? "",
          `promptfarm ${slug(t.source_synthetic)}`,
          phase.title,
        ]);
      }
    }
  }

  if (plan.format === "backlog") {
    const items = ((plan.groups[0] as BacklogGroup | undefined)?.items ?? []);
    for (const t of items) {
      rows.push([
        t.type.charAt(0).toUpperCase() + t.type.slice(1),
        t.title,
        t.description ?? "",
        PRIORITY_MAP[t.priority] ?? "Medium",
        t.story_points,
        `promptfarm ${slug(t.source_synthetic)}`,
        "",
      ]);
    }
  }

  if (plan.format === "roles") {
    for (const group of (plan.groups as RoleGroup[])) {
      rows.push([
        "Epic",
        group.title,
        [
          group.inputs.length  > 0 ? `Receives: ${group.inputs.join(", ")}`  : "",
          group.outputs.length > 0 ? `Delivers: ${group.outputs.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        "Medium",
        group.items.reduce((a, t) => a + t.story_points, 0),
        "promptfarm",
        "",
      ]);
      for (const t of group.items) {
        rows.push([
          t.type.charAt(0).toUpperCase() + t.type.slice(1),
          t.title,
          t.description ?? "",
          "Medium",
          t.story_points,
          `promptfarm ${slug(group.title)}`,
          group.title,
        ]);
      }
    }
  }

  return rows.map(csvRow).join("\n");
}

// ── Notion Markdown ───────────────────────────────────────────────────────────
// Produces a Markdown file that Notion imports via File → Import → Markdown & CSV.

const TYPE_LABEL: Record<string, string> = { epic: "🟣 Epic", story: "🔵 Story", task: "◻️ Task" };
const PRIORITY_EMOJI: Record<string, string> = { high: "🔴", medium: "🟡", low: "⚪" };

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const header = rows[0]!;
  const divider = header.map(() => "---");
  return [header, divider, ...rows.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

export function generateNotionMarkdown(plan: GeneratedPlanOutput): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const FORMAT_LABELS: Record<string, string> = {
    sprints: "By Sprints",
    phases:  "By Phases",
    backlog: "Flat Backlog",
    roles:   "By Roles",
  };

  const lines: string[] = [];

  lines.push(`# ${plan.title || "Implementation Plan"}`);
  lines.push(`**${FORMAT_LABELS[plan.format] ?? plan.format}** · ${today}`);
  lines.push("");

  if (plan.summary) {
    lines.push(`> ${plan.summary}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  if (plan.format === "sprints") {
    for (const sprint of (plan.groups as PlanSprintGroup[])) {
      lines.push(`## ${sprint.title}`);
      if (sprint.goal) lines.push(`_${sprint.goal}_`);
      lines.push(`**${sprint.total_points} story points · ${sprint.items.length} tasks**`);
      lines.push("");
      lines.push(mdTable([
        ["Type", "Task", "Owner", "SP"],
        ...sprint.items.map((t) => [
          TYPE_LABEL[t.type] ?? t.type,
          t.title,
          t.source_synthetic,
          String(t.story_points),
        ]),
      ]));
      lines.push("");
    }
  }

  if (plan.format === "phases") {
    for (const phase of (plan.groups as PlanPhaseGroup[])) {
      const total = phase.items.reduce((a, t) => a + (t.story_points ?? 0), 0);
      lines.push(`## ${phase.title}`);
      if (phase.description) lines.push(phase.description);
      if (phase.exit_criteria) lines.push(`**Exit criteria:** ${phase.exit_criteria}`);
      if (total > 0) lines.push(`**${total} story points · ${phase.items.length} tasks**`);
      lines.push("");
      lines.push(mdTable([
        ["Type", "Task", "Owner", "SP"],
        ...phase.items.map((t) => [
          TYPE_LABEL[t.type] ?? t.type,
          t.title,
          t.source_synthetic,
          t.story_points != null ? String(t.story_points) : "—",
        ]),
      ]));
      lines.push("");
    }
  }

  if (plan.format === "backlog") {
    const items = ((plan.groups[0] as BacklogGroup | undefined)?.items ?? []);
    lines.push("## Backlog");
    lines.push("");
    lines.push(mdTable([
      ["Priority", "Type", "Task", "Owner", "SP"],
      ...items.map((t) => [
        `${PRIORITY_EMOJI[t.priority] ?? ""} ${PRIORITY_MAP[t.priority] ?? t.priority}`,
        TYPE_LABEL[t.type] ?? t.type,
        t.title,
        t.source_synthetic,
        String(t.story_points),
      ]),
    ]));
    lines.push("");
  }

  if (plan.format === "roles") {
    for (const group of (plan.groups as RoleGroup[])) {
      const total = group.items.reduce((a, t) => a + t.story_points, 0);
      lines.push(`## ${group.title}`);
      if (group.inputs.length > 0)  lines.push(`**Receives:** ${group.inputs.join(", ")}`);
      if (group.outputs.length > 0) lines.push(`**Delivers:** ${group.outputs.join(", ")}`);
      lines.push(`**${total} story points · ${group.items.length} tasks**`);
      lines.push("");
      lines.push(mdTable([
        ["Type", "Task", "SP"],
        ...group.items.map((t) => [
          TYPE_LABEL[t.type] ?? t.type,
          t.title,
          String(t.story_points),
        ]),
      ]));
      lines.push("");
    }
  }

  return lines.join("\n");
}
