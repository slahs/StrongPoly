"""M_Wood_Planks - Brettverschalung / Tuerbretter (Nadel-/Laubholz, verwittert).

Echte Geometrie (Hoehenfeld-Ebene): senkrechte Bretter unterschiedlicher Breite mit
gerundeten Kanten, leichter Schuesselung und Hoehenversatz, offene Fugen, Brettsaege-Spuren
(leicht schraege Riefen), Faserrillen, Astloecher; zwei Nagelreihen (geschmiedete Kopfnaegel,
metallisch) mit Rostfahnen nach unten. V = Faserrichtung (Bretter senkrecht), U quer.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.5
SPEC = C.Spec(
    "M_Wood_Planks", seed=5606, tile_m=T, tiers=("1k", "512"), kind="wall", ao_distance=0.025,
    description="Senkrechte, verwitterte Bretter mit Fugen, Saegeriefen, Aesten und geschmiedeten Naegeln",
    orientation="V entlang der Bretter (senkrecht), U quer; fuer Boeden um 90 Grad drehen",
    tint={"hue": [-0.02, 0.02], "saturation": [0.8, 1.15], "value": [0.75, 1.12]},
    notes="Naegel in zwei Reihen bei V=0.18 und V=0.68 (Querleisten dahinter), metallisch in orm.b.",
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    # Brettbreiten
    ws = []
    while sum(ws) < T - 0.33:
        ws.append(rng.uniform(0.17, 0.30))
    ws.append(T - sum(ws))
    edges = np.concatenate([[0], np.cumsum(ws)]) / T
    off = rng.random()
    uu = (u - off) % 1.0
    bid = np.searchsorted(edges, uu, side="right") - 1
    bid = np.clip(bid, 0, len(ws) - 1)
    b0 = edges[bid]
    b1 = edges[bid + 1]
    wloc = (uu - b0) / (b1 - b0)           # 0..1 quer im Brett
    dedge = np.minimum(uu - b0, b1 - uu) * T  # Abstand zur Brettkante (m)
    nb = len(ws)
    gap = rng.uniform(0.002, 0.005, nb)[bid]
    boff = rng.uniform(-0.0018, 0.0018, nb)[bid]
    cup = rng.uniform(0.0006, 0.002, nb)[bid]
    r_edge = 0.004
    t = np.clip((dedge - gap / 2) / r_edge, 0, 1)
    prof = np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))
    H = (0.004 + boff + cup * (2 * wloc - 1) ** 2) * prof - 0.012 * (1 - prof) ** 4
    # Maserung je Brett (versetzt), entlang V
    ob = rng.random((nb, 2))[bid]
    uw = u + ob[..., 0] * 7.0
    warp = C.spectral(n, 1, beta=3.4, fmin=1) * 0.01
    G1 = C.streaks(v + ob[..., 1], uw + warp, 2, 640, 6, beta=1.4)
    G2 = C.streaks(v + ob[..., 1], uw + warp, 3, 2048, 20, beta=1.0)
    rings = np.sin((uw + warp) * T * 160 * np.pi + C.streaks(v, uw, 4, 128, 4, beta=2.0) * 2.0)
    H += prof * (G1 * 0.0005 + G2 * 0.0003 + np.clip(rings, 0, 1) ** 2 * 0.0004)
    # Saegeriefen: leicht schraege, unregelmaessige Linien quer
    ang = rng.uniform(-0.12, 0.12, nb)[bid]
    saw = np.sin((Y + ang * X) * 2 * np.pi / 0.014 + C.spectral(n, 5, beta=2.5, fmin=2) * 2.0)
    sawm = C.smoothstep(-0.3, 0.8, C.spectral(n, 6, beta=2.0, fmin=2))
    H += prof * saw * sawm * 0.00012
    # Astloecher
    kn = np.zeros((n, n), np.float32)
    for _k in range(4):
        kx, ky = rng.random(2)
        rx, ry = rng.uniform(0.006, 0.013), rng.uniform(0.01, 0.02)
        dx = ((u - kx + 0.5) % 1 - 0.5) * T
        dy = ((v - ky + 0.5) % 1 - 0.5) * T
        kd = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        kn = np.maximum(kn, C.smoothstep(1.1, 0.8, kd))
    H -= kn * 0.002 * prof
    # Naegel
    nail = np.zeros((n, n), np.float32)
    nail_h = np.zeros((n, n), np.float32)
    rust = np.zeros((n, n), np.float32)
    for row_v in (0.18, 0.68):
        for i in range(nb):
            for side in (0.25, 0.75):
                cu = (off + edges[i] + side * (edges[i + 1] - edges[i])) % 1.0
                cv = row_v + rng.normal(0, 0.006)
                cu += rng.normal(0, 0.004)
                dx = ((u - cu + 0.5) % 1 - 0.5) * T
                dy = ((v - cv + 0.5) % 1 - 0.5) * T
                s = rng.uniform(0.0055, 0.0075)
                rot = rng.uniform(0, np.pi / 2)
                qx = np.abs(dx * np.cos(rot) - dy * np.sin(rot))
                qy = np.abs(dx * np.sin(rot) + dy * np.cos(rot))
                sq = np.maximum(qx, qy) * 0.75 + np.sqrt(dx * dx + dy * dy) * 0.25
                m = C.smoothstep(s, s * 0.85, sq)
                nail = np.maximum(nail, m)
                nail_h = np.maximum(nail_h, m * (0.0016 * np.sqrt(np.clip(1 - (sq / s) ** 2, 0, 1)) + 0.0004))
                runl = rng.uniform(0.03, 0.12)
                rr = np.exp(-(dx / 0.006) ** 2) * C.smoothstep(0.0, 0.01, -dy) * C.smoothstep(runl, 0.0, -dy)
                halo = np.exp(-(dx * dx + dy * dy) / 0.012 ** 2)
                rust = np.maximum(rust, np.maximum(rr * 0.7, halo * 0.6))
    nail_tex = C.spectral(n, 7, beta=1.2, fmin=200)
    H = H * (1 - nail) + nail * (0.004 + boff + nail_h + nail_tex * 0.0002)
    # Albedo
    tones = rng.uniform(0.8, 1.2, nb)[bid]
    base = np.array([0.16, 0.112, 0.075])
    grey = np.array([0.215, 0.195, 0.17])
    wst = C.streaks(v + ob[..., 1], uw, 9, 256, 3, beta=1.8)
    weather = np.clip(0.5 + 0.2 * C.spectral(n, 8, beta=2.6, fmin=1) + 0.25 * wst + 0.2 * (rng.random(nb)[bid] - 0.5), 0, 1)
    col = (base * (1 - weather[..., None]) + grey * weather[..., None]) * tones[..., None]
    col = col * (1 + 0.15 * G1 + 0.08 * G2 + 0.06 * rings)[..., None]
    col = col * (0.35 + 0.65 * prof)[..., None]
    col = col * (1 - 0.65 * kn[..., None])
    rc = np.array([0.20, 0.085, 0.035])
    col = col * (1 - 0.6 * rust[..., None]) + 0.6 * rust[..., None] * rc
    dirt = C.smoothstep(0.3, 1.8, C.spectral(n, 10, beta=2.8, fmin=1))
    col = col * (1 - 0.2 * dirt[..., None])
    iron = np.array([0.22, 0.20, 0.185]) * (1 + 0.25 * nail_tex)[..., None]
    col = col * (1 - nail[..., None]) + iron * nail[..., None]
    rough = 0.74 + 0.08 * weather + 0.08 * (1 - prof)
    rough = rough * (1 - nail) + nail * (0.55 + 0.1 * nail_tex)
    metal = nail * 0.75 * C.smoothstep(-1.0, 0.5, nail_tex)
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               metal=metal.astype(np.float32), geo_res=1024, split_sigma=1.0)


if __name__ == "__main__":
    C.run(SPEC, build)
