"""M_Cloth_Linen - grobes, handgewebtes Leinen (Hemden, Kittel, Saecke, Segeltuch).

Echte Geometrie: Leinwandbindung aus einzelnen Faden-Kurven (Kette/Schuss, je 100 Faeden auf
12 cm = 1,2 mm Teilung), mit Fadenverdickungen (Noppen), unregelmaessigem Lauf und
Garndrehung im Shader. Naturfarben leicht vergraut, Flecken. U/V = Schuss/Kette.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 0.12
N = 100
SPEC = C.Spec(
    "M_Cloth_Linen", seed=6616, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.0012, albedo_ao=0.3,
    description="Grobes Leinen in Leinwandbindung, ungebleicht, mit Noppen und leichten Flecken",
    orientation="U = Schuss, V = Kette",
    tint={"hue": [-0.5, 0.5], "saturation": [0.0, 1.6], "value": [0.35, 1.15]},
    notes="Heller Naturton als Basis fuer Einfaerbung; Webstruktur im Spiel bewusst ~4x vergroessert (tile 0,25), sonst unter Pixelgroesse.",
    game_tile=0.25,
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    p = T / N
    sizes, pos, rad, cattr, pattr = C.weave_curves(rng, T, N, lambda i, j: (i + j) % 2 == 0, amp=p * 0.22,
                                                   radius=p * 0.40, ppc=8, jitter=0.10, slub=0.22, seed=SPEC.seed)
    S = C.Shader("Linen", T)
    rnd = S.attr("rnd")
    tt = S.attr("tt")
    base = S.mixc((0.43, 0.39, 0.31), (0.37, 0.335, 0.27), rnd)
    twist = S.math("SINE", S.mul(tt, 6.283 * N * 3.0))
    col = S.hsv(base, 0.5, 1.0, S.remap(S.pnoise(30, detail=3, seed=3), 0.3, 0.7, 0.9, 1.08))
    stain = S.smooth(S.pnoise(3, detail=5, seed=4), 0.58, 0.72)
    col = S.mixc(col, S.hsv(col, 0.5, 1.1, 0.72), S.mul(stain, 0.6))
    col = S.hsv(col, 0.5, 1.0, S.add(1.0, S.mul(twist, 0.04)))
    rough = S.remap(rnd, 0, 1, 0.82, 0.92)
    mat = S.finish(col, rough, 0.0, None)
    C.new_hair("Threads", sizes, pos, rad, curve_attrs=cattr, point_attrs=pattr, material=mat, collection=tile)
    gv, gq = C.grid(2, 2, 0, 0, T, T)
    gv[:, 2] = -p * 0.6
    S2 = C.Shader("Back", T)
    C.mesh_from_arrays("Back", gv, gq, material=S2.finish((0.12, 0.11, 0.09), 0.9, 0.0, None), collection=tile)


if __name__ == "__main__":
    C.run(SPEC, build)
