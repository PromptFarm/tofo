#!/bin/bash
# Downloads a portable (no-installer) Node.js build for the target platform
# and drops just the runtime binary into $1 (a directory that already
# exists). Used so the desktop app never depends on the end user having
# Node.js installed system-wide — see lib.rs's `resolve_bundled_node_path()`.
#
# Windows, macOS, and Linux are all handled (tested on Windows; macOS/Linux
# paths are written the same way but only verified via CI, since this repo's
# own build machine is Windows-only).
set -euo pipefail

NODE_VERSION="24.14.1"
DEST_DIR="$1"
if [ -z "$DEST_DIR" ]; then
  echo "usage: fetch-portable-node.sh <dest-dir>" >&2
  exit 1
fi
mkdir -p "$DEST_DIR"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="win-x64"
    ARCHIVE_EXT="zip"
    BIN_NAME="node.exe"
    ;;
  Darwin)
    ARCH="$(uname -m)"
    if [ "$ARCH" = "arm64" ]; then PLATFORM="darwin-arm64"; else PLATFORM="darwin-x64"; fi
    ARCHIVE_EXT="tar.gz"
    BIN_NAME="node"
    ;;
  Linux)
    ARCH="$(uname -m)"
    if [ "$ARCH" = "aarch64" ]; then PLATFORM="linux-arm64"; else PLATFORM="linux-x64"; fi
    ARCHIVE_EXT="tar.gz"
    BIN_NAME="node"
    ;;
  *)
    echo "fetch-portable-node.sh: unsupported platform $(uname -s)" >&2
    exit 1
    ;;
esac

DEST_BIN="$DEST_DIR/$BIN_NAME"
if [ -f "$DEST_BIN" ]; then
  echo "Portable node already present at $DEST_BIN, skipping download"
  exit 0
fi

ARCHIVE_NAME="node-v${NODE_VERSION}-${PLATFORM}.${ARCHIVE_EXT}"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE_NAME}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading portable Node.js ${NODE_VERSION} (${PLATFORM})..."
curl -fsSL "$URL" -o "$TMP_DIR/$ARCHIVE_NAME"

if [ "$ARCHIVE_EXT" = "zip" ]; then
  # Neither Git's bundled tar nor Windows' own tar.exe (bsdtar) actually
  # extract .zip via `-xf` in this environment despite `file` correctly
  # identifying the format — tested and confirmed broken. PowerShell's
  # Expand-Archive is the reliable path on Windows.
  WIN_ARCHIVE="$(cygpath -w "$TMP_DIR/$ARCHIVE_NAME" 2>/dev/null || echo "$TMP_DIR/$ARCHIVE_NAME")"
  WIN_TMP="$(cygpath -w "$TMP_DIR" 2>/dev/null || echo "$TMP_DIR")"
  powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '$WIN_ARCHIVE' -DestinationPath '$WIN_TMP' -Force"
else
  tar -xf "$TMP_DIR/$ARCHIVE_NAME" -C "$TMP_DIR"
fi

EXTRACTED_DIR="$TMP_DIR/node-v${NODE_VERSION}-${PLATFORM}"
if [ "$PLATFORM" = "win-x64" ]; then
  cp "$EXTRACTED_DIR/node.exe" "$DEST_BIN"
else
  cp "$EXTRACTED_DIR/bin/node" "$DEST_BIN"
  chmod +x "$DEST_BIN"
fi

echo "Portable node ready at $DEST_BIN ($(du -h "$DEST_BIN" | cut -f1))"
