#!/usr/bin/env bash
# Prüft die Sprachclips: Signal (Dauer, Pegel, NaN, Stille) und – wenn das Whisper-Modell vorhanden ist – die Verständlichkeit
# per Rücktranskription (Wortfehlerrate). Whisper-Modell: Release "asr-models" von k2-fsa/sherpa-onnx (sherpa-onnx-whisper-small).
#
#   scripts/check-voices.sh [--only archer,advisor] [--report bericht.json]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${VOICE_WORK:-$HOME/.cache/strongpoly-voices}"
LANG_ID="${VOICE_LANG:-de}"
ASR="$WORK/asr/sherpa-onnx-whisper-small"
if [ ! -d "$ASR" ]; then
  echo "Lade Whisper small (ca. 640 MB, einmalig) …"
  mkdir -p "$WORK/asr"
  curl -fsSL -o "$WORK/asr/small.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2"
  tar -xjf "$WORK/asr/small.tar.bz2" -C "$WORK/asr"
  rm -f "$WORK/asr/small.tar.bz2"
fi
[ -x "$WORK/venv/bin/python" ] || { python3 -m venv "$WORK/venv"; "$WORK/venv/bin/pip" install -q sherpa-onnx numpy soundfile; }
"$WORK/venv/bin/python" "$ROOT/scripts/check_voices.py" --manifest "$ROOT/packages/client/public/voice/$LANG_ID/manifest.json" --asr "$ASR" "$@"
