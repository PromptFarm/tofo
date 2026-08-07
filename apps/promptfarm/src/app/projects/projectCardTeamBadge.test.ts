import assert from "node:assert/strict";

import type { PromptProjectSummary, TeamPresetSummary } from "@/lib/db-client";
import { resolveProjectTeamBadge } from "./projectCardTeamBadge";

function makeProject(overrides: Partial<PromptProjectSummary> = {}): PromptProjectSummary {
  return {
    id: "project-1",
    name: "Project",
    idea: "Idea",
    status: "active",
    latestSessionId: "session-1",
    hasLatestRun: true,
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    domainTags: [],
    selectedTeamId: null,
    ...overrides,
  };
}

const teams: TeamPresetSummary[] = [
  {
    id: "team-1",
    name: "Red Team",
    members: [],
    connections: [],
  },
];

assert.equal(
  resolveProjectTeamBadge(
    makeProject({ selectedTeamId: "team-1" }),
    teams,
  ),
  "Red Team",
);

assert.equal(
  resolveProjectTeamBadge(
    makeProject({ selectedTeamId: "missing-team" }),
    teams,
  ),
  "Selected team",
);

assert.equal(
  resolveProjectTeamBadge(
    makeProject({ selectedTeamId: null, status: "active", hasLatestRun: true }),
    teams,
  ),
  "Synthetic team",
);

assert.equal(
  resolveProjectTeamBadge(
    makeProject({ selectedTeamId: null, status: "active", latestSessionId: "session-1", hasLatestRun: false }),
    teams,
  ),
  "Auto team",
);

assert.equal(
  resolveProjectTeamBadge(
    makeProject({ selectedTeamId: null, status: "draft", latestSessionId: null, hasLatestRun: false }),
    teams,
  ),
  null,
);

console.log("projectCardTeamBadge tests passed");
