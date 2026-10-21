"""Laufzeit-Texturen aus Quellbildern erzeugen (WebP + kleinere Fassungen fuer die Grafikstufen).

Quelle (verlustfrei, NICHT ausgeliefert): assets/src/textures/<M_Name>/{albedo,normal,orm}.png (auch .tif/.jpg).
PNGs, die direkt unter packages/client/public/assets/textures/<M_Name>/ liegen, werden dorthin verschoben.
Ziel (ausgeliefert):  packages/client/public/assets/textures/<M_Name>/<karte>.webp  und  <karte>_<px>.webp
                      (z. B. albedo_512.webp fuer Niedrig; die Laufzeit waehlt die groesste Fassung <= assetTexMax)
Danach wird das Manifest neu geschrieben (node scripts/asset-manifest.mjs).

Begruendung WebP (Messung docs/phase5a/ARCHITECTURE.md): 1024er Albedo 12 KB WebP gegen 36 KB JPEG, 58 KB KTX2-ETC1S,
650 KB KTX2-UASTC; Dekodieren ~16 ms + Hochladen ~20 ms (Chromium/SwiftShader). KTX2 spart GPU-Speicher (1 statt 4 Byte je
Pixel) und wird von der Laufzeit bereits unterstuetzt (Datei <karte>.ktx2 daneben + Transcoder unter public/assets/basis/),
ist aber erst bei vielen Materialien (Phase 5B) noetig.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/tools/textures.py [--sizes=512,1024] [--only=M_Stone_Ashlar,...]
"""
import pathlib
import shutil
import subprocess
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'assets' / 'src' / 'textures'
PUB = ROOT / 'packages' / 'client' / 'public' / 'assets' / 'textures'
KINDS = ('albedo', 'normal', 'orm')
QUALITY = {'albedo': 90, 'orm': 92, 'normal': 95}


def args():
    a = {k[2:].split('=')[0]: (k.split('=', 1)[1] if '=' in k else True) for k in sys.argv[1:] if k.startswith('--')}
    sizes = [int(x) for x in str(a.get('sizes', '512,1024')).split(',') if x]
    only = set(str(a['only']).split(',')) if 'only' in a else None
    return sizes, only


def main():
    sizes, only = args()
    SRC.mkdir(parents=True, exist_ok=True)
    # PNG/TIF-Quellen aus dem ausgelieferten Ordner in die Quellablage verschieben
    if PUB.exists():
        for d in PUB.iterdir():
            if not d.is_dir():
                continue
            for f in d.iterdir():
                if f.suffix.lower() in ('.png', '.tif', '.tiff') and f.stem in KINDS:
                    (SRC / d.name).mkdir(parents=True, exist_ok=True)
                    shutil.move(str(f), str(SRC / d.name / f.name))
    n = 0
    for d in sorted(p for p in SRC.iterdir() if p.is_dir()):
        if only and d.name not in only:
            continue
        for kind in KINDS:
            src = next((d / f'{kind}{e}' for e in ('.png', '.tif', '.tiff', '.jpg') if (d / f'{kind}{e}').exists()), None)
            if src is None:
                continue
            im = Image.open(src)
            im = im.convert('RGBA' if kind == 'albedo' and im.mode in ('RGBA', 'LA') else 'RGB')
            out = PUB / d.name
            out.mkdir(parents=True, exist_ok=True)
            q = QUALITY[kind]
            im.save(out / f'{kind}.webp', quality=q, method=6)
            for s in sizes:
                if s < max(im.size):
                    im.resize((s, s * im.size[1] // im.size[0]), Image.LANCZOS).save(out / f'{kind}_{s}.webp', quality=q, method=6)
            n += 1
            print(f'{d.name}/{kind}: {im.size[0]}x{im.size[1]} -> webp' + ''.join(f', {s}' for s in sizes if s < max(im.size)))
    print(f'{n} Karten geschrieben')
    subprocess.run(['node', str(ROOT / 'scripts' / 'asset-manifest.mjs')], cwd=str(ROOT), check=False)


if __name__ == '__main__':
    main()
