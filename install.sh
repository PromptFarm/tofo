#!/bin/sh
# Installs the latest TOFO release on macOS or Linux.
#   curl -fsSL https://raw.githubusercontent.com/PromptFarm/tofo/main/install.sh | sh
set -eu

REPO="PromptFarm/tofo"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
OS="$(uname -s)"

case "$OS" in
  Darwin|Linux) ;;
  *)
    echo "This installer is for macOS/Linux. On Windows, use install.ps1 instead:" >&2
    echo "  irm https://raw.githubusercontent.com/PromptFarm/tofo/main/install.ps1 | iex" >&2
    exit 1
    ;;
esac

echo "Finding the latest TOFO release..."
RELEASE_JSON="$(curl -fsSL "$API_URL")"

if [ "$OS" = "Darwin" ]; then
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
  cp -R "$APP_PATH" "/Applications/"
  hdiutil detach "$MOUNT_DIR" -quiet
  rm -f "$TMP_DMG"

  # TOFO isn't notarized by Apple (that requires a paid developer account) —
  # a build downloaded via a browser gets a com.apple.quarantine flag that
  # makes Gatekeeper refuse to open it at all ("app is damaged"). curl
  # doesn't set that flag, but strip it defensively anyway in case macOS
  # applies it some other way (e.g. via Finder's own copy).
  xattr -cr "/Applications/$(basename "$APP_PATH")" 2>/dev/null || true

  echo "TOFO installed to /Applications. Launch it from Spotlight or Applications."
else
  APPIMAGE_URL="$(printf '%s' "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | grep -o 'https://[^"]*' | head -n1)"
  if [ -z "$APPIMAGE_URL" ]; then
    echo "Couldn't find an .AppImage in the latest release. Grab it manually:" >&2
    echo "  https://github.com/${REPO}/releases/latest" >&2
    exit 1
  fi

  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
  DEST="$INSTALL_DIR/TOFO.AppImage"

  echo "Downloading $APPIMAGE_URL"
  curl -fsSL "$APPIMAGE_URL" -o "$DEST"
  chmod +x "$DEST"

  echo "TOFO installed to $DEST."
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) echo "Run it with: TOFO.AppImage" ;;
    *) echo "Add $INSTALL_DIR to your PATH, or run it directly: $DEST" ;;
  esac
fi
