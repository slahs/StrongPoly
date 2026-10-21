"""M_Ground_Grass - dichte, gemischte Wiese (Draufsicht-Kachel fuer Terrain).

Echte Geometrie: ~110 000 einzelne Grashalme (geneigte, gebogene, spitz zulaufende
Streifen; gruen, gelbgruen, einzelne trockene), Kleepolster (Dreiblatt mit Kerbe und hellem
Winkelzeichen), Wegerich-Rosetten, darunter Streu und Erde. Isotrop.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 2.5
SPEC = C.Spec(
    "M_Ground_Grass", seed=6818, tile_m=T, tiers=("2k", "1k", "512"), kind="ground", ao_distance=0.03, albedo_ao=0.5,
    description="Dichte gemischte Wiese: Grashalme, Klee, Wegerich, trockene Halme, Streu",
    orientation="isotrop (Boden); fuer grosse Flaechen mit Makro-Variation/zweiter Kachelgroesse mischen",
    tint={"hue": [-0.04, 0.03], "saturation": [0.75, 1.15], "value": [0.8, 1.15]},
    notes="Hoehe (orm.a) = Bewuchshoehe; eignet sich als Blend-Maske gegen M_Ground_Dirt/M_Ground_Path.",
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    dens = C.spectral(256, 1, beta=2.4, fmin=2)
    # Halme: Dichte ueber Rauschen moduliert (Buelten)
    B = 110000
    P = rng.random((B, 2)) * T
    d = C.sample(dens, P[:, 0] / T, P[:, 1] / T)
    keep = rng.random(B) < np.clip(0.55 + 0.35 * d, 0.1, 1)
    P = P[keep]
    B = len(P)
    L = rng.lognormal(np.log(0.07), 0.35, B)
    W = rng.uniform(0.0022, 0.0045, B)
    az = rng.uniform(0, 2 * np.pi, B)
    inc = np.clip(rng.normal(0.55, 0.3, B), 0.05, 1.3)
    bend = rng.uniform(0.2, 0.9, B)
    V, Q, tv, bid = C.blades(rng, P, L, W, az, inc, bend, segs=5)
    kind = rng.random(B)
    rnd = rng.random(B)
    C.log("Halme:", B)
    S = C.Shader("Blades", T)
    t = S.attr("t")
    k = S.attr("kind")
    r = S.attr("rnd")
    green = S.ramp(r, [(0.0, (0.050, 0.090, 0.020)), (0.35, (0.075, 0.115, 0.026)), (0.7, (0.095, 0.130, 0.035)),
                       (1.0, (0.115, 0.140, 0.045))])
    dry = S.ramp(r, [(0.0, (0.20, 0.17, 0.085)), (1.0, (0.27, 0.23, 0.12))])
    yel = S.mixc(green, (0.17, 0.16, 0.055), 0.6)
    col = S.mixc(green, yel, S.smooth(k, 0.72, 0.74))
    col = S.mixc(col, dry, S.smooth(k, 0.88, 0.9))
    # Halmbasis dunkler, Spitzen leicht heller/trockener
    col = S.mixc(S.hsv(col, 0.5, 1.0, 0.45), col, S.smooth(t, 0.0, 0.45))
    col = S.mixc(col, S.hsv(col, 0.48, 0.8, 1.2), S.mul(S.smooth(t, 0.75, 1.0), 0.5))
    # grossflaechige Farbvariation (Naehrstoff/Feuchte)
    patch = S.pnoise(4, detail=4, seed=3)
    col = S.hsv(col, S.remap(patch, 0.3, 0.7, 0.485, 0.515), S.remap(patch, 0.3, 0.7, 0.85, 1.1), 1.0)
    rough = S.remap(r, 0, 1, 0.55, 0.75)
    mat = S.finish(col, rough, 0.0, None)
    C.mesh_from_arrays("Blades", V, Q, point_attrs={"t": tv, "kind": kind[bid], "rnd": rnd[bid]}, smooth=True,
                       material=mat, collection=tile)
    # Klee: Polster
    Vs, Qs, ST, LR = [], [], [], []
    off = 0
    cl = C.spectral(256, 2, beta=2.6, fmin=2)
    cand = rng.random((9000, 2)) * T
    cm = C.sample(cl, cand[:, 0] / T, cand[:, 1] / T)
    cand = cand[cm > 0.9]
    wf = lambda tt: 0.55 * np.sin(np.pi * np.clip(tt, 0, 1) ** 0.6) ** 0.8
    for (x, y) in cand[:2600]:
        h = rng.uniform(0.02, 0.08)
        R = rng.uniform(0.006, 0.011)
        a0 = rng.uniform(0, 2 * np.pi)
        for li in range(3):
            v, q, st = C.leaf_grid(R, wf, nx=6, ny=8, fold=0.25, curl=-0.15, notch=0.18)
            a = a0 + li * 2 * np.pi / 3 + rng.normal(0, 0.15)
            tilt = rng.uniform(-0.25, 0.15)
            Rm = C.rot_z(a - np.pi / 2) @ C.rot_axis((1, 0, 0), tilt)
            v = v @ Rm.T + np.array([x, y, h])
            Vs.append(v)
            Qs.append(q + off)
            off += len(v)
            ST.append(st)
            LR.append(np.full(len(v), rng.random()))
    S2 = C.Shader("Clover", T)
    st = S2.attr("st", out="Vector")
    sx, sy, _ = S2.sep(st)
    lr = S2.attr("rnd")
    ccol = S2.mixc((0.045, 0.095, 0.035), (0.07, 0.12, 0.04), lr)
    chev = S2.mul(S2.smooth(S2.math("ABSOLUTE", S2.sub(sy, S2.add(0.45, S2.mul(S2.math("ABSOLUTE", sx), 0.35)))), 0.07, 0.02),
                  S2.smooth(lr, 0.3, 0.5))
    ccol = S2.mixc(ccol, (0.16, 0.20, 0.12), S2.mul(chev, 0.7))
    mid = S2.smooth(S2.math("ABSOLUTE", sx), 0.06, 0.0)
    ccol = S2.mixc(ccol, (0.10, 0.14, 0.06), S2.mul(mid, 0.5))
    mclov = S2.finish(ccol, 0.55, 0.0, S2.mul(mid, -0.0003))
    if Vs:
        C.mesh_from_arrays("Clover", np.concatenate(Vs), np.concatenate(Qs),
                           point_attrs={"st": np.concatenate(ST), "rnd": np.concatenate(LR)}, material=mclov,
                           collection=tile)
    C.log("Kleeblaetter:", len(Vs))
    # Wegerich-Rosetten
    Vs, Qs, ST = [], [], []
    off = 0
    wpl = lambda tt: 0.28 * np.sin(np.pi * np.clip(tt, 0, 1) ** 0.75) ** 0.9
    for _ in range(45):
        x, y = rng.random(2) * T
        nlv = rng.integers(5, 9)
        for li in range(nlv):
            Lp = rng.uniform(0.06, 0.13)
            v, q, st = C.leaf_grid(Lp, wpl, nx=6, ny=14, fold=0.12, curl=-0.06)
            a = li * 2 * np.pi / nlv + rng.normal(0, 0.2)
            Rm = C.rot_z(a - np.pi / 2) @ C.rot_axis((1, 0, 0), rng.uniform(0.05, 0.35))
            v = v @ Rm.T + np.array([x, y, 0.004])
            Vs.append(v)
            Qs.append(q + off)
            off += len(v)
            ST.append(st)
    S3 = C.Shader("Plantain", T)
    st3 = S3.attr("st", out="Vector")
    sx3, sy3, _ = S3.sep(st3)
    veins = S3.smooth(S3.math("ABSOLUTE", S3.math("SINE", S3.mul(sx3, 3.14159 * 2.5))), 0.12, 0.0)
    pcol = S3.mixc((0.055, 0.095, 0.03), (0.09, 0.13, 0.05), veins)
    mpl = S3.finish(pcol, 0.5, 0.0, S3.mul(veins, 0.0004))
    C.mesh_from_arrays("Plantain", np.concatenate(Vs), np.concatenate(Qs), point_attrs={"st": np.concatenate(ST)},
                       material=mpl, collection=tile)
    # Boden mit Streu
    gv, gq = C.grid(256, 256, 0, 0, T, T)
    gs = C.spectral(512, 4, beta=2.4, fmin=1)
    gv[:, 2] = -0.004 + C.sample(gs, gv[:, 0] / T, gv[:, 1] / T) * 0.004
    S4 = C.Shader("Soil", T)
    lit = S4.pnoise(300, detail=3, seed=5)
    scol = S4.mixc((0.05, 0.038, 0.026), (0.16, 0.125, 0.07), S4.smooth(lit, 0.45, 0.6))
    msoil = S4.finish(scol, 0.95, 0.0, S4.mul(S4.sub(lit, 0.5), 0.002))
    C.mesh_from_arrays("Soil", gv, gq, material=msoil, collection=tile)


if __name__ == "__main__":
    C.run(SPEC, build)
