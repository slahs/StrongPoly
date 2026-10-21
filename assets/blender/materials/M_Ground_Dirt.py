"""M_Ground_Dirt - offene Erde (Acker-/Hofboden, Baustellen, Wegraender).

Echte Geometrie (Hoehenfeld-Ebene): krumelige Oberflaeche mit Erdschollen, kleinen
eingebetteten Steinen (gerundet, teils herausragend), Zweigstuecken und Laubresten;
feuchte (dunkle, glattere) und trockene (helle) Partien. Isotrop.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 4.0
SPEC = C.Spec(
    "M_Ground_Dirt", seed=6111, tile_m=T, tiers=("2k", "1k", "512"), kind="ground", ao_distance=0.03,
    description="Offene, kruemelige Erde mit Schollen, Kieseln, Zweigresten und feuchten Partien",
    orientation="isotrop (Boden)",
    tint={"hue": [-0.02, 0.02], "saturation": [0.8, 1.15], "value": [0.8, 1.15]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    H = C.spectral(n, 1, beta=2.6, fmin=1) * 0.018 + C.spectral(n, 2, beta=2.0, fmin=8) * 0.005
    # Schollen: gewoelbte Zellen verschiedener Groesse
    for k, amp, seed in ((90, 0.006, 3), (220, 0.003, 4), (500, 0.0012, 5)):
        F1, F2, ID = C.worley(n, k, seed, jitter=1.0)
        on = np.random.default_rng(seed + 50).random(k * k)[ID] < 0.55
        H += on * (1 - np.clip(F1 / 0.75, 0, 1) ** 2) * amp * np.random.default_rng(seed + 60).uniform(0.4, 1.2, k * k)[ID]
    H += C.spectral(n, 6, beta=1.0, fmin=300) * 0.0004
    # Kiesel
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.006, 0.02) if r.random() < 0.85 else r.uniform(0.02, 0.045),
                           2600, gap=0.004)
    st = C.cell_stones(rng, n, T, P, R * 0.9, gap=0.0, round_frac=0.9, dome=0.7, height=R * 0.9, surf_amp=0.05,
                       seed=7, weight_frac=1.0)
    # nur innerhalb des Radius: Stein = Kreis
    inside = st["rel"] < 0.95
    sp = np.where(inside, np.sqrt(np.clip(1 - st["rel"] ** 2, 0, 1)) * R[st["ID"]] * 0.6, 0)
    sink = rng.uniform(0.2, 0.7, len(P))[st["ID"]] * R[st["ID"]] * 0.6
    stoneH = np.where(inside, sp - sink, -1)
    is_stone = (stoneH > H).astype(np.float32)
    H = np.maximum(H, stoneH)
    # Zweige und Laubreste
    twig = np.zeros((n, n), np.float32)
    for i in range(70):
        a = rng.uniform(0, np.pi)
        cx, cy = rng.random(2)
        L = rng.uniform(0.03, 0.18) / T
        wdt = rng.uniform(0.0015, 0.004)
        dx = (u - cx + 0.5) % 1 - 0.5
        dy = (v - cy + 0.5) % 1 - 0.5
        along = dx * np.cos(a) + dy * np.sin(a)
        across = (-dx * np.sin(a) + dy * np.cos(a)) * T + 0.002 * np.sin(along * T * 60)
        m = C.smoothstep(L / 2, L / 2 * 0.9, np.abs(along)) * C.smoothstep(wdt, wdt * 0.5, np.abs(across))
        twig = np.maximum(twig, m)
    H = np.maximum(H, H * (1 - twig) + twig * (H + 0.002))
    leaf = C.smoothstep(1.7, 2.1, C.spectral(n, 8, beta=1.6, fmin=60)) * (1 - is_stone)
    H += leaf * 0.0005
    wet = C.smoothstep(-0.2, 0.9, C.spectral(n, 9, beta=2.6, fmin=1) - 4.0 * (H - C.blur(H, 30)))
    dry = 1 - wet
    soil_dry = np.array([0.175, 0.135, 0.095])
    soil_wet = np.array([0.075, 0.056, 0.040])
    m1 = C.spectral(n, 10, beta=1.4, fmin=40)
    col = soil_dry * dry[..., None] + soil_wet * wet[..., None]
    col = col * (1 + 0.12 * m1)[..., None]
    hp = H - C.blur(H, 4)
    col = col * (1 + np.clip(hp / 0.002, -1, 1) * 0.12)[..., None]
    scol = C.palette_pick(rng, len(P), [(0.24, 0.22, 0.19), (0.30, 0.25, 0.19), (0.17, 0.16, 0.15),
                                        (0.34, 0.30, 0.25)], jitter=0.07)[st["ID"]]
    scol = scol * (0.75 + 0.25 * dry)[..., None]
    col = col * (1 - is_stone[..., None]) + scol * is_stone[..., None]
    tc = np.array([0.09, 0.065, 0.045])
    col = col * (1 - twig[..., None]) + tc * twig[..., None]
    lc = np.array([0.16, 0.10, 0.05]) * (1 + 0.3 * C.spectral(n, 11, beta=1.0, fmin=100))[..., None]
    col = col * (1 - leaf[..., None]) + lc * leaf[..., None]
    rough = 0.95 * dry + 0.78 * wet
    rough = rough * (1 - is_stone) + 0.75 * is_stone
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.2)


if __name__ == "__main__":
    C.run(SPEC, build)
