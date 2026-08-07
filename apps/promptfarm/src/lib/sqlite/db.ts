import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CREATE_TABLES_SQL } from "./schema";

// In the desktop build, the Rust shell sets PROMPTFARM_DATA_DIR to a stable
// location outside the extracted server folder — that folder gets deleted
// and re-extracted on every app update (see lib.rs's ensure_server_extracted),
// so a database living inside it would be wiped on every update. Falls back
// to process.cwd() for the plain web app (`pnpm dev`/`pnpm start`), where
// there's no such extraction step and cwd is already stable.
const DATA_DIR = process.env.PROMPTFARM_DATA_DIR ?? process.cwd();
const DB_PATH = join(DATA_DIR, ".promptfarm", "promptfarm.db");

declare global {
  // eslint-disable-next-line no-var
  var __promptfarmDb: DatabaseSync | undefined;
}

function createDb(): DatabaseSync {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(CREATE_TABLES_SQL);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__promptfarmDb) {
    globalThis.__promptfarmDb = createDb();
  }
  return globalThis.__promptfarmDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

export function boolToInt(value: boolean | undefined, fallback = true): number {
  return (value ?? fallback) ? 1 : 0;
}

// node:sqlite rows come back as null-prototype objects, which Next.js's RSC
// serializer rejects when passing them to Client Components. Spreading into a
// literal restores a normal Object.prototype.
export function toPlain<T extends object>(row: T): T {
  return { ...row };
}

export function toPlainRows<T extends object>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}
