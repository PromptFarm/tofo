#!/bin/bash
# Builds the Next.js app for the Tauri desktop bundle.
#
# `next build`'s own `output: standalone` file-tracing doesn't reliably
# capture every dependency in this pnpm monorepo (seen missing: `next` itself,
# then `styled-jsx` — a real, recurring gap, not a one-off). Rather than
# chase individual missing packages, this replaces the traced node_modules
# with the actual, fully-working one pnpm already resolved for `dev`/`build`.
set -euo pipefail
cd "$(dirname "$0")/.."

# Warm the SQLite DB before next build's parallel page-data-collection
# workers start — see scripts/warm-db.ts and package.json's `prebuild`
# script for why. This script calls `next build` directly rather than
# through `pnpm run build`, which bypasses that npm lifecycle hook, so
# it has to be called explicitly here too.
pnpm exec jiti scripts/warm-db.ts

next build

FLAT_APP_DIR=".next/standalone-flat/apps/promptfarm"
rm -rf .next/standalone-flat
mkdir -p "$FLAT_APP_DIR"

cp .next/standalone/apps/promptfarm/server.js "$FLAT_APP_DIR/server.js"
cp .next/standalone/apps/promptfarm/package.json "$FLAT_APP_DIR/package.json"
cp -RL .next/standalone/apps/promptfarm/.next "$FLAT_APP_DIR/.next"
cp -r .next/static "$FLAT_APP_DIR/.next/static"
cp -RL public "$FLAT_APP_DIR/public"
# `src/personas/*.md` are read at runtime via a dynamic fs.readFile() (see
# personaSource.ts), which next build's file-tracer can't see — it only
# traces static require()/import graphs. Not copied automatically like the
# node_modules gaps above; has to be done explicitly.
mkdir -p "$FLAT_APP_DIR/src"
cp -RL src/personas "$FLAT_APP_DIR/src/personas"
cp -RL node_modules "$FLAT_APP_DIR/node_modules"

echo "Desktop build ready: $FLAT_APP_DIR"

# Bundled so the app never depends on the end user having Node.js installed
# system-wide — see lib.rs's `resolve_bundled_node_path()`.
bash "$(dirname "$0")/fetch-portable-node.sh" ".next/standalone-flat/node-runtime"

# Bundling this directory file-by-file (as Tauri's NSIS packaging does by
# default) breaks: many paths here — deeply nested node_modules files, or
# Next.js dynamic API routes like [projectId]/session/runs/[runId]/outputs —
# exceed Windows' 260-char MAX_PATH once prefixed with this repo's (long,
# worktree-nested) absolute path, and makensis.exe isn't long-path-aware.
# One archive is one short path, sidestepping the problem entirely. Rust
# extracts it into the app's local data dir on first run (see lib.rs).
ARCHIVE_PATH=".next/next-standalone.tar.gz"
rm -f "$ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C .next/standalone-flat .
echo "Archived resources: $ARCHIVE_PATH ($(du -h "$ARCHIVE_PATH" | cut -f1))"
