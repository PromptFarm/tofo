import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import {
  getModelProviderSettings,
  saveModelProviderSettings,
  type ModelProviderKind,
} from "@/lib/sqlite/appSettings";

const VALID_PROVIDERS: ModelProviderKind[] = ["ollama", "claude", "claude-cli"];

export async function GET() {
  try {
    await requireAppUser();
    const settings = getModelProviderSettings();
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireAppUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const provider = body?.provider;
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 },
    );
  }

  saveModelProviderSettings({
    provider,
    ollamaBaseUrl: typeof body.ollamaBaseUrl === "string" ? body.ollamaBaseUrl : "http://localhost:11434/v1",
    ollamaModel: typeof body.ollamaModel === "string" ? body.ollamaModel : "qwen2.5:7b-instruct",
    claudeApiKey: typeof body.claudeApiKey === "string" ? body.claudeApiKey : "",
    claudeModel: typeof body.claudeModel === "string" ? body.claudeModel : "",
  });

  return NextResponse.json({ ok: true });
}
