"""M_Timber_Oak - gealterte, behauene Eichenbalken (Fachwerk, Staender, Riegel).

Echte Geometrie (Hoehenfeld-Ebene): ausgewitterte Maserung (weiches Fruehholz tiefer),
Beilspuren (flache Dechsel-/Beilmulden quer zur Faser mit Graten), Trockenrisse (lange,
spitz auslaufende Risse entlang der Faser), Aeste mit umlaufender Faser.
Farbe: mittel- bis dunkelbraun, an den Graten silbergrau verwittert.
U = Faserrichtung (Balkenlaengsachse), V quer.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 1.0
SPEC = C.Spec(
    "M_Timber_Oak", seed=5505, tile_m=T, tiers=("2k", "1k", "512"), kind="wall", ao_distance=0.02,
    description="Gealterte, behauene Eiche: ausgewitterte Maserung, Beilspuren, Trockenrisse, Aeste",
    orientation="U entlang der Faser (Balkenachse), V quer dazu",
    tint={"hue": [-0.02, 0.02], "saturation": [0.8, 1.15], "value": [0.75, 1.1]},
    preview_uv_scale=1.0,
)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    n = SPEC.res
    X, Y = C.pix_coords(n, T)
    u, v = X / T, Y / T
    # Aeste: Faserverzerrung um die Astposition
    knots = [(0.27, 0.62, 0.018, 0.012), (0.78, 0.18, 0.012, 0.009)]
    wy = np.zeros((n, n), np.float32)
    kmask = np.zeros((n, n), np.float32)
    for (kx, ky, rx, ry) in knots:
        dx = (u - kx + 0.5) % 1.0 - 0.5
        dy = (v - ky + 0.5) % 1.0 - 0.5
        g = np.exp(-(dx / (rx * 4.5)) ** 2 - (dy / (ry * 2.2)) ** 2)
        wy += np.sign(dy) * g * ry * 1.6
        kd = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        kmask = np.maximum(kmask, C.smoothstep(1.15, 0.85, kd))
    vv = v + wy
    # Maserung: Faserstreifen entlang U (wenige Stuetzstellen laengs, viele quer), weich verzerrt
    warp = C.spectral(n, 1, beta=3.4, fmin=1) * 0.008
    vw = vv + warp
    G1 = C.streaks(u, vw, 2, 512, 6, beta=1.4)
    G2 = C.streaks(u, vw, 3, 2048, 24, beta=1.0)
    G3 = C.streaks(u, vw, 4, 128, 4, beta=2.0)
    rings = np.sin((vw * 180 + G3 * 0.5) * np.pi)  # Jahrringe ~5,5 mm
    grooves = np.clip(rings, 0, 1) ** 2 * 0.0005 + G2 * 0.00035 + G1 * 0.0007
    # Beilspuren: Mulden quer zur Faser (Zellen in V gestreckt)
    F1, F2, IDb = C.worley(n, 16, 4, jitter=0.85, aspect=(1.0, 0.3))
    dish = -(1.0 - np.clip(F1 / 0.75, 0, 1) ** 2) * 0.0024
    dvar = np.random.default_rng(5).uniform(0.4, 1.3, 256)[IDb]
    H = C.blur(dish * dvar, 8) + grooves * 1.3 + C.spectral(n, 6, beta=2.8, fmin=1) * 0.0018
    # Trockenrisse
    crack = np.zeros((n, n), np.float32)
    for i in range(7):
        y0 = rng.random()
        x0 = rng.random()
        L = rng.uniform(0.35, 1.1)
        wmax = rng.uniform(0.0015, 0.0055)
        wav = C.spectral(256, 40 + i, beta=3.2, fmin=1)
        t = ((u - x0) % 1.0) / L
        inside = (t < 1.0)
        w = wmax * np.maximum(np.sin(np.clip(t, 0, 1) * np.pi), 0.0) ** 0.7
        yc = y0 + C.sample(wav, u, 0.37 * i) * 0.003 + wy
        d = np.abs((v - yc + 0.5) % 1.0 - 0.5) * T
        c = C.smoothstep(w + 0.0006, w * 0.3, d) * inside
        crack = np.maximum(crack, c)
    H -= crack * 0.012
    # Ast: leicht erhaben, mit Ringen und Schwundriss
    H += kmask * 0.0006
    # Albedo: warmes, dunkles Eichenbraun; Verwitterung grau entlang der Faser
    base = np.array([0.120, 0.082, 0.052])
    grey = np.array([0.20, 0.18, 0.155])
    wst = C.streaks(u, vw, 9, 256, 3, beta=1.8)
    weather = np.clip(0.45 + 0.25 * C.spectral(n, 7, beta=2.6, fmin=1) + 0.25 * wst, 0, 1)
    col = base * (1 - weather[..., None]) + grey * weather[..., None]
    tone = 1.0 + 0.16 * G1 + 0.10 * G2 + 0.07 * rings
    col = col * tone[..., None]
    # Grate heller, Mulden/Rillen dunkler
    hp = H - C.blur(H, 6)
    col = col * (1 + np.clip(hp / 0.0006, -1, 1)[..., None] * 0.12)
    col = col * (1 - 0.85 * crack[..., None])
    kcol = np.array([0.06, 0.04, 0.026])
    kr = np.zeros((n, n), np.float32)
    for (kx, ky, rx, ry) in knots:
        dx = (u - kx + 0.5) % 1.0 - 0.5
        dy = (v - ky + 0.5) % 1.0 - 0.5
        kd = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        kr = np.maximum(kr, (0.5 + 0.5 * np.sin(kd * 18)) * C.smoothstep(1.1, 0.9, kd))
    col = col * (1 - kmask[..., None] * 0.6) + kcol * (kmask * (0.4 + 0.3 * kr))[..., None]
    dirt = C.smoothstep(0.2, 1.8, C.spectral(n, 8, beta=2.8, fmin=1))
    col = col * (1 - 0.25 * dirt[..., None])
    rough = 0.72 + 0.10 * weather - 0.03 * G2 + 0.1 * crack
    C.hf_build(SPEC, tile, H.astype(np.float32), np.clip(col, 0, 1).astype(np.float32), rough.astype(np.float32),
               geo_res=1024, split_sigma=1.0)


if __name__ == "__main__":
    C.run(SPEC, build)
