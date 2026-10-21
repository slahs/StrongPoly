"""M_Cloth_Wool - gewalktes Wolltuch in Koeperbindung (Maentel, Hosen, Waffenroecke).

Echte Geometrie: 2/2-Koeper aus Faden-Kurven (je 72 Faeden auf 16 cm = 2,2 mm Teilung,
dickes, ungleichmaessiges Garn) plus ~40 000 kurze Abstehfasern (Flaum) als Kurven, die die
Bindung teilweise verdecken. Naturwolle hell, als Basis zum Einfaerben. U/V = Schuss/Kette.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 0.16
N = 72
SPEC = C.Spec(
    "M_Cloth_Wool", seed=6717, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.002, albedo_ao=0.3,
    description="Gewalktes Wolltuch in 2/2-Koeper mit Flaum, Naturwolle als Faerbebasis",
    orientation="U = Schuss, V = Kette (Koepergrat diagonal)",
    tint={"hue": [-0.5, 0.5], "saturation": [0.0, 1.8], "value": [0.3, 1.1]},
    notes="Heller Naturton als Basis fuer Einfaerbung; Bindung im Spiel bewusst ~3,5x vergroessert (tile 0,3), sonst unter Pixelgroesse.",
    game_tile=0.3,
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    p = T / N
    sizes, pos, rad, cattr, pattr = C.weave_curves(rng, T, N, lambda i, j: (i + j) % 4 < 2, amp=p * 0.20,
                                                   radius=p * 0.46, ppc=8, jitter=0.12, slub=0.25, seed=SPEC.seed)
    # Flaum: kurze, gebogene Fasern ueber der Oberflaeche
    nf = 40000
    fs, fp, fr = [], [], []
    for _ in range(nf):
        x0, y0 = rng.random(2) * T
        L = rng.uniform(0.0008, 0.0035)
        a = rng.uniform(0, 2 * np.pi)
        el = rng.uniform(0.1, 0.6)
        t = np.linspace(0, 1, 4)
        cur = rng.normal(0, 1.2)
        pts = np.stack([x0 + np.cos(a + cur * t) * L * t, y0 + np.sin(a + cur * t) * L * t,
                        p * 0.25 + np.sin(el) * L * t * (1 - 0.4 * t)], -1)
        fs.append(4)
        fp.append(pts)
        fr.append(np.full(4, rng.uniform(0.00002, 0.00004)))
    S = C.Shader("Wool", T)
    rnd = S.attr("rnd")
    base = S.mixc((0.50, 0.465, 0.40), (0.44, 0.41, 0.355), rnd)
    col = S.hsv(base, 0.5, 1.0, S.remap(S.pnoise(25, detail=3, seed=3), 0.3, 0.7, 0.9, 1.08))
    pill = S.smooth(S.pnoise(4, detail=4, seed=5), 0.55, 0.7)
    col = S.mixc(col, S.hsv(col, 0.5, 1.0, 0.8), S.mul(pill, 0.4))
    rough = S.remap(rnd, 0, 1, 0.88, 0.96)
    mat = S.finish(col, rough, 0.0, None)
    sizes += fs
    pos = np.concatenate([pos] + fp)
    rad = np.concatenate([rad] + fr)
    cattr = {"rnd": np.concatenate([cattr["rnd"], rng.random(nf)]), "dir": np.concatenate([cattr["dir"], np.full(nf, 2.0)])}
    pattr = {"tt": np.concatenate([pattr["tt"], np.zeros(nf * 4)])}
    C.new_hair("Threads", sizes, pos, rad, curve_attrs=cattr, point_attrs=pattr, material=mat, collection=tile)
    gv, gq = C.grid(2, 2, 0, 0, T, T)
    gv[:, 2] = -p * 0.6
    S2 = C.Shader("Back", T)
    C.mesh_from_arrays("Back", gv, gq, material=S2.finish((0.15, 0.14, 0.12), 0.95, 0.0, None), collection=tile)


if __name__ == "__main__":
    C.run(SPEC, build)
