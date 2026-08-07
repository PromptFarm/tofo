#!/usr/bin/env node
// Runs every *.test.ts file under src/ through jiti. Discovering test files by
// glob (instead of listing each one in package.json) means a new test file is
// picked up automatically — CI can't quietly skip it the way it skipped 16 of
// these for years before anyone wired them in.
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(rootDir, "src");
const require = createRequire(import.meta.url);
const jitiCli = join(dirname(require.resolve("jiti/package.json")), "lib/jiti-cli.mjs");

function findTestFiles(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const testFiles = findTestFiles(srcDir).sort();
console.log(`Running ${testFiles.length} test file(s)...\n`);

const failed = [];
for (const file of testFiles) {
  const rel = relative(rootDir, file).split(sep).join("/");
  console.log(`--- ${rel} ---`);
  const result = spawnSync(process.execPath, [jitiCli, file], { stdio: "inherit", cwd: rootDir });
  if (result.status !== 0) failed.push(rel);
  console.log();
}

if (failed.length > 0) {
  console.error(`FAILED (${failed.length}/${testFiles.length}):`);
  for (const rel of failed) console.error(`  - ${rel}`);
  process.exit(1);
}

console.log(`All ${testFiles.length} test files passed.`);
