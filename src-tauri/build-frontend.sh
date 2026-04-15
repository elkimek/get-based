#!/bin/bash
# Stage the web frontend into src-tauri/dist/ for tauri build.
# Tauri rejects frontendDist that contains src-tauri/ itself, so we copy a
# clean subset of the repo (no Rust, no Python source, no build artifacts).
set -e

# Run from src-tauri/, but copy from the repo root (one dir up).
cd "$(dirname "$0")"
SRC="$(cd .. && pwd)"
DEST="$(pwd)/dist"

rm -rf "$DEST"
mkdir -p "$DEST"

# Copy the web app files only — no src-tauri/, no lens/, no docs source, no .git
for entry in index.html styles.css version.js manifest.json service-worker.js \
             icon.svg icon-192.png icon-512.png \
             js vendor data; do
  if [ -e "$SRC/$entry" ]; then
    cp -r "$SRC/$entry" "$DEST/"
  fi
done

# Tauri build expects index.html at the top level — confirm
if [ ! -f "$DEST/index.html" ]; then
  echo "ERROR: $DEST/index.html missing after staging"
  exit 1
fi

# Note: Umami analytics snippet is kept (opt-out via Settings → Privacy).
# CSP in tauri.conf.json allows umami-iota-olive.vercel.app for script + connect.

echo "Staged frontend to $DEST"
