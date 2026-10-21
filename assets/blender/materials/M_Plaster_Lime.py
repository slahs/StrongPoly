"""M_Plaster_Lime - Kalkputz, gealtert und leicht verschmutzt.

Echte Geometrie (Hoehenfeld-Ebene): wellige Kellenstruktur (ueberlappende Kellenzuege mit
weichen Graten), Sandkorn, abblaetternde Kalktuenche-Schichten, Haarrisse (verzweigtes,
verzerrtes Rissnetz), wenige Abplatzungen mit Bruchstein-Untergrund, senkrechte Schmutzlaeufe.
orm.a (Hoehe) ist so normiert, dass Abplatzungen ganz unten liegen -> Hoehen-Blend mit
M_Stone_Rubble ueber Vertexfarbe/Maske fuer staerkere Schaeden. U horizontal, V oben.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 2.0
SPEC = C.Spec(
    "M_Plaster_Lime", seed=5404, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.03,
    description="Kalkputz mit Kellenstruktur, Tuencheschichten, Haarrissen, Schmutzlaeufen und kleinen Abplatzungen",
    orientation="U horizontal, V nach oben (Schmutzlaeufe nach unten)",
    tint={"hue": [-0.03, 0.03], "saturation": [0.7, 1.2], "value": [0.85, 1.05]},
    notes="Hoehe (orm.a): Abplatzungen ~0, Putzflaeche ~0.6-1. Fuer staerkere Schaeden mit M_Stone_Rubble "
          "per Hoehen-Blend mischen (Maske aus Vertexfarbe, Schwelle gegen orm.a).",
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    # Kellenstruktur: grosse Wellen + ueberlappende Kellenzuege (Zellgrenzen als weiche Grate)
    w1 = C.spectral(n, 1, beta=3.0, fmin=1)
    F1, F2, IDk = C.worley(n, 9, 2, jitter=0.9, aspect=(1.0, 1.7))
    ridge = C.smoothstep(0.10, 0.0, F2 - F1)
    kid = np.random.default_rng(3).random(81)[IDk]
    tilt = (np.random.default_rng(4).random((81, 2)) - 0.5)[IDk]
    cellslope = (tilt[..., 0] * (F1 * 0.5) + tilt[..., 1] * F1 * 0.3)
    H = w1 * 0.0040 + ridge * 0.0010 + cellslope * 0.0030
    sand = C.spectral(n, 5, beta=0.8, fmin=220)
    H += sand * 0.00010 + C.spectral(n, 6, beta=1.6, fmin=60) * 0.00012
    # Tuencheschichten (oberste Kalkfarbe teils abgeblaettert)
    lw = C.spectral(n, 7, beta=2.2, fmin=4) + 0.3 * C.spectral(n, 8, beta=1.2, fmin=40)
    wash = C.smoothstep(0.35, 0.45, lw)  # 1 = Tuenche vorhanden
    H += wash * 0.00035
    # Haarrisse: verzerrtes Zellnetz, nur teilweise sichtbar
    warpx = C.spectral(n, 9, beta=2.0, fmin=3) * 0.025
    warpy = C.spectral(n, 10, beta=2.0, fmin=3) * 0.025
    cF1, cF2, _ = C.worley(n, 6, 11, jitter=1.0)
    cF1b, cF2b, _ = C.worley(n, 6, 11, jitter=1.0)
    # zweites, verschobenes Abtasten fuer Verzerrung
    edge = C.sample(cF2 - cF1, u + warpx, v + warpy)
    fine = C.sample(C.worley(n, 17, 12, jitter=1.0)[1] - C.worley(n, 17, 12, jitter=1.0)[0], u + warpy, v + warpx)
    vis = C.smoothstep(0.6, 1.2, C.spectral(n, 13, beta=2.4, fmin=2))
    vis2 = C.smoothstep(0.9, 1.5, C.spectral(n, 14, beta=2.2, fmin=4))
    px = 1.0 / n
    crack = np.maximum(C.smoothstep(0.012, 0.0, edge) * vis, C.smoothstep(0.02, 0.0, fine) * vis2 * 0.8)
    H -= crack * 0.0018
    # Abplatzungen: Putz (15 mm) fehlt, darunter Bruchstein
    # zwei groessere, unregelmaessige Abplatzungen (periodischer Abstand)
    spn = C.spectral(n, 15, beta=2.0, fmin=3) * 0.16 + C.spectral(n, 16, beta=1.4, fmin=25) * 0.05
    shape = np.full((n, n), -1.0, np.float32)
    for (cx, cy, rx, ry) in ((0.62, 0.33, 0.12, 0.08),):
        dx = (u - cx + 0.5) % 1.0 - 0.5
        dy = (v - cy + 0.5) % 1.0 - 0.5
        shape = np.maximum(shape, 1.0 - np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2))
    spall = C.smoothstep(-0.006, 0.006, shape + spn)
    # Rand der Abplatzung: Putzkante leicht ausgebrochen
    from scipy import ndimage
    dist_in = ndimage.distance_transform_edt(np.tile(spall > 0.5, (3, 3)))[n:2 * n, n:2 * n] * T / n
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.05, 0.11), 1500, gap=0.004)
    P, R = C.poisson_torus(rng, T, lambda r: r.uniform(0.025, 0.05), 3000, gap=0.003, existing=(P, R))
    st = C.cell_stones(rng, n, T, P, R, aniso=(1.0, 1.4), gap=0.012, round_frac=0.4, dome=0.2,
                       height=0.006 + R * 0.08, surf_amp=0.05, seed=17)
    base = -0.016 + np.maximum(st["H"], 0.002 + 0.002 * C.spectral(n, 18, beta=2.0, fmin=5))
    is_stone_under = (st["H"] > 0.002).astype(np.float32)
    lip = C.smoothstep(0.0, 0.012, dist_in)  # weicher Uebergang am Bruchrand (Sohle)
    Hs = H * (1 - spall) + spall * (base * lip + (H - 0.006) * (1 - lip))
    # Albedo
    putz = np.array([0.60, 0.545, 0.43])
    under = np.array([0.47, 0.425, 0.345])  # grauerer Unterputz
    m1 = C.spectral(n, 19, beta=2.0, fmin=2)
    m2 = C.spectral(n, 20, beta=1.2, fmin=50)
    alb = under * (1 - wash[..., None]) + putz * wash[..., None]
    alb = alb * (1 + 0.05 * m1 + 0.025 * m2)[..., None]
    # Schmutzlaeufe: vertikal gestreckt, von oben nach unten auslaufend
    runs = C.spectral(n, 21, beta=2.0, fmin=2, aniso=(1.0, 0.12))
    runs2 = C.spectral(n, 22, beta=1.6, fmin=6, aniso=(1.0, 0.18))
    streak = np.clip(0.55 * runs + 0.4 * runs2 - 0.1, 0, None)
    streak = np.clip(streak, 0, 1.4) / 1.4
    alb = alb * (1 - 0.5 * streak[..., None]) + 0.5 * streak[..., None] * np.array([0.25, 0.225, 0.185])
    grime = C.smoothstep(0.0, 2.0, C.spectral(n, 23, beta=2.6, fmin=1))
    alb = alb * (1 - 0.18 * grime[..., None])
    alb = alb * (1 - 0.65 * crack[..., None])
    # gruenliche Algen-/Moosschleier selten
    alg = C.smoothstep(1.3, 2.2, C.spectral(n, 24, beta=2.4, fmin=2)) * 0.35
    alb = alb * (1 - alg[..., None]) + alg[..., None] * np.array([0.22, 0.25, 0.17])
    # Abplatzung: Steine + Moertel
    scol = C.palette_pick(rng, len(P), [(0.30, 0.28, 0.25), (0.33, 0.28, 0.21), (0.24, 0.21, 0.18),
                                        (0.20, 0.19, 0.175)], jitter=0.06)
    sc = scol[st["ID"]] * (0.7 + 0.3 * C.smoothstep(0, 0.02, st["e"]))[..., None]
    mort = np.array([0.35, 0.33, 0.285]) * (1 + 0.1 * m2)[..., None]
    inner = sc * is_stone_under[..., None] + mort * (1 - is_stone_under[..., None])
    inner = inner * (0.75 + 0.25 * lip[..., None])
    sp3 = spall[..., None]
    alb = alb * (1 - sp3) + inner * sp3
    rough = 0.90 + 0.04 * m2 - 0.03 * wash
    rough = rough * (1 - spall) + spall * (0.86 + 0.06 * is_stone_under)
    C.hf_build(SPEC, tile, Hs.astype(np.float32), np.clip(alb, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.2)


if __name__ == "__main__":
    C.run(SPEC, build)
