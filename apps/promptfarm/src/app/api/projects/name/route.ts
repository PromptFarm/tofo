import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { findProjectByName } from "@/lib/db-client";
import { createModelProvider } from "@/lib/thinking-graph/server/modelProvider";
import { getThinkingGraphRuntimeConfig } from "@/lib/thinking-graph/server/config";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAppUser();
    const { idea } = (await req.json()) as { idea: string };

    if (!idea?.trim()) {
      return NextResponse.json({ error: "Idea is required" }, { status: 400 });
    }

    const config = getThinkingGraphRuntimeConfig();
    const model = createModelProvider(config);

    const result = await model.generate({
      messages: [
        {
          role: "system",
          content:
            "You generate short project names (2-5 words) from an idea description. Return ONLY the name, no quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: `Generate a short project name for this idea: ${idea.trim().slice(0, 500)}`,
        },
      ],
      maxTokens: 30,
      temperature: 0.7,
    });

    const name = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 80);

    // Ensure uniqueness for this user
    let candidate = name;
    let suffix = 2;
    while (await findProjectByName(user.id, candidate)) {
      candidate = `${name} ${suffix}`;
      suffix++;
    }

    return NextResponse.json({ name: candidate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate name";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
