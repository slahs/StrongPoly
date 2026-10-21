"""Baeume der Referenzumgebung (Teilschritt 5): Stieleiche, Haengebirke, Fichte - je drei Wuchs-/Groessenvarianten.

Aufbau je Baum (alles aus einem deterministischen Skelett, Seed je Variante):
  - Stamm mit Wurzelanlauf (Rippen am Fuss), Starkaeste, Seitenaeste als Roehren mit Rinde (M_Bark, UV im Weltmass)
  - Laubbaeume: Blattkarten (M_Foliage, Atlaszellen Eiche/Birke) an den aeusseren Zweigabschnitten, Kronenhuelle als
    Ellipsoid (Aeste wachsen bis zur Huelle), Normalen der Karten von der Kronenmitte nach aussen (weiche Kronen-
    beleuchtung statt flacher Karten), AO analytisch aus der Lage in der Krone (innen/unten dunkler)
  - Fichte: Quirle aus waagrechten, leicht haengenden Aesten mit aufgebogenen Spitzen; Nadelzweig-Karten
    (M_Foliage_Conifer) liegen auf den Aesten, dazu haengende Zweige ("Kammfichte"), Kegelkrone
  - LOD1: gleiches Skelett, nur Stamm + Starkaeste, Karten zu groesseren Buescheln zusammengefasst (Raster 0,4)
  - LOD2: Stamm + vereinfachte Krone aus wenigen grossen Karten (impostorartig, <= 300 Dreiecke)
Massstab: 1 Einheit = 1 Kachel (~1,85 m); Baeume RTS-typisch gestaucht wie die Gebaeude (Eiche ~3 Einheiten,
Huette 1,3 + Dach, Figur 0,95).

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/veg_trees.py [--only=veg_oak_a,...] [--no-blend] [--no-manifest]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import veg  # noqa: E402  (importiert bpy -> mathutils verfuegbar)
from mathutils import Vector  # noqa: E402
from sp.veg import VMesh, card, clamp, lerp, smooth, tube  # noqa: E402

BARK = 'M_Bark'
LEAF = 'M_Foliage'
NEEDLE = 'M_Foliage_Conifer'


def bark_tile():
    from sp import materials
    return materials.tile(BARK)


class Branch:
    def __init__(self, pts, radii, level, rnd, flex0=0.0, flex1=0.5, white=0.0, parent=None, t_on_parent=0.0):
        self.pts = pts
        self.radii = radii
        self.level = level
        self.rnd = rnd
        self.flex0 = flex0
        self.flex1 = flex1
        self.white = white
        self.parent = parent
        self.t = t_on_parent
        self.children = []

    def at(self, t):
        """Punkt, Richtung und Radius bei Anteil t der Laenge"""
        n = len(self.pts) - 1
        x = clamp(t) * n
        i = min(n - 1, int(x))
        f = x - i
        p = self.pts[i].lerp(self.pts[i + 1], f)
        d = (self.pts[i + 1] - self.pts[i]).normalized()
        r = lerp(self.radii[i], self.radii[i + 1], f)
        return p, d, r

    def length(self):
        return sum((self.pts[i + 1] - self.pts[i]).length for i in range(len(self.pts) - 1))


class Crown:
    """Kronenhuelle: Ellipsoid (Mitte c, Halbachsen R)"""

    def __init__(self, c, R):
        self.c = Vector(c)
        self.R = Vector(R)

    def norm_dist(self, p):
        q = p - self.c
        return math.sqrt((q.x / self.R.x) ** 2 + (q.y / self.R.y) ** 2 + (q.z / self.R.z) ** 2)

    def to_surface(self, p, d):
        """Abstand entlang d bis zur Huelle (p innen); 0 wenn ausserhalb"""
        q = p - self.c
        qx, qy, qz = q.x / self.R.x, q.y / self.R.y, q.z / self.R.z
        ex, ey, ez = d.x / self.R.x, d.y / self.R.y, d.z / self.R.z
        a = ex * ex + ey * ey + ez * ez
        b = 2 * (qx * ex + qy * ey + qz * ez)
        cc = qx * qx + qy * qy + qz * qz - 1
        disc = b * b - 4 * a * cc
        if disc < 0:
            return 0.0
        return max(0.0, (-b + math.sqrt(disc)) / (2 * a))

    def normal(self, p):
        q = p - self.c
        n = Vector((q.x / self.R.x ** 2, q.y / self.R.y ** 2, q.z / self.R.z ** 2))
        if n.length < 1e-6:
            return Vector((0, 0, 1))
        return n.normalized()


def rand_unit(rng):
    while True:
        v = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
        if 0.05 < v.length <= 1:
            return v.normalized()


def perp(d):
    ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    return d.cross(ref).normalized()


def rotate(v, axis, ang):
    """Rodrigues"""
    axis = axis.normalized()
    return v * math.cos(ang) + axis.cross(v) * math.sin(ang) + axis * axis.dot(v) * (1 - math.cos(ang))


def grow(rng, start, d, length, r0, r1, segs, wiggle=0.15, gravi=0.0, up_bias=0.0, crown=None, droop_end=0.0):
    """Polylinie: Startrichtung d, je Segment Zufallsknick (wiggle), Schwerkraft (gravi < 0 = haengt) und Auftrieb (up_bias)"""
    pts = [start.copy()]
    radii = [r0]
    seg = length / segs
    d = d.normalized()
    for i in range(1, segs + 1):
        t = i / segs
        d = d + rand_unit(rng) * wiggle + Vector((0, 0, gravi + up_bias - droop_end * t * t))
        d.normalize()
        pts.append(pts[-1] + d * seg)
        radii.append(lerp(r0, r1, t))
    return pts, radii


# ---------------------------------------------------------------------------------------------------------------- Laubbaum

def broadleaf(seed, P):
    """Skelett eines Laubbaums. P: Parameter (siehe SPECIES). Rueckgabe: (Aeste, Krone, Blattanker)"""
    rng = random.Random(seed)
    H = P['H']
    crown = Crown((P.get('cx', 0.0), P.get('cy', 0.0), P['cz']), P['R'])
    branches = []
    # Stamm bis zur Gabel (Eiche) bzw. bis fast zur Spitze (Birke)
    lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * P.get('lean', 0.05)
    trunks = P.get('stems', 1)
    trunk_list = []
    for s in range(trunks):
        off = Vector((0, 0, 0))
        dd = Vector((0, 0, 1)) + lean
        if trunks > 1:
            a = s * 2 * math.pi / trunks + rng.uniform(-0.3, 0.3)
            off = Vector((math.cos(a), math.sin(a), 0)) * 0.035
            dd = Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, 1)) + lean
        top = P['trunk_h'] * (1 - 0.12 * s)
        pts, radii = grow(rng, off, dd, top, P['trunk_r'] * (1 - 0.18 * s), P['trunk_r1'], P['trunk_segs'], wiggle=P.get('trunk_wiggle', 0.06), up_bias=0.0)
        tr = Branch(pts, radii, 0, rng.random(), 0.0, P.get('trunk_flex', 0.12), white=P.get('white', 0.0))
        branches.append(tr)
        trunk_list.append(tr)
    # Starkaeste
    for tr in trunk_list:
        n1 = P['limbs']
        golden = 2.39996
        roll0 = rng.uniform(0, 6.28)
        for k in range(n1):
            t = lerp(P['limb_t0'], P['limb_t1'], (k + rng.uniform(0.0, 0.8)) / n1)
            p, d, r = tr.at(t)
            ang = math.radians(lerp(P['limb_ang'][0], P['limb_ang'][1], rng.random()))
            # Ziel auf der Kronenhuelle: Rolle um den Stamm (goldener Winkel), Hoehe aus dem Neigungswinkel
            roll = roll0 + k * golden + rng.uniform(-0.3, 0.3)
            el = (math.pi / 2 - ang) * 0.9
            u = Vector((math.cos(roll) * math.cos(el), math.sin(roll) * math.cos(el), math.sin(el)))
            target = crown.c + Vector((u.x * crown.R.x, u.y * crown.R.y, u.z * crown.R.z))
            dirv = (target - p).normalized()
            L = (target - p).length * rng.uniform(*P['limb_reach'])
            if L < 0.15:
                continue
            segs = P['limb_segs']
            pts, radii = grow(rng, p, dirv, L, r * P['limb_r'], P['limb_r1'], segs, wiggle=P['limb_wiggle'], gravi=P.get('limb_gravi', 0.0),
                              droop_end=P.get('limb_droop', 0.0))
            lb = Branch(pts, radii, 1, rng.random(), tr.flex0 + (tr.flex1 - tr.flex0) * t, 0.6, white=P.get('white', 0.0) * 0.85, parent=tr, t_on_parent=t)
            tr.children.append(lb)
            branches.append(lb)
            # Seitenaeste
            n2 = P['twigs']
            for j in range(n2):
                tt = lerp(P['twig_t0'], 0.96, (j + rng.uniform(0, 0.9)) / n2)
                q, dq, rq = lb.at(tt)
                side = perp(dq)
                side = rotate(side, dq, rng.uniform(0, 6.28))
                a2 = math.radians(lerp(*P['twig_ang'], rng.random()))
                d2 = (dq * math.cos(a2) + side * math.sin(a2) + Vector((0, 0, P.get('twig_up', 0.15)))).normalized()
                L2 = min(P['twig_len'] * rng.uniform(0.7, 1.2), crown.to_surface(q, d2) * 1.05 + 0.08)
                if L2 < 0.08:
                    continue
                pts2, radii2 = grow(rng, q, d2, L2, max(0.006, rq * 0.7), 0.004, P['twig_segs'], wiggle=0.22, gravi=P.get('twig_gravi', 0.0),
                                    droop_end=P.get('twig_droop', 0.0))
                tb = Branch(pts2, radii2, 2, rng.random(), lb.flex0 + (lb.flex1 - lb.flex0) * tt, 0.95, white=P.get('white', 0.0) * 0.6, parent=lb, t_on_parent=tt)
                lb.children.append(tb)
                branches.append(tb)
    # obere Fortsetzung des Stamms bei Birken: Stamm ist bereits bis zur Spitze gewachsen
    # Blattanker: aeussere Abschnitte der Zweige und Starkaeste
    anchors = []
    for b in branches:
        if b.level == 0 and not P.get('leaf_on_trunk'):
            continue
        n = max(2, int(b.length() / P['leaf_step']))
        t0 = 0.25 if b.level == 2 else 0.55
        for i in range(n + 1):
            t = lerp(t0, 1.0, i / n)
            p, d, r = b.at(t)
            if crown.norm_dist(p) < P.get('inner_cut', 0.35):
                continue
            anchors.append((p, d, b, t))
    return branches, crown, anchors


def leaf_normal(crown, up_bias=0.25, k_face=0.3):
    def fn(p, face_n):
        cn = crown.normal(p)
        f = face_n if face_n.dot(cn) >= 0 else -face_n
        n = cn * (1 - k_face) + f * k_face + Vector((0, 0, up_bias))
        return n.normalized()
    return fn


def leaf_ao(crown, p):
    re = crown.norm_dist(p)
    zf = smooth(crown.c.z - crown.R.z, crown.c.z + crown.R.z * 0.6, p.z)
    return clamp((0.38 + 0.62 * smooth(0.25, 1.02, re)) * (0.72 + 0.28 * zf), 0.25, 1.0)


def bark_data(crown, H, white_fn=None):
    def make(b):
        def fn(p, t, ang):
            z = p.z
            ao = 0.5 + 0.5 * smooth(0.0, 0.45, z)
            if crown is not None:
                re = crown.norm_dist(p)
                ao *= 0.62 + 0.38 * smooth(0.2, 1.0, re) if z > crown.c.z - crown.R.z else 1.0
            flex = lerp(b.flex0, b.flex1, t)
            w = white_fn(b, p) if white_fn else b.white
            return (clamp(ao, 0.2, 1.0), flex, b.rnd, w)
        return fn
    return make


def build_bark(vm, branches, P, crown, lod, white_fn=None):
    tile = bark_tile()
    mk = bark_data(crown, P['H'], white_fn)
    tri = 0
    for b in branches:
        if b.level > P['bark_levels'][lod]:
            continue
        sides = P['sides'][lod][b.level]
        pts, radii = b.pts, b.radii
        if lod > 0 and len(pts) > 3:
            step = 2 if lod == 1 else max(2, len(pts) // 2)
            idx = list(range(0, len(pts), step))
            if idx[-1] != len(pts) - 1:
                idx.append(len(pts) - 1)
            pts = [pts[i] for i in idx]
            radii = [radii[i] for i in idx]
        if b.level == 0:
            tri += tube(vm, pts, radii, sides, BARK, tile, mk(b), cap=True, lobes=P.get('lobes', 0.25) if lod == 0 else 0.0,
                        lobe_seed=b.rnd * 6.0, flare_h=P.get('flare_h', 0.3), flare_k=P.get('flare_k', 0.6))
        else:
            tri += tube(vm, pts, radii, sides, BARK, tile, mk(b), cap=True)
    return tri


def leaf_cards(vm, rng, crown, anchors, P, lod, cell_name, budget_tris):
    """Karten an den Blattankern (LOD0) bzw. zusammengefasst (LOD1/LOD2)."""
    cell = veg.FOLIAGE_CELLS[cell_name]
    nfn = leaf_normal(crown, P.get('leaf_up', 0.25), 0.3 if lod == 0 else 0.15)
    tri = 0
    if lod == 0:
        pts = list(anchors)
        rng.shuffle(pts)
        per = 4 if P.get('bend', 0.12) > 0 else 2
        n = min(len(pts), budget_tris // per)
        pts = pts[:n]
        for (p, d, b, t) in pts:
            s = P['leaf_size'] * rng.uniform(0.8, 1.15)
            out = crown.normal(p)
            up = (d * P.get('leaf_follow', 0.6) + out * (1 - P.get('leaf_follow', 0.6)) + Vector((0, 0, P.get('leaf_lift', 0.1)))).normalized()
            if P.get('hang'):
                up = (up * 0.35 + Vector((0, 0, -1)) * 0.65 + out * 0.25).normalized()
            side = rotate(perp(up), up, rng.uniform(0, 6.28))
            c = cell if rng.random() < 0.5 else (cell[2], cell[1], cell[0], cell[3])
            rnd = rng.random()
            base = p - up * s * 0.08

            def data(q, uv, _rnd=rnd, _b=b):
                tip = abs(uv[1] - c[1]) / max(1e-6, abs(c[3] - c[1]))
                return (leaf_ao(crown, q) * (0.88 + 0.12 * tip), clamp(lerp(_b.flex0, _b.flex1, 0.8) + 0.12 * tip), _rnd, 1.0)
            tri += card(vm, base, up, side, s, s, c, LEAF, nfn, data, bend=P.get('bend', 0.12))
        return tri
    # LOD1/LOD2: Raster-Buendelung der Anker
    g = P['cluster'][lod]
    cells = {}
    for (p, d, b, t) in anchors:
        key = (math.floor(p.x / g), math.floor(p.y / g), math.floor(p.z / g))
        cells.setdefault(key, []).append((p, d, b, t))
    keys = sorted(cells.keys())
    rng.shuffle(keys)
    for key in keys:
        if tri + 2 > budget_tris:
            break
        grp = cells[key]
        p = sum((a[0] for a in grp), Vector((0, 0, 0))) / len(grp)
        d = sum((a[1] for a in grp), Vector((0, 0, 0)))
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
        b = grp[0][2]
        out = crown.normal(p)
        s = P['leaf_size'] * P['cluster_scale'][lod] * rng.uniform(0.9, 1.1)
        if lod == 2:
            # Huellenkarte: liegt tangential auf der Kronenhuelle (gross, dicht), Basis etwas innen
            up = (out.cross(Vector((0, 0, 1))).cross(out)).normalized() if abs(out.z) < 0.95 else Vector((1, 0, 0))
            up = rotate(up, out, rng.uniform(-0.6, 0.6))
            side = out.cross(up).normalized()
            base = p + out * 0.05 - up * s * 0.5
            if P.get('hang'):
                up = -up
                base = p + out * 0.05 - up * s * 0.5
        else:
            up = (d * 0.5 + out * 0.5 + Vector((0, 0, 0.1))).normalized()
            if P.get('hang'):
                up = (up * 0.35 + Vector((0, 0, -1)) * 0.65 + out * 0.25).normalized()
            side = rotate(perp(up), up, rng.uniform(0, 6.28))
            base = p - up * s * 0.15
        c = cell if rng.random() < 0.5 else (cell[2], cell[1], cell[0], cell[3])
        rnd = rng.random()
        data = (lambda q, uv, _rnd=rnd, _b=b: (leaf_ao(crown, q), clamp(lerp(_b.flex0, _b.flex1, 0.8)), _rnd, 1.0))
        tri += card(vm, base, up, side, s, s, c, LEAF, nfn, data, bend=0.0)
    return tri


def build_broadleaf(asset_id, seed, P, cell_name, desc, white_fn=None):
    branches, crown, anchors = broadleaf(seed, P)
    lods = []
    budget = veg.BUDGETS['tree']
    for L in range(3):
        vm = VMesh()
        rng = random.Random(seed * 7 + L)
        bark = build_bark(vm, branches, P, crown, L, white_fn)
        leaf_budget = budget[L] - bark - (40 if L == 0 else 10)
        leaf_cards(vm, rng, crown, anchors, P, L, cell_name, leaf_budget)
        lods.append(vm)
    return veg.export(asset_id, lods, 'tree', desc=desc, extras={'species': P['species'], 'role': P.get('role', 'mature'), 'height': P['H'], 'crown': [round(crown.R.x, 2), round(crown.R.z, 2)]})


# ---------------------------------------------------------------------------------------------------------------- Fichte

def spruce(asset_id, seed, P, desc):
    rng = random.Random(seed)
    H = P['H']
    tile = bark_tile()
    lean = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * 0.02
    tpts, tradii = grow(rng, Vector((0, 0, 0)), Vector((0, 0, 1)) + lean, H, P['trunk_r'], 0.006, 14, wiggle=0.015)
    trunk = Branch(tpts, tradii, 0, rng.random(), 0.0, 0.35)
    branches = []
    z = P['z0']
    golden = 2.39996
    roll = rng.uniform(0, 6.28)
    whorl = 0
    while z < H - 0.12:
        tz = z / H
        n = P['per_whorl'] if tz < 0.8 else max(3, P['per_whorl'] - 2)
        Rz = P['base_r'] * (1 - (z - P['z0']) / (H - P['z0'])) ** 0.92 + 0.07
        for k in range(n):
            a = roll + k * 2 * math.pi / n + rng.uniform(-0.25, 0.25)
            hd = Vector((math.cos(a), math.sin(a), 0))
            down = rng.uniform(*P['droop'])
            d0 = (hd + Vector((0, 0, -down))).normalized()
            L = Rz * rng.uniform(0.82, 1.08)
            p0, _, _ = trunk.at(tz)
            pts, radii = grow(rng, p0, d0, L, P['branch_r'] * (0.5 + 0.5 * (1 - tz)), 0.004, 4, wiggle=0.06, up_bias=0.0)
            # aufgebogene Spitze
            for i in range(2, len(pts)):
                pts[i] = pts[i] + Vector((0, 0, P['tip_up'] * L * ((i - 1) / (len(pts) - 1)) ** 2))
            b = Branch(pts, radii, 1, rng.random(), 0.05 + 0.25 * tz, 0.85, parent=trunk, t_on_parent=tz)
            b.whorl = whorl
            branches.append(b)
        roll += golden
        z += rng.uniform(*P['dz'])
        whorl += 1
    allb = [trunk] + branches

    def cone_normal(p):
        r = math.hypot(p.x, p.y)
        rad = Vector((p.x, p.y, 0)).normalized() if r > 1e-4 else Vector((1, 0, 0))
        n = rad * 0.85 + Vector((0, 0, 0.55))
        return n.normalized()

    def needle_ao(p):
        r = math.hypot(p.x, p.y)
        Rz = P['base_r'] * max(0.0, 1 - (p.z - P['z0']) / (H - P['z0'])) ** 0.92 + 0.07
        rr = r / max(0.05, Rz)
        return clamp((0.35 + 0.65 * smooth(0.1, 1.0, rr)) * (0.7 + 0.3 * smooth(0.0, H, p.z)), 0.25, 1.0)

    def nfn_k(k_face):
        def fn(p, face_n):
            cn = cone_normal(p)
            f = face_n if face_n.dot(cn) >= 0 else -face_n
            return (cn * (1 - k_face) + f * k_face).normalized()
        return fn

    def bark_fn(b):
        def fn(p, t, ang):
            ao = (0.45 + 0.55 * smooth(0.0, 0.5, p.z)) * (0.6 + 0.4 * smooth(0.0, 1.0, t)) if b.level else 0.4 + 0.5 * smooth(0.0, 0.5, p.z)
            return (clamp(ao, 0.2, 1.0), lerp(b.flex0, b.flex1, t), b.rnd, 0.0)
        return fn

    budget = veg.BUDGETS['tree']
    lods = []
    for L in range(3):
        rng2 = random.Random(seed * 11 + L)
        vm = VMesh()
        tri = 0
        # Stamm: endet knapp über dem obersten Quirl (kein kahler Leittrieb), darüber Wipfelkarten
        zlast = max(b.pts[0].z for b in branches)
        tp = [q for q in trunk.pts if q.z <= zlast + 0.08]
        tr = trunk.radii[:len(tp)]
        if L:
            idx = list(range(0, len(tp), 3 if L == 1 else 7)) + [len(tp) - 1]
            tp = [tp[i] for i in sorted(set(idx))]
            tr = [tr[i] for i in sorted(set(idx))]
        tri += tube(vm, tp, tr, (8, 6, 4)[L], BARK, tile, bark_fn(trunk), lobes=0.18 if L == 0 else 0.0, lobe_seed=trunk.rnd * 6,
                    flare_h=0.22, flare_k=0.5)
        if L == 0:
            for b in branches:
                tri += tube(vm, b.pts[::2] if len(b.pts) > 3 else b.pts, b.radii[::2] if len(b.pts) > 3 else b.radii, 3, BARK, tile, bark_fn(b))
        cell = veg.CONIFER_CELL
        # Wipfel: zwei gekreuzte, aufrechte Nadelkarten vom obersten Quirl bis zur Spitze
        for k in range(2):
            sd = Vector((1, 0, 0)) if k == 0 else Vector((0, 1, 0))
            hh = H - zlast + 0.12
            data = (lambda q, uv: (needle_ao(q), 0.9, 0.5, 0.6))
            tri += card(vm, Vector((0, 0, zlast - 0.1)), Vector((0, 0, 1)), sd, clamp(hh * 0.75, 0.22, 0.42), hh + 0.06, cell, NEEDLE, nfn_k(0.2), data,
                        bend=0.1 if L == 0 else 0.0)
        left = budget[L] - tri - 10
        if L == 0:
            cards = []
            for b in branches:
                Lb = b.length()
                ncard = 4 if Lb > 0.4 else 3 if Lb > 0.25 else 2
                for i in range(ncard):
                    t = lerp(0.12, 0.62, i / max(1, ncard - 1))
                    cards.append(('lay', b, t, Lb))
                for i in range(P['hang_cards'] if Lb > 0.3 else 1):
                    cards.append(('hang', b, rng2.uniform(0.3, 0.85), Lb))
            rng2.shuffle(cards)
            cards = cards[:left // 4 - 6]
            for k in range(6):
                cards.append(('top', trunk, 0.86 + 0.13 * k / 5, 0.0))
            for kind, b, t, Lb in cards:
                p, d, r = b.at(t)
                if kind == 'top':
                    # Wipfel: schräg nach oben stehende Zweige rund um den Leittrieb
                    a = rng2.uniform(0, 6.28)
                    out = Vector((math.cos(a), math.sin(a), 0))
                    up = (Vector((0, 0, 1)) * 0.75 + out * 0.5).normalized()
                    side = Vector((0, 0, 1)).cross(out).normalized()
                    s_len = 0.22 * (1.15 - (t - 0.86) * 2.5)
                    s_w = s_len * 0.8
                    base = p - Vector((0, 0, 0.03))
                elif kind == 'lay':
                    s_len = max(0.22, Lb * (1.0 - t) * 0.95 + 0.08)
                    s_w = clamp(s_len * 0.75, 0.18, 0.42)
                    up = (d + Vector((0, 0, 0.05))).normalized()
                    side = Vector((0, 0, 1)).cross(up).normalized()
                    side = rotate(side, up, rng2.uniform(-0.45, 0.45))
                    base = p
                else:
                    s_len = clamp(Lb * 0.45, 0.16, 0.34)
                    s_w = s_len * 0.8
                    out = Vector((d.x, d.y, 0)).normalized() if abs(d.z) < 0.99 else Vector((1, 0, 0))
                    up = (Vector((0, 0, -1)) * 0.8 + out * 0.45).normalized()
                    side = out.cross(Vector((0, 0, 1))).normalized()
                    side = rotate(side, up, rng2.uniform(-0.5, 0.5))
                    base = p + Vector((0, 0, -0.01))
                rnd = rng2.random()
                c = cell if rng2.random() < 0.5 else (cell[2], cell[1], cell[0], cell[3])

                def data(q, uv, _rnd=rnd, _b=b, _t=t):
                    tip = abs(uv[1] - c[1])
                    return (needle_ao(q), clamp(lerp(_b.flex0, _b.flex1, _t) + 0.15 * tip), _rnd, 0.6)
                tri += card(vm, base, up, side, s_w, s_len, c, NEEDLE, nfn_k(0.35), data, bend=0.1)
        else:
            # LOD1: je Ast eine grosse liegende Karte (+ Haengekarten an grossen Aesten); LOD2: je Quirl Kreuzkarten
            if L == 1:
                items = []
                for b in branches:
                    items.append(('lay', b))
                for b in branches:
                    if b.length() > 0.4:
                        items.append(('hang', b))
                for kind, b in items:
                    if tri + 2 > budget[1] - 4:
                        break
                    Lb = b.length()
                    p, d, r = b.at(0.05)
                    rnd = rng2.random()
                    if kind == 'lay':
                        up = (b.pts[-1] - b.pts[0]).normalized()
                        side = Vector((0, 0, 1)).cross(up).normalized()
                        s_len = Lb * 1.08 + 0.06
                        s_w = clamp(Lb * 0.95, 0.22, 0.6)
                        base = p
                    else:
                        p, d, r = b.at(0.5)
                        out = Vector((d.x, d.y, 0)).normalized()
                        up = (Vector((0, 0, -1)) * 0.8 + out * 0.45).normalized()
                        side = out.cross(Vector((0, 0, 1))).normalized()
                        s_len = clamp(Lb * 0.55, 0.2, 0.45)
                        s_w = s_len * 1.1
                        base = p
                    data = (lambda q, uv, _rnd=rnd, _b=b: (needle_ao(q), clamp(lerp(_b.flex0, _b.flex1, 0.6)), _rnd, 0.6))
                    tri += card(vm, base, up, side, s_w, s_len, cell, NEEDLE, nfn_k(0.2), data)
            else:
                whorls = {}
                for b in branches:
                    whorls.setdefault(b.whorl, []).append(b)
                keys = sorted(whorls)
                step = max(1, math.ceil(len(keys) * 4 * 2 / max(8, left)))
                for wi in keys[::step]:
                    bs = whorls[wi]
                    zc = sum(b.pts[0].z for b in bs) / len(bs)
                    Rz = max(b.length() for b in bs) * 1.05 + 0.05
                    base_rot = rng2.uniform(0, math.pi)
                    for k in range(3):
                        if tri + 2 > budget[2] - 2:
                            break
                        a = base_rot + k * math.pi / 3
                        up = Vector((math.cos(a), math.sin(a), -0.12)).normalized()
                        side = Vector((-math.sin(a), math.cos(a), 0))
                        base = Vector((0, 0, zc + 0.03)) - up * Rz
                        rnd = rng2.random()
                        data = (lambda q, uv, _rnd=rnd: (needle_ao(q), 0.6, _rnd, 0.6))
                        # Karte quer durch den Stamm: von -Rz bis +Rz, Breite ~ Quirlabstand * 2,5
                        tri += card(vm, base, up, side, clamp(Rz * 0.9, 0.25, 0.7), Rz * 2, cell, NEEDLE, nfn_k(0.0), data)
        lods.append(vm)
    return veg.export(asset_id, lods, 'tree', desc=desc, extras={'species': 'spruce', 'role': P.get('role', 'mature'), 'height': H, 'crown': [P['base_r'], H / 2]})


# ---------------------------------------------------------------------------------------------------------------- Arten

OAK = dict(
    species='oak', trunk_r=0.12, trunk_r1=0.08, trunk_segs=6, trunk_wiggle=0.07, lean=0.06, flare_h=0.32, flare_k=0.65, lobes=0.28,
    limbs=6, limb_t0=0.62, limb_t1=1.0, limb_ang=(32, 72), limb_reach=(0.72, 0.9), limb_r=0.62, limb_r1=0.018, limb_segs=6,
    limb_wiggle=0.22, limb_gravi=-0.02, limb_droop=0.1,
    twigs=9, twig_t0=0.25, twig_ang=(35, 70), twig_len=0.6, twig_segs=3, twig_up=0.12, twig_gravi=-0.03,
    leaf_step=0.045, leaf_size=0.5, bend=0.12, leaf_follow=0.55, leaf_lift=0.12, inner_cut=0.42,
    bark_levels=(2, 1, 0), sides=((10, 6, 3), (6, 4, 3), (5, 3, 3)), cluster=(0, 0.2, 0.4), cluster_scale=(1, 1.3, 1.75),
)
BIRCH = dict(
    species='birch', trunk_r=0.06, trunk_r1=0.012, trunk_segs=10, trunk_wiggle=0.035, lean=0.05, flare_h=0.2, flare_k=0.35, lobes=0.12,
    limbs=16, limb_t0=0.32, limb_t1=0.96, limb_ang=(28, 55), limb_reach=(0.75, 0.95), limb_r=0.45, limb_r1=0.008, limb_segs=5,
    limb_wiggle=0.14, limb_gravi=0.0, limb_droop=0.45,
    twigs=4, twig_t0=0.35, twig_ang=(40, 80), twig_len=0.42, twig_segs=3, twig_up=-0.35, twig_gravi=-0.1, twig_droop=0.6,
    leaf_step=0.07, leaf_size=0.4, bend=0.08, leaf_follow=0.7, leaf_lift=0.0, hang=True, inner_cut=0.3, leaf_up=0.2,
    bark_levels=(2, 1, 0), sides=((8, 5, 3), (6, 3, 3), (5, 3, 3)), cluster=(0, 0.19, 0.36), cluster_scale=(1, 1.3, 1.8),
)


def birch_white(b, p):
    if b.level == 0:
        # Birke: unten schwarzgraue Borke, darueber weiss
        return smooth(0.12, 0.45, p.z)
    return 0.85 if b.level == 1 else 0.45


def oak(asset_id, seed, H, R, cz, extra, desc):
    P = dict(OAK, H=H, R=R, cz=cz, trunk_h=extra.pop('trunk_h'), **extra)
    return build_broadleaf(asset_id, seed, P, 'oak', desc)


def birch(asset_id, seed, H, R, cz, extra, desc):
    P = dict(BIRCH, H=H, R=R, cz=cz, trunk_h=H * 0.94, white=1.0, **extra)
    return build_broadleaf(asset_id, seed, P, 'birch', desc, white_fn=birch_white)


VARIANTS = {
    'veg_oak_a': lambda: oak('veg_oak_a', 101, 3.0, (1.3, 1.22, 0.92), 2.05, dict(trunk_h=1.05), 'Stieleiche, ausgewachsen, breite Krone'),
    'veg_oak_b': lambda: oak('veg_oak_b', 202, 3.3, (1.05, 1.12, 1.08), 2.2, dict(trunk_h=1.2, cx=0.18, cy=-0.1, limbs=5, lean=0.1),
                             'Stieleiche, hoeher, unregelmaessige Krone, leicht schief'),
    'veg_oak_c': lambda: oak('veg_oak_c', 303, 2.15, (0.78, 0.76, 0.66), 1.45, dict(trunk_h=0.72, trunk_r=0.07, trunk_r1=0.05, limbs=5, twigs=5,
                                                                                    leaf_size=0.42, twig_len=0.42, role='young'), 'junge Eiche'),
    'veg_birch_a': lambda: birch('veg_birch_a', 404, 3.3, (0.68, 0.62, 1.2), 2.15, {}, 'Haengebirke, einstaemmig'),
    'veg_birch_b': lambda: birch('veg_birch_b', 505, 2.8, (0.58, 0.55, 1.0), 1.85, dict(lean=0.12, limbs=13, role='young'), 'Haengebirke, kleiner, schief'),
    'veg_birch_c': lambda: birch('veg_birch_c', 606, 3.05, (0.82, 0.74, 1.1), 2.0, dict(stems=2, limbs=10, trunk_r=0.05), 'Haengebirke, zweistaemmig'),
    'veg_spruce_a': lambda: spruce('veg_spruce_a', 707, dict(H=3.9, trunk_r=0.085, z0=0.42, base_r=0.95, per_whorl=7, droop=(0.1, 0.3), tip_up=0.18,
                                                             branch_r=0.022, dz=(0.14, 0.18), hang_cards=2), 'Fichte, ausgewachsen'),
    'veg_spruce_b': lambda: spruce('veg_spruce_b', 808, dict(H=3.3, trunk_r=0.075, z0=0.3, base_r=0.88, per_whorl=7, droop=(0.15, 0.35), tip_up=0.22,
                                                             branch_r=0.02, dz=(0.12, 0.16), hang_cards=2), 'Fichte, mittel, dicht'),
    'veg_spruce_c': lambda: spruce('veg_spruce_c', 909, dict(H=2.1, trunk_r=0.05, z0=0.15, base_r=0.64, per_whorl=6, droop=(0.05, 0.2), tip_up=0.25,
                                                             branch_r=0.014, dz=(0.11, 0.14), hang_cards=1, role='young'), 'junge Fichte'),
}


if __name__ == '__main__':
    only = veg.only_filter()
    for k, f in VARIANTS.items():
        if only and k not in only:
            continue
        f()
    veg.manifest()
