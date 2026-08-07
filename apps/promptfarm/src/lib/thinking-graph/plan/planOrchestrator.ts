import "server-only";

import { createModelProvider } from "../server/modelProvider";
import { getThinkingGraphRuntimeConfig } from "../server/config";
import { buildPlanSystemPrompt, buildPlanUserMessage } from "./planOrchestratorPrompt";
import type {
  PlanInput,
  GeneratedPlanOutput,
  PlanFormatId,
  PlanTaskItem,
  PlanStoryPoints,
  SprintItemDependent,
  SprintPlanOutput,
  PhaseItemDependent,
  PhasesPlanOutput,
  BacklogItemDependent,
  BacklogPlanOutput,
  RoleItemDependent,
  RolesPlanOutput,
} from "./planTypes";

// ── JSON parsing ───────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const trimmed = text.trim();
  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  // First { … last }
  const start = trimmed.indexOf("{");
  const end   = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);
  return trimmed;
}

// ── Output normalisation ───────────────────────────────────────────────────────

const VALID_SP         = new Set<number>([1, 2, 3, 5, 8, 13]);
const VALID_ITEM_TYPES = new Set(["epic", "story", "task"]);
const MAX_RETRIES      = 2;

function createPlanResponseSchema(format: PlanFormatId): Record<string, unknown> {
  const planStoryPoints = { type: "number", enum: [1, 2, 3, 5, 8, 13] };
  const planStoryPointsOrEmpty = {
    anyOf: [
      planStoryPoints,
      { type: "string", enum: [""] },
    ],
  };
  const stringArray = {
    type: "array",
    items: { type: "string" },
  };

  const taskBase = {
    type: "object",
    properties: {
      id: { type: "string" },
      type: { type: "string", enum: ["epic", "story", "task"] },
      title: { type: "string" },
      description: { type: "string" },
      story_points: planStoryPoints,
      source_synthetic: { type: "string" },
      role: { type: "string" },
    },
    required: ["id", "type", "title", "description", "story_points", "source_synthetic", "role"],
    additionalProperties: false,
  };

  if (format === "sprints") {
    return {
      type: "object",
      properties: {
        format: { type: "string", enum: ["sprints"] },
        title: { type: "string" },
        summary: { type: "string" },
        generated_from_iteration: { type: "number" },
        velocity_assumption: { type: "number" },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              goal: { type: "string" },
              duration_weeks: { type: "number" },
              total_points: { type: "number" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ...(taskBase.properties as Record<string, unknown>),
                    assignee_role: { type: "string" },
                    depends_on: stringArray,
                  },
                  required: taskBase.required as string[],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "title", "goal", "duration_weeks", "total_points", "items"],
            additionalProperties: false,
          },
        },
      },
      required: ["format", "title", "summary", "generated_from_iteration", "velocity_assumption", "groups"],
      additionalProperties: false,
    };
  }

  if (format === "phases") {
    return {
      type: "object",
      properties: {
        format: { type: "string", enum: ["phases"] },
        title: { type: "string" },
        summary: { type: "string" },
        generated_from_iteration: { type: "number" },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              exit_criteria: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["epic", "story", "task"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    story_points: planStoryPointsOrEmpty,
                    source_synthetic: { type: "string" },
                    role: { type: "string" },
                    depends_on: stringArray,
                  },
                  required: ["id", "type", "title", "description", "story_points", "source_synthetic", "role"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "title", "description", "exit_criteria", "items"],
            additionalProperties: false,
          },
        },
      },
      required: ["format", "title", "summary", "generated_from_iteration", "groups"],
      additionalProperties: false,
    };
  }

  if (format === "backlog") {
    return {
      type: "object",
      properties: {
        format: { type: "string", enum: ["backlog"] },
        title: { type: "string" },
        summary: { type: "string" },
        generated_from_iteration: { type: "number" },
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ...(taskBase.properties as Record<string, unknown>),
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    depends_on: stringArray,
                  },
                  required: [...(taskBase.required as string[]), "priority"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "title", "items"],
            additionalProperties: false,
          },
        },
      },
      required: ["format", "title", "summary", "generated_from_iteration", "groups"],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties: {
      format: { type: "string", enum: ["roles"] },
      title: { type: "string" },
      summary: { type: "string" },
      generated_from_iteration: { type: "number" },
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            synthetic_id: { type: "string" },
            execution_mode: { type: "string", enum: ["human", "agent"] },
            inputs: stringArray,
            outputs: stringArray,
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["story", "task"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  story_points: planStoryPoints,
                  source_synthetic: { type: "string" },
                  role: { type: "string" },
                  inputs: stringArray,
                  outputs: stringArray,
                  depends_on: stringArray,
                },
                required: ["id", "type", "title", "description", "story_points", "source_synthetic", "role"],
                additionalProperties: false,
              },
            },
          },
          required: ["id", "title", "synthetic_id", "execution_mode", "inputs", "outputs", "items"],
          additionalProperties: false,
        },
      },
    },
    required: ["format", "title", "summary", "generated_from_iteration", "groups"],
    additionalProperties: false,
  };
}

