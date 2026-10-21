"""Texturen der Vegetation, die nicht in der Materialbibliothek des Material-Agenten liegen (Teilschritt 5):

  M_Foliage_Conifer  Nadelzweig (Fichte) mit Alpha: Hauptzweig von unten Mitte nach oben, wechselstaendige Seitenzweige,
                     Nadeln als kurze Striche (dunkel am Zweig, hellgruener Neutrieb an den Spitzen); Normal aus einem
                     Hoehenfeld (Nadeln erhaben), ORM: AO aus geglaetteter Deckung, Rauheit 0,8, A = Hoehe
  M_Flora            Farbpalette fuer Gras, Wiesenblumen, Farn (Geometrie ohne Alpha): 16 Spalten = Farben, V = Halmbasis
                     (unten, dunkler) bis Spitze (oben, heller/gelblicher); Normal flach, ORM: Rauheit 0,7

Alles prozedural (numpy + Pillow), reproduzierbar (feste Seeds), Eigenerstellung. Ausgabe als verlustfreie Quellen unter
assets/src/textures/<M>/{albedo,normal,orm}.png; danach erzeugt assets/blender/tools/textures.py die WebP-Fassungen.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/tools/veg_textures.py && \\
         /home/user/bpyenv/bin/python assets/blender/tools/textures.py --only=M_Foliage_Conifer,M_Flora
"""
import math
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'assets' / 'src' / 'textures'

# Spalten der Flora-Palette (sRGB): Halmfarben 0-6, Blueten 7-12, Samenstand 13, Stengel/braun 14, Farn 15
PALETTE = [
    ('#4a6626', '#86a548'),  # 0 Gras satt
    ('#56702c', '#9fb05a'),  # 1 Gras hell
    ('#5f7430', '#b9b468'),  # 2 Gras mit gelblichen Spitzen
    ('#6b7434', '#c8b878'),  # 3 trockenes Gras
    ('#7a7a3e', '#d6c48a'),  # 4 Strohgras / Samenhalme
    ('#3d5822', '#6f8f3a'),  # 5 Gras dunkel (Schatten, Waldsaum)
    ('#4e6a28', '#7c9a3c'),  # 6 Blattrosetten (Wegerich, Klee)
    ('#d9d6c6', '#f6f3e6'),  # 7 weiss (Margerite, Schafgarbe)
    ('#c9a020', '#f0d040'),  # 8 gelb (Hahnenfuss, Loewenzahn)
    ('#b4547a', '#e08aa8'),  # 9 rosa (Klee, Lichtnelke)
    ('#6e58b0', '#9a84d8'),  # 10 violett (Flockenblume, Glockenblume)
    ('#a8321e', '#d24a30'),  # 11 rot (Mohn, sparsam)
    ('#4f72b8', '#7c9ce0'),  # 12 blau (Kornblume, Wegwarte)
    ('#b8ad8a', '#e2d9b8'),  # 13 Samenstand hell
    ('#5a4430', '#7c5e40'),  # 14 Stengel/braun
    ('#2c4a1c', '#4f7a2c'),  # 15 Farn
]


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def save(name, albedo, normal, orm):
    d = SRC / name
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(albedo).save(d / 'albedo.png')
    Image.fromarray(normal).save(d / 'normal.png')
    Image.fromarray(orm).save(d / 'orm.png')
    print(f'{name}: {albedo.shape[1]}x{albedo.shape[0]} -> {d.relative_to(ROOT)}')


def flora(w=256, h=64):
    img = np.zeros((h, w, 4), np.uint8)
    cw = w // len(PALETTE)
    for i, (base, tip) in enumerate(PALETTE):
        b = hexrgb(base)
        t = hexrgb(tip)
        for y in range(h):
            v = 1.0 - y / (h - 1)  # Zeile 0 = oben = Spitze (Blender-V 1)
            k = v ** 0.8
            c = b + (t - b) * k
            img[y, i * cw:(i + 1) * cw, :3] = np.clip(c, 0, 255)
    img[..., 3] = 255
    normal = np.zeros((h, w, 3), np.uint8)
    normal[...] = (128, 128, 255)
    orm = np.zeros((h, w, 3), np.uint8)
    orm[...] = (255, 178, 0)
    save('M_Flora', img[..., :3].copy(), normal, orm)


