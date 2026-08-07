import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import type { GeneratedPlanOutput } from "@/lib/thinking-graph/plan/planTypes";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupTitle(group: GeneratedPlanOutput["groups"][number]): string {
  return "title" in group ? (group as { title: string }).title : "";
}

function itemSP(item: object): number | null {
  const sp = (item as { story_points?: number }).story_points;
  return typeof sp === "number" ? sp : null;
}

export async function POST(req: NextRequest) {
  let body: { plan: GeneratedPlanOutput; accessToken: string; pageId: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { plan, accessToken, pageId } = body;
  if (!plan || !accessToken || !pageId) {
    return NextResponse.json({ error: "Missing plan, accessToken, or pageId" }, { status: 400 });
  }

  const notion = new Client({ auth: accessToken });

  try {
    // Create parent page
    const page = await notion.pages.create({
      parent: { type: "page_id", page_id: pageId },
      properties: {
        title: {
          title: [{ text: { content: plan.title || "Implementation Plan" } }],
        },
      },
    });

    // Create tasks database inside the new page
    const db = await notion.databases.create({
      parent: { type: "page_id", page_id: page.id },
      title: [{ text: { content: "Tasks" } }],
      properties: {
        "Name":         { title: {} },
        "Type":         { select: { options: [
          { name: "Epic",  color: "purple" },
          { name: "Story", color: "blue"   },
          { name: "Task",  color: "gray"   },
        ]}},
        "Group":        { select: { options: [] } },
        "Story Points": { number: { format: "number" } },
        "Expert":       { rich_text: {} },
        "Description":  { rich_text: {} },
        "Status":       { select: { options: [
          { name: "To Do",       color: "gray"   },
          { name: "In Progress", color: "yellow" },
          { name: "Done",        color: "green"  },
        ]}},
      },
    });

    // Add all tasks (sequential to respect Notion rate limits)
    for (const group of plan.groups) {
      const gTitle = groupTitle(group);
      for (const item of group.items) {
        const sp = itemSP(item);
        const expert = (item as { source_synthetic?: string }).source_synthetic ?? "";
        const desc   = (item as { description?: string }).description ?? "";
        await notion.pages.create({
          parent: { database_id: db.id },
          properties: {
            "Name":         { title: [{ text: { content: item.title } }] },
            "Type":         { select: { name: capitalize(item.type) } },
            "Group":        { select: { name: gTitle || "—" } },
            "Story Points": { number: sp },
            "Expert":       { rich_text: expert ? [{ text: { content: expert } }] : [] },
            "Description":  { rich_text: desc   ? [{ text: { content: desc.slice(0, 2000) } }] : [] },
            "Status":       { select: { name: "To Do" } },
          },
        });
      }
    }

    return NextResponse.json({
      pageUrl: `https://notion.so/${page.id.replace(/-/g, "")}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notion API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
