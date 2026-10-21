"""M_Iron_Wrought - geschmiedetes Eisen (Beschlaege, Baender, Werkzeug, Ruestungsteile).

Echte Geometrie (Hoehenfeld-Ebene): ueberlappende Hammerschlag-Dellen (Worley-Zellen mit
eigener Tiefe), Schmiedefalten/Schweissnaht-Streifen entlang U, Zunder-Narben (Pits).
Material: schwarzer Zunder (Magnetit, halbmetallisch), blank geriebene Hoehen (metallisch,
glatter), Rost in Vertiefungen und Flecken (nichtmetallisch, rau). U = Schmiederichtung.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 0.5
SPEC = C.Spec(
    "M_Iron_Wrought", seed=5909, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.006,
    description="Geschmiedetes Eisen: Hammerschlag, Zunder, blanke Kanten, Rost in Vertiefungen",
    orientation="U entlang der Schmiederichtung (Band/Stab), V quer",
    tint={"hue": [-0.01, 0.01], "saturation": [0.9, 1.1], "value": [0.85, 1.1]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    H = np.zeros((n, n), np.float32)
    for k, depth, seed in ((28, 0.0005, 1), (55, 0.00028, 2)):
        F1, F2, ID = C.worley(n, k, seed, jitter=0.9)
        dv = np.random.default_rng(seed + 10).uniform(0.4, 1.2, k * k)[ID]
        H += -(1 - np.clip(F1 / 0.8, 0, 1) ** 2) * depth * dv
    Hd = H.copy()
    folds = C.streaks(u, v, 3, 512, 5, beta=1.8)
    H += folds * 0.00015
    pitn = C.spectral(n, 4, beta=1.0, fmin=120)
    pits = C.smoothstep(1.6, 2.6, pitn)
    H -= pits * 0.00025
    H += C.spectral(n, 5, beta=2.8, fmin=1) * 0.0006
    H += C.spectral(n, 6, beta=1.2, fmin=200) * 0.00003
    # Kruemmung -> blank geriebene Hoehen
    hd = C.blur(Hd, 2.0)
    hp = hd - C.blur(hd, 24)
    hi = C.smoothstep(0.00012, 0.00032, hp) * 0.75
    low = C.smoothstep(-0.0001, -0.0003, hp)
    rustn = C.spectral(n, 7, beta=2.4, fmin=2) + 0.4 * C.spectral(n, 8, beta=1.2, fmin=30)
    rust = np.clip(C.smoothstep(1.2, 1.9, rustn) + low * C.smoothstep(0.7, 1.4, rustn) * 0.6, 0, 1)
    rust = rust * (1 - hi * 0.7)
    scale_col = np.array([0.115, 0.112, 0.108]) * (1 + 0.12 * C.spectral(n, 9, beta=2.2, fmin=4))[..., None]
    bright = np.array([0.42, 0.41, 0.395])
    rc = np.array([0.20, 0.085, 0.035]) * (1 + 0.25 * C.spectral(n, 10, beta=1.2, fmin=40))[..., None]
    col = scale_col * (1 - hi[..., None]) + bright * hi[..., None]
    col = col * (1 - rust[..., None]) + rc * rust[..., None]
    metal = np.clip((0.55 * (1 - hi) + 1.0 * hi) * (1 - rust), 0, 1)
    rough = (0.58 * (1 - hi) + 0.32 * hi) * (1 - rust) + 0.88 * rust + 0.05 * pits
    H += rust * C.spectral(n, 11, beta=1.0, fmin=150) * 0.00008
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               metal=metal.astype(np.float32), geo_res=1024, split_sigma=1.0)


if __name__ == "__main__":
    C.run(SPEC, build)