def conifer(S=1024, ss=3, seed=8121):
    rng = np.random.default_rng(seed)
    W = S * ss
    col = Image.new('RGB', (W, W), (0, 0, 0))
    cov = Image.new('L', (W, W), 0)
    hgt = Image.new('L', (W, W), 0)
    dc = ImageDraw.Draw(col)
    dv = ImageDraw.Draw(cov)
    dh = ImageDraw.Draw(hgt)

    def P(x, y):
        # Einheitskoordinaten (0..1, y nach oben) -> Pixel
        return (x * W, (1 - y) * W)

    twigs = []
    # Hauptzweig: leicht gebogen von unten Mitte nach oben
    pts = []
    x, y = 0.5, 0.02
    ang = math.pi / 2 + rng.normal(0, 0.04)
    for i in range(26):
        pts.append((x, y))
        ang += rng.normal(0, 0.025)
        x += math.cos(ang) * 0.036
        y += math.sin(ang) * 0.036
    twigs.append((pts, 0.010, 1.0))
    # Seitenzweige wechselstaendig
    n_side = 16
    for k in range(n_side):
        t = 0.08 + 0.84 * k / n_side
        i = int(t * (len(pts) - 1))
        px, py = pts[i]
        side = 1 if k % 2 == 0 else -1
        a = math.pi / 2 - side * (0.95 + rng.normal(0, 0.08))
        L = (0.36 - 0.24 * t) * rng.uniform(0.85, 1.1)
        sp = []
        x, y = px, py
        for j in range(10):
            sp.append((x, y))
            a += side * 0.03 + rng.normal(0, 0.03)
            x += math.cos(a) * L / 9
            y += math.sin(a) * L / 9
        twigs.append((sp, 0.006, 0.75 - 0.3 * t))
    # Zweige zeichnen (braun)
    for tp, r, _ in twigs:
        for a, b in zip(tp[:-1], tp[1:]):
            dc.line([P(*a), P(*b)], fill=(58, 44, 30), width=max(1, int(r * W)))
            dv.line([P(*a), P(*b)], fill=255, width=max(1, int(r * W)))
            dh.line([P(*a), P(*b)], fill=150, width=max(1, int(r * W)))
    # Nadeln: kurze Striche beidseits, zur Spitze geneigt; aeltere dunkler, Neutrieb an den Spitzen hellgruen
    dark = np.array([30, 52, 26], np.float32)
    mid = np.array([44, 74, 34], np.float32)
    fresh = np.array([96, 132, 52], np.float32)
    for tp, r, wgt in twigs:
        seglen = [math.dist(a, b) for a, b in zip(tp[:-1], tp[1:])]
        total = sum(seglen)
        acc = 0.0
        for (a, b), sl in zip(zip(tp[:-1], tp[1:]), seglen):
            dx, dy = (b[0] - a[0]) / max(1e-6, sl), (b[1] - a[1]) / max(1e-6, sl)
            n = int(sl * 900)
            for m in range(n):
                f = m / max(1, n)
                tt = (acc + sl * f) / total
                x0 = a[0] + (b[0] - a[0]) * f
                y0 = a[1] + (b[1] - a[1]) * f
                for side in (-1, 1):
                    ang = math.atan2(dy, dx) + side * (0.75 + rng.normal(0, 0.18))
                    nl = rng.uniform(0.028, 0.042) * (1 - 0.35 * tt)
                    x1 = x0 + math.cos(ang) * nl
                    y1 = y0 + math.sin(ang) * nl
                    fr = max(0.0, (tt - 0.72) / 0.28) * rng.uniform(0.6, 1.0)
                    c = mid + (dark - mid) * rng.uniform(0, 1) * (1 - tt)
                    c = c + (fresh - c) * fr
                    c = c * rng.uniform(0.85, 1.15)
                    cc = tuple(int(v) for v in np.clip(c, 0, 255))
                    wpx = max(1, int(0.0055 * W))
                    dc.line([P(x0, y0), P(x1, y1)], fill=cc, width=wpx)
                    dv.line([P(x0, y0), P(x1, y1)], fill=255, width=wpx)
                    dh.line([P(x0, y0), P(x1, y1)], fill=int(170 + 70 * rng.uniform()), width=wpx)
            acc += sl
    col = col.resize((S, S), Image.LANCZOS)
    cov = cov.resize((S, S), Image.LANCZOS)
    hgt = hgt.resize((S, S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    c = np.asarray(col).astype(np.float32)
    a = np.asarray(cov).astype(np.float32) / 255.0
    # Farbe in den transparenten Bereich ausbluten lassen (keine dunklen Raender in den Mipmaps)
    pre = c * a[..., None]
    blur_c = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    blur_a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255.0
    fill = blur_c / np.maximum(blur_a[..., None], 1e-3)
    c = np.where(a[..., None] > 0.02, c / np.maximum(a[..., None], 1e-3), fill)
    c = np.clip(c, 0, 255)
    alb = np.concatenate([c, (a * 255)[..., None]], -1).astype(np.uint8)
    hf = np.asarray(hgt).astype(np.float32) / 255.0
    gx = np.zeros_like(hf)
    gy = np.zeros_like(hf)
    gx[:, 1:-1] = hf[:, 2:] - hf[:, :-2]
    gy[1:-1, :] = hf[:-2, :] - hf[2:, :]
    k = 3.0
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(hf)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([(nx / ln * 0.5 + 0.5), (ny / ln * 0.5 + 0.5), (nz / ln * 0.5 + 0.5)], -1)
    nrm = (nrm * 255).astype(np.uint8)
    ao = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))).astype(np.float32) / 255.0
    ao = 1.0 - 0.45 * ao
    orm = np.stack([ao * 255, np.full_like(ao, 0.8 * 255), np.zeros_like(ao), hf * 255], -1).astype(np.uint8)
    save('M_Foliage_Conifer', alb, nrm, orm[..., :3].copy())


if __name__ == '__main__':
    flora()
    conifer()
