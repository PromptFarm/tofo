import assert from "node:assert/strict";

import type { PromptProjectDetail, PromptProjectSummary } from "./db-client";
import {
  normalizeProjectDetail,
  normalizeProjectSummary,
} from "./projectMetadata";

function makeSummary(
  overrides: Partial<PromptProjectSummary> = {},
): PromptProjectSummary {
  return {
    id: "project-1",
    name: "Test Project",
    idea: "Idea",
    status: "active",
    latestSessionId: null,
    hasLatestRun: false,
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    domainTags: [],
    selectedTeamId: null,
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<PromptProjectDetail> = {},
): PromptProjectDetail {
  return {
    ...makeSummary(),
    projectState: null,
    draftState: null,
    ...overrides,
  };
}

function runNormalizeProjectDetailTests(): void {
  const exactBackendShape = normalizeProjectDetail(
    {
      id: "project-exact",
      name: "Exact Backend Shape",
      idea: "Idea",
      status: "active",
      latestSessionId: null,
      hasLatestRun: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      selectedTeamId: undefined as never,
      domainTags: undefined as never,
      projectState: {
        _draftMeta: {
          domainTags: ["SaaS", "GameDev", "Education"],
          selectedTeamId: null,
        },
      } as never,
      draftState: null,
    } satisfies PromptProjectDetail,
  );

  assert.deepEqual(exactBackendShape.domainTags, ["SaaS", "GameDev", "Education"]);
  assert.equal(exactBackendShape.selectedTeamId, null);

  const fromDraftMeta = normalizeProjectDetail(
    makeDetail({
      domainTags: undefined as never,
      selectedTeamId: undefined as never,
      projectState: {
        somePayload: true,
        _draftMeta: {
          domainTags: ["SaaS", "Education"],
          selectedTeamId: null,
        },
      } as never,
    }),
  );

  assert.deepEqual(fromDraftMeta.domainTags, ["SaaS", "Education"]);
  assert.equal(fromDraftMeta.selectedTeamId, null);

  const fromDraftState = normalizeProjectDetail(
    makeDetail({
      domainTags: undefined as never,
      selectedTeamId: undefined as never,
      draftState: {
        kind: "new_project_draft",
        domainTags: ["GameDev"],
        selectedTeamId: "team-1",
      },
    }),
  );

  assert.deepEqual(fromDraftState.domainTags, ["GameDev"]);
  assert.equal(fromDraftState.selectedTeamId, "team-1");

  const keepsTopLevel = normalizeProjectDetail(
    makeDetail({
      domainTags: ["TopLevel"],
      selectedTeamId: "team-top",
      projectState: {
        _draftMeta: {
          domainTags: ["IgnoredMeta"],
          selectedTeamId: "ignored-team",
        },
      } as never,
    }),
  );

  assert.deepEqual(keepsTopLevel.domainTags, ["TopLevel"]);
  assert.equal(keepsTopLevel.selectedTeamId, "team-top");
}

function runNormalizeProjectSummaryTests(): void {
  // Backend rows for the summary list can carry a stray `projectState` field
  // (overlap with the detail shape) — normalizeProjectSummary should still
  // extract domainTags/selectedTeamId from it. Cast via a variable so TS
  // doesn't flag `projectState` as an excess property of PromptProjectSummary.
  const overridesWithProjectState = {
    domainTags: undefined,
    selectedTeamId: undefined,
    projectState: {
      _draftMeta: {
        domainTags: ["SaaS", "GameDev", "Education", "Extra"],
        selectedTeamId: "",
      },
    },
  } as unknown as Partial<PromptProjectSummary>;

  const summary = normalizeProjectSummary(
    makeSummary(overridesWithProjectState) as PromptProjectSummary,
  );

  assert.deepEqual(summary.domainTags, ["SaaS", "GameDev", "Education"]);
  assert.equal(summary.selectedTeamId, null);
}

runNormalizeProjectDetailTests();
runNormalizeProjectSummaryTests();

console.log("projectMetadata normalization tests passed");
