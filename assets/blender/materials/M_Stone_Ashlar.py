"""M_Stone_Ashlar - Quadermauerwerk (Sandstein, gealtert).

Echte Geometrie: unregelmaessige Lagen (Schichthoehen variieren), Quader mit gerundeten,
verwitterten Kanten, leicht gewoelbten/verkippten Spiegeln, muschelfoermigen Abplatzungen
(Kugel-Ausschnitte an Kanten und Ecken), zurueckliegendes Fugenbett aus Kalkmoertel.
Mikrostruktur per Shader-Bump: Korn, Poren, Schichtung (Lagerung), Scharrier-Spuren.
U = horizontal (Lagerfugen), V = oben.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

T = 2.5
SPEC = C.Spec(
    "M_Stone_Ashlar", seed=5101, tile_m=T, tiers=("2k", "1k", "512"), kind="wall", ao_distance=0.035,
    description="Quadermauerwerk aus gelblich-grauem Sandstein, Kalkmoertelfugen, verwitterte Kanten, Abplatzungen",
    orientation="U horizontal entlang der Lagerfugen, V nach oben",
    tint={"hue": [-0.02, 0.015], "saturation": [0.85, 1.1], "value": [0.85, 1.1]},
)


def courses(rng):
    k = 6
    hs = rng.uniform(0.30, 0.52, k)
    hs *= T / hs.sum()
    return hs


def course_blocks(rng, prev_joints):
    best = None
    for _try in range(24):
        Ls = []
        x = 0.0
        while T - x > 1.15:
            L = rng.uniform(0.48, 1.15)
            Ls.append(L)
            x += L
        r = T - x
        if r < 0.40:
            Ls[-1] += r
        else:
            Ls.append(r)
        off = rng.uniform(0, T)
        joints = (off + np.concatenate([[0], np.cumsum(Ls)[:-1]])) % T
        if prev_joints is None or len(prev_joints) == 0:
            score = 1.0
        else:
            d = np.abs(joints[:, None] - prev_joints[None, :])
            d = np.minimum(d, T - d)
            score = d.min()
        if best is None or score > best[0]:
            best = (score, Ls, off, joints)
        if score > 0.12:
            break
    return best[1], best[2], best[3]


def build_stones(rng, mat_stone):
    unit, quads = C.cube_sphere(64, edge_bias=0.6)
    V, Q, A_rnd, A_rnd2, A_chip, A_loc, A_ln = [], [], [], [], [], [], []
    off = 0
    hs = courses(rng)
    y0 = 0.0
    prev = None
    nstones = 0
    for H in hs:
        Ls, xo, joints = course_blocks(rng, prev)
        prev = joints
        x = xo
        for L in Ls:
            j = rng.uniform(0.012, 0.026)
            hx = (L - j) / 2 - rng.uniform(0, 0.004)
            hy = (H - j) / 2 - rng.uniform(0, 0.004)
            hz = 0.09
            r = rng.uniform(0.010, 0.032)
            p, n = C.rounded_box(unit, (hx, hy, hz), r)
            seed = int(rng.integers(1 << 30))
            # Spiegel: Woelbung + unregelmaessige Flaeche
            wf = C.smoothstep(0.3, 0.95, n[:, 2])
            u = unit
            bulge = rng.uniform(0.002, 0.013) * (1 - u[:, 0] ** 2) * (1 - u[:, 1] ** 2)
            rel = C.fbm3(p * 2.5, seed, 4) * 0.008 + C.fbm3(p * 9, seed + 7, 3) * 0.0028 + C.fbm3(p * 30, seed + 9, 2) * 0.0009
            # Kanten verwittert: zusaetzlich nach innen genagt
            edge = 1 - wf
            gnaw = edge * (0.6 + 0.4 * C.fbm3(p * 25, seed + 3, 3)) * rng.uniform(0.0, 0.009)
            p = p + n * (wf * (bulge + rel) - gnaw)[:, None]
            # muschelige Abplatzungen (Kugel-Ausschnitte an Spiegelkanten/Ecken)
            chip = np.zeros(len(p))
            nch = rng.poisson(3.6)
            for _c in range(nch):
                e = rng.integers(4)
                if rng.random() < 0.25:  # Ecke
                    P = np.array([rng.choice([-1, 1]) * hx, rng.choice([-1, 1]) * hy, hz])
                    side = np.array([np.sign(P[0]), np.sign(P[1]), 0]) / np.sqrt(2)
                else:
                    t = rng.uniform(-0.9, 0.9)
                    if e == 0:
                        P, side = np.array([t * hx, -hy, hz]), np.array([0, -1, 0])
                    elif e == 1:
                        P, side = np.array([t * hx, hy, hz]), np.array([0, 1, 0])
                    elif e == 2:
                        P, side = np.array([-hx, t * hy, hz]), np.array([-1, 0, 0])
                    else:
                        P, side = np.array([hx, t * hy, hz]), np.array([1, 0, 0])
                d = side + np.array([0, 0, 1.0]) * rng.uniform(0.6, 1.6) + rng.normal(0, 0.25, 3)
                d /= np.linalg.norm(d)
                R = rng.uniform(0.02, 0.095)
                depth = rng.uniform(0.004, 0.022) * (R / 0.05)
                Cc = P + d * (R - depth)
                v = p - Cc
                dist = np.linalg.norm(v, axis=1)
                ins = dist < R
                if ins.any():
                    newp = Cc + v[ins] / dist[ins, None] * R
                    chip[ins] += np.linalg.norm(newp - p[ins], axis=1)
                    p[ins] = newp
            # Bruchflaechen rau
            cm = C.smoothstep(0.0005, 0.004, chip)
            p = p + n * (cm * C.fbm3(p * 70, seed + 11, 3) * 0.0015)[:, None]
            # leichte Verkippung, Vor-/Ruecksprung
            Rm = C.rot_axis((1, 0, 0), rng.normal(0, 0.012)) @ C.rot_axis((0, 1, 0), rng.normal(0, 0.012)) \
                @ C.rot_z(rng.normal(0, 0.004))
            p = p @ Rm.T
            cx = x + L / 2
            cy = y0 + H / 2
            cz = -hz + rng.normal(0, 0.005)
            loc = p + rng.uniform(-40, 40, 3)
            p = p + np.array([cx, cy, cz])
            # Steine an der rechten/oberen Kante wickeln (Instanzen liefern den Rest)
            p[:, 0] = np.where(cx >= T, p[:, 0] - T, p[:, 0])
            V.append(p)
            Q.append(quads + off)
            off += len(p)
            rv = rng.random()
            A_rnd.append(np.full(len(p), rv))
            A_rnd2.append(np.full(len(p), rng.random()))
            A_chip.append(chip)
            A_loc.append(loc)
            A_ln.append(unit)
            nstones += 1
            x += L
        y0 += H
    C.log("Quader:", nstones)
    V = np.concatenate(V)
    # alles, was rechts ueber T hinausragt, wird durch die Instanzen ohnehin abgedeckt
    return C.mesh_from_arrays("Stones", V, np.concatenate(Q),
                              point_attrs={"rnd": np.concatenate(A_rnd), "rnd2": np.concatenate(A_rnd2),
                                           "chip": np.concatenate(A_chip), "loc": np.concatenate(A_loc),
                                           "ln": np.concatenate(A_ln)},
                              material=mat_stone)


def stone_shader():
    S = C.Shader("Stone", T)
    loc = S.attr("loc", out="Vector")
    rnd = S.attr("rnd")
    rnd2 = S.attr("rnd2")
    chip = S.attr("chip")
    ln = S.attr("ln", out="Vector")
    lx, ly, lz = S.sep(ln)
    base = S.ramp(rnd, [
        (0.00, (0.300, 0.262, 0.205)),
        (0.25, (0.355, 0.300, 0.215)),
        (0.45, (0.330, 0.300, 0.255)),
        (0.62, (0.385, 0.322, 0.232)),
        (0.80, (0.300, 0.282, 0.250)),
        (1.00, (0.350, 0.270, 0.205)),
    ])
    # Schichtung (Lagerung) entlang U, Fleckigkeit, Eisenfahnen
    bedv = S.vmath("MULTIPLY", loc, (0.9, 14.0, 0.9))
    bed = S.noise(bedv, 1.0, detail=4, rough=0.6, distortion=0.4)
    mott = S.noise(loc, 7.0, detail=6, rough=0.55)
    col = S.mixc(base, S.mixc(base, (0.42, 0.30, 0.17), 0.6), S.smooth(bed, 0.55, 0.75))
    col = S.hsv(col, 0.5, 1.0, S.remap(mott, 0.25, 0.75, 0.74, 1.18))
    col = S.hsv(col, 0.5, 1.0, S.remap(rnd2, 0.0, 1.0, 0.82, 1.14))
    # dunkle Verwitterungskruste (Patina) und Ablaufspuren (vertikal gestreckt)
    crust = S.smooth(S.noise(loc, 2.2, detail=6, rough=0.62), 0.52, 0.66)
    runv = S.vmath("MULTIPLY", loc, (9.0, 0.7, 9.0))
    runs = S.smooth(S.noise(runv, 1.0, detail=5, rough=0.6), 0.5, 0.7)
    col = S.mixc(col, (0.115, 0.105, 0.09), S.mul(S.maxi(crust, S.mul(runs, 0.7)), 0.55))
    # frische Bruchflaechen heller/gelblicher
    fresh = S.smooth(chip, 0.0008, 0.006)
    col = S.mixc(col, S.hsv(col, 0.505, 0.95, 1.28), fresh)
    # Schmutz an den Raendern (Fugennaehe), Kanten abgegriffen -> Pointiness
    border = S.maxi(S.math("ABSOLUTE", lx), S.math("ABSOLUTE", ly))
    grime = S.mul(S.smooth(border, 0.82, 1.0), S.remap(S.noise(loc, 3.0, 3), 0.3, 0.7, 0.3, 1.0))
    # grossflaechige Verschmutzung/Russ (periodisch ueber die Kachel)
    big = S.pnoise(5, detail=5, rough=0.6, seed=2)
    col = S.hsv(col, 0.5, 1.0, S.remap(big, 0.3, 0.75, 0.80, 1.06))
    col = S.mixc(col, (0.13, 0.115, 0.095), S.mul(grime, 0.45))
    # Flechten-Tupfen (selten)
    lich_v = S.voronoi(loc, 30.0, rand=1.0)
    lich_mask = S.mul(S.smooth(lich_v, 0.22, 0.05), S.smooth(S.pnoise(3, detail=2, seed=5), 0.58, 0.68))
    col = S.mixc(col, (0.42, 0.42, 0.33), S.mul(lich_mask, 0.8))
    pt = S.geo("Pointiness")
    col = S.mixc(col, S.hsv(col, 0.5, 0.9, 1.15), S.smooth(pt, 0.52, 0.62))
    # Mikrostruktur (Meter)
    grain = S.noise(loc, 900.0, detail=3, rough=0.6)
    pores_v = S.voronoi(loc, 260.0, rand=1.0)
    pores = S.smooth(pores_v, 0.18, 0.0)
    ero_v = S.vmath("MULTIPLY", loc, (1.5, 40.0, 1.5))
    ero = S.noise(ero_v, 1.0, detail=5, rough=0.65)
    # Scharrierung: feine parallele Rillen, Richtung je Stein, stark verwittert
    dirv = S.comb(S.math("COSINE", S.mul(rnd2, 6.28)), S.math("SINE", S.mul(rnd2, 6.28)), 0.0)
    tool = S.math("SINE", S.mul(S.add(S.vmath("DOT_PRODUCT", loc, dirv), S.mul(S.noise(loc, 30.0, 2), 0.003)),
                                6.283 / 0.0042))
    tool_m = S.smooth(S.noise(loc, 4.0, 2), 0.45, 0.7)
    micro = S.add(S.mul(S.sub(grain, 0.5), 0.0007), S.mul(pores, -0.0008))
    micro = S.add(micro, S.mul(S.sub(ero, 0.5), 0.0022))
    micro = S.add(micro, S.mul(S.mul(tool, tool_m), 0.00018))
    micro = S.add(micro, S.mul(S.sub(S.noise(loc, 120.0, 3), 0.5), S.mul(fresh, 0.002)))
    rough = S.add(S.remap(mott, 0.3, 0.7, 0.80, 0.9), S.mul(lich_mask, 0.05))
    return S.finish(col, rough, 0.0, micro)


def mortar_shader():
    S = C.Shader("Mortar", T)
    n1 = S.pnoise(120, detail=4, seed=11)
    n2 = S.pnoise(8, detail=4, seed=12)
    col = S.mixc((0.31, 0.29, 0.245), (0.19, 0.175, 0.15), S.smooth(n2, 0.4, 0.7))
    col = S.hsv(col, 0.5, 1.0, S.remap(n1, 0.3, 0.7, 0.85, 1.1))
    grit = S.pvoronoi(1600, seed=13)
    peb = S.smooth(grit, 0.25, 0.05)
    col = S.mixc(col, (0.26, 0.24, 0.21), S.mul(peb, S.smooth(S.pnoise(300, 2, seed=14), 0.5, 0.6)))
    sand = S.pnoise(1100, detail=2, seed=15)
    micro = S.add(S.mul(S.sub(sand, 0.5), 0.0006), S.mul(peb, 0.0005))
    rough = S.remap(n1, 0.3, 0.7, 0.88, 0.97)
    return S.finish(col, rough, 0.0, micro)


def build(scene, tile):
    rng = np.random.default_rng(SPEC.seed)
    stones = build_stones(rng, stone_shader())
    # Fugenbett: periodisch verformte Ebene, ca. 8-14 mm hinter den Spiegeln
    v, q = C.grid(400, 400, 0, 0, T, T)
    g1 = C.spectral(512, SPEC.seed + 1, beta=2.4, fmin=2)
    g2 = C.spectral(512, SPEC.seed + 2, beta=1.6, fmin=20)
    v[:, 2] = -0.021 + C.sample(g1, v[:, 0] / T, v[:, 1] / T) * 0.0045 + C.sample(g2, v[:, 0] / T, v[:, 1] / T) * 0.0012
    mort = C.mesh_from_arrays("Mortar", v, q, material=mortar_shader())
    for ob in (stones, mort):
        scene.collection.objects.unlink(ob)
        tile.objects.link(ob)


if __name__ == "__main__":
    C.run(SPEC, build)
