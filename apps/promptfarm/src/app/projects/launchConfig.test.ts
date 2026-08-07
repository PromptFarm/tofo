import assert from "node:assert/strict";

import { buildThinkingGraphLaunchUrl } from "./launchConfig";

assert.equal(
  buildThinkingGraphLaunchUrl({
    projectId: "project-1",
    autoPersonaIds: ["persona-a", "persona-b"],
    autostart: true,
  }),
  "/tofo/projects/project-1?autostart=true&personas=persona-a%2Cpersona-b",
);

assert.equal(
  buildThinkingGraphLaunchUrl({
    projectId: "project-1",
    autoPersonaIds: ["persona-a"],
    autostart: false,
  }),
  "/tofo/projects/project-1?personas=persona-a",
);

assert.equal(
  buildThinkingGraphLaunchUrl({
    projectId: "project-1",
    autostart: false,
  }),
  "/tofo/projects/project-1",
);

console.log("launchConfig tests passed");
