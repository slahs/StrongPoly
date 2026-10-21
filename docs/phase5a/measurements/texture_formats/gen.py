"""Testtexturen (1024², kachelbar, steinartig) fuer den Formatvergleich: albedo/normal/orm als PNG, JPEG, WebP."""
import os
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
N = 1024
rng = np.random.default_rng(7)


def tile_noise(freq, seed):
    r = np.random.default_rng(seed)
    g = r.random((freq, freq))
    x = np.linspace(0, freq, N, endpoint=False)
    i0 = np.floor(x).astype(int) % freq
    i1 = (i0 + 1) % freq
    f = x - np.floor(x)
    f = f * f * (3 - 2 * f)
    a = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i1] * f[None, :]
    b = g[i1][:, i0] * (1 - f)[None, :] + g[i1][:, i1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


h = sum(tile_noise(4 * 2 ** k, 10 + k) * 0.5 ** k for k in range(6))
h = (h - h.min()) / (h.max() - h.min())
# Quaderfugen
yy, xx = np.mgrid[0:N, 0:N]
row = yy // 128
mortar = ((yy % 128) < 8) | (((xx + (row % 2) * 96) % 192) < 8)
h = np.where(mortar, h * 0.25, 0.35 + h * 0.65)
base = np.array([0.60, 0.58, 0.54])
var = tile_noise(8, 3)[..., None] * 0.25
alb = np.clip((base[None, None, :] * (0.65 + 0.5 * h[..., None]) + var * np.array([0.12, 0.08, 0.03])), 0, 1)
Image.fromarray((alb * 255).astype(np.uint8)).save(f'{out}/albedo.png')
gx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
n = np.stack([-gx * 6, gy * 6, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(f'{out}/normal.png')
orm = np.stack([0.55 + 0.45 * h, 0.7 + 0.25 * (1 - h), np.zeros_like(h)], -1)
Image.fromarray((orm * 255).astype(np.uint8)).save(f'{out}/orm.png')
for k in ('albedo', 'normal', 'orm'):
    im = Image.open(f'{out}/{k}.png')
    im.save(f'{out}/{k}.jpg', quality=88)
    im.save(f'{out}/{k}.webp', quality=88)
    im.resize((512, 512), Image.LANCZOS).save(f'{out}/{k}_512.webp', quality=88)
print('ok')
