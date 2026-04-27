#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
PLUGIN_NAME="ktab-manager"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SOURCE_DIR"

# Lecture de la version dans manifest.json
VERSION=$(awk -F'"' '/"version"/ {print $4; exit}' manifest.json)
OUTPUT="${PLUGIN_NAME}-${VERSION}.zip"

# Allow-list explicite des fichiers a inclure
INCLUDE=(
  manifest.json
  popup.html
  popup.js
  background.js
  icons
)

# --- Nettoyage prealable ---
echo "[*] Suppression des .DS_Store residuels..."
find . -name '.DS_Store' -type f -delete 2>/dev/null || true

# --- Creation du ZIP ---
rm -f "$OUTPUT"
echo "[*] Creation de $OUTPUT..."

zip -r -X "$OUTPUT" "${INCLUDE[@]}" \
  -x "*.DS_Store" \
  -x "__MACOSX*" \
  -x "*/.*"

# --- Verification ---
echo "[*] Contenu de l'archive :"
unzip -l "$OUTPUT"

if unzip -l "$OUTPUT" | grep -qE "(__MACOSX|\.DS_Store|/\._)"; then
  echo "[X] ERREUR : fichiers indesirables detectes dans l'archive"
  exit 1
fi

echo "[OK] Package propre : $OUTPUT"