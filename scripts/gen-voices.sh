#!/usr/bin/env bash
# Erzeugt die deutschen Sprachclips (Meilenstein 4D) aus den Dialogdaten in packages/shared/src/data/voices*.ts.
#
#   scripts/gen-voices.sh                  alle Zeilen (bereits aktuelle Clips werden übersprungen)
#   scripts/gen-voices.sh --only knight    nur diese Stimmen/Profile (Komma-getrennt)
#   scripts/gen-voices.sh --force          alles neu erzeugen
#   VOICE_LANG=en scripts/gen-voices.sh    englisches Paket (packages/client/public/voice/en)
#
# Braucht: python3 (venv + pip: sherpa-onnx, numpy, soundfile), ffmpeg (mit libmp3lame und rubberband), curl, pnpm.
# Kostenlos und lokal: keine API-Schlüssel, keine Online-Dienste. Modelle (nur CC0, siehe packages/client/public/voice/README.md)
# werden einmalig aus dem Release "tts-models" von k2-fsa/sherpa-onnx geladen und in $VOICE_WORK zwischengespeichert.
# Hinter einem Proxy: HTTPS_PROXY/SSL_CERT_FILE wie üblich setzen (TLS-Prüfung bleibt an).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${VOICE_WORK:-$HOME/.cache/strongpoly-voices}"
LANG_ID="${VOICE_LANG:-de}"
OUT="$ROOT/packages/client/public/voice/$LANG_ID"
BASE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
if [ "$LANG_ID" = "en" ]; then
  MODELS=(en_US-joe-medium en_US-john-medium en_US-norman-medium en_US-kathleen-low)
else
  MODELS=(de_DE-thorsten-high de_DE-thorsten-medium de_DE-thorsten_emotional-medium de_DE-kerstin-low)
fi

mkdir -p "$WORK/models"
if [ ! -x "$WORK/venv/bin/python" ]; then
  python3 -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install -q sherpa-onnx numpy soundfile
fi
for m in "${MODELS[@]}"; do
  d="$WORK/models/vits-piper-$m"
  if [ ! -d "$d" ]; then
    echo "Lade Modell $m …"
    curl -fsSL -o "$WORK/models/$m.tar.bz2" "$BASE_URL/vits-piper-$m.tar.bz2"
    tar -xjf "$WORK/models/$m.tar.bz2" -C "$WORK/models"
    rm -f "$WORK/models/$m.tar.bz2"
  fi
done

LINES="$WORK/lines_$LANG_ID.json"
(cd "$ROOT" && pnpm --filter @strongpoly/shared exec tsx ../../scripts/export-voice-lines.ts "$LANG_ID" "$LINES")
"$WORK/venv/bin/python" "$ROOT/scripts/gen_voices.py" --lines "$LINES" --models "$WORK/models" --out "$OUT" "$@"