function normaliseTask(t: Record<string, unknown>, idx: number): PlanTaskItem {
  const sp = Number(t.story_points);
  return {
    id:               typeof t.id === "string" && t.id ? t.id : `task-${idx}`,
    type:             (["epic", "story", "task"] as const).includes(t.type as "epic") ? (t.type as PlanTaskItem["type"]) : "task",
    title:            typeof t.title === "string" ? t.title.slice(0, 80) : "",
    description:      typeof t.description === "string" ? t.description.slice(0, 300) : "",
    story_points:     (VALID_SP.has(sp) ? sp : 3) as PlanStoryPoints,
    source_synthetic: typeof t.source_synthetic === "string" ? t.source_synthetic : "",
    role:             typeof t.role === "string" ? t.role : "",
  };
}

function normaliseSprintItems(raw: unknown): SprintItemDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const base = normaliseTask(t as Record<string, unknown>, i);
    const item = t as Record<string, unknown>;
    return {
      ...base,
      assignee_role: typeof item.assignee_role === "string" && item.assignee_role ? item.assignee_role : undefined,
      depends_on: Array.isArray(item.depends_on)
        ? (item.depends_on as unknown[]).filter((d): d is string => typeof d === "string")
        : undefined,
    };
  });
}

function normalisePhaseItems(raw: unknown): PhaseItemDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const item = t as Record<string, unknown>;
    const sp = Number(item.story_points);
    return {
      id:               typeof item.id               === "string" && item.id ? item.id : `item-${i}`,
      type:             (["epic", "story", "task"] as const).includes(item.type as "epic") ? (item.type as PlanTaskItem["type"]) : "task",
      title:            typeof item.title            === "string" ? item.title.slice(0, 80) : "",
      description:      typeof item.description      === "string" ? item.description.slice(0, 300) : "",
      story_points:     VALID_SP.has(sp) ? sp as PlanStoryPoints : undefined,
      source_synthetic: typeof item.source_synthetic === "string" ? item.source_synthetic : "",
      role:             typeof item.role             === "string" ? item.role : "",
      depends_on:       Array.isArray(item.depends_on)
        ? (item.depends_on as unknown[]).filter((d): d is string => typeof d === "string")
        : undefined,
    };
  });
}

const VALID_BACKLOG_PRIORITIES = new Set(["high", "medium", "low"]);

function normaliseBacklogItems(raw: unknown): BacklogItemDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const base = normaliseTask(t as Record<string, unknown>, i);
    const item = t as Record<string, unknown>;
    const rawPriority = item.priority as string;
    // Map legacy "critical" to "high"; default unknowns to "medium"
    const priority = rawPriority === "critical" ? "high"
      : VALID_BACKLOG_PRIORITIES.has(rawPriority) ? rawPriority as BacklogItemDependent["priority"]
      : "medium";
    return {
      ...base,
      priority,
      depends_on: Array.isArray(item.depends_on)
        ? (item.depends_on as unknown[]).filter((d): d is string => typeof d === "string")
        : undefined,
    };
  });
}

function normaliseRoleItems(raw: unknown): RoleItemDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const item = t as Record<string, unknown>;
    const sp = Number(item.story_points);
    const strings = (arr: unknown) =>
      Array.isArray(arr) ? (arr as unknown[]).filter((d): d is string => typeof d === "string") : undefined;
    return {
      id:               typeof item.id               === "string" && item.id ? item.id : `item-${i}`,
      // Epics are not allowed — map to "story"
      type:             item.type === "task" ? "task" : "story" as RoleItemDependent["type"],
      title:            typeof item.title            === "string" ? item.title.slice(0, 80) : "",
      description:      typeof item.description      === "string" ? item.description.slice(0, 300) : "",
      story_points:     (VALID_SP.has(sp) ? sp : 3) as PlanStoryPoints,
      source_synthetic: typeof item.source_synthetic === "string" ? item.source_synthetic : "",
      role:             typeof item.role             === "string" ? item.role : "",
      inputs:           strings(item.inputs),
      outputs:          strings(item.outputs),
      depends_on:       strings(item.depends_on),
    };
  });
}

