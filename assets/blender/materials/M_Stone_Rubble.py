"""M_Stone_Rubble - Bruchsteinmauerwerk.

Echte Geometrie (Hoehenfeld-Ebene, ~1 Mio. Vertices): zufaellig gepackte, gerundete,
flach gelagerte Feldsteine dreier Groessenklassen (gewichtete Voronoi-Packung auf dem Torus,
Zwickelsteine in den Luecken), dazwischen zurueckliegender, ausgewaschener Kalkmoertel.
Farbmischung verschiedener Gesteine, Schmutz an den Fugen, Flechten. U horizontal, V oben.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 2.0
AN = 1.45  # Steine liegen flach: horizontal gestreckt
SPEC = C.Spec(
    "M_Stone_Rubble", seed=5202, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.06,
    description="Bruchsteinmauerwerk aus gemischten Feldsteinen, flach gelagert, Kalkmoertel ausgewaschen",
    orientation="U horizontal, V nach oben (Steine liegen flach)",
    tint={"hue": [-0.02, 0.02], "saturation": [0.85, 1.1], "value": [0.85, 1.1]},
    notes="Dient auch als Untergrund fuer abgeplatzten Putz (M_Plaster_Lime: Hoehen-Blend ueber orm.a).",
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    box = (T, T * AN)
    P, R = C.poisson_torus(rng, box, lambda r: r.uniform(0.15, 0.26), 400, gap=0.004)
    P, R = C.poisson_torus(rng, box, lambda r: r.uniform(0.08, 0.15), 4000, gap=0.004, existing=(P, R))
    P, R = C.poisson_torus(rng, box, lambda r: r.uniform(0.03, 0.08), 12000, gap=0.003, existing=(P, R))
    P = P / np.array([1.0, AN])
    C.log("Steine:", len(P))
    st = C.cell_stones(rng, n, T, P, R, aniso=(1.0, AN), gap=0.011, round_frac=0.38, dome=0.18,
                       height=0.018 + R * 0.16, surf_amp=0.06, seed=SPEC.seed, gap_noise=0.5, weight_frac=0.45)
    X, Y = st["X"], st["Y"]
    u, v = X / T, Y / T
    ID = st["ID"]
    # Moertel: zurueckliegend, ausgewaschen, sandig
    m1 = C.spectral(n, 11, beta=2.2, fmin=3)
    m2 = C.spectral(n, 12, beta=1.2, fmin=60)
    Hm = 0.007 + m1 * 0.004 + m2 * 0.0006
    grain = C.spectral(n, 13, beta=1.0, fmin=150)
    Hs = st["H"] + st["prof"] * grain * 0.0007
    H = np.maximum(Hs, Hm)
    is_stone = (Hs > Hm).astype(np.float32)
    # Albedo
    cols = C.palette_pick(rng, len(P), [
        (0.29, 0.275, 0.245), (0.335, 0.285, 0.215), (0.25, 0.215, 0.175), (0.19, 0.18, 0.165),
        (0.34, 0.29, 0.20), (0.235, 0.235, 0.225), (0.30, 0.255, 0.21)],
        weights=[3, 3, 2, 1.2, 1.2, 1.2, 2], jitter=0.05)
    ns = C.spectral(n, 21, beta=2.0, fmin=8)
    nf = C.spectral(n, 22, beta=1.3, fmin=40)
    offs = rng.random((len(P), 2))
    o = offs[ID]
    var = C.sample(ns, u + o[..., 0], v + o[..., 1]) * 0.10 + C.sample(nf, u + o[..., 1], v + o[..., 0]) * 0.06
    stc = cols[ID] * (1.0 + var)[..., None]
    edge = C.smoothstep(0.0, 0.03, st["e"])
    stc *= (0.68 + 0.32 * edge)[..., None]
    mc = np.array([0.27, 0.255, 0.22]) * (1.0 + 0.10 * m1 + 0.05 * C.spectral(n, 23, beta=1.0, fmin=80))[..., None]
    alb = stc * is_stone[..., None] + mc * (1 - is_stone[..., None])
    # Grossflaechiger Schmutz, Feuchte, Flechten
    big = C.spectral(n, 24, beta=2.6, fmin=1)
    alb *= (0.9 + 0.1 * np.tanh(big))[..., None]
    lich = C.smoothstep(0.9, 1.6, C.spectral(n, 25, beta=2.2, fmin=6)) * C.smoothstep(0.0, 0.8, C.spectral(n, 26, beta=1.0, fmin=60))
    lich *= is_stone
    alb = alb * (1 - 0.7 * lich[..., None]) + 0.7 * lich[..., None] * np.array([0.40, 0.40, 0.31])
    rough = np.where(is_stone > 0, 0.80 + 0.06 * np.tanh(var * 5), 0.93) + 0.04 * lich
    C.hf_build(SPEC, tile, H.astype(np.float32), alb.astype(np.float32), rough.astype(np.float32), geo_res=1024)


if __name__ == "__main__":
    C.run(SPEC, build)
