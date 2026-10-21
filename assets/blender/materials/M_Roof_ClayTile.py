"""M_Roof_ClayTile - Biberschwanz-Doppeldeckung aus gebranntem Ton.

Echte Geometrie: jeder Ziegel ist ein geschlossener Koerper (14 mm) mit Segmentbogen-Schnitt
am unteren Ende, leichter Querwoelbung, auf den darunterliegenden Reihen aufliegend
(geneigt), Reihen um eine halbe Ziegelbreite versetzt, kleine Lage-/Drehfehler,
gelegentlich abgeschlagene Ecken. Shader: Ziegelfarben (rot/orange/braun, einzelne dunkel
gebrannte oder neuere Ziegel), feine Laengsriefen (Strichbiber), Poren, Schmutz an den
Unterkanten, Flechten-Tupfen, Moos in den Stoss- und Ueberdeckungsfugen.
V = Dachgefaelle aufwaerts (First oben), U entlang der Traufe.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

NX = 7          # Ziegel je Reihe
NROWS = 8
T = 1.2
W = T / NX      # Teilung inkl. Stossfuge
LATT = T / NROWS  # sichtbare Reihenhoehe 15 cm
LEN = 0.38
TH = 0.014
SPEC = C.Spec(
    "M_Roof_ClayTile", seed=5707, tile_m=T, tiers=("2k", "1k", "512"), kind="wall", ao_distance=0.04, albedo_ao=0.6,
    description="Biberschwanz-Ziegeldach (Doppeldeckung), gebrannter Ton, gealtert mit Flechten und Moos",
    orientation="V = Dachgefaelle aufwaerts (zum First), U entlang der Traufe",
    tint={"hue": [-0.025, 0.02], "saturation": [0.8, 1.1], "value": [0.8, 1.1]},
    notes="Kachel = 7 Ziegel x 8 Reihen (Lattweite 15 cm).",
)


def tile_mesh(rng, cx, y0):
    nx, ny = 22, 56
    w = W - rng.uniform(0.003, 0.007)
    s = np.linspace(-w / 2, w / 2, nx + 1)
    seg = rng.uniform(0.022, 0.032)  # Bogenstich
    chip = rng.random() < 0.18
    chip_side = rng.choice([-1, 1])
    chip_d = rng.uniform(0.01, 0.03)
    tmin = seg * (s / (w / 2)) ** 2
    if chip:
        cs = np.clip((s * chip_side - w * 0.15) / (w * 0.35), 0, 1)
        tmin = tmin + chip_d * cs ** 1.5
    jj = np.linspace(0, 1, ny + 1) ** 1.6  # dichter am sichtbaren unteren Ende
    S, J = np.meshgrid(s, jj)
    Tm = np.broadcast_to(tmin, S.shape)
    t = Tm + J * (LEN - Tm)
    k = rng.normal(0, 0.0012)
    lift = 2.6 * TH * rng.uniform(0.92, 1.08)
    z = lift * (1 - t / LEN) + TH + k * (1 - (S / (w / 2)) ** 2)
    # gerundete Unterkante (sichtbar in der Normal-Map)
    edge_r = rng.uniform(0.005, 0.009)
    de = np.clip((t - Tm) / edge_r, 0, 1)
    z -= TH * 0.75 * (1 - np.sqrt(1 - (1 - de) ** 2))
    # seitliche Kanten leicht gerundet
    ds = np.clip((w / 2 - np.abs(S)) / 0.004, 0, 1)
    z -= TH * 0.4 * (1 - np.sqrt(1 - (1 - ds) ** 2))
    top = np.stack([S, t, z], -1)
    V, Q = C.slab_from_grid(top, TH)
    ang = rng.normal(0, 0.012)
    V = V @ C.rot_z(ang).T
    V[:, 0] += cx + rng.normal(0, 0.002)
    V[:, 1] += y0 + rng.normal(0, 0.002)
    V[:, 2] += rng.normal(0, 0.0008)
    tt = np.concatenate([t.ravel(), t.ravel()])
    ss = np.concatenate([S.ravel(), S.ravel()]) / (w / 2)
    return V, Q, tt, ss


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    Vs, Qs, A = [], [], {"t": [], "s": [], "rnd": [], "rnd2": [], "loc": []}
    off = 0
    for r in range(NROWS):
        y0 = r * LATT
        shift = (W / 2) * (r % 2)
        for i in range(NX):
            V, Q, tt, ss = tile_mesh(rng, i * W + W / 2 + shift, y0)
            Vs.append(V)
            Qs.append(Q + off)
            off += len(V)
            A["t"].append(tt)
            A["s"].append(ss)
            A["rnd"].append(np.full(len(V), rng.random()))
            A["rnd2"].append(np.full(len(V), rng.random()))
            A["loc"].append(V - V.mean(0) + rng.uniform(-30, 30, 3))
    V = np.concatenate(Vs)
    S = C.Shader("Clay", T)
    t = S.attr("t")
    sa = S.attr("s")
    rnd = S.attr("rnd")
    rnd2 = S.attr("rnd2")
    loc = S.attr("loc", out="Vector")
    base = S.ramp(rnd, [
        (0.00, (0.235, 0.100, 0.052)),
        (0.20, (0.310, 0.130, 0.060)),
        (0.42, (0.350, 0.165, 0.078)),
        (0.60, (0.280, 0.125, 0.065)),
        (0.80, (0.370, 0.190, 0.098)),
        (0.93, (0.205, 0.100, 0.060)),
        (1.00, (0.150, 0.080, 0.050)),
    ])
    mott = S.noise(loc, 40.0, detail=5, rough=0.6)
    col = S.hsv(base, 0.5, 0.88, S.remap(mott, 0.3, 0.7, 0.74, 1.02))
    # Alterung: Schmutz/Russ zur unteren Kante hin (sichtbarer Bereich t < LATT)
    lower = S.smooth(t, 0.0, 0.05)
    col = S.mixc(S.hsv(col, 0.5, 0.8, 0.62), col, lower)
    big = S.pnoise(4, detail=4, rough=0.6, seed=3)
    col = S.hsv(col, 0.5, S.remap(big, 0.3, 0.7, 0.7, 1.05), S.remap(big, 0.3, 0.7, 0.82, 1.06))
    # Flechten (hell gelbgrau, rund)
    lv = S.voronoi(loc, 30.0, rand=1.0)
    lm = S.mul(S.smooth(lv, 0.30, 0.10), S.smooth(S.pnoise(4, detail=4, seed=5), 0.56, 0.68))
    col = S.mixc(col, (0.36, 0.35, 0.27), S.mul(lm, 0.75))
    # Moos in den Fugen (Stossfuge |s|~1 und Ueberdeckungslinie t ~ LATT)
    side = S.smooth(S.math("ABSOLUTE", sa), 0.80, 0.98)
    overl = S.mul(S.smooth(t, LATT - 0.03, LATT - 0.005), S.smooth(t, LATT + 0.03, LATT))
    mn = S.smooth(S.pnoise(5, detail=5, seed=6), 0.48, 0.66)
    moss = S.mul(S.maxi(side, overl), S.mul(mn, S.smooth(S.noise(loc, 90.0, 3), 0.35, 0.6)))
    mcol = S.mixc((0.05, 0.075, 0.02), (0.13, 0.15, 0.04), S.noise(loc, 160.0, 2))
    col = S.mixc(col, mcol, moss)
    # Mikrostruktur: Strichbiber-Riefen, Poren, Rauheit
    rib = S.math("SINE", S.mul(sa, 3.14159 * 7.0))
    grain = S.noise(loc, 900.0, detail=2)
    pores = S.smooth(S.voronoi(loc, 400.0), 0.15, 0.0)
    micro = S.add(S.mul(rib, 0.00018), S.mul(S.sub(grain, 0.5), 0.00025))
    micro = S.add(micro, S.mul(pores, -0.0003))
    micro = S.add(micro, S.mul(moss, S.mul(S.noise(loc, 300.0, 4), 0.003)))
    rough = S.add(S.remap(mott, 0.3, 0.7, 0.72, 0.86), S.mul(S.add(moss, lm), 0.12))
    mat = S.finish(col, rough, 0.0, micro)
    ob = C.mesh_from_arrays("Tiles", V, np.concatenate(Qs),
                            point_attrs={k: np.concatenate(v) for k, v in A.items()}, material=mat,
                            collection=tile)
    # Lattung/Unterdach dunkel (nur in Spalten sichtbar)
    gv, gq = C.grid(4, 4, 0, 0, T, T)
    gv[:, 2] = -0.01
    S2 = C.Shader("Under", T)
    m2 = S2.finish((0.03, 0.025, 0.02), 0.9, 0.0, None)
    C.mesh_from_arrays("Under", gv, gq, material=m2, collection=tile)
    C.log("Ziegel:", NX * NROWS, "Vertices:", len(V))


if __name__ == "__main__":
    C.run(SPEC, build)