function normaliseOutput(raw: unknown, format: PlanFormatId): GeneratedPlanOutput {
  const r = (raw as Record<string, unknown>) ?? {};
  const title = typeof r.title === "string" ? r.title : "Implementation Plan";

  if (format === "sprints") {
    const velocity = typeof r.velocity_assumption === "number" ? r.velocity_assumption : 20;
    const groups = Array.isArray(r.groups)
      ? r.groups.map((g: Record<string, unknown>, gi: number) => {
          const items = normaliseSprintItems(g.items);
          return {
            id:             typeof g.id             === "string" ? g.id             : `sprint_${gi + 1}`,
            title:          typeof g.title          === "string" ? g.title          : `Sprint ${gi + 1}`,
            goal:           typeof g.goal           === "string" ? g.goal           : "",
            duration_weeks: typeof g.duration_weeks === "number" ? g.duration_weeks : 2,
            // Always recompute from items so total_points is always consistent
            total_points:   items.reduce((s, i) => s + i.story_points, 0),
            items,
          };
        })
      : [];
    return {
      format: "sprints",
      title,
      summary:                  typeof r.summary                  === "string" ? r.summary                  : "",
      generated_from_iteration: typeof r.generated_from_iteration === "number" ? r.generated_from_iteration : 1,
      velocity_assumption:      velocity,
      groups,
    };
  }

  if (format === "phases") {
    const groups = Array.isArray(r.groups)
      ? r.groups.map((g: Record<string, unknown>, gi: number) => ({
          id:            typeof g.id            === "string" ? g.id            : `phase_${gi + 1}`,
          title:         typeof g.title         === "string" ? g.title         : `Phase ${gi + 1}`,
          description:   typeof g.description   === "string" ? g.description   : "",
          exit_criteria: typeof g.exit_criteria === "string" ? g.exit_criteria : "",
          items:         normalisePhaseItems(g.items),
        }))
      : [];
    return {
      format: "phases",
      title,
      summary:                  typeof r.summary                  === "string" ? r.summary                  : "",
      generated_from_iteration: typeof r.generated_from_iteration === "number" ? r.generated_from_iteration : 1,
      groups,
    };
  }

  if (format === "backlog") {
    const rawGroups = Array.isArray(r.groups) ? r.groups : [];
    const groups = rawGroups.map((g: Record<string, unknown>, gi: number) => ({
      id:    typeof g.id    === "string" ? g.id    : gi === 0 ? "backlog" : `group_${gi}`,
      title: typeof g.title === "string" ? g.title : "Backlog",
      items: normaliseBacklogItems(g.items),
    }));
    return {
      format: "backlog",
      title,
      summary:                  typeof r.summary                  === "string" ? r.summary                  : "",
      generated_from_iteration: typeof r.generated_from_iteration === "number" ? r.generated_from_iteration : 1,
      groups,
    };
  }

  // roles
  const strings = (arr: unknown) =>
    Array.isArray(arr) ? (arr as unknown[]).filter((d): d is string => typeof d === "string") : [];
  const groups = Array.isArray(r.groups)
    ? r.groups.map((g: Record<string, unknown>, gi: number) => ({
        id:             typeof g.id             === "string" ? g.id             : `role_${gi + 1}`,
        title:          typeof g.title          === "string" ? g.title          : `Role ${gi + 1}`,
        synthetic_id:   typeof g.synthetic_id   === "string" ? g.synthetic_id   : "",
        execution_mode: g.execution_mode === "agent" ? "agent" : "human" as "human" | "agent",
        inputs:         strings(g.inputs),
        outputs:        strings(g.outputs),
        items:          normaliseRoleItems(g.items),
      }))
    : [];
  return {
    format: "roles",
    title,
    summary:                  typeof r.summary                  === "string" ? r.summary                  : "",
    generated_from_iteration: typeof r.generated_from_iteration === "number" ? r.generated_from_iteration : 1,
    groups,
  };
}

// ── Sprint validation ──────────────────────────────────────────────────────────

