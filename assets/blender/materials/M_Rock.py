"""M_Rock - natuerlicher Fels (Findlinge, Felsbrocken, Aufschluesse).

Echte Geometrie (Hoehenfeld-Ebene): Bruchflaechen als zufaellig geneigte Ebenen-Facetten
zweier Groessenordnungen (mit weichen Kanten), Schichtfugen, tiefe Risse (verzerrtes
Zellnetz), raue Kornoberflaeche. Flechten (gelbgruen/grau) und Moos in Rissen.
Gelblich-graues Kalk-/Sandsteingestein. Fuer triplanare oder UV-Abbildung.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 3.0
SPEC = C.Spec(
    "M_Rock", seed=6313, tile_m=T, tiers=("1k", "512"), kind="ground", ao_distance=0.06,
    description="Natuerlicher Fels mit Bruchfacetten, Schichtfugen, Rissen, Flechten und Moos",
    orientation="isotrop; fuer triplanare Projektion geeignet",
    tint={"hue": [-0.02, 0.02], "saturation": [0.8, 1.15], "value": [0.8, 1.15]},
)


def facets(n, k, seed, slope, rng):
    F1, F2, ID, dx, dy = C.worley(n, k, seed, jitter=1.0, return_vec=True)
    g = np.random.default_rng(seed + 1).normal(0, slope, (k * k, 2))
    o = np.random.default_rng(seed + 2).normal(0, 1, k * k)
    gi = g[ID]
    plane = (gi[..., 0] * dx + gi[..., 1] * dy) / k + o[ID] * slope * 0.3 / k
    edge = C.smoothstep(0.0, 0.08, F2 - F1)
    return plane, edge, ID


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    p1, e1, _ = facets(n, 7, 1, 0.5, rng)
    p2, e2, _ = facets(n, 19, 2, 0.35, rng)
    H = C.blur(p1 * T, 2) * 0.6 + C.blur(p2 * T, 1.5) * 0.22
    H += C.spectral(n, 3, beta=2.8, fmin=1) * 0.05
    H -= (1 - e1) * 0.02 + (1 - e2) * 0.006
    # Schichtung
    strat = C.streaks(u, v + C.spectral(n, 4, beta=3.0, fmin=1) * 0.02, 5, 256, 4, beta=2.2)
    H += strat * 0.006
    # Risse
    wx = C.spectral(n, 6, beta=2.2, fmin=2) * 0.02
    wy = C.spectral(n, 7, beta=2.2, fmin=2) * 0.02
    F1, F2, _ = C.worley(n, 5, 8, jitter=1.0)
    ce = C.sample(F2 - F1, u + wx, v + wy)
    crack = C.smoothstep(0.02, 0.0, ce) * C.smoothstep(0.0, 1.0, C.spectral(n, 9, beta=2.0, fmin=2) + 0.6)
    H -= crack * 0.03
    grain = C.spectral(n, 10, beta=1.2, fmin=80)
    H += grain * 0.0005 + C.spectral(n, 11, beta=0.8, fmin=300) * 0.00012
    hp = C.blur(H, 2) - C.blur(H, 40)
    cav = C.smoothstep(-0.004, -0.02, hp)
    ridge = C.smoothstep(0.004, 0.02, hp)
    base = np.array([0.255, 0.240, 0.205])
    m1 = C.spectral(n, 12, beta=2.4, fmin=1)
    m2 = C.spectral(n, 13, beta=1.4, fmin=30)
    col = base * (1 + 0.14 * m1 + 0.04 * m2 + 0.10 * strat)[..., None]
    col = col * (1 - 0.25 * cav[..., None]) * (1 + 0.08 * ridge[..., None])
    col = col * (1 - 0.6 * crack[..., None])
    # Flechten
    lmask = C.smoothstep(0.7, 1.4, C.spectral(n, 14, beta=2.2, fmin=4)) * (1 - cav)
    lF1, _, lID = C.worley(n, 140, 15, jitter=1.0)
    spots = C.smoothstep(0.55, 0.3, lF1) * lmask
    lcol = np.where((np.random.default_rng(16).random(140 * 140)[lID] < 0.5)[..., None],
                    np.array([0.34, 0.33, 0.20]), np.array([0.40, 0.40, 0.37]))
    col = col * (1 - 0.8 * spots[..., None]) + 0.8 * spots[..., None] * lcol
    moss = np.clip(cav * 0.8 + crack, 0, 1) * C.smoothstep(0.2, 1.0, C.spectral(n, 17, beta=2.4, fmin=2))
    mcol = np.array([0.055, 0.075, 0.025]) * (1 + 0.4 * C.spectral(n, 18, beta=1.0, fmin=120))[..., None]
    col = col * (1 - moss[..., None]) + mcol * moss[..., None]
    H += moss * 0.002 * (1 + C.spectral(n, 19, beta=0.8, fmin=200))
    H += spots * 0.0004
    rough = 0.82 + 0.06 * grain * 0.3 + 0.08 * moss - 0.06 * ridge
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.5)


if __name__ == "__main__":
    C.run(SPEC, build)
