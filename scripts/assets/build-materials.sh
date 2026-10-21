#!/usr/bin/env bash
# Baut die PBR-Materialbibliothek (assets/blender/materials/M_*.py) reproduzierbar.
#
#   scripts/assets/build-materials.sh                 # alle Materialien + library.json/.jpg
#   scripts/assets/build-materials.sh M_Stone_Ashlar  # einzelne Materialien (+ Bibliothek)
#   STAGE=preview scripts/assets/build-materials.sh M_Rock   # nur Vorschau neu rendern
#
# Umgebung:
#   BPY_PYTHON                 Python mit bpy 5.2.2 (Standard: ~/bpyenv/bin/python)
#                              benoetigt zusaetzlich: pip install Pillow OpenEXR scipy
#   STRONGPOLY_MAT_WORK        Arbeitsverzeichnis fuer EXR/PNG-Zwischenstaende (Standard: $TMPDIR/strongpoly-materials)
#   STRONGPOLY_MAT_THREADS     Cycles-Threads (Standard 2)
#   STRONGPOLY_MAT_SAMPLES     Samples des Quell-Renderings (Standard je Material)
#   STRONGPOLY_MAT_FORMATS     Laufzeitformate, kommagetrennt: ktx2,webp (Standard: ktx2)
#   BASISU                     Pfad zu basisu (sonst npm-Paket basis_universal@1.16.4-1 im Arbeitsverzeichnis)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="${BPY_PYTHON:-$HOME/bpyenv/bin/python}"
WORK="${STRONGPOLY_MAT_WORK:-${TMPDIR:-/tmp}/strongpoly-materials}"
export STRONGPOLY_MAT_WORK="$WORK"
STAGE="${STAGE:-all}"
mkdir -p "$WORK"

if [[ -z "${BASISU:-}" ]]; then
  BU="$WORK/_tools/node_modules/basis_universal/bin/basisu"
  if [[ ! -x "$BU" ]]; then
    echo "[mat] installiere basisu (npm basis_universal@1.16.4-1) nach $WORK/_tools"
    mkdir -p "$WORK/_tools"
    (cd "$WORK/_tools" && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund basis_universal@1.16.4-1 >/dev/null)
    chmod +x "$BU"
  fi
  export BASISU="$BU"
fi

"$PY" -c "import bpy, numpy, scipy, PIL, OpenEXR" || {
  echo "Fehlende Python-Pakete: $PY -m pip install Pillow OpenEXR scipy" >&2; exit 1; }

cd "$ROOT/assets/blender/materials"
if [[ $# -gt 0 ]]; then
  MATS=("$@")
else
  MATS=()
  for f in M_*.py; do MATS+=("${f%.py}"); done
fi
for m in "${MATS[@]}"; do
  echo "[mat] === $m ($STAGE) ==="
  "$PY" "$m.py" --stage "$STAGE"
done
"$PY" _library.py