function validateSprints(plan: SprintPlanOutput, velocity: number): string[] {
  const errors: string[] = [];

  if (plan.groups.length > 4)
    errors.push(`Too many sprints: ${plan.groups.length} (max 4)`);

  plan.groups.forEach((sprint, si) => {
    const sum = sprint.items.reduce((acc, i) => acc + i.story_points, 0);

    // total_points is recomputed in normaliseOutput, so this catches any post-normalise drift
    if (sum !== sprint.total_points)
      errors.push(`Sprint ${si + 1}: total_points mismatch (declared ${sprint.total_points}, actual ${sum})`);

    if (sum > velocity)
      errors.push(`Sprint ${si + 1}: exceeds velocity (${sum} > ${velocity})`);

    // depends_on may only reference items in the same sprint or an earlier sprint
    const currentIds = new Set(sprint.items.map(i => i.id));
    const earlierIds = new Set(plan.groups.slice(0, si).flatMap(g => g.items.map(i => i.id)));
    sprint.items.forEach(item => {
      (item.depends_on ?? []).forEach(depId => {
        if (!earlierIds.has(depId) && !currentIds.has(depId))
          errors.push(`Item ${item.id}: depends on future or unknown item "${depId}"`);
      });
    });

    if (!sprint.goal || sprint.goal.length < 10)
      errors.push(`Sprint ${si + 1}: goal too short or missing`);
  });

  return errors;
}

// ── Phases validation ──────────────────────────────────────────────────────────

function validatePhases(plan: PhasesPlanOutput): string[] {
  const errors: string[] = [];

  if (plan.groups.length < 2)
    errors.push("Minimum 2 phases required");
  if (plan.groups.length > 5)
    errors.push(`Too many phases: ${plan.groups.length} (max 5)`);

  plan.groups.forEach((phase, pi) => {
    if (!phase.exit_criteria || phase.exit_criteria.length < 20)
      errors.push(`Phase ${pi + 1}: exit_criteria missing or too vague`);
    if (!phase.description || phase.description.length < 10)
      errors.push(`Phase ${pi + 1}: description missing`);
    if (!phase.items || phase.items.length === 0)
      errors.push(`Phase ${pi + 1}: no items`);
  });

  return errors;
}

// ── Backlog validation ─────────────────────────────────────────────────────────

const BACKLOG_PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function validateBacklog(plan: BacklogPlanOutput): string[] {
  const errors: string[] = [];

  if (plan.groups.length !== 1) {
    errors.push(`Backlog must have exactly 1 group (got ${plan.groups.length})`);
    return errors; // can't safely inspect items — bail out
  }

  const group = plan.groups[0]!;
  if (group.id !== "backlog")
    errors.push(`Group id must be "backlog" (got "${group.id}")`);

  const { items } = group;
  if (items.length > 20)
    errors.push(`Maximum 20 items in backlog (got ${items.length})`);

  // Sort order: high → medium → low
  for (let i = 1; i < items.length; i++) {
    const prev = BACKLOG_PRIORITY_ORDER[items[i - 1]!.priority] ?? 99;
    const curr = BACKLOG_PRIORITY_ORDER[items[i]!.priority]    ?? 99;
    if (curr < prev)
      errors.push(`Item ${items[i]!.id}: priority order violated (${items[i]!.priority} after ${items[i - 1]!.priority})`);
  }

  // Build id → priority-order map once for O(n) dependency checks
  const priorityByItemId = new Map(items.map(item => [item.id, BACKLOG_PRIORITY_ORDER[item.priority] ?? 99]));

  items.forEach(item => {
    // Invalid priority field (normaliser should have fixed this, but log if not)
    if (!(item.priority in BACKLOG_PRIORITY_ORDER))
      errors.push(`Item ${item.id}: invalid priority "${item.priority}"`);

    // depends_on: dependency must have equal or higher priority (lower order number)
    (item.depends_on ?? []).forEach(depId => {
      const depOrder = priorityByItemId.get(depId);
      if (depOrder === undefined) {
        errors.push(`Item ${item.id}: depends on unknown item "${depId}"`);
      } else {
        const itemOrder = BACKLOG_PRIORITY_ORDER[item.priority] ?? 99;
        if (depOrder > itemOrder)
          errors.push(`Item ${item.id}: depends on lower-priority item "${depId}"`);
      }
    });
  });

  return errors;
}

// ── Roles validation ───────────────────────────────────────────────────────────

