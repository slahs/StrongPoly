"""M_Foliage - Laub-Atlas mit Alpha fuer Baeume und Buesche (Karten/Billboards).

Echte Geometrie: vier Zweig-Bueschel (2x2-Atlas), jeweils ein gebogener Zweig mit
Seitentrieben (3D-Kurven) und einzeln modellierten Blaettern (gefaltet entlang der
Mittelrippe, gewoelbt, gedreht): A Eiche (gelappt), B Buche (oval, gewellter Rand),
C Strauch (Weissdorn/Hasel, klein, dicht), D Birke (klein, rautenfoermig, haengend).
Albedo mit Alpha (Maske), Normal aus der Blattgeometrie + Adern, ORM. Nicht kachelbar.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.0
CELL = T / 2
CELLS = [
    {"name": "oak", "uv": [0.0, 0.5, 0.5, 1.0]},
    {"name": "beech", "uv": [0.5, 0.5, 1.0, 1.0]},
    {"name": "shrub", "uv": [0.0, 0.0, 0.5, 0.5]},
    {"name": "birch", "uv": [0.5, 0.0, 1.0, 0.5]},
]
SPEC = C.Spec(
    "M_Foliage", seed=6919, tile_m=T, tiers=("1k", "512"), kind="foliage", ao_distance=0.03, albedo_ao=0.35,
    description="Laub-Atlas (2x2): Eiche, Buche, Strauch, Birke - Albedo mit Alpha, Normal, ORM",
    orientation="Atlas; Zellen siehe atlas.cells (UV-Ursprung unten links, V nach oben)",
    tint={"hue": [-0.04, 0.05], "saturation": [0.75, 1.15], "value": [0.75, 1.15]},
    alpha=True, alpha_cutoff=0.5, tiled=False,
    translucency={"color": [0.55, 0.75, 0.2], "weight": 0.35,
                  "hint": "duenne Blaetter: Durchlicht ~35 %, Farbe gelbgruen; im Spiel als Wrap-/Rueckseitenlicht"},
    atlas={"layout": "2x2", "cellSizeMeters": CELL, "origin": "UV unten links (three flipY=true); "
           "bei glTF-Texturen (flipY=false) v' = 1 - v", "cells": CELLS},
    notes="Fuer Karten-Baeume: Zelle je Karte; Alpha-Test (alphaCutoff) statt Blending, Mipmaps mit Alpha-Erhalt.",
)

OAK = lambda t: 0.32 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.85) ** 0.9 * (0.62 + 0.38 * np.abs(np.cos(np.pi * 4.5 * t)) ** 0.5)
BEECH = lambda t: 0.30 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.9) ** 0.85 * (1 + 0.04 * np.sin(2 * np.pi * 7 * t))
SHRUB = lambda t: 0.33 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.8) ** 0.9 * (1 + 0.08 * np.sin(2 * np.pi * 9 * t))
BIRCH = lambda t: 0.40 * np.clip(np.minimum(t / 0.35, (1 - t) / 0.65), 0, 1) ** 0.8 * (1 + 0.06 * np.sin(2 * np.pi * 11 * t))

KINDS = {
    "oak": dict(wf=OAK, L=(0.08, 0.12), n_main=9, side=6, per=7, droop=0.0, col=0.0, twig_r=0.004),
    "beech": dict(wf=BEECH, L=(0.065, 0.09), n_main=10, side=7, per=7, droop=0.0, col=0.33, twig_r=0.0035),
    "shrub": dict(wf=SHRUB, L=(0.04, 0.055), n_main=14, side=9, per=10, droop=0.0, col=0.6, twig_r=0.003),
    "birch": dict(wf=BIRCH, L=(0.04, 0.055), n_main=12, side=8, per=9, droop=0.5, col=0.85, twig_r=0.0022),
}


def twig_path(rng, start, direction, length, bend, npt=12):
    pts = [np.array(start, float)]
    d = np.array(direction, float)
    d /= np.linalg.norm(d)
    seg = length / (npt - 1)
    for _ in range(npt - 1):
        a = bend + rng.normal(0, 0.06)
        c, s = math.cos(a), math.sin(a)
        d = np.array([c * d[0] - s * d[1], s * d[0] + c * d[1], 0.0])
        pts.append(pts[-1] + d * seg)
    return np.array(pts)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    hs, hp, hr, hcol = [], [], [], []
    Vs, Qs, ST, LR, LK = [], [], [], [], []
    off = 0
    for ci, cell in enumerate(CELLS):
        k = KINDS[cell["name"]]
        u0, v0 = cell["uv"][0] * T, cell["uv"][1] * T
        cx, cy = u0 + CELL / 2, v0 + CELL / 2
        # Hauptzweig von unten links nach oben
        start = (u0 + CELL * 0.5 + rng.normal(0, 0.02), v0 + CELL * 0.04, 0.0)
        main = twig_path(rng, start, (rng.normal(0, 0.08), 1.0, 0), CELL * 0.86, rng.normal(0, 0.012), 14)
        branches = [(main, k["twig_r"])]
        for si in range(k["side"]):
            t0 = 0.15 + 0.75 * si / max(1, k["side"] - 1)
            idx = int(t0 * (len(main) - 1))
            p0 = main[idx]
            d0 = main[min(idx + 1, len(main) - 1)] - main[max(idx - 1, 0)]
            side = 1 if si % 2 == 0 else -1
            ang = side * rng.uniform(0.6, 1.1)
            c, s = math.cos(ang), math.sin(ang)
            dd = np.array([c * d0[0] - s * d0[1], s * d0[0] + c * d0[1], 0])
            Lb = CELL * rng.uniform(0.24, 0.40) * (1.1 - 0.5 * t0)
            br = twig_path(rng, p0, dd, Lb, -side * rng.uniform(0.0, 0.08) - k["droop"] * 0.05, 8)
            branches.append((br, k["twig_r"] * 0.6))
        # Zweige als Kurven
        for br, r in branches:
            npt = len(br)
            z = np.linspace(0, 0.004, npt)
            hs.append(npt)
            hp.append(np.column_stack([br[:, 0], br[:, 1], z]))
            hr.append(np.linspace(r, r * 0.45, npt))
            hcol.append(ci)
        # Blaetter entlang der Zweige
        for bi, (br, r) in enumerate(branches):
            nleaf = k["per"] + (3 if bi == 0 else 0)
            for li in range(nleaf):
                tpos = 0.25 + 0.75 * (li + rng.random() * 0.5) / nleaf
                idx = min(int(tpos * (len(br) - 1)), len(br) - 2)
                p = br[idx] + (br[idx + 1] - br[idx]) * rng.random()
                d = br[idx + 1] - br[idx]
                base_ang = math.atan2(d[1], d[0])
                side = 1 if li % 2 == 0 else -1
                ang = base_ang + side * rng.uniform(0.5, 1.1) - math.pi / 2
                if k["droop"] > 0:
                    ang = ang * (1 - k["droop"]) + (-math.pi) * k["droop"] + rng.normal(0, 0.25)
                L = rng.uniform(*k["L"])
                v, q, st = C.leaf_grid(L, k["wf"], nx=8, ny=40, fold=rng.uniform(0.15, 0.4),
                                       curl=rng.uniform(-0.15, 0.1))
                # Blattstiel-Versatz, Neigung und Drehung um die Mittelrippe
                v[:, 1] += L * 0.12
                R = C.rot_z(ang) @ C.rot_axis((1, 0, 0), rng.uniform(-0.5, 0.35)) @ C.rot_axis((0, 1, 0), rng.normal(0, 0.35))
                v = v @ R.T + p + np.array([0, 0, 0.006 + rng.uniform(0, 0.03)])
                # Blaetter, die ueber die Zelle hinausragen, entfallen (keine Ueberlappung im Atlas)
                if (v[:, 0].min() < u0 + 0.006 or v[:, 0].max() > u0 + CELL - 0.006 or
                        v[:, 1].min() < v0 + 0.006 or v[:, 1].max() > v0 + CELL - 0.006):
                    continue
                Vs.append(v)
                Qs.append(q + off)
                off += len(v)
                ST.append(st)
                LR.append(np.full(len(v), rng.random()))
                LK.append(np.full(len(v), k["col"]))
                # Stiel
                hs.append(3)
                pe = v[np.argmin(np.abs(st[:, 0]) + st[:, 1] * 10)]
                hp.append(np.array([p, (p + pe) / 2, pe]))
                hr.append(np.array([0.0009, 0.0007, 0.0006]))
                hcol.append(ci)
    S = C.Shader("Leaf", T)
    st = S.attr("st", out="Vector")
    sx, sy, _ = S.sep(st)
    lr = S.attr("rnd")
    lk = S.attr("kind")
    base = S.ramp(lk, [(0.0, (0.040, 0.070, 0.018)), (0.33, (0.060, 0.095, 0.022)), (0.6, (0.045, 0.080, 0.025)),
                       (0.85, (0.075, 0.110, 0.025)), (1.0, (0.075, 0.110, 0.025))])
    col = S.hsv(base, S.remap(lr, 0, 1, 0.48, 0.52), S.remap(lr, 0, 1, 0.85, 1.15), S.remap(lr, 0, 1, 0.8, 1.2))
    # Mittelrippe und Seitenadern (heller, leicht erhaben)
    ax = S.math("ABSOLUTE", sx)
    mid = S.smooth(ax, 0.05, 0.0)
    lat = S.smooth(S.math("ABSOLUTE", S.math("SINE", S.mul(S.sub(sy, S.mul(ax, 0.35)), 3.14159 * 9.0))), 0.12, 0.0)
    lat = S.mul(lat, S.smooth(ax, 0.95, 0.6))
    veins = S.maxi(mid, S.mul(lat, 0.6))
    col = S.mixc(col, S.hsv(col, 0.47, 0.8, 1.45), S.mul(veins, 0.55))
    # vereinzelt gelbe/braune Flecken, Randnekrose
    spot = S.mul(S.smooth(S.noise(st, 6.0, 3, w=lr), 0.66, 0.74), S.smooth(lr, 0.75, 0.8))
    col = S.mixc(col, (0.14, 0.09, 0.03), S.mul(spot, 0.8))
    edge = S.mul(S.smooth(ax, 0.85, 1.0), S.smooth(lr, 0.85, 0.9))
    col = S.mixc(col, (0.12, 0.10, 0.03), edge)
    micro = S.add(S.mul(veins, 0.0004), S.mul(S.sub(S.noise(st, 60.0, 2, w=lr), 0.5), 0.0002))
    rough = S.remap(lr, 0, 1, 0.45, 0.6)
    mat = S.finish(col, rough, 0.0, micro)
    C.mesh_from_arrays("Leaves", np.concatenate(Vs), np.concatenate(Qs),
                       point_attrs={"st": np.concatenate(ST), "rnd": np.concatenate(LR), "kind": np.concatenate(LK)},
                       material=mat, collection=tile)
    S2 = C.Shader("Twig", T)
    tc = S2.mixc((0.06, 0.045, 0.03), (0.11, 0.09, 0.07), S2.noise(S2.obj(), 200.0, 3))
    m2 = S2.finish(tc, 0.75, 0.0, None)
    C.new_hair("Twigs", hs, np.concatenate(hp), np.concatenate(hr), material=m2, collection=tile)
    C.log("Blaetter:", len(Vs))


if __name__ == "__main__":
    C.run(SPEC, build)
