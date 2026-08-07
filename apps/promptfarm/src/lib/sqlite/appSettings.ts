import { getDb, nowIso } from "./db";

const SETTINGS_KEY = "modelProvider";

export type ModelProviderKind = "ollama" | "claude" | "claude-cli";

export type ModelProviderSettings = {
  provider: ModelProviderKind;
  ollamaBaseUrl: string;
  ollamaModel: string;
  claudeApiKey: string;
  claudeModel: string;
};

const DEFAULTS: ModelProviderSettings = {
  provider: "ollama",
  ollamaBaseUrl: "http://localhost:11434/v1",
  ollamaModel: "qwen2.5:7b-instruct",
  claudeApiKey: "",
  claudeModel: "",
};

export function getModelProviderSettings(): ModelProviderSettings | null {
  const row = getDb()
    .prepare("SELECT value FROM AppSetting WHERE key = ?")
    .get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    return { ...DEFAULTS, ...(JSON.parse(row.value) as Partial<ModelProviderSettings>) };
  } catch {
    return null;
  }
}

export function saveModelProviderSettings(settings: ModelProviderSettings): void {
  const value = JSON.stringify(settings);
  getDb()
    .prepare(
      `INSERT INTO AppSetting (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    )
    .run(SETTINGS_KEY, value, nowIso());
}

export function isModelProviderConfigured(): boolean {
  return getModelProviderSettings() !== null;
}
