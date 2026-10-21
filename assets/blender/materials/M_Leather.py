"""M_Leather - pflanzlich gegerbtes Rindsleder (Guertel, Schuhe, Taschen, Ruestungsteile).

Echte Geometrie (Hoehenfeld-Ebene): Narbenbild (kleine gewoelbte Zellen mit feinen
Furchen), Knickfalten unterschiedlicher Richtung, Poren, Kratzer; abgeriebene, glattere und
hellere Stellen. U/V isotrop.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 0.35
SPEC = C.Spec(
    "M_Leather", seed=6010, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.004,
    description="Pflanzlich gegerbtes Leder: Narbung, Knickfalten, Poren, Kratzer, abgeriebene Stellen",
    orientation="isotrop",
    tint={"hue": [-0.04, 0.04], "saturation": [0.6, 1.25], "value": [0.6, 1.35]},
    notes="Grundton mittelbraun; ueber tint dunkler/heller faerbbar (z. B. Ruestungsleder dunkel).",
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    warpu = C.spectral(n, 1, beta=2.5, fmin=2) * 0.004
    warpv = C.spectral(n, 2, beta=2.5, fmin=2) * 0.004
    F1, F2, ID = C.worley(n, 110, 3, jitter=1.0)
    e = C.sample(F2 - F1, u + warpu, v + warpv)
    f1 = C.sample(F1, u + warpu, v + warpv)
    grain = 0.00012 * (1 - np.clip(f1 / 0.9, 0, 1) ** 2) - 0.00012 * C.smoothstep(0.12, 0.0, e)
    F1b, F2b, _ = C.worley(n, 34, 4, jitter=1.0)
    creases_big = C.smoothstep(0.08, 0.0, C.sample(F2b - F1b, u + warpv * 3, v + warpu * 3))
    H = grain - creases_big * 0.00035
    # Knickfalten
    wr = np.zeros((n, n), np.float32)
    for i in range(14):
        a = rng.uniform(0, np.pi)
        cx, cy = rng.random(2)
        L = rng.uniform(0.15, 0.45)
        dx = (u - cx + 0.5) % 1 - 0.5
        dy = (v - cy + 0.5) % 1 - 0.5
        along = dx * np.cos(a) + dy * np.sin(a)
        across = -dx * np.sin(a) + dy * np.cos(a) + C.spectral(256, 20 + i, beta=2.6, fmin=1)[
            (np.clip((along + 0.5) * 255, 0, 255)).astype(int), 7] * 0.004
        m = C.smoothstep(L / 2, L / 2 * 0.6, np.abs(along))
        wr = np.maximum(wr, m * np.exp(-(across / rng.uniform(0.0015, 0.004)) ** 2))
    H -= wr * 0.0006
    H += C.spectral(n, 5, beta=2.6, fmin=1) * 0.0008
    pores = C.smoothstep(2.2, 3.0, C.spectral(n, 6, beta=0.6, fmin=200))
    H -= pores * 0.00006
    scr = np.zeros((n, n), np.float32)
    for i in range(10):
        a = rng.uniform(0, np.pi)
        cx, cy = rng.random(2)
        dx = (u - cx + 0.5) % 1 - 0.5
        dy = (v - cy + 0.5) % 1 - 0.5
        along = dx * np.cos(a) + dy * np.sin(a)
        across = -dx * np.sin(a) + dy * np.cos(a)
        m = C.smoothstep(0.08, 0.03, np.abs(along)) * np.exp(-(across / 0.0012) ** 2)
        scr = np.maximum(scr, m)
    H -= scr * 0.0001
    wear = C.smoothstep(0.6, 1.6, C.spectral(n, 7, beta=2.6, fmin=2))
    H = H * (1 - 0.5 * wear)
    base = np.array([0.135, 0.068, 0.033])
    m1 = C.spectral(n, 8, beta=2.2, fmin=2)
    col = base * (1 + 0.18 * m1)[..., None]
    col = col * (1 - 0.35 * C.smoothstep(0.1, 0.0, e)[..., None] * (1 - wear[..., None]))
    col = col * (1 - 0.4 * creases_big[..., None]) * (1 - 0.45 * wr[..., None])
    col = col * (1 + 0.2 * wear[..., None]) + np.array([0.012, 0.007, 0.004]) * wear[..., None]
    col = col * (1 + 0.6 * scr[..., None])
    rough = 0.62 - 0.17 * wear + 0.08 * creases_big + 0.05 * C.smoothstep(0.1, 0.0, e)
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.0)


if __name__ == "__main__":
    C.run(SPEC, build)
