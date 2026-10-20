#!/usr/bin/env python3
"""
Qualitätsprüfung der erzeugten Sprachclips (Meilenstein 4D).

Je Clip: Dauer, Spitzenpegel, RMS, Anteil Stille, NaN/Clipping. Optional Rücktranskription mit Whisper (sherpa-onnx, lokal):
Wortfehlerrate (WER) gegen den Sollsatz als Maß für Verständlichkeit.

Aufruf:
  check_voices.py --manifest packages/client/public/voice/de/manifest.json [--asr <Ordner sherpa-onnx-whisper-small>] [--only gruppe,...] [--report out.json]

Whisper-Paket: Release "asr-models" von k2-fsa/sherpa-onnx (sherpa-onnx-whisper-small.tar.bz2), siehe README. Ohne --asr nur Signalprüfung.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np


def decode(path, sr=16000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def norm(s):
    s = unicodedata.normalize('NFC', s.lower())
    s = re.sub(r'[^a-zäöüß0-9 ]', ' ', s)
    return s.split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            c = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
            p = c
    return d[len(h)] / max(1, len(r))


def signal_stats(x):
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    act = x[np.abs(x) > 0.02]
    rms = math.sqrt(float(np.mean(act ** 2))) if len(act) else 0.0
    quiet = float(np.mean(np.abs(x) < 0.005)) if len(x) else 1.0
    return {'peak': round(peak, 3), 'rms_db': round(20 * math.log10(max(rms, 1e-6)), 1), 'quiet': round(quiet, 2), 'nan': bool(not np.all(np.isfinite(x))), 'clip': peak >= 0.999}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--asr', default='')
    ap.add_argument('--only', default='')
    ap.add_argument('--report', default='')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    man = json.load(open(a.manifest, encoding='utf-8'))
    base = os.path.dirname(a.manifest)
    only = set(filter(None, a.only.split(',')))
    keys = [k for k, c in man['clips'].items() if not only or c['v'] in only]
    if a.limit:
        keys = keys[: a.limit]
    rec = None
    if a.asr:
        import sherpa_onnx
        rec = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=f'{a.asr}/small-encoder.int8.onnx', decoder=f'{a.asr}/small-decoder.int8.onnx', tokens=f'{a.asr}/small-tokens.txt',
            language='de', task='transcribe', num_threads=3)
    rows = []
    for k in keys:
        c = man['clips'][k]
        x = decode(os.path.join(base, c['f']))
        row = {'key': k, 'voice': c['v'], 'dur': round(len(x) / 16000, 2), 'ref': c['t'], **signal_stats(x)}
        if rec:
            s = rec.create_stream()
            s.accept_waveform(16000, x)
            rec.decode_stream(s)
            row['hyp'] = s.result.text.strip()
            row['wer'] = round(wer(c['t'], row['hyp']), 2)
        rows.append(row)
        if rec:
            print(f"{k:34s} WER={row['wer']:.2f}  {row['ref']!r} -> {row['hyp']!r}", flush=True)
    bad = [r for r in rows if r['nan'] or r['clip'] or r['dur'] < 0.25 or r['dur'] > 6]
    print(f'\n{len(rows)} Clips geprüft; Signalprobleme: {len(bad)}')
    for r in bad:
        print('  PROBLEM', r['key'], r)
    if rec:
        per = {}
        for r in rows:
            per.setdefault(r['voice'], []).append(r['wer'])
        print('\nWortfehlerrate je Stimme (Mittel / Anteil Clips mit WER 0):')
        for v, w in sorted(per.items()):
            print(f'  {v:12s} {np.mean(w):.2f} / {np.mean([x == 0 for x in w]):.2f}  (n={len(w)})')
        allw = [r['wer'] for r in rows]
        print(f'  GESAMT       {np.mean(allw):.2f} / {np.mean([x == 0 for x in allw]):.2f}')
    if a.report:
        json.dump(rows, open(a.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
