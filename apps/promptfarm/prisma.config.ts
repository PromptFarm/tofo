import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({
  path: join(dirname(fileURLToPath(import.meta.url)), ".env"),
  quiet: true,
});

const datasourceUrl =
  process.env.PRISMA_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.DIRECT_URL;

if (!datasourceUrl) {
  throw new Error(
    "PRISMA_DATABASE_URL, DATABASE_URL, or DIRECT_URL is required for Prisma CLI commands.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
