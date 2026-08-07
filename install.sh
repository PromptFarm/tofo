#!/bin/sh
# Installs the latest TOFO release on macOS.
#   curl -fsSL https://raw.githubusercontent.com/PromptFarm/tofo/main/install.sh | sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows, use install.ps1 instead:" >&2
  echo "  irm https://raw.githubusercontent.com/PromptFarm/tofo/main/install.ps1 | iex" >&2
  exit 1
fi

REPO="PromptFarm/tofo"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

echo "Finding the latest TOFO release..."
RELEASE_JSON="$(curl -fsSL "$API_URL")"

DMG_URL="$(printf '%s' "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*\.dmg"' | grep -o 'https://[^"]*' | head -n1)"
if [ -z "$DMG_URL" ]; then
  echo "Couldn't find a .dmg in the latest release. Grab it manually:" >&2
  echo "  https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

TMP_DMG="$(mktemp -t tofo-XXXXXX).dmg"
echo "Downloading $DMG_URL"
curl -fsSL "$DMG_URL" -o "$TMP_DMG"

echo "Mounting and installing to /Applications..."
MOUNT_DIR="$(mktemp -d -t tofo-mount-XXXXXX)"
hdiutil attach "$TMP_DMG" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

APP_PATH="$(find "$MOUNT_DIR" -maxdepth 1 -iname "*.app" | head -n1)"
if [ -z "$APP_PATH" ]; then
  hdiutil detach "$MOUNT_DIR" -quiet
  echo "Couldn't find TOFO.app inside the disk image." >&2
  exit 1
fi

rm -rf "/Applications/$(basename "$APP_PATH")"
cp -R "$APP_PATH" /Applications/
hdiutil detach "$MOUNT_DIR" -quiet
rm -f "$TMP_DMG"

echo "TOFO installed to /Applications. Launch it from Spotlight or Applications."
