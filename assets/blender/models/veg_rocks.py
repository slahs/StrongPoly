"""Felsen und Steine der Referenzumgebung (Teilschritt 5): Findling (gerundet, halb eingesunken), kantiger Fels
(Bruchflaechen, leichte Schichtung), Felsplatte (flach, rissig), Steinhaufen (Lesesteine). Material M_Rock (UV im Weltmass
per Box-Projektion), Moos-Anteil in der Datenfarbe G (Oberseiten, Mulden), AO per Cycles-Bake (mit Bodenplatte).

LOD aus derselben Form mit weniger Unterteilung (Ikosaeder 4/3/2 bzw. 3/2/1 Stufen) - die Silhouette bleibt gleich.
Budget Fels <= 1500 Dreiecke (LOD0).

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/veg_rocks.py [--only=...] [--no-bake] [--no-blend]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import materials, veg  # noqa: E402
from sp.veg import VMesh, clamp, smooth  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, noise  # noqa: E402

ROCK = 'M_Rock'


def ico(subdiv):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    verts = [v.co.copy() for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def fbm(p, octaves=4, lac=2.0, gain=0.5):
    s = 0.0
    a = 1.0
    f = 1.0
    for _ in range(octaves):
        s += noise.noise(p * f) * a
        f *= lac
        a *= gain
    return s


def rock_shape(seed, radii, center_z, amp, freq, planes=0, strata=0.0, ridge=0.0):
    """Verformungsfunktion: Einheitskugelpunkt -> Position (Blender, Z oben)"""
    rng = random.Random(seed)
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    cuts = []
    for _ in range(planes):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 1.0))).normalized()
        cuts.append((n, rng.uniform(0.62, 0.86)))
    R = Vector(radii)

    def f(u):
        u = u.normalized()
        d = 1.0 + amp * fbm(u * freq + off, 4)
        if ridge:
            d += ridge * (1.0 - abs(noise.noise(u * freq * 2.3 + off * 1.7))) ** 3
        p = u * d
        for n, k in cuts:
            e = p.dot(n) - k
            if e > 0:
                p = p - n * e * 0.92
        p = Vector((p.x * R.x, p.y * R.y, p.z * R.z))
        if strata:
            p.z += strata * math.sin(p.z * 34.0 + fbm(p * 3.0 + off, 2) * 2.0) * (0.4 + 0.6 * abs(u.x * 0.7 + u.y * 0.7))
        p.z += center_z
        return p
    return f


def add_rock(vm, shape, subdiv, tile, loc=(0, 0, 0), rot=0.0, scale=1.0, moss=1.0, rnd=0.5):
    verts, faces = ico(subdiv)
    c, s = math.cos(rot), math.sin(rot)
    P = []
    for v in verts:
        p = shape(v) * scale
        P.append(Vector((p.x * c - p.y * s + loc[0], p.x * s + p.y * c + loc[1], p.z + loc[2])))
    # weiche Normalen je Ecke
    vn = [Vector((0, 0, 0)) for _ in P]
    fns = []
    for f in faces:
        a, b, cc = P[f[0]], P[f[1]], P[f[2]]
        n = (b - a).cross(cc - a)
        fns.append(n.normalized() if n.length > 1e-12 else Vector((0, 0, 1)))
        for i in f:
            vn[i] += n
    vn = [n.normalized() if n.length > 1e-12 else Vector((0, 0, 1)) for n in vn]
    ids = [vm.vert(p) for p in P]
    tri = 0
    for f, fn in zip(faces, fns):
        ax, ay, az = abs(fn.x), abs(fn.y), abs(fn.z)
        uvs = []
        datas = []
        for i in f:
            p = P[i]
            if az >= ax and az >= ay:
                u, v = p.x, p.y
            elif ax >= ay:
                u, v = p.y, p.z
            else:
                u, v = p.x, p.z
            uvs.append((u / tile, v / tile))
            n = vn[i]
            m = smooth(0.35, 0.85, n.z) * (0.55 + 0.45 * (fbm(p * 4.0, 2) * 0.5 + 0.5)) * moss
            m *= smooth(-0.05, 0.25, p.z)
            datas.append((1.0, clamp(m), rnd, 0.0))
        vm.face([ids[i] for i in f], uvs, [vn[i] for i in f], datas, ROCK)
        tri += 1
    return tri


def rock(asset_id, shape_fn, subs, desc, role, moss=1.0, extra=None):
    tile = materials.tile(ROCK)
    lods = []
    for L, sd in enumerate(subs):
        vm = VMesh()
        shape_fn(vm, sd, tile, moss)
        lods.append(vm)
    return veg.export(asset_id, lods, 'rock', desc=desc, bake_ao=True, bake_distance=0.5, extras=dict({'role': role}, **(extra or {})))


def boulder(vm, sd, tile, moss):
    add_rock(vm, rock_shape(7, (0.62, 0.5, 0.44), 0.18, 0.16, 1.3, ridge=0.04), sd, tile, moss=moss, rnd=0.3)


def angular(vm, sd, tile, moss):
    add_rock(vm, rock_shape(19, (0.55, 0.42, 0.5), 0.2, 0.1, 1.6, planes=7, strata=0.012), sd, tile, moss=moss * 0.8, rnd=0.6)


def slab(vm, sd, tile, moss):
    add_rock(vm, rock_shape(23, (0.72, 0.52, 0.2), 0.04, 0.12, 1.4, planes=4, ridge=0.03), sd, tile, moss=moss * 1.2, rnd=0.8)


def stones(vm, sd, tile, moss):
    rng = random.Random(31)
    for k in range(4):
        a = k * 1.9 + rng.uniform(-0.3, 0.3)
        r = 0.08 + 0.12 * (k % 3) / 2
        sz = rng.uniform(0.09, 0.17)
        add_rock(vm, rock_shape(40 + k, (sz * 1.2, sz, sz * 0.7), sz * 0.25, 0.18, 1.8, planes=3), sd, tile, loc=(math.cos(a) * r, math.sin(a) * r, 0),
                 rot=rng.uniform(0, 6.28), moss=moss * 0.5, rnd=rng.random())


VARIANTS = {
    'veg_rock_a': lambda: rock('veg_rock_a', boulder, (4, 3, 2), 'Findling: gerundet, halb eingesunken, moosig', 'boulder'),
    'veg_rock_b': lambda: rock('veg_rock_b', angular, (4, 3, 2), 'kantiger Fels mit Bruchflaechen und Schichtung', 'rock'),
    'veg_rock_c': lambda: rock('veg_rock_c', slab, (4, 3, 2), 'flache Felsplatte, rissig, moosig', 'rock'),
    'veg_rock_d': lambda: rock('veg_rock_d', stones, (3, 2, 1), 'Lesesteine (vier Steine)', 'stones'),
}

if __name__ == '__main__':
    only = veg.only_filter()
    for k, f in VARIANTS.items():
        if only and k not in only:
            continue
        f()
    veg.manifest()
