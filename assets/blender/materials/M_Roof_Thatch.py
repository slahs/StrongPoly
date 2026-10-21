"""M_Roof_Thatch - Strohdach (Langstroh/Reet), goldgrau verwittert.

Echte Geometrie: ~20 000 einzelne Halme als 3D-Kurven (Cycles-Kurvenprimitive) mit
Durchmesser 2,5-5 mm, leicht gebogen, in Lagen (Gaengen) geschichtet: die Fussenden jeder Lage
liegen hoeher und decken die Lage darunter (wie Ziegel), Richtung entlang des Gefaelles mit
Streuung. Shader: Halmfarben (goldgelb bis grau verwittert), dunklere, feuchte Tiefe,
Knoten, Moos-/Algenflecken. V = Dachgefaelle aufwaerts.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.0
COURSE = 0.25
SPEC = C.Spec(
    "M_Roof_Thatch", seed=6515, tile_m=T, tiers=("2k", "1k", "512"), kind="wall", ao_distance=0.05, albedo_ao=0.7,
    description="Strohdach aus Langstroh in Lagen, goldgrau verwittert, mit Moos- und Algenflecken",
    orientation="V = Dachgefaelle aufwaerts (Halme laufen entlang V, Fussenden zeigen nach unten)",
    tint={"hue": [-0.03, 0.02], "saturation": [0.7, 1.15], "value": [0.8, 1.12]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    sizes, pos, rad, A_rnd, A_c, P_t = [], [], [], [], [], []
    ncourse = int(round(T / COURSE))
    clump = C.spectral(256, 3, beta=2.2, fmin=2)
    for c in range(ncourse):
        y_c = c * COURSE
        nst = 6500
        for _i in range(nst):
            x0 = rng.random() * T
            # Fussenden um die Ganglinie verteilt (gewellte Kante)
            yb = y_c + rng.normal(0, 0.035) + C.sample(clump, x0 / T, c * 0.3) * 0.02
            L = rng.uniform(0.18, 0.42)
            ang = rng.normal(0, 0.10)
            curv = rng.normal(0, 0.15)
            npt = 6
            t = np.linspace(0, 1, npt)
            dx = np.sin(ang + curv * t) * L * t
            dy = np.cos(ang) * L * t
            # Lagenueberdeckung: Fussende hoch, oberes Ende tief (unter der naechsten Lage)
            z0 = rng.uniform(0.0, 0.045)
            z = z0 + 0.075 * (1 - t) ** 1.3 - 0.03 * t + rng.normal(0, 0.003)
            p = np.stack([x0 + dx, yb + dy, z], -1)
            r = rng.uniform(0.0012, 0.0024) * (1 - 0.35 * t)
            sizes.append(npt)
            pos.append(p)
            rad.append(r)
            A_rnd.append(rng.random())
            A_c.append(z0 / 0.045)
            P_t.append(t)
    # Bruchstuecke / kurze Halme obenauf
    for _i in range(3000):
        x0, y0 = rng.random(2) * T
        L = rng.uniform(0.03, 0.10)
        a = rng.normal(0, 0.5)
        t = np.linspace(0, 1, 3)
        p = np.stack([x0 + np.sin(a) * L * t, y0 + np.cos(a) * L * t, 0.075 + rng.uniform(0, 0.03) + 0 * t], -1)
        sizes.append(3)
        pos.append(p)
        rad.append(np.full(3, rng.uniform(0.001, 0.0018)))
        A_rnd.append(rng.random())
        A_c.append(1.0)
        P_t.append(t)
    S = C.Shader("Straw", T)
    rnd = S.attr("rnd")
    depth = S.attr("cz")
    tt = S.attr("tt")
    base = S.ramp(rnd, [
        (0.0, (0.30, 0.235, 0.12)),
        (0.25, (0.36, 0.29, 0.15)),
        (0.5, (0.24, 0.205, 0.145)),
        (0.75, (0.19, 0.17, 0.13)),
        (1.0, (0.40, 0.33, 0.18)),
    ])
    # Verwitterung grau (oben liegende Halme), Tiefe dunkler/feucht
    weather = S.smooth(S.pnoise(3, detail=4, seed=4), 0.35, 0.7)
    col = S.mixc(base, S.hsv(base, 0.5, 0.35, 0.75), S.mul(weather, 0.75))
    col = S.mixc(S.hsv(col, 0.5, 1.0, 0.45), col, S.smooth(depth, 0.0, 0.8))
    col = S.mixc(col, S.hsv(col, 0.5, 0.9, 0.7), S.smooth(tt, 0.4, 1.0))
    # Knoten
    pos_o = S.obj()
    node = S.smooth(S.noise(S.vmath("MULTIPLY", pos_o, (1.0, 25.0, 1.0)), 1.0, 2), 0.72, 0.8)
    col = S.mixc(col, S.hsv(col, 0.5, 1.1, 0.7), S.mul(node, 0.5))
    moss = S.mul(S.smooth(S.pnoise(4, detail=5, seed=6), 0.55, 0.72), S.smooth(S.pnoise(60, 3, seed=7), 0.4, 0.6))
    col = S.mixc(col, (0.06, 0.085, 0.03), S.mul(moss, 0.85))
    rough = S.add(S.remap(rnd, 0, 1, 0.55, 0.75), S.mul(weather, 0.15))
    mat = S.finish(col, rough, 0.0, None)
    C.new_hair("Straw", sizes, np.concatenate(pos), np.concatenate(rad),
               curve_attrs={"rnd": np.array(A_rnd), "cz": np.array(A_c)}, point_attrs={"tt": np.concatenate(P_t)},
               material=mat, collection=tile)
    gv, gq = C.grid(4, 4, 0, 0, T, T)
    gv[:, 2] = -0.04
    S2 = C.Shader("Under", T)
    C.mesh_from_arrays("Under", gv, gq, material=S2.finish((0.05, 0.04, 0.025), 0.9, 0.0, None), collection=tile)
    C.log("Halme:", len(sizes))


if __name__ == "__main__":
    C.run(SPEC, build)
