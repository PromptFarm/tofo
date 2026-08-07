import assert from "node:assert/strict";
import type { SyntheticNode } from "@/lib/planning/types";
import { composeVisibleSynthetics } from "./composeVisibleSynthetics";

function synthetic(id: string, code: string): SyntheticNode {
  return {
    id,
    code,
    name: code,
    role: `${code} role`,
    status: "active",
    layout: { x: 0, y: 0 },
    config: {
      enabled: true,
      temperature: 0.3,
      strictness: 70,
      engagementPercent: 70,
    },
  };
}

{
  const base = [synthetic("syn-a", "AA"), synthetic("syn-custom-1", "CC")];
  const added = [synthetic("syn-custom-1", "CC")];
  const result = composeVisibleSynthetics(base, added, []);

  assert.deepEqual(
    result.map((item) => item.id),
    ["syn-a", "syn-custom-1"],
  );
}

{
  const base = [synthetic("syn-a", "AA")];
  const added = [synthetic("syn-c", "CC"), synthetic("syn-c", "CC")];
  const result = composeVisibleSynthetics(base, added, []);

  assert.deepEqual(
    result.map((item) => item.id),
    ["syn-a", "syn-c"],
  );
}

{
  const base = [synthetic("syn-a", "AA"), synthetic("syn-b", "BB")];
  const added = [synthetic("syn-c", "CC")];
  const result = composeVisibleSynthetics(base, added, ["syn-b"]);

  assert.deepEqual(
    result.map((item) => item.id),
    ["syn-a", "syn-c"],
  );
}

console.log("composeVisibleSynthetics tests passed");
