"""M_Roof_Shingle - gespaltene Holzschindeln (Laerche/Eiche), silbergrau verwittert.

Echte Geometrie: jede Schindel ist ein geschlossener, keilfoermiger Koerper (unten ~10 mm,
oben ~3 mm) mit unregelmaessiger, leicht ausgefranster Unterkante, Schuesselung und
Verdrehung; Reihen mit zufaelligen Breiten (8-17 cm), Stossfugen versetzt.
Shader: Spaltholz-Faser (entlang V), Spaltrisse, Verwitterungsgrau, Fleckigkeit, Moos/Flechten
in den Fugen und an den unteren Kanten. V = Dachgefaelle aufwaerts, U entlang der Traufe.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.2
NROWS = 10
LATT = T / NROWS  # 12 cm sichtbar
LEN = 0.40
SPEC = C.Spec(
    "M_Roof_Shingle", seed=5808, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.035, albedo_ao=0.6,
    description="Gespaltene Holzschindeln, silbergrau verwittert, mit Spaltrissen, Moos und Flechten",
    orientation="V = Dachgefaelle aufwaerts (zum First), U entlang der Traufe",
    tint={"hue": [-0.02, 0.02], "saturation": [0.8, 1.2], "value": [0.8, 1.12]},
)


def shingle(rng, cx, w, y0):
    nx, ny = 18, 48
    s = np.linspace(-w / 2, w / 2, nx + 1)
    # unregelmaessige Unterkante: leicht schraeg, abgerundete Ecken, ausgefranst
    slant = rng.normal(0, 0.008)
    rc = rng.uniform(0.004, 0.012)
    corner = np.clip(1 - (w / 2 - np.abs(s)) / rc, 0, 1) ** 2 * rc
    fray = C.sample(C.spectral(64, int(rng.integers(1 << 20)), beta=1.5, fmin=4), s / 0.3, 0.3) * 0.0025
    tmin = slant * s / (w / 2) + corner + np.abs(fray)
    tmin -= tmin.min()
    jj = np.linspace(0, 1, ny + 1) ** 1.5
    S, J = np.meshgrid(s, jj)
    Tm = np.broadcast_to(tmin, S.shape)
    t = Tm + J * (LEN - Tm)
    th_bot = rng.uniform(0.008, 0.012)
    th = th_bot - (th_bot - 0.003) * t / LEN
    lift = 2.4 * th_bot
    cup = rng.normal(0, 0.0015)
    twist = rng.normal(0, 0.02)
    z = lift * (1 - t / LEN) + th + cup * (1 - (S / (w / 2)) ** 2) + twist * S * (1 - t / LEN) * 0.3
    er = 0.004
    de = np.clip((t - Tm) / er, 0, 1)
    z -= th * 0.5 * (1 - np.sqrt(1 - (1 - de) ** 2))
    top = np.stack([S, t, z], -1)
    V, Q = C.slab_from_grid(top, 0.003)
    V = V @ C.rot_z(rng.normal(0, 0.01)).T
    V[:, 0] += cx
    V[:, 1] += y0 + rng.normal(0, 0.003)
    tt = np.concatenate([t.ravel(), t.ravel()])
    ss = np.concatenate([S.ravel(), S.ravel()]) / (w / 2)
    return V, Q, tt, ss


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    Vs, Qs, A = [], [], {"t": [], "s": [], "rnd": [], "rnd2": [], "loc": []}
    off = 0
    for r in range(NROWS):
        ws = []
        while sum(ws) < T - 0.17:
            ws.append(rng.uniform(0.08, 0.17))
        rest = T - sum(ws)
        if rest < 0.07:
            ws[-1] += rest
        else:
            ws.append(rest)
        x = rng.uniform(0, T)
        for w in ws:
            gap = rng.uniform(0.002, 0.006)
            V, Q, tt, ss = shingle(rng, x + w / 2, w - gap, r * LATT)
            x += w
            Vs.append(V)
            Qs.append(Q + off)
            off += len(V)
            A["t"].append(tt)
            A["s"].append(ss)
            A["rnd"].append(np.full(len(V), rng.random()))
            A["rnd2"].append(np.full(len(V), rng.random()))
            A["loc"].append(V - V.mean(0) + rng.uniform(-30, 30, 3))
    V = np.concatenate(Vs)
    S = C.Shader("Shingle", T)
    t = S.attr("t")
    sa = S.attr("s")
    rnd = S.attr("rnd")
    loc = S.attr("loc", out="Vector")
    base = S.ramp(rnd, [
        (0.0, (0.160, 0.142, 0.118)),
        (0.3, (0.205, 0.185, 0.158)),
        (0.5, (0.150, 0.118, 0.085)),
        (0.7, (0.190, 0.150, 0.108)),
        (0.85, (0.215, 0.195, 0.165)),
        (1.0, (0.115, 0.095, 0.075)),
    ])
    fib = S.noise(S.vmath("MULTIPLY", loc, (60.0, 1.5, 60.0)), 1.0, detail=6, rough=0.6)
    fib2 = S.noise(S.vmath("MULTIPLY", loc, (250.0, 6.0, 250.0)), 1.0, detail=3, rough=0.5)
    col = S.hsv(base, 0.5, 1.0, S.remap(fib, 0.3, 0.7, 0.78, 1.18))
    col = S.hsv(col, 0.5, 1.0, S.remap(fib2, 0.3, 0.7, 0.9, 1.08))
    # braunerer, weniger verwitterter Holzton in geschuetzten Bereichen / Unterkante dunkel
    lower = S.smooth(t, 0.0, 0.04)
    col = S.mixc(S.hsv(col, 0.5, 0.9, 0.6), col, lower)
    prot = S.smooth(t, LATT - 0.02, LATT + 0.01)
    col = S.mixc(col, (0.12, 0.085, 0.055), S.mul(prot, 0.6))
    big = S.pnoise(4, detail=4, rough=0.6, seed=3)
    col = S.hsv(col, 0.5, 1.0, S.remap(big, 0.3, 0.7, 0.78, 1.08))
    # Spaltrisse entlang der Faser
    split = S.smooth(S.noise(S.vmath("MULTIPLY", loc, (120.0, 3.0, 120.0)), 1.0, detail=2), 0.73, 0.80)
    col = S.mixc(col, (0.03, 0.025, 0.02), S.mul(split, 0.8))
    # Moos/Flechten
    side = S.smooth(S.math("ABSOLUTE", sa), 0.85, 0.99)
    mn = S.smooth(S.pnoise(5, detail=5, seed=6), 0.5, 0.66)
    moss = S.mul(S.maxi(S.mul(side, 0.8), S.smooth(t, 0.05, 0.0)), S.mul(mn, S.smooth(S.noise(loc, 90.0, 3), 0.35, 0.6)))
    col = S.mixc(col, S.mixc((0.05, 0.07, 0.02), (0.12, 0.14, 0.04), S.noise(loc, 160.0, 2)), moss)
    lv = S.voronoi(loc, 35.0)
    lm = S.mul(S.smooth(lv, 0.25, 0.08), S.smooth(S.pnoise(3, detail=3, seed=8), 0.55, 0.68))
    col = S.mixc(col, (0.33, 0.33, 0.27), S.mul(lm, 0.7))
    micro = S.add(S.mul(S.sub(fib, 0.5), 0.0010), S.mul(S.sub(fib2, 0.5), 0.0005))
    micro = S.add(micro, S.mul(split, -0.0015))
    micro = S.add(micro, S.mul(moss, S.mul(S.noise(loc, 300.0, 4), 0.003)))
    rough = S.add(S.remap(fib, 0.3, 0.7, 0.78, 0.9), S.mul(moss, 0.08))
    mat = S.finish(col, rough, 0.0, micro)
    C.mesh_from_arrays("Shingles", V, np.concatenate(Qs), point_attrs={k: np.concatenate(v) for k, v in A.items()},
                       material=mat, collection=tile)
    gv, gq = C.grid(4, 4, 0, 0, T, T)
    gv[:, 2] = -0.01
    S2 = C.Shader("Under", T)
    C.mesh_from_arrays("Under", gv, gq, material=S2.finish((0.03, 0.025, 0.02), 0.9, 0.0, None), collection=tile)
    C.log("Schindel-Vertices:", len(V))


if __name__ == "__main__":
    C.run(SPEC, build)
