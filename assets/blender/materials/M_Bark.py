"""M_Bark - Eichen-/Laubbaumrinde (Staemme, dicke Aeste).

Echte Geometrie (Hoehenfeld-Ebene): tiefe Laengsfurchen als verzerrtes, senkrecht
gestrecktes Zellnetz, dazwischen Borkenplatten mit Querrissen, faseriger Laengsstruktur und
abgeriebenen Kanten; Moos/Flechten bevorzugt in den Furchen und auf einer Seite.
V = Stammachse (aufwaerts), U = Umfang.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.0
SPEC = C.Spec(
    "M_Bark", seed=6414, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.03, albedo_ao=0.35,
    description="Tief gefurchte Laubbaumrinde mit Borkenplatten, Querrissen, Moos und Flechten",
    orientation="V entlang der Stammachse, U um den Umfang",
    tint={"hue": [-0.02, 0.03], "saturation": [0.8, 1.2], "value": [0.8, 1.15]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    wx = C.spectral(n, 1, beta=2.6, fmin=1) * 0.012
    wy = C.spectral(n, 2, beta=2.6, fmin=1) * 0.03
    F1, F2, ID = C.worley(n, 9, 3, jitter=1.0, aspect=(1.0, 0.25))
    e = C.sample(F2 - F1, u + wx, v + wy)
    plate = C.smoothstep(0.015, 0.16, e)
    prof = np.sqrt(plate)
    H = prof * 0.028
    # zweite, feinere Plattenebene
    F1b, F2b, _ = C.worley(n, 20, 4, jitter=1.0, aspect=(1.0, 0.3))
    eb = C.sample(F2b - F1b, u + wx * 1.5, v + wy)
    H -= C.smoothstep(0.08, 0.0, eb) * 0.006 * plate
    # Querrisse in den Platten
    q = np.abs(np.sin((v + wy * 0.5 + C.spectral(n, 5, beta=2.0, fmin=3) * 0.01) * np.pi * 26))
    qm = C.smoothstep(0.08, 0.0, q) * C.smoothstep(0.2, 1.0, C.spectral(n, 6, beta=2.0, fmin=6) + 0.4)
    H -= qm * plate * 0.006
    fib = C.streaks(v, u, 7, 1024, 10, beta=1.2)
    H += fib * 0.0008 + C.spectral(n, 8, beta=1.0, fmin=200) * 0.0003
    H += C.spectral(n, 9, beta=2.6, fmin=1) * 0.004
    # Farben
    top = np.array([0.105, 0.094, 0.080])
    deep = np.array([0.055, 0.038, 0.026])
    col = deep * (1 - plate[..., None]) + top * plate[..., None]
    col = col * (1 + 0.12 * fib + 0.1 * C.spectral(n, 10, beta=2.0, fmin=4))[..., None]
    col = col * (1 - 0.5 * qm[..., None] * plate[..., None])
    worn = C.smoothstep(0.6, 1.0, prof) * C.smoothstep(0.3, 1.4, C.spectral(n, 11, beta=2.2, fmin=4))
    col = col * (1 + 0.15 * worn[..., None])
    side = 0.5 + 0.5 * np.cos((u - 0.25) * 2 * np.pi)  # Wetterseite
    moss = C.smoothstep(0.55, 1.0, side * 0.7 + 0.5 * C.spectral(n, 12, beta=2.4, fmin=2) * 0.5 + (1 - plate) * 0.25)
    moss *= C.smoothstep(-0.2, 0.6, C.spectral(n, 13, beta=1.2, fmin=40))
    mcol = np.array([0.06, 0.085, 0.025]) * (1 + 0.4 * C.spectral(n, 14, beta=1.0, fmin=150))[..., None]
    col = col * (1 - moss[..., None]) + mcol * moss[..., None]
    lF1, _, lID = C.worley(n, 70, 15, jitter=1.0)
    lich = C.smoothstep(0.45, 0.25, lF1) * plate * C.smoothstep(1.2, 1.8, C.spectral(n, 16, beta=2.2, fmin=3))
    col = col * (1 - 0.5 * lich[..., None]) + 0.5 * lich[..., None] * np.array([0.24, 0.25, 0.19])
    H += moss * 0.0025 * (1 + C.spectral(n, 17, beta=0.8, fmin=200)) + lich * 0.0005
    rough = 0.88 + 0.05 * moss - 0.06 * worn
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.2)


if __name__ == "__main__":
    C.run(SPEC, build)
