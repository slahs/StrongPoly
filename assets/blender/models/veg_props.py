"""Requisiten der Referenzumgebung (Teilschritt 5): Holzzaun (Pfosten und Spaltstangen), Flechtzaun (Staken mit
geflochtenen Ruten), Gemuesebeet (Erdhuegel mit Brettern, Kohl und Lauch), liegender Baumstamm.

Zaunstuecke sind 1 Einheit lang entlang Blender +X (von -0,5 bis +0,5, Pfosten am Anfang) und werden im LookDev entlang
einer Linie aneinandergereiht (lookdev_scene.ts `propLine`). Holz: M_Timber_Oak (Maserung entlang U), Ruten/Staken mit
Rinde: M_Bark, Erde: M_Ground_Dirt, Pflanzen: M_Flora. AO per Cycles-Bake.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/veg_props.py [--only=...] [--no-bake] [--no-blend]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from sp import materials, veg  # noqa: E402
from sp.veg import VMesh, tube  # noqa: E402
from mathutils import Vector  # noqa: E402

import veg_ground as VG  # noqa: E402

OAK = 'M_Timber_Oak'
BARK = 'M_Bark'
DIRT = 'M_Ground_Dirt'
PLANK = 'M_Wood_Planks'


def D(ao=1.0, flex=0.0, rnd=0.5, a=0.0):
    return lambda p, t, ang: (ao, flex, rnd, a)


def wobble(rng, p0, p1, n, amp):
    pts = []
    for i in range(n + 1):
        t = i / n
        p = p0.lerp(p1, t)
        if 0 < i < n:
            p = p + Vector((rng.uniform(-amp, amp), rng.uniform(-amp, amp), rng.uniform(-amp, amp)))
        pts.append(p)
    return pts


def fence_rail(L):
    rng = random.Random(51)
    vm = VMesh()
    t_oak = materials.tile(OAK)
    sides = (6, 5, 4)[L]
    # Pfosten: leicht schief, oben schraeg abgearbeitet (Spitze)
    base = Vector((-0.5, rng.uniform(-0.01, 0.01), -0.05))
    top = base + Vector((rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), 0.68))
    tube(vm, [base, base.lerp(top, 0.5), top], [0.048, 0.046, 0.04], sides, OAK, t_oak, D(0.9, 0.0, 0.3), cap=True, swap_uv=True)
    if L == 2:
        for z in (0.24, 0.48):
            tube(vm, [Vector((-0.5, 0, z)), Vector((0.52, 0, z - 0.01))], [0.028, 0.026], 3, OAK, t_oak, D(1.0), cap=False, swap_uv=True)
        return vm
    for k, z in enumerate((0.24, 0.48)):
        p0 = Vector((-0.53, 0.03 * (1 if k else -1) + 0.02, z + rng.uniform(-0.02, 0.02)))
        p1 = Vector((0.53, 0.03 * (1 if k else -1) + 0.02, z + rng.uniform(-0.03, 0.01)))
        pts = wobble(rng, p0, p1, (5, 3)[L], 0.008)
        for i in range(1, len(pts) - 1):
            pts[i].z -= 0.018 * math.sin(math.pi * i / (len(pts) - 1))
        tube(vm, pts, [0.03, 0.028, 0.029, 0.027, 0.03, 0.028][:len(pts)], (5, 4)[L], OAK, t_oak, D(1.0, 0.0, rng.random()), cap=False, swap_uv=True)
    return vm


def fence_wattle(L):
    rng = random.Random(52)
    vm = VMesh()
    t_bark = materials.tile(BARK)
    stakes = [-0.5, -0.3, -0.1, 0.1, 0.3]
    for i, x in enumerate(stakes):
        if L == 2 and i % 2:
            continue
        b = Vector((x + rng.uniform(-0.01, 0.01), rng.uniform(-0.01, 0.01), -0.04))
        t = b + Vector((rng.uniform(-0.015, 0.015), rng.uniform(-0.015, 0.015), 0.6 + rng.uniform(-0.03, 0.04)))
        tube(vm, [b, t], [0.022, 0.019], (5, 4, 3)[L], BARK, t_bark, D(0.85, 0.0, rng.random(), 0.0), cap=True)
    if L == 2:
        # Geflecht als flache Tafel (zwei Roehren-Seiten = Vierkant)
        for z0 in (0.12, 0.32):
            tube(vm, [Vector((-0.5, 0, z0)), Vector((0.5, 0, z0))], [0.1, 0.1], 4, BARK, t_bark, D(0.9), cap=False)
        return vm
    rows = (9, 5)[L]
    for r in range(rows):
        z = 0.06 + r * (0.46 / (rows - 1))
        ph = 1 if r % 2 else -1
        pts = []
        xs = [-0.52] + [s for s in stakes] + [0.5]
        for j, x in enumerate(xs):
            y = 0.024 * ph * (1 if j % 2 else -1)
            pts.append(Vector((x, y, z + rng.uniform(-0.008, 0.008))))
            if L == 0 and j + 1 < len(xs):
                xm = (x + xs[j + 1]) / 2
                pts.append(Vector((xm, 0.0, z + rng.uniform(-0.006, 0.006))))
        tube(vm, pts, [0.011] * len(pts), (4, 3)[L], BARK, t_bark, D(0.8 + 0.2 * (r / rows), 0.0, rng.random(), 0.0), cap=False)
    return vm


def garden_bed(L):
    rng = random.Random(53)
    vm = VMesh()
    t_dirt = materials.tile(DIRT)
    t_pl = materials.tile(PLANK)
    W, Dp = 1.6, 0.8
    nx, ny = ((16, 8), (8, 4), (4, 2))[L]
    # Erdhuegel mit Furchen (zwei Reihen)
    ids = {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = -W / 2 + W * i / nx
            y = -Dp / 2 + Dp * j / ny
            v = abs(y) / (Dp / 2)
            h = 0.09 * (1 - v ** 3) + (0.018 * math.cos(y / (Dp / 2) * math.pi * 2) if L < 2 else 0) + rng.uniform(-0.006, 0.006)
            ids[(i, j)] = (vm.vert((x, y, h - 0.01)), Vector((x, y, h)))
    for j in range(ny):
        for i in range(nx):
            q = [ids[(i, j)], ids[(i + 1, j)], ids[(i + 1, j + 1)], ids[(i, j + 1)]]
            vm.face([a[0] for a in q], [(a[1].x / t_dirt, a[1].y / t_dirt) for a in q], [(0, 0, 1)] * 4, [(0.8, 0.9, 0.5, 0.0)] * 4, DIRT)
    # Bretter als Einfassung
    for (p0, p1) in (((-W / 2, -Dp / 2), (W / 2, -Dp / 2)), ((W / 2, -Dp / 2), (W / 2, Dp / 2)), ((W / 2, Dp / 2), (-W / 2, Dp / 2)), ((-W / 2, Dp / 2), (-W / 2, -Dp / 2))):
        a = Vector((p0[0], p0[1], 0.035))
        b = Vector((p1[0], p1[1], 0.035))
        tube(vm, [a, b], [0.045, 0.045], 4, PLANK, t_pl, D(0.85), cap=False, swap_uv=True)
    if L == 2:
        return vm
    # Kohl (Reihe 1) und Lauch (Reihe 2)
    for k in range(6):
        c = Vector((-0.62 + k * 0.25 + rng.uniform(-0.03, 0.03), -0.17 + rng.uniform(-0.03, 0.03), 0.08))
        if L == 0:
            nl = 8
            for li in range(nl):
                a = li * 2.39996 + rng.uniform(-0.2, 0.2)
                out = Vector((math.cos(a), math.sin(a), 0))
                side = Vector((-out.y, out.x, 0))
                ln = rng.uniform(0.09, 0.13)
                p1 = c + out * ln * 0.8 + Vector((0, 0, 0.05 + 0.03 * (li < 4)))
                ids2 = (vm.vert(c), vm.vert(c + out * ln * 0.45 + side * 0.04 + Vector((0, 0, 0.03))), vm.vert(p1), vm.vert(c + out * ln * 0.45 - side * 0.04 + Vector((0, 0, 0.03))))
                n = VG.soft_normal(out + Vector((0, 0, 0.6)), 0.3)
                d = (0.75, 0.25, rng.random(), 1.0)
                vm.face(ids2, (VG.pal(6, 0.2), VG.pal(6, 0.6), VG.pal(6, 0.95), VG.pal(6, 0.6)), (n,) * 4, (d,) * 4, VG.FLORA)
            VG.flower_head(vm, rng, c + Vector((0, 0, 0.06)), 1, 'ball', 0.05)
        else:
            VG.flower_head(vm, rng, c + Vector((0, 0, 0.05)), 5, 'ball', 0.08)
    if L == 0:
        for k in range(10):
            base = Vector((-0.66 + k * 0.145, 0.18 + rng.uniform(-0.02, 0.02), 0.08))
            for b in range(4):
                a = rng.uniform(0, 6.28)
                VG.blade(vm, rng, base, rng.uniform(0.12, 0.2), 0.012, Vector((math.cos(a), math.sin(a), 0)), rng.uniform(0.05, 0.25), 1, segs=1)
    return vm


def log(L):
    rng = random.Random(54)
    vm = VMesh()
    t_bark = materials.tile(BARK)
    n = (8, 4, 2)[L]
    pts = wobble(rng, Vector((-0.85, 0, 0.1)), Vector((0.85, 0.05, 0.085)), n, 0.01)
    radii = [0.13 - 0.025 * i / n for i in range(n + 1)]
    tube(vm, pts, radii, (10, 7, 5)[L], BARK, t_bark, lambda p, t, ang: (0.55 + 0.45 * max(0.0, math.sin(ang)) if L < 2 else 0.8, 0.0, 0.4, 0.0), cap=False)
    # Schnittflaechen (Hirnholz)
    t_oak = materials.tile(OAK)
    for end, r in ((pts[0], radii[0]), (pts[-1], radii[-1])):
        sides = (10, 7, 5)[L]
        c = vm.vert(end)
        ring = [vm.vert(end + Vector((0, math.cos(2 * math.pi * k / sides) * r, math.sin(2 * math.pi * k / sides) * r))) for k in range(sides)]
        for k in range(sides):
            j = (k + 1) % sides
            nx = -1 if end is pts[0] else 1
            vm.face((c, ring[k], ring[j]) if nx > 0 else (c, ring[j], ring[k]), ((0.5, 0.5), (0.5 + 0.3 * math.cos(k), 0.5 + 0.3 * math.sin(k)), (0.5 + 0.3 * math.cos(j), 0.5 + 0.3 * math.sin(j))),
                    ((nx, 0, 0),) * 3, ((0.9, 0, 0.2, 0.0),) * 3, OAK)
    if L < 2:
        for k in range(2):
            p = pts[2 + k * 3] if len(pts) > 5 else pts[1]
            d = Vector((rng.uniform(-0.3, 0.3), rng.choice((-1, 1)) * 0.6, 0.7)).normalized()
            tube(vm, [p, p + d * 0.22], [0.035, 0.02], 5, BARK, t_bark, D(0.9), cap=True)
    return vm


def export(asset_id, fn, desc, role, kind='prop'):
    return veg.export(asset_id, [fn(0), fn(1), fn(2)], kind, desc=desc, bake_ao=True, bake_distance=0.4, extras={'role': role})


VARIANTS = {
    'veg_fence_rail': lambda: export('veg_fence_rail', fence_rail, 'Holzzaun: Eichenpfosten mit zwei Spaltstangen (1 Einheit)', 'fence'),
    'veg_fence_wattle': lambda: export('veg_fence_wattle', fence_wattle, 'Flechtzaun: Staken mit geflochtenen Haselruten (1 Einheit)', 'fence'),
    'veg_garden_bed': lambda: export('veg_garden_bed', garden_bed, 'Gemuesebeet: Erdhuegel mit Brettern, Kohl und Lauch', 'garden'),
    'veg_log': lambda: export('veg_log', log, 'liegender Baumstamm mit Rinde und Schnittflaechen', 'log'),
}

if __name__ == '__main__':
    only = veg.only_filter()
    for k, f in VARIANTS.items():
        if only and k not in only:
            continue
        f()
    veg.manifest()
