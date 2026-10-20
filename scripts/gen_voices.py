#!/usr/bin/env python3
"""
Erzeugt die gesprochenen Clips (Meilenstein 4D) aus den Dialogdaten.

Eingabe : JSON mit Zeilen und Stimmprofilen (von `scripts/gen-voices.sh` aus `packages/shared/src/data/voices*.ts` exportiert)
Ausgabe : packages/client/public/voice/<lang>/<gruppe>/<ereignis>_<n>.mp3 und manifest.json (Schlüssel -> Datei, Dauer, Text)

Sprachsynthese lokal und kostenlos: Piper/VITS-Modelle, ausgeführt mit sherpa-onnx (Python-Paket `sherpa-onnx`, Apache-2.0).
Keine Netzwerkzugriffe, keine API-Schlüssel. Modelle (nur nachweislich frei nutzbare Stimmen):

  vits-piper-de_DE-thorsten-high / -medium / thorsten_emotional-medium
      Sprecher Thorsten Müller, Datensatz "Thorsten-Voice", Lizenz CC0 (Modellkarte der Pakete: "License: CC0")
  vits-piper-de_DE-kerstin-low
      Sprecherin "kerstin", Datensatz rhasspy/dataset-voice-kerstin, Lizenz CC0 1.0
  Englisch (--lang en im Export): vits-piper-en_US-joe-medium (CC0), -john-medium (gemeinfrei), -norman-medium (gemeinfrei),
      -kathleen-low (CC0); Lizenzangaben jeweils aus der MODEL_CARD des Pakets

Bezug der Modellpakete (Release "tts-models" von k2-fsa/sherpa-onnx), siehe scripts/gen-voices.sh und README.
Nachbearbeitung mit ffmpeg: Tonhöhe (rubberband), Raum/Klangfarbe je Profil, Normalisierung, MP3 (mono).

Aufruf:  gen_voices.py --lines lines.json --models <Ordner mit vits-piper-*> --out packages/client/public/voice/de [--only gruppe,...] [--force]
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np
import sherpa_onnx
import soundfile as sf

GEN_VERSION = 5
OUT_SR = 22050

MODELS = {
    'thorsten-high': ('vits-piper-de_DE-thorsten-high', 'de_DE-thorsten-high.onnx'),
    'thorsten-medium': ('vits-piper-de_DE-thorsten-medium', 'de_DE-thorsten-medium.onnx'),
    'thorsten-emotional': ('vits-piper-de_DE-thorsten_emotional-medium', 'de_DE-thorsten_emotional-medium.onnx'),
    'kerstin': ('vits-piper-de_DE-kerstin-low', 'de_DE-kerstin-low.onnx'),
    'en-joe': ('vits-piper-en_US-joe-medium', 'en_US-joe-medium.onnx'),
    'en-john': ('vits-piper-en_US-john-medium', 'en_US-john-medium.onnx'),
    'en-norman': ('vits-piper-en_US-norman-medium', 'en_US-norman-medium.onnx'),
    'en-kathleen': ('vits-piper-en_US-kathleen-low', 'en_US-kathleen-low.onnx'),
}

# Klangfarbe/Raum je Profil (ffmpeg-Filterketten nach der Tonhöhenverschiebung)
FX = {
    'none': 'highpass=f=70',
    'room': 'highpass=f=80,aecho=0.9:0.9:38|71:0.1|0.05',
    'helm': 'highpass=f=120,lowpass=f=6200,equalizer=f=1500:t=q:w=1.2:g=2,aecho=0.9:0.9:13|27:0.1|0.05',
    'hall': 'highpass=f=70,equalizer=f=170:t=q:w=1:g=2,aecho=0.92:0.9:75|150:0.12|0.06',
    'chapel': 'highpass=f=90,lowpass=f=6500,aecho=0.92:0.9:90|190:0.12|0.07',
    'air': 'highpass=f=100,equalizer=f=3200:t=q:w=1.5:g=1.5,aecho=0.92:0.92:93:0.08',
    'yard': 'highpass=f=90,lowpass=f=7000,aecho=0.9:0.9:113:0.09',
    'shop': 'highpass=f=90,lowpass=f=7000,aecho=0.9:0.9:27|46:0.1|0.06',
}


def slug(s):
    t = s.translate(str.maketrans({'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', '@': '_', ' ': '_'}))
    return ''.join(c if c.isalnum() or c in '._-' else '_' for c in t)


def load_tts(models_dir, key, cache={}):
    if key in cache:
        return cache[key]
    d, onnx = MODELS[key]
    p = os.path.join(models_dir, d)
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=f'{p}/{onnx}', tokens=f'{p}/tokens.txt', data_dir=f'{p}/espeak-ng-data',
                noise_scale=0.6, noise_scale_w=0.7, length_scale=1.0),
            num_threads=2, provider='cpu'))
    cache[key] = sherpa_onnx.OfflineTts(cfg)
    return cache[key]


def trim(x, sr):
    """Stille vorn/hinten entfernen (Schwelle relativ zum Spitzenwert), kurzen Rand lassen."""
    if len(x) == 0:
        return x
    thr = np.max(np.abs(x)) * 10 ** (-42 / 20)
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.035 * sr))
    b = min(len(x), idx[-1] + int(0.11 * sr))
    return x[a:b]


def run_ffmpeg(src, dst, af):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', af, '-ac', '1', '-ar', str(OUT_SR), '-c:a', 'pcm_f32le', dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)


def finish(x, gain_db):
    """Sprechpegel auf RMS -20 dBFS (nur aktive Stellen), weicher Begrenzer, kurze Ein-/Ausblendung."""
    act = x[np.abs(x) > np.max(np.abs(x)) * 0.05]
    rms = math.sqrt(float(np.mean(act ** 2))) if len(act) else 1e-4
    x = x * (10 ** (-20 / 20) / max(rms, 1e-5)) * 10 ** (gain_db / 20)
    ceil = 0.89
    x = np.where(np.abs(x) > 0.6, np.sign(x) * (0.6 + (ceil - 0.6) * np.tanh((np.abs(x) - 0.6) / (ceil - 0.6))), x)
    n_in, n_out = int(0.004 * OUT_SR), int(0.03 * OUT_SR)
    if len(x) > n_in + n_out:
        x[:n_in] *= np.linspace(0, 1, n_in)
        x[-n_out:] *= np.linspace(1, 0, n_out)
    return x.astype(np.float32)


def render(line, prof, models_dir, tmp, lang='de'):
    spk = prof['ttsEn'] if lang == 'en' else prof['tts']
    tts = load_tts(models_dir, spk['model'])
    a = tts.generate(line['text'], sid=spk['sid'], speed=prof['speed'])
    x = np.asarray(a.samples, dtype=np.float32)
    x = trim(x, a.sample_rate)
    raw, fx_in, fx_out = (os.path.join(tmp, n) for n in ('raw.wav', 'in.wav', 'out.wav'))
    sf.write(raw, x, a.sample_rate, subtype='FLOAT')
    # englische Sprecher sind schon unterschiedlich tief; halbe Verschiebung hält die Verständlichkeit
    ratio = 2 ** (prof['pitch'] * (0.5 if lang == 'en' else 1.0) / 12)
    chain = []
    if abs(prof['pitch']) > 0.01:
        chain.append(f'aresample={a.sample_rate},rubberband=pitch={ratio:.5f}:formant=shifted:pitchq=quality')
    chain.append(FX[prof['fx']])
    run_ffmpeg(raw, fx_out, ','.join(chain))
    y, sr = sf.read(fx_out, dtype='float32')
    y = trim(y, sr)
    y = finish(y, prof['gain'])
    sf.write(fx_in, y, sr, subtype='PCM_16')
    return y, fx_in


def encode(wav, mp3):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', str(OUT_SR), '-c:a', 'libmp3lame', '-b:a', '48k', '-write_xing', '0', mp3]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lines', required=True)
    ap.add_argument('--models', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--keep-wav', default='')
    args = ap.parse_args()

    data = json.load(open(args.lines, encoding='utf-8'))
    profiles = data['profiles']
    lang = data['lang']
    only = set(filter(None, args.only.split(',')))
    man_path = os.path.join(args.out, 'manifest.json')
    old = {}
    if os.path.exists(man_path):
        old = json.load(open(man_path, encoding='utf-8')).get('clips', {})
    clips = {}
    os.makedirs(args.out, exist_ok=True)
    total = len(data['lines'])
    with tempfile.TemporaryDirectory() as tmp:
        for i, line in enumerate(data['lines']):
            key = line['key']
            prof = profiles[line['profile']]
            other = 'tts' if lang == 'en' else 'ttsEn'
            relevant = {k: v for k, v in prof.items() if k != other}
            h = hashlib.sha1(json.dumps([GEN_VERSION, line['text'], relevant], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:10]
            if line['voice'] == 'advisor':
                rel = f"advisor/{slug(key[len('advisor.'):])}.mp3"
            else:
                g, ev, n = key.split('.')
                rel = f'{g}/{ev}_{n}.mp3'
            path = os.path.join(args.out, rel)
            selected = not only or line['voice'] in only or line['profile'] in only
            fresh = key in old and old[key].get('h') == h and os.path.exists(path)
            if (not selected or (fresh and not args.force)) and key in old and os.path.exists(path):
                clips[key] = old[key]
                continue
            if not selected:
                continue
            y, wav = render(line, prof, args.models, tmp, lang)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            encode(wav, path)
            if args.keep_wav:
                os.makedirs(args.keep_wav, exist_ok=True)
                os.replace(wav, os.path.join(args.keep_wav, key + '.wav'))
            clips[key] = {'f': rel, 'd': round(len(y) / OUT_SR, 2), 'h': h, 't': line['text'], 'v': line['voice']}
            if line.get('src'):
                clips[key]['x'] = 1  # Zeile aus fremder Datenquelle (advisor_lines.ts), nicht aus voices.de.ts
            print(f'[{i + 1}/{total}] {key}  {clips[key]["d"]:.2f}s  {os.path.getsize(path)} B', flush=True)
    manifest = {
        'lang': lang,
        'format': 'mp3',
        'sampleRate': OUT_SR,
        'generator': f'scripts/gen_voices.py v{GEN_VERSION} (Piper/VITS via sherpa-onnx, ffmpeg)',
        'clips': dict(sorted(clips.items())),
    }
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write('\n')
    size = sum(os.path.getsize(os.path.join(args.out, c['f'])) for c in clips.values() if os.path.exists(os.path.join(args.out, c['f'])))
    print(f'{len(clips)} Clips, {size / 1e6:.2f} MB, Manifest {man_path}')


if __name__ == '__main__':
    sys.exit(main())
