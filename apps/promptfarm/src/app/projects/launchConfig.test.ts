import assert from "node:assert/strict";

import { buildThinkingGraphLaunchUrl } from "./launchConfig";

assert.equal(
  buildThinkingGraphLaunchUrl({
    projectId: "project-1",
    autoPersonaIds: ["persona-a", "persona-b"],
    autostart: true,
  }),
  "/tofo/projects/project-1",
);

assert.equal(
  buildThinkingGraphLaunchUrl({
    projectId: "project-1",
    autoPersonaIds: ["persona-a"],
    autostart: false,
  }),
  "/tofo/projects/project-1",
);

console.log("launchConfig tests passed");
