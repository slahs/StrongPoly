"""M_Stone_Cobble - Kopfsteinpflaster (Feldsteine/Katzenkopf).

Echte Geometrie (Hoehenfeld-Ebene): dicht gesetzte, gewoelbte Rundsteine (12-22 cm), oben
abgelaufen (glatter, heller), in Sand-/Erdfugen mit Kies, Moos und Grasspitzen in den Fugen.
Bodenmaterial: U/V beliebig (isotrop).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 2.0
SPEC = C.Spec(
    "M_Stone_Cobble", seed=5303, tile_m=T, tiers=("1k", "512"), kind="ground", ao_distance=0.05,
    description="Kopfsteinpflaster aus gemischten Rundsteinen, abgelaufene Kuppen, Sand-/Erdfugen mit Moos",
    orientation="isotrop (Boden), keine Vorzugsrichtung",
    tint={"hue": [-0.02, 0.02], "saturation": [0.85, 1.1], "value": [0.85, 1.1]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.075, 0.11), 3000, gap=0.006)
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.045, 0.075), 6000, gap=0.005, existing=(P, R))
    C.log("Steine:", len(P))
    st = C.cell_stones(rng, n, T, P, R, gap=0.007, round_frac=0.6, dome=0.5, height=0.022 + R * 0.25,
                       surf_amp=0.035, seed=SPEC.seed, gap_noise=0.6, weight_frac=0.5)
    X, Y = st["X"], st["Y"]
    u, v = X / T, Y / T
    ID = st["ID"]
    # Fugenfuellung: Sand/Erde mit Kies
    f1 = C.spectral(n, 31, beta=2.0, fmin=4)
    f2 = C.spectral(n, 32, beta=1.0, fmin=120)
    Hf = 0.0065 + f1 * 0.003 + f2 * 0.0008
    gF1, gF2, gID = C.worley(n, 180, 33, jitter=0.95)
    grav = C.smoothstep(0.42, 0.18, gF1) * (np.random.default_rng(34).random(180 * 180)[gID] < 0.35)
    Hf = Hf + grav * 0.003
    grain = C.spectral(n, 35, beta=1.1, fmin=150)
    Hs = st["H"] + st["prof"] * grain * 0.0005
    H = np.maximum(Hs, Hf)
    is_stone = (Hs > Hf).astype(np.float32)
    cols = C.palette_pick(rng, len(P), [
        (0.26, 0.245, 0.225), (0.31, 0.265, 0.205), (0.20, 0.185, 0.165), (0.16, 0.15, 0.14),
        (0.33, 0.295, 0.24), (0.28, 0.22, 0.175)], weights=[3, 2.5, 2, 1.5, 1.5, 1.5], jitter=0.06)
    ns = C.spectral(n, 36, beta=1.8, fmin=10)
    offs = rng.random((len(P), 2))
    o = offs[ID]
    var = C.sample(ns, u + o[..., 0], v + o[..., 1]) * 0.09
    stc = cols[ID] * (1.0 + var)[..., None]
    top = C.smoothstep(0.75, 0.15, st["rel"]) * st["prof"]  # abgelaufene Kuppe
    stc = stc * (1 + 0.12 * top[..., None])
    edge = C.smoothstep(0.0, 0.025, st["e"])
    stc *= (0.6 + 0.4 * edge)[..., None]
    dirt = np.array([0.17, 0.14, 0.105]) * (1 + 0.15 * f1)[..., None]
    sand = np.array([0.30, 0.26, 0.20])
    jc = dirt * (1 - 0.4 * grav[..., None]) + 0.4 * grav[..., None] * sand
    moss = C.smoothstep(0.2, 1.2, C.spectral(n, 37, beta=2.4, fmin=3)) * C.smoothstep(-0.3, 0.7, C.spectral(n, 38, beta=1.0, fmin=80))
    moss_j = moss * (1 - is_stone) + moss * is_stone * (1 - edge) * 0.6
    mc = np.array([0.075, 0.10, 0.035]) * (1 + 0.3 * C.spectral(n, 39, beta=1.0, fmin=100))[..., None]
    alb = stc * is_stone[..., None] + jc * (1 - is_stone[..., None])
    alb = alb * (1 - moss_j[..., None]) + mc * moss_j[..., None]
    big = C.spectral(n, 40, beta=2.6, fmin=1)
    alb *= (0.9 + 0.1 * np.tanh(big))[..., None]
    rough = np.where(is_stone > 0, 0.78 - 0.18 * top, 0.95)
    rough = rough * (1 - moss_j) + 0.9 * moss_j
    Hm = H + moss_j * 0.0015 * (1 + C.spectral(n, 41, beta=0.8, fmin=200))
    C.hf_build(SPEC, tile, Hm.astype(np.float32), alb.astype(np.float32), rough.astype(np.float32), geo_res=1024)


if __name__ == "__main__":
    C.run(SPEC, build)
