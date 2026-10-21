"""Bodenvegetation der Referenzumgebung (Teilschritt 5): Grasbueschel (frisch / hoch mit Samenstaenden), Wiesenblumen
(zwei Mischungen), Farn, Hasel- und Weissdornbusch.

  - Gras, Blumen, Farn: echte Geometrie (Halme als verjuengte, gebogene Streifen, Blueten als kleine Faecher/Kelche,
    Farnwedel mit Fiederblaettchen) mit Farbpalette M_Flora (UV.u = Palettenspalte, UV.v = Basis -> Spitze) - kein
    Alpha-Test, also kein Overdraw-Problem bei dichtem Gras. Normalen zur Senkrechten geneigt (weich, keine dunklen
    Rueckseiten), Biegsamkeit fuer den Wind steigt zur Spitze.
  - Buesche: mehrere Triebe aus dem Boden (M_Bark) und Blattkarten (M_Foliage, Atlaszelle Strauch) mit Kronennormalen.
  - LOD1/LOD2: weniger Halme/Blueten bzw. vereinfachte Karten.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/veg_ground.py [--only=veg_grass_a,...] [--no-blend]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from sp import veg  # noqa: E402
from sp.veg import VMesh, card, clamp, lerp, smooth  # noqa: E402
from mathutils import Vector  # noqa: E402

import veg_trees as VT  # noqa: E402

FLORA = 'M_Flora'
NCOL = 16


def pal(col, v):
    """UV in der Palette: Spalte col (0..15), v 0 = Basis .. 1 = Spitze (mit etwas Abstand zum Rand)"""
    return ((col + 0.5) / NCOL, 0.03 + 0.94 * clamp(v))


def soft_normal(n, up=0.6):
    m = Vector(n).normalized() * (1 - up) + Vector((0, 0, 1)) * up
    return m.normalized()


def blade(vm, rng, base, height, width, lean_dir, lean, cols, segs=3, curl=0.0, ao0=0.5):
    """Halm: verjuengter Streifen, gebogen in lean_dir; cols = (Spalte); Rueckgabe Dreiecke"""
    side = Vector((-lean_dir.y, lean_dir.x, 0)).normalized()
    side = VT.rotate(side, Vector((0, 0, 1)), rng.uniform(-0.6, 0.6))
    pts = []
    for i in range(segs + 1):
        t = i / segs
        bend = lean * t * t
        p = base + Vector((0, 0, height * t * (1 - 0.25 * lean * t))) + lean_dir * bend * height + side * curl * t * t * height
        pts.append(p)
    rnd = rng.random()
    tri = 0
    col = cols
    prev = None
    for i in range(segs + 1):
        t = i / segs
        w = width * (1 - t) ** 0.9 if i < segs else 0.0
        p = pts[i]
        if i < segs:
            a = vm.vert(p - side * w / 2)
            b = vm.vert(p + side * w / 2)
            cur = (a, b, p, t)
        else:
            c = vm.vert(p)
            cur = (c, None, p, t)
        if prev is not None:
            pa, pb, pp, pt = prev
            ca, cb, cp, ct = cur
            tang = (cp - pp).normalized()
            fn = tang.cross(side).normalized()
            n0 = soft_normal(fn if fn.z >= 0 else -fn)

            def d(tt):
                return (ao0 + (1 - ao0) * smooth(0.0, 0.8, tt), clamp(tt ** 1.4), rnd, 1.0)
            if cb is not None:
                vm.face((pa, pb, cb, ca), (pal(col, pt), pal(col, pt), pal(col, ct), pal(col, ct)), (n0, n0, n0, n0), (d(pt), d(pt), d(ct), d(ct)), FLORA)
                tri += 2
            else:
                vm.face((pa, pb, ca), (pal(col, pt), pal(col, pt), pal(col, ct)), (n0, n0, n0), (d(pt), d(pt), d(ct)), FLORA)
                tri += 1
        prev = cur
    return tri


def tuft(vm, rng, n, h_rng, w_rng, cols, spread=0.07, segs=3, lean=(0.15, 0.5)):
    tri = 0
    for k in range(n):
        a = rng.uniform(0, 6.28)
        r = spread * math.sqrt(rng.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.01))
        out = Vector((math.cos(a), math.sin(a), 0)) if r > 1e-4 else Vector((1, 0, 0))
        out = VT.rotate(out, Vector((0, 0, 1)), rng.uniform(-0.5, 0.5))
        tri += blade(vm, rng, base, rng.uniform(*h_rng), rng.uniform(*w_rng), out, rng.uniform(*lean), rng.choice(cols), segs=segs,
                     curl=rng.uniform(-0.2, 0.2))
    return tri


def grass(asset_id, seed, tall=False):
    lods = []
    for L in range(3):
        rng = random.Random(seed)
        vm = VMesh()
        if not tall:
            n = (22, 12, 5)[L]
            tuft(vm, rng, n, (0.13, 0.27), (0.014, 0.022), [0, 1, 2, 0, 1, 5], spread=0.08, segs=(3, 1, 1)[L])
        else:
            n = (18, 10, 4)[L]
            tuft(vm, rng, n, (0.2, 0.4), (0.012, 0.018), [2, 3, 4, 1], spread=0.07, segs=(3, 1, 1)[L], lean=(0.2, 0.6))
            if L < 2:
                # Samenstaende: duenner Halm + aehrenfoermiger Kopf
                for k in range((4, 2)[L]):
                    a = rng.uniform(0, 6.28)
                    base = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, 0))
                    h = rng.uniform(0.38, 0.52)
                    out = Vector((math.cos(a), math.sin(a), 0))
                    blade(vm, rng, base, h, 0.006, out, rng.uniform(0.05, 0.2), 14, segs=2)
                    top = base + Vector((0, 0, h * 0.97)) + out * 0.02
                    blade(vm, rng, top - Vector((0, 0, 0.06)), 0.085, 0.022, out, 0.1, 13, segs=1)
        lods.append(vm)
    return veg.export(asset_id, lods, 'flora', desc='Grasbueschel' + (' (hoch, Samenstaende)' if tall else ''),
                      extras={'role': 'grassTall' if tall else 'grass'})


def flower_head(vm, rng, top, col, kind, size):
    """Bluete: 'disk' (Margerite: flacher Faecher), 'cup' (Hahnenfuss: kleiner Kelch), 'ball' (Klee: Kugelkopf)"""
    tri = 0
    rnd = rng.random()
    d = (1.0, 1.0, rnd, 1.0)
    if kind == 'disk':
        n = 7
        c = vm.vert(top + Vector((0, 0, 0.004)))
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(vm.vert(top + Vector((math.cos(a) * size, math.sin(a) * size, -0.004))))
        for i in range(n):
            j = (i + 1) % n
            vm.face((c, ring[i], ring[j]), (pal(8, 0.9), pal(col, 0.8), pal(col, 0.8)), ((0, 0, 1),) * 3, (d, d, d), FLORA)
            tri += 1
    elif kind == 'cup':
        n = 5
        c = vm.vert(top - Vector((0, 0, size * 0.4)))
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(vm.vert(top + Vector((math.cos(a) * size, math.sin(a) * size, size * 0.2))))
        for i in range(n):
            j = (i + 1) % n
            vm.face((c, ring[i], ring[j]), (pal(col, 0.4), pal(col, 0.9), pal(col, 0.9)), ((0, 0, 1),) * 3, (d, d, d), FLORA)
            tri += 1
    else:
        # Kugelkopf als Oktaeder
        pts = [Vector((size, 0, 0)), Vector((-size, 0, 0)), Vector((0, size, 0)), Vector((0, -size, 0)), Vector((0, 0, size * 1.2)), Vector((0, 0, -size * 0.8))]
        ids = [vm.vert(top + p) for p in pts]
        faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
        for f in faces:
            ns = [soft_normal(pts[i], 0.3) for i in f]
            vm.face([ids[i] for i in f], [pal(col, 0.85)] * 3, ns, (d, d, d), FLORA)
            tri += 1
    return tri


def flowers(asset_id, seed, mix):
    lods = []
    for L in range(3):
        rng = random.Random(seed)
        vm = VMesh()
        tuft(vm, rng, (7, 3, 2)[L], (0.08, 0.16), (0.012, 0.018), [0, 1, 6], spread=0.1, segs=(2, 1, 1)[L])
        n = (9, 5, 3)[L]
        for k in range(n):
            col, kind, size = rng.choice(mix)
            a = rng.uniform(0, 6.28)
            r = 0.12 * math.sqrt(rng.random())
            base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
            h = rng.uniform(0.14, 0.3)
            out = Vector((math.cos(a), math.sin(a), 0))
            lean = rng.uniform(0.0, 0.2)
            blade(vm, rng, base, h, 0.007, out, lean, 6, segs=(2, 1, 1)[L])
            top = base + Vector((0, 0, h * (1 - 0.25 * lean))) + out * lean * h
            flower_head(vm, rng, top, col, kind if L < 2 else 'cup', size * (1.0 if L == 0 else 1.25))
        lods.append(vm)
    return veg.export(asset_id, lods, 'flora', desc='Wiesenblumen', extras={'role': 'flowers'})


def fern(asset_id, seed):
    lods = []
    for L in range(3):
        rng = random.Random(seed)
        vm = VMesh()
        nf = (7, 6, 4)[L]
        for f in range(nf):
            a = 2 * math.pi * f / nf + rng.uniform(-0.25, 0.25)
            out = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-out.y, out.x, 0))
            length = rng.uniform(0.34, 0.5)
            rise = rng.uniform(0.55, 0.85)
            rnd = rng.random()
            # Spindel: Bogen nach aussen und unten
            npts = (7, 4, 4)[L]
            pts = []
            for i in range(npts):
                t = i / (npts - 1)
                pts.append(out * length * t + Vector((0, 0, length * rise * math.sin(t * math.pi * 0.62) - length * 0.25 * t * t)))
            if L == 2:
                # Wedel als ein Dreieck-Streifen
                b0 = vm.vert(pts[0] - side * 0.02)
                b1 = vm.vert(pts[0] + side * 0.02)
                tip = vm.vert(pts[-1])
                mid = pts[npts // 2]
                m0 = vm.vert(mid - side * 0.07)
                m1 = vm.vert(mid + side * 0.07)
                d0 = (0.6, 0.2, rnd, 1.0)
                d1 = (1.0, 0.9, rnd, 1.0)
                n = Vector((0, 0, 1))
                vm.face((b0, b1, m1, m0), (pal(15, 0.1), pal(15, 0.1), pal(15, 0.6), pal(15, 0.6)), (n,) * 4, (d0, d0, d1, d1), FLORA)
                vm.face((m0, m1, tip), (pal(15, 0.6), pal(15, 0.6), pal(15, 0.95)), (n,) * 3, (d1, d1, d1), FLORA)
                continue
            # Spindel als schmaler Streifen
            for i in range(npts - 1):
                p0, p1 = pts[i], pts[i + 1]
                w = 0.006
                ids = (vm.vert(p0 - side * w), vm.vert(p0 + side * w), vm.vert(p1 + side * w), vm.vert(p1 - side * w))
                t0, t1 = i / (npts - 1), (i + 1) / (npts - 1)
                n = soft_normal((p1 - p0).cross(side), 0.5)
                vm.face(ids, (pal(14, t0), pal(14, t0), pal(14, t1), pal(14, t1)), (n,) * 4,
                        ((0.6 + 0.4 * t0, t0 ** 1.3, rnd, 1.0),) * 2 + ((0.6 + 0.4 * t1, t1 ** 1.3, rnd, 1.0),) * 2, FLORA)
            # Fiederblaettchen beidseits
            npin = (11, 4)[L]
            for k in range(npin):
                t = 0.12 + 0.86 * k / npin
                i = min(npts - 2, int(t * (npts - 1)))
                f_ = t * (npts - 1) - i
                p = pts[i].lerp(pts[i + 1], f_)
                tang = (pts[i + 1] - pts[i]).normalized()
                plen = (0.11 * (1 - t) + 0.025) * (1.4 if L == 1 else 1.0)
                for s in (-1, 1):
                    dirp = (side * s * 0.85 + tang * 0.45 + Vector((0, 0, -0.1))).normalized()
                    q = p + dirp * plen
                    wv = tang.cross(dirp).normalized()
                    pw = plen * 0.28
                    ids = (vm.vert(p), vm.vert(p + dirp * plen * 0.45 + tang * pw * 0.5), vm.vert(q), vm.vert(p + dirp * plen * 0.45 - tang * pw * 0.5))
                    n = soft_normal(wv if wv.z >= 0 else -wv, 0.45)
                    dd = (0.55 + 0.45 * t, clamp(t ** 1.2 + 0.1), rnd, 1.0)
                    vm.face(ids, (pal(15, t), pal(15, t + 0.05), pal(15, min(1, t + 0.15)), pal(15, t + 0.05)), (n,) * 4, (dd,) * 4, FLORA)
        lods.append(vm)
    return veg.export(asset_id, lods, 'flora', desc='Farn (Wurmfarn), sieben Wedel', extras={'role': 'fern'})


# ---------------------------------------------------------------------------------------------------------------- Buesche

def bush(asset_id, seed, P, desc):
    rng = random.Random(seed)
    crown = VT.Crown((0, 0, P['cz']), P['R'])
    branches = []
    for s in range(P['stems']):
        a = 2 * math.pi * s / P['stems'] + rng.uniform(-0.3, 0.3)
        off = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.02, 0.08)
        d = Vector((math.cos(a) * P['fan'], math.sin(a) * P['fan'], 1)).normalized()
        L = crown.to_surface(off + Vector((0, 0, 0.05)), d) * rng.uniform(0.85, 1.0)
        pts, radii = VT.grow(rng, off, d, max(0.3, L), P['stem_r'], 0.006, 5, wiggle=0.12, droop_end=P.get('droop', 0.1))
        b = VT.Branch(pts, radii, 1, rng.random(), 0.1, 0.75)
        branches.append(b)
        for j in range(P['twigs']):
            t = rng.uniform(0.3, 0.92)
            p, dq, r = b.at(t)
            side = VT.rotate(VT.perp(dq), dq, rng.uniform(0, 6.28))
            d2 = (dq * 0.6 + side * 0.8 + Vector((0, 0, 0.1))).normalized()
            L2 = min(0.35, crown.to_surface(p, d2) * 1.05 + 0.05)
            if L2 < 0.06:
                continue
            pts2, radii2 = VT.grow(rng, p, d2, L2, max(0.004, r * 0.6), 0.003, 2, wiggle=0.2)
            tb = VT.Branch(pts2, radii2, 2, rng.random(), lerp(b.flex0, b.flex1, t), 0.95, parent=b, t_on_parent=t)
            branches.append(tb)
    anchors = []
    for b in branches:
        n = max(2, int(b.length() / P['leaf_step']))
        for i in range(n + 1):
            t = lerp(0.3 if b.level == 1 else 0.1, 1.0, i / n)
            p, d, r = b.at(t)
            if crown.norm_dist(p) < 0.3:
                continue
            anchors.append((p, d, b, t))
    Pl = dict(VT.OAK)
    Pl.update(dict(H=P['R'][2] * 2, leaf_size=P['leaf_size'], bend=0.12, leaf_follow=0.5, leaf_lift=0.12, inner_cut=0.3,
                   bark_levels=(2, 1, -1), sides=((0, 4, 3), (0, 3, 3), (0, 3, 3)), cluster=(0, 0.3, 0.5), cluster_scale=(1, 1.5, 2.0)))
    budget = veg.BUDGETS['bush']
    lods = []
    for L in range(3):
        vm = VMesh()
        rng2 = random.Random(seed * 3 + L)
        bark = 0
        if L < 2:
            bark = VT.build_bark(vm, branches, Pl, crown, L)
        VT.leaf_cards(vm, rng2, crown, anchors, Pl, L, 'shrub', budget[L] - bark - 8)
        lods.append(vm)
    return veg.export(asset_id, lods, 'bush', desc=desc, extras={'role': 'bush', 'height': P['R'][2] * 2})


VARIANTS = {
    'veg_grass_a': lambda: grass('veg_grass_a', 11),
    'veg_grass_b': lambda: grass('veg_grass_b', 12, tall=True),
    'veg_flowers_a': lambda: flowers('veg_flowers_a', 21, [(7, 'disk', 0.03), (7, 'disk', 0.026), (8, 'cup', 0.02), (8, 'cup', 0.018), (13, 'ball', 0.016)]),
    'veg_flowers_b': lambda: flowers('veg_flowers_b', 22, [(9, 'ball', 0.02), (10, 'ball', 0.018), (12, 'disk', 0.022), (7, 'disk', 0.024), (11, 'cup', 0.03)]),
    'veg_fern_a': lambda: fern('veg_fern_a', 31),
    'veg_bush_a': lambda: bush('veg_bush_a', 41, dict(stems=8, fan=0.45, cz=0.62, R=(0.62, 0.58, 0.6), stem_r=0.018, twigs=4, leaf_step=0.07, leaf_size=0.34),
                               'Haselstrauch: viele Triebe aus dem Boden, lockere Krone'),
    'veg_bush_b': lambda: bush('veg_bush_b', 42, dict(stems=5, fan=0.6, cz=0.45, R=(0.55, 0.52, 0.45), stem_r=0.022, twigs=6, leaf_step=0.055, leaf_size=0.3,
                                                       droop=0.15), 'Weissdorn: dicht, rundlich'),
}

if __name__ == '__main__':
    only = veg.only_filter()
    for k, f in VARIANTS.items():
        if only and k not in only:
            continue
        f()
    veg.manifest()
