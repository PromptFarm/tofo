#!/bin/bash
# Packages TOFO as a portable, no-installer .zip — extract and run, same
# distribution style as Ouroboros (Ouroboros.exe + _internal/ inside a
# single zip). No NSIS/MSI: the earlier NSIS installer route worked but
# is no longer how Windows is distributed — this replaced it.
#
# Deliberately bypasses `tauri build`'s own bundling (which is what
# previously drove the NSIS path) — a plain `cargo build --release` plus
# manually staging the resources next to it is simpler and matches exactly
# what a portable zip needs: no installer script, no bundle-target config.
set -euo pipefail
cd "$(dirname "$0")/.."  # apps/desktop

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
DIST_DIR="dist/TOFO"
ZIP_PATH="dist/TOFO-${VERSION}-windows-x64.zip"

echo "== Building promptfarm (Next.js + portable Node + archive) =="
pnpm --dir ../promptfarm build:desktop

echo "== Building app.exe (cargo release) =="
(cd src-tauri && cargo build --release)

echo "== Staging portable package =="
rm -rf dist
mkdir -p "$DIST_DIR"
cp src-tauri/target/release/app.exe "$DIST_DIR/TOFO.exe"
cp ../promptfarm/.next/next-standalone.tar.gz "$DIST_DIR/next-standalone.tar.gz"

echo "== Zipping =="
WIN_DIST_DIR="$(cygpath -w "$DIST_DIR" 2>/dev/null || echo "$DIST_DIR")"
WIN_ZIP_PATH="$(cygpath -w "$ZIP_PATH" 2>/dev/null || echo "$ZIP_PATH")"
powershell.exe -NoProfile -Command "Compress-Archive -Path '$WIN_DIST_DIR' -DestinationPath '$WIN_ZIP_PATH' -Force"

echo "Portable zip ready: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
