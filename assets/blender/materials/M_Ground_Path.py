"""M_Ground_Path - festgefahrener Erdweg mit Fahrspuren.

Echte Geometrie (Hoehenfeld-Ebene): verdichtete Erde, zwei Radspuren (Spurweite ~1,4 m)
mit aufgeworfenen Raendern, Hufspuren-Dellen, eingedrueckter Kies, ausgetrocknete
Pfuetzen in den Spuren (glatter, dunkler Schlamm mit Trockenrissen und Raendern).
V = Wegrichtung, U quer (Spuren bei U = 0,32 und 0,68).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 4.0
SPEC = C.Spec(
    "M_Ground_Path", seed=6212, tile_m=T, tiers=("2k", "1k", "512"), kind="ground", ao_distance=0.04,
    description="Festgefahrener Erdweg mit Radspuren, Kies, Hufspuren und ausgetrockneten Pfuetzen",
    orientation="V entlang des Weges, U quer; Spurmitten bei U=0.32 und U=0.68 (Spurweite 1,44 m)",
    tint={"hue": [-0.02, 0.02], "saturation": [0.85, 1.1], "value": [0.85, 1.12]},
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    H = C.spectral(n, 1, beta=2.8, fmin=1) * 0.010 + C.spectral(n, 2, beta=2.0, fmin=10) * 0.002
    # Radspuren (entlang V), leicht maeandernd
    rut = np.zeros((n, n), np.float32)
    rim = np.zeros((n, n), np.float32)
    mean = C.spectral(256, 3, beta=3.0, fmin=1)
    for c0 in (0.32, 0.68):
        cu = c0 + C.sample(mean, 0.2 + c0, v) * 0.008
        d = np.abs(((u - cu + 0.5) % 1 - 0.5) * T)
        wdt = 0.085 + 0.025 * C.sample(mean, 0.7, v + c0)
        rut = np.maximum(rut, C.smoothstep(wdt, wdt * 0.55, d))
        rim = np.maximum(rim, np.exp(-((d - wdt * 1.6) / 0.08) ** 2))
    depth = 0.035 + 0.012 * C.spectral(n, 4, beta=2.5, fmin=1)
    H = H - rut * depth + rim * 0.006 * (0.6 + 0.4 * C.spectral(n, 5, beta=2.0, fmin=4))
    # Laengsriefen in der Spur (Reifen/Eisenring)
    H += rut * C.streaks(v, u, 6, 1024, 6, beta=1.2) * 0.0012
    # Hufspuren in der Mitte und daneben
    hoof = np.zeros((n, n), np.float32)
    for i in range(70):
        cx = (0.5 + rng.normal(0, 0.07)) % 1.0 if rng.random() < 0.7 else rng.random()
        cy = rng.random()
        r = rng.uniform(0.045, 0.065)
        dx = ((u - cx + 0.5) % 1 - 0.5) * T
        dy = ((v - cy + 0.5) % 1 - 0.5) * T
        dd = np.sqrt(dx * dx + (dy * 1.15) ** 2)
        hoof = np.maximum(hoof, C.smoothstep(r, r * 0.6, dd) * rng.uniform(0.3, 1.0))
    H -= hoof * 0.012
    # ausgetrocknete Pfuetzen in den Spuren (tiefe Stellen)
    lowH = C.blur(H, 6)
    pud = C.blur(rut, 3) * C.smoothstep(0.1, 0.9, C.spectral(n, 7, beta=2.5, fmin=2))
    pud = C.smoothstep(0.25, 0.45, pud)
    flat = pud * (lowH - H) * 0.85  # Schlamm glaettet die Oberflaeche
    H = H + flat
    cF1, cF2, _ = C.worley(n, 70, 8, jitter=1.0)
    mudcrack = C.smoothstep(0.06, 0.0, cF2 - cF1) * pud
    H -= mudcrack * 0.0025
    pud_edge = pud * (1 - pud) * 4
    # Kies
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.006, 0.02) if r.random() < 0.9 else r.uniform(0.02, 0.045), 9000, gap=0.002)
    st = C.cell_stones(rng, n, T, P, R, gap=0.0, round_frac=0.9, dome=0.7, height=R * 0.9, surf_amp=0.05,
                       seed=9, weight_frac=1.0)
    inside = st["rel"] < 0.95
    gm = (1 - rut * 0.6) * C.smoothstep(-0.5, 0.6, C.spectral(n, 10, beta=2.0, fmin=3)) * (1 - pud)
    keep = rng.random(len(P))[st["ID"]] < gm
    stoneH = np.where(inside & keep, H + (np.sqrt(np.clip(1 - st["rel"] ** 2, 0, 1)) - 0.55) * R[st["ID"]] * 0.8, -1)
    is_stone = (stoneH > H).astype(np.float32)
    H = np.maximum(H, stoneH)
    H += C.spectral(n, 11, beta=1.0, fmin=300) * 0.0004 * (1 - pud)
    # Farben
    dry = np.array([0.245, 0.195, 0.135])
    comp = np.array([0.135, 0.105, 0.075])
    m1 = C.spectral(n, 12, beta=2.0, fmin=3)
    rb = C.blur(rut, 4) * (0.6 + 0.4 * C.smoothstep(-1.0, 1.0, C.spectral(n, 14, beta=2.2, fmin=3)))
    col = dry * (1 - rb[..., None]) + comp * rb[..., None]
    col = col * (1 + 0.13 * m1 + 0.07 * C.spectral(n, 13, beta=1.2, fmin=60))[..., None]
    org = C.smoothstep(1.4, 2.2, C.spectral(n, 15, beta=1.8, fmin=20)) * (1 - rb)
    col = col * (1 - 0.45 * org[..., None])
    hp = H - C.blur(H, 5)
    col = col * (1 + np.clip(hp / 0.003, -1, 1) * 0.10)[..., None]
    mud = np.array([0.105, 0.085, 0.065])
    col = col * (1 - pud[..., None]) + mud * pud[..., None]
    col = col * (1 - 0.25 * pud_edge[..., None])
    col = col * (1 - 0.45 * mudcrack[..., None])
    col = col * (1 - 0.15 * hoof[..., None])
    scol = C.palette_pick(rng, len(P), [(0.30, 0.28, 0.25), (0.36, 0.31, 0.24), (0.22, 0.21, 0.20),
                                        (0.40, 0.36, 0.30)], jitter=0.08)[st["ID"]]
    col = col * (1 - is_stone[..., None]) + scol * is_stone[..., None]
    rough = 0.93 - 0.12 * rb - 0.2 * pud + 0.03 * mudcrack
    rough = rough * (1 - is_stone) + 0.7 * is_stone
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.2)


if __name__ == "__main__":
    C.run(SPEC, build)