function validateRoles(plan: RolesPlanOutput): string[] {
  const errors: string[] = [];

  plan.groups.forEach((role, ri) => {
    if (!role.synthetic_id)
      errors.push(`Role ${ri + 1}: missing synthetic_id`);
    if (!role.execution_mode)
      errors.push(`Role ${ri + 1}: missing execution_mode`);

    role.items.forEach(item => {
      // Normaliser maps epics to "story", so this is a belt-and-suspenders check
      if ((item.type as string) === "epic")
        errors.push(`Role ${ri + 1}, item ${item.id}: epics not allowed in roles format`);
    });
  });

  return errors;
}

// ── Universal validator ────────────────────────────────────────────────────────

type AnyPlanGroup = { id?: string; title?: string; items?: Array<Record<string, unknown>> };

function validatePlan(plan: GeneratedPlanOutput, velocity: number): string[] {
  const errors: string[] = [];

  // Base
  if (!plan.title || plan.title.length > 80)
    errors.push("title missing or over 80 chars");
  if (!plan.summary)
    errors.push("summary missing");

  const groups = plan.groups as AnyPlanGroup[];
  if (!groups || groups.length === 0) {
    errors.push("no groups");
    return errors; // can't safely iterate — bail out
  }

  groups.forEach((group, gi) => {
    if (!group.id)    errors.push(`Group ${gi + 1}: missing id`);
    if (!group.title) errors.push(`Group ${gi + 1}: missing title`);
    const items = group.items ?? [];
    if (items.length === 0) errors.push(`Group ${gi + 1}: no items`);
    items.forEach((item, ii) => {
      const loc = `Group ${gi + 1}, item ${ii + 1}`;
      if (!item.id)    errors.push(`${loc}: missing id`);
      if (!item.title) errors.push(`${loc}: missing title`);
      if (typeof item.title === "string" && item.title.length > 80)
        errors.push(`${loc}: title over 80 chars`);
      if (!item.description)
        errors.push(`${loc}: missing description`);
      if (typeof item.description === "string" && item.description.length > 300)
        errors.push(`${loc}: description over 300 chars`);
      if (!VALID_ITEM_TYPES.has(item.type as string))
        errors.push(`${loc}: invalid type "${String(item.type)}"`);
      if (!item.source_synthetic)
        errors.push(`${loc}: missing source_synthetic`);
      // story_points: undefined/empty allowed (phases); if present must be fibonacci
      const sp = item.story_points;
      if (sp !== undefined && sp !== "" && !VALID_SP.has(Number(sp)))
        errors.push(`${loc}: story_points must be fibonacci (got ${String(sp)})`);
    });
  });

  if (errors.length > 0) return errors;

  // Format-specific
  if (plan.format === "sprints") errors.push(...validateSprints(plan, velocity));
  if (plan.format === "phases")  errors.push(...validatePhases(plan));
  if (plan.format === "backlog") errors.push(...validateBacklog(plan));
  if (plan.format === "roles")   errors.push(...validateRoles(plan));

  return errors;
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generatePlan(input: PlanInput): Promise<GeneratedPlanOutput> {
  const config    = getThinkingGraphRuntimeConfig();
  const provider  = createModelProvider(config);
  const velocity  = input.velocityAssumption ?? 20;
  const responseSchema = createPlanResponseSchema(input.format);
  const maxTokensByFormat: Record<PlanFormatId, number> = {
    sprints: 2400,
    phases: 2600,
    backlog: 2200,
    roles: 2400,
  };

  const systemPrompt    = buildPlanSystemPrompt(input.format);
  const baseUserMessage = buildPlanUserMessage(input);

  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const userMessage = attempt === 0
      ? baseUserMessage
      : `${baseUserMessage}

PREVIOUS ATTEMPT FAILED WITH THESE ERRORS:
${lastErrors.map(e => `- ${e}`).join("\n")}
Fix all errors and return corrected JSON.`;

    const result = await provider.generate({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
      temperature: 0.3,
      maxTokens:   maxTokensByFormat[input.format],
      responseSchema,
    });

    let parsed: unknown;
    try {
      try {
        parsed = JSON.parse(result.text);
      } catch {
        parsed = JSON.parse(extractJson(result.text));
      }
    } catch (err) {
      lastErrors = [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`];
      continue;
    }

    const plan = normaliseOutput(parsed, input.format);
    const errors = validatePlan(plan, velocity);

    if (errors.length === 0) return plan;

    lastErrors = errors;
    console.warn(`[plan/${input.format}] attempt ${attempt + 1} errors:`, errors);
  }

  throw new Error(
    `Plan generation failed after ${MAX_RETRIES + 1} attempts. Last errors: ${lastErrors.join(", ")}`
  );
}
