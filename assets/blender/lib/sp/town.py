"""Bausteine fuer Stadt-/Dorfgebaeude (Fachwerkhaus, Baeckerei, Schmiede): gefaste Hoelzer mit Maserungs-UVs,
Fachwerkwaende (Schwelle, Staender, Riegel, Streben, Rahm, Holznaegel) mit Putzfeldern und Oeffnungen, Bruchsteinsockel,
Dachflaechen als Hoehenfeld (Stroh/Reet mit Lagen, Kruppelwalm), Schindel-/Ziegellagen, Kleinteile (Fass, Holzstapel,
Saecke, Bank, Werkzeug). Alles in Blender-Koordinaten (Z oben, Vorderseite -Y), Masse in Spiel-Einheiten.

Unregelmaessigkeit ist Absicht: jedes Holz bekommt aus einem Zufallsgenerator leichte Schiefstellung, Durchhang und
Querschnittsschwankung; Putzfelder sind fein unterteilt, damit AO/Schmutz der Datenfarbe Flecken und Verlauf zeigen.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector
from mathutils import noise

from . import materials, mesh, uv

UV = uv.UV_NAME

# Bibliotheksmaterialien, deren Maserung entlang V laeuft (Bretter senkrecht, U quer) - alle anderen Hoelzer/Eisen: U
GRAIN_V = {'M_Wood_Planks'}


def mark_world(obj, grain_u=True):
    """UVs des Objekts sind in Weltmass (1 UV = 1 Einheit) mit Maserung entlang U; town.add skaliert sie auf die
    Kachelgroesse des zugewiesenen Materials (und dreht sie fuer GRAIN_V-Materialien)."""
    obj['sp_uv_world'] = 1
    obj['sp_uv_len'] = 1 if grain_u else 0
    return obj


def uv_world_box(obj, along=None, space='object'):
    """Box-Projektion im Weltmass (along = Maserungsachse auf U), Skalierung spaeter in town.add"""
    uv.box(obj, tile=1.0, space=space, along=along)
    return mark_world(obj, grain_u=along is not None)


def add(A, obj, **kw):
    """A.add mit Material-gerechten Weltmass-UVs: Objekte mit sp_uv_world werden nach der Materialzuweisung durch die
    Kachelgroesse `tile` des Materials (assets/materials.json) geteilt; fuer GRAIN_V-Materialien werden U und V getauscht,
    damit die Maserung der Bibliothekstextur der Laengsrichtung folgt. Aendert sich `tile`, genuegt ein Neuexport."""
    if kw.get('uv_mode', 'box') is not None:
        for k in ('sp_uv_world', 'sp_uv_len'):
            if k in obj:
                del obj[k]
    A.add(obj, **kw)
    if obj.get('sp_uv_world') and obj.data.materials and obj.data.materials[0] is not None:
        name = obj.data.materials[0].name
        t = materials.tile(name)
        swap = bool(obj.get('sp_uv_len')) and name in GRAIN_V
        uvl = obj.data.uv_layers.get(UV)
        if uvl is not None:
            co = [0.0] * (len(uvl.data) * 2)
            uvl.data.foreach_get('uv', co)
            for i in range(0, len(co), 2):
                u, v = co[i], co[i + 1]
                if swap:
                    u, v = v, -u
                co[i], co[i + 1] = u / t, v / t
            uvl.data.foreach_set('uv', co)
        for k in ('sp_uv_world', 'sp_uv_len'):
            del obj[k]
    return obj


# ---------------------------------------------------------------------------------------------------------------- Hoelzer

def _frame_axes(p0, p1, up):
    a, b = Vector(p0), Vector(p1)
    d = b - a
    L = max(1e-6, d.length)
    x = d / L
    u = Vector(up)
    if abs(x.dot(u)) > 0.98:
        u = Vector((0, 1, 0)) if abs(x.y) < 0.9 else Vector((1, 0, 0))
    y = u.cross(x).normalized()
    z = x.cross(y).normalized()
    return a, L, x, y, z


def timber(name, p0, p1, w, h=None, ch=0.012, up=(0, 0, 1), segs=1, bend=0.0, wob=0.0, rnd=None, tile=1.0, taper=0.0,
           caps=True, outer_only=False):
    """Gefastes Holz von p0 nach p1, Querschnitt w (quer, lokale Y) x h (lokale Z), Fase ch auf den vier Laengskanten
    (Achteck-Querschnitt). segs > 1: Zwischenringe fuer Durchhang `bend` (Mitte sinkt entlang -Z) und Verzug `wob`
    (zufaellig quer). UVs: U entlang der Maserung (Laenge / tile), V um den Umfang; Stirnflaechen planar (Hirnholz)."""
    rnd = rnd or random.Random(hash(name) & 0xffff)
    h = h if h is not None else w
    a, L, x, y, z = _frame_axes(p0, p1, up)
    c = min(ch, w * 0.3, h * 0.3)
    if c <= 1e-4:
        prof = [(w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2)]
    elif outer_only:  # nur die beiden Kanten der Aussenseite (+Y) gefast: Wandhoelzer, Innenseite verdeckt
        prof = [(w / 2, -h / 2 + c), (w / 2, h / 2 - c), (w / 2 - c, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2), (w / 2 - c, -h / 2)]
    else:
        prof = [(w / 2, -h / 2 + c), (w / 2, h / 2 - c), (w / 2 - c, h / 2), (-w / 2 + c, h / 2),
                (-w / 2, h / 2 - c), (-w / 2, -h / 2 + c), (-w / 2 + c, -h / 2), (w / 2 - c, -h / 2)]
    n = len(prof)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new(UV)
    rings = []
    wob_y = rnd.uniform(-1, 1) * wob
    wob_z = rnd.uniform(-1, 1) * wob * 0.5
    ws = 1.0 + rnd.uniform(-0.06, 0.06)
    for k in range(segs + 1):
        t = k / segs
        s = math.sin(math.pi * t)
        sc = ws * (1.0 - taper * t)
        off = y * (wob_y * s) + z * (wob_z * s - bend * s)
        ring = []
        for (py, pz) in prof:
            co = a + x * (t * L) + y * (py * sc) + z * (pz * sc) + off
            ring.append(bm.verts.new(co))
        rings.append(ring)
    # Umfang fuer V
    per = [0.0]
    for i in range(n):
        p, q = prof[i], prof[(i + 1) % n]
        per.append(per[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    ou, ov = rnd.random(), rnd.random()
    for k in range(segs):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            u0, u1 = k / segs * L / tile + ou, (k + 1) / segs * L / tile + ou
            v0, v1 = per[i] / tile + ov, per[i + 1] / tile + ov
            for lp, (uu, vv) in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                lp[uvl].uv = (uu, vv)
    if caps:
        for k, rev in ((0, True), (segs, False)):
            vs = list(reversed(rings[k])) if rev else rings[k]
            pr = list(reversed(prof)) if rev else prof
            f = bm.faces.new(vs)
            for lp, (py, pz) in zip(f.loops, pr):
                lp[uvl].uv = (py / tile * 2 + ou, pz / tile * 2 + ov)
    bm.normal_update()
    return mark_world(mesh.obj_from_bm(name, bm))


def peg(name, loc, normal, size=0.02, depth=0.007, rot=0.0):
    """Holznagel/Zapfenkopf: kleiner Stumpf (5 Flaechen, 10 Dreiecke), der aus der Holzoberflaeche ragt
    (normal = Blickrichtung der Wand)."""
    nrm = Vector(normal).normalized()
    up = Vector((0, 0, 1)) if abs(nrm.z) < 0.9 else Vector((0, 1, 0))
    t1 = up.cross(nrm).normalized()
    t2 = nrm.cross(t1).normalized()
    if rot:
        t1, t2 = t1 * math.cos(rot) + t2 * math.sin(rot), t2 * math.cos(rot) - t1 * math.sin(rot)
    c = Vector(loc)
    h = size / 2
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new(UV)
    base = [bm.verts.new(c - nrm * 0.004 + t1 * sx * h + t2 * sy * h) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    top = [bm.verts.new(c + nrm * depth + (t1 * sx * h + t2 * sy * h) * 0.8) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((base[i], base[j], top[j], top[i]))
    bm.faces.new(top)
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (lp.vert.co.x * 3.1 + lp.vert.co.z, lp.vert.co.y * 3.1 + lp.vert.co.z * 0.7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mark_world(mesh.obj_from_bm(name, bm))


def box_uv(name, size, loc, rot=(0, 0, 0), bevel=0.0):
    """Quader mit Unterkante bei loc (wie mesh.box); UVs kommen spaeter per uv.box"""
    return mesh.box(name, size, loc=loc, rot=rot, bevel=bevel)


def plank_uv(obj, axis, tile=2.0, seed=0):
    """Bretter/Bohlen: Box-UV mit Maserung entlang `axis` ('x'|'y'|'z')"""
    uv.box(obj, tile=tile, space='object', along=axis)
    return obj


# ---------------------------------------------------------------------------------------------------------------- Waende

class Wall:
    """Eine Fachwerkwand in einer senkrechten Ebene. Lokale Koordinaten: u entlang der Wand (0..L, von `a` nach `b`),
    z Hoehe; die Aussenflaeche des Holzes liegt in der Ebene durch a-b, `out` zeigt nach aussen."""

    def __init__(self, a, b, out, z0, z1):
        self.a = Vector((a[0], a[1], 0.0))
        self.b = Vector((b[0], b[1], 0.0))
        self.L = (self.b - self.a).length
        self.dir = (self.b - self.a).normalized()
        self.out = Vector((out[0], out[1], 0.0)).normalized()
        self.z0 = z0
        self.z1 = z1
        self.openings = []  # (u0, u1, z0, z1, kind)

    def p(self, u, z, d=0.0):
        """Punkt auf der Wand: u entlang, z hoch, d nach innen (positiv = in die Wand hinein)"""
        q = self.a + self.dir * u - self.out * d
        return Vector((q.x, q.y, z))

    def opening(self, u0, u1, z0, z1, kind='window'):
        self.openings.append((u0, u1, z0, z1, kind))
        return self


def frame(wall, members, rnd, depth=0.09, prefix='fw'):
    """Fachwerkhoelzer einer Wand. members: Liste (u0, z0, u1, z1, breite, rolle). Rolle steuert die Fase. Die Hoelzer
    liegen mit der Aussenflaeche in der Wandebene (Mitte depth/2 nach innen). Rueckgabe: Liste Objekte."""
    out = []
    for i, (u0, z0, u1, z1, w, role) in enumerate(members):
        d = depth * rnd.uniform(0.95, 1.05)
        # Querschnitt: w in der Wandebene (senkrecht zur Laengsachse), d nach innen
        p0 = wall.p(u0, z0, d / 2)
        p1 = wall.p(u1, z1, d / 2)
        # "up" so waehlen, dass die lokale Z-Achse des Holzes in der Wandebene liegt -> Breite w zeigt nach aussen
        axis = (p1 - p0).normalized()
        upv = axis.cross(wall.out).normalized()
        L = (p1 - p0).length
        bend = 0.0
        segs = 1
        if role in ('plate', 'sill') and L > 0.9:
            segs = 2
            bend = rnd.uniform(0.004, 0.012) if role == 'plate' else 0.0
        o = timber(f'{prefix}_{i}', p0, p1, d, w, ch=0.011 if role != 'rail' else 0.008, up=upv, segs=segs, bend=0.0,
                   wob=0.004 if L > 0.6 else 0.0, rnd=rnd, outer_only=True)
        if bend:
            mesh.sag(o, bend, 'X' if abs(wall.dir.x) > 0.5 else 'Y')
        out.append(o)
    return out


def wall_timber(wall, name, u0, z0, u1, z1, w, d, depth=0.0, ch=0.0, rnd=None, segs=1):
    """Holz/Brett in der Wandebene: w = Breite in der Wandebene (quer zur Laengsachse), d = Dicke nach aussen;
    depth = Lage der Mitte nach innen (negativ = vor der Wand)."""
    p0 = wall.p(u0, z0, depth)
    p1 = wall.p(u1, z1, depth)
    upv = (p1 - p0).normalized().cross(wall.out).normalized()
    return timber(name, p0, p1, d, w, ch=ch, up=upv, rnd=rnd, segs=segs)


def grime_attr(obj, fn):
    """Je-Vertex-Schmutz (Attribut 'sp_grime', 0..1) aus fn(x, y, z) -> Verwitterung, Moos, Russ"""
    me = obj.data
    a = me.attributes.get('sp_grime') or me.attributes.new('sp_grime', 'FLOAT', 'POINT')
    a.data.foreach_set('value', [max(0.0, min(1.0, fn(v.co.x, v.co.y, v.co.z))) for v in me.vertices])
    return obj


def tilt(u, z0, z1, rnd, amt=0.012):
    """leicht schiefer Staender: (u unten, u oben)"""
    return u + rnd.uniform(-amt, amt) * 0.4, u + rnd.uniform(-amt, amt)


def plaster(wall, name, u0, u1, z0, z1, rnd, inset=0.022, thick=0.07, cell=0.14, bulge=0.006):
    """Putz-/Ausfachungskern der Wand als fein unterteilte Felder (Bereiche um die Oeffnungen), Aussenflaeche `inset`
    hinter der Holzflaeche, leicht ausgebeult (Lehmgefache). Laibungen der Oeffnungen entstehen als Kanten der Felder.
    Rueckgabe: ein Objekt."""
    # Rechteck [u0,u1]x[z0,z1] minus Oeffnungen -> Rechtecke (Streifen nach u-Grenzen)
    cuts_u = sorted({u0, u1} | {o[0] for o in wall.openings if u0 < o[0] < u1} | {o[1] for o in wall.openings if u0 < o[1] < u1})
    rects = []
    for i in range(len(cuts_u) - 1):
        a, b = cuts_u[i], cuts_u[i + 1]
        mid = (a + b) / 2
        holes = sorted([o for o in wall.openings if o[0] <= mid <= o[1]], key=lambda o: o[2])
        zz = z0
        for o in holes:
            if o[2] > zz:
                rects.append((a, b, zz, min(o[2], z1)))
            zz = max(zz, o[3])
        if zz < z1:
            rects.append((a, b, zz, z1))
    bm = bmesh.new()
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    for (a, b, za, zb) in rects:
        nu = max(1, int(round((b - a) / cell)))
        nz = max(1, int(round((zb - za) / cell)))
        grid = []
        for j in range(nz + 1):
            row = []
            for i in range(nu + 1):
                u = a + (b - a) * i / nu
                z = za + (zb - za) * j / nz
                edge = i in (0, nu) or j in (0, nz)
                bl = 0.0 if edge else bulge * (0.5 + noise.noise(Vector((u * 3.0, z * 3.0, 0)) + off))
                row.append(bm.verts.new(wall.p(u, z, inset - bl)))
            grid.append(row)
        for j in range(nz):
            for i in range(nu):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        # Raender nach innen (Laibungen / Stoesse) und Rueckseite
        back = [wall.p(a, za, inset + thick), wall.p(b, za, inset + thick), wall.p(b, zb, inset + thick), wall.p(a, zb, inset + thick)]
        bv = [bm.verts.new(c) for c in back]
        bm.faces.new(list(reversed(bv)))
        edges = [[grid[0][i] for i in range(nu + 1)], [grid[j][nu] for j in range(nz + 1)],
                 [grid[nz][i] for i in range(nu, -1, -1)], [grid[j][0] for j in range(nz, -1, -1)]]
        for k, ed in enumerate(edges):
            b0, b1 = bv[k], bv[(k + 1) % 4]
            # Faecher vom Rand zu den zwei Rueckseiten-Ecken
            for m in range(len(ed) - 1):
                bm.faces.new((ed[m + 1], ed[m], b0) if m < len(ed) // 2 else (ed[m + 1], ed[m], b1))
            mid = len(ed) // 2
            bm.faces.new((ed[mid], b0, b1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def opening_reveal(wall, name, u0, u1, z0, z1, depth=0.09, inset=0.022):
    """Rueckwand einer Oeffnung (dunkle Fensterflaeche/Tuerblatt-Hintergrund) in Tiefe `depth`"""
    bm = bmesh.new()
    vs = [bm.verts.new(wall.p(u, z, depth)) for (u, z) in ((u0, z0), (u1, z0), (u1, z1), (u0, z1))]
    f = bm.faces.new(vs)
    bm.normal_update()
    if f.normal.dot(wall.out) < 0:
        f.normal_flip()
    return mesh.obj_from_bm(name, bm)


def patch(wall, name, u, z, r, rnd, inset=0.019, n=9):
    """Abgeplatzte Putzstelle / Lehmfleck: unregelmaessiges Vieleck knapp vor dem Putz"""
    bm = bmesh.new()
    vs = []
    for k in range(n):
        a = 2 * math.pi * k / n
        rr = r * (0.6 + 0.5 * rnd.random())
        vs.append(bm.verts.new(wall.p(u + math.cos(a) * rr * 1.15, z + math.sin(a) * rr * 0.8, inset)))
    f = bm.faces.new(vs)
    bm.normal_update()
    if f.normal.dot(wall.out) < 0:
        f.normal_flip()
    return mesh.obj_from_bm(name, bm)


# ---------------------------------------------------------------------------------------------------------------- Sockel

def plinth_ring(name, x0, y0, x1, y1, h, rnd, proud=0.03, depth=0.15, lmin=0.17, lmax=0.32, sink=0.04, small_prob=0.25):
    """Bruchsteinsockel um das Rechteck [x0,x1]x[y0,y1] (Aussenkante der Schwelle): Einzelsteine in einer Lage, gelegentlich
    zwei kleinere uebereinander, Steine stehen `proud` vor. Rueckgabe: (Steine, Kern) - Kern = Fuellmauer dahinter."""
    stones = []
    sides = [((x0, y0), (x1, y0), (0, -1)), ((x1, y0), (x1, y1), (1, 0)), ((x1, y1), (x0, y1), (0, 1)), ((x0, y1), (x0, y0), (-1, 0))]
    k = 0
    for (a, b, nrm) in sides:
        A = Vector((a[0], a[1], 0))
        B = Vector((b[0], b[1], 0))
        L = (B - A).length
        d = (B - A) / L
        nv = Vector((nrm[0], nrm[1], 0))
        u = -proud
        while u < L + proud - 0.04:
            l = min(rnd.uniform(lmin, lmax), L + proud - u)
            if l < 0.07:
                break
            c = A + d * (u + l / 2) + nv * (proud - depth / 2 + rnd.uniform(-0.008, 0.01))
            rot = math.atan2(d.y, d.x) + rnd.uniform(-0.04, 0.04)
            if rnd.random() < small_prob and h > 0.15:
                hh = h * rnd.uniform(0.45, 0.55)
                for j, (zc, hj) in enumerate(((hh / 2 - sink / 2, hh + sink), (hh + (h - hh) / 2, h - hh))):
                    ll = l * rnd.uniform(0.85, 1.0)
                    stones.append(mesh.stone(f'{name}_{k}_{j}', (ll * 0.97, depth * rnd.uniform(0.9, 1.05), hj * 0.96),
                                             loc=(c.x, c.y, zc), seed=rnd.randint(0, 9999), rough=0.06, subdiv=0, rot_z=rot,
                                             bevel=0.2))
            else:
                hz = h * rnd.uniform(0.95, 1.05) + sink
                stones.append(mesh.stone(f'{name}_{k}', (l * 0.97, depth * rnd.uniform(0.92, 1.05), hz), loc=(c.x, c.y, hz / 2 - sink),
                                         seed=rnd.randint(0, 9999), rough=0.07, subdiv=0, rot_z=rot, bevel=0.22))
            k += 1
            u += l
    core = mesh.box(f'{name}_core', (x1 - x0 - 0.06, y1 - y0 - 0.06, h - 0.02), loc=((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
    return stones, core


# ---------------------------------------------------------------------------------------------------------------- Daecher

class GableRoof:
    """Satteldach mit First entlang X (Traufen vorn/hinten). Geometrie der Dachoberseite als Funktion:
       z_main(y) = ridge - |y| * tan(pitch),  optional Kruppelwalm: z_hip(x) = hip_z + (xe - |x|) * tan(hip_pitch)
    xe/ye = halbe Ausdehnung bis Ortgang/Traufe (inkl. Ueberstand)."""

    def __init__(self, xe, ye, ridge, pitch_deg, hip_z=None, hip_deg=60.0, sag=0.0, cy=0.0, wave=0.0, seed=0):
        self.xe, self.ye, self.ridge = xe, ye, ridge
        self.t = math.tan(math.radians(pitch_deg))
        self.hip_z = hip_z
        self.th = math.tan(math.radians(hip_deg))
        self.sag = sag
        self.cy = cy
        self.wave = wave
        self.off = Vector((seed * 7.1, seed * 3.3, 1.7))

    def z_main(self, x, y):
        s = self.sag * math.cos(math.pi * x / (2 * self.xe)) ** 2 * (1.0 - 0.6 * abs(y - self.cy) / self.ye)
        return self.ridge - abs(y - self.cy) * self.t - s

    def z_hip(self, x):
        if self.hip_z is None:
            return 1e9
        return self.hip_z + (self.xe - abs(x)) * self.th

    def z(self, x, y):
        return min(self.z_main(x, y), self.z_hip(x))

    def normal(self, x, y):
        if self.z_hip(x) < self.z_main(x, y):
            b = math.atan(self.th)
            return Vector((math.copysign(math.sin(b), x), 0.0, math.cos(b)))
        a = math.atan(self.t)
        return Vector((0.0, math.copysign(math.sin(a), y - self.cy), math.cos(a)))

    def under_z(self, x, y, thick):
        """Unterseite einer Dachhaut der Dicke `thick` (senkrecht gemessen) an (x, y)"""
        return self.z(x, y) - thick / max(0.2, self.normal(x, y).z)

    def eave_z(self):
        return self.ridge - self.ye * self.t

    def slope_dist(self, x, y):
        """Abstand entlang der Dachflaeche von der Unterkante (fuer Lagen)"""
        if self.z_hip(x) < self.z_main(x, y):
            return (self.xe - abs(x)) * math.sqrt(1 + self.th ** 2) + 10.0
        return (self.ye - abs(y - self.cy)) * math.sqrt(1 + self.t ** 2)


class ThatchSurf:
    """Oberseite eines Stroh-/Reetdachs ueber einem GableRoof: Lagen (Stufe am Fuss jeder Lage), Rauschbeulen, unruhige
    Traufe. z(x, y) wird auch fuer Auflagen (Moos, First) benutzt, damit sie genau auf der Flaeche liegen."""

    def __init__(self, R, course=0.24, step=0.014, bump=0.018, seed=1):
        self.R = R
        self.course = course
        self.step = step
        self.bump = bump
        rnd = random.Random(seed)
        self.off = Vector((rnd.uniform(0, 99), rnd.uniform(0, 99), 0.0))

    def eave_y(self, x, side):
        R = self.R
        return R.cy + side * (R.ye + noise.noise(Vector((x * 2.3, 0.0, 0.0)) + self.off) * 0.025)

    def z(self, x, y, eave=False):
        R = self.R
        z = R.z(x, y)
        s = R.slope_dist(x, y)
        if s < 9.0:
            ph = (s % self.course) / self.course
            # Lagenfuss (ph ~ 0) steht hervor, zum Lagenende hin flacher
            z += self.step * (1.0 - ph) - self.step * 0.5
        z += self.bump * noise.noise(Vector((x * 1.7, y * 1.9, 0.0)) + self.off)
        if eave:
            z -= 0.02 + 0.015 * noise.noise(Vector((x * 4.1, 1.0, 0.0)) + self.off)
        return z

    def rows(self, extra=1):
        """Abstaende entlang des Hangs (von der Traufe): je Lage Fuss + kurz davor + `extra` Zwischenzeilen"""
        R = self.R
        k = math.sqrt(1 + R.t ** 2)
        L = R.ye * k
        out = [0.0]
        s = 0.0
        while True:
            nxt = s + self.course
            for e in range(1, extra + 1):
                v = s + self.course * e / (extra + 1)
                if v < L - 0.03:
                    out.append(v)
            if nxt >= L - 0.03:
                break
            out.append(nxt - 0.012)
            out.append(nxt)
            s = nxt
        out.append(L)
        return [v / k for v in out]  # in y-Abstand von der Traufe


def thatch_roof(name, R, nx=14, thick=0.16, thick_eave=0.22, surf=None, rnd=None, rim=True, under=True, soffit=0.4,
                extra=1):
    """Stroh-/Reetdach als dickes Hoehenfeld ueber [-xe,xe]x[cy-ye,cy+ye] (Oberseite aus ThatchSurf), Dicke zur Traufe
    hin zunehmend, Untersicht nur im Ueberstand. Rueckgabe: Objekt (UVs per uv_roof)."""
    rnd = rnd or random.Random(1)
    S = surf or ThatchSurf(R, seed=rnd.randint(0, 999))
    bm = bmesh.new()
    xs = [-R.xe + 2 * R.xe * i / nx for i in range(nx + 1)]
    dy = S.rows(extra)
    yl = [R.cy - (R.ye - d) for d in dy] + [R.cy + (R.ye - d) for d in reversed(dy[:-1])]
    top = []
    for j, y in enumerate(yl):
        row = []
        edge = j == 0 or j == len(yl) - 1
        for x in xs:
            yy = S.eave_y(x, -1 if j == 0 else 1) if edge else y
            row.append(bm.verts.new((x, yy, S.z(x, yy, eave=edge))))
        top.append(row)
    for j in range(len(yl) - 1):
        for i in range(nx):
            bm.faces.new((top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]))
    nx = len(xs) - 1
    # Dicke: Rand-Streifen nach unten, Untersicht im Ueberstand
    def thick_at(v):
        d = R.slope_dist(v.co.x, v.co.y)
        k = max(0.0, min(1.0, d / 0.5)) if d < 9.0 else 1.0
        return thick_eave + (thick - thick_eave) * k

    def normal_at(x, y):
        if R.z_hip(x) < R.z_main(x, y):
            b = math.atan(R.th)
            return Vector((math.copysign(math.sin(b), x), 0.0, math.cos(b)))
        a = math.atan(R.t)
        return Vector((0.0, math.copysign(math.sin(a), y - R.cy), math.cos(a)))

    def lower(co, t):
        # senkrecht nach unten (gerader Traufschnitt): die Kante steht ueber Giebel und Walmfuss vor
        return co - Vector((0.0, 0.0, t / max(0.3, normal_at(co.x, co.y).z)))

    if rim:
        ring = [top[0][i] for i in range(nx + 1)] + [top[j][nx] for j in range(1, len(yl))] + \
               [top[len(yl) - 1][i] for i in range(nx - 1, -1, -1)] + [top[j][0] for j in range(len(yl) - 2, 0, -1)]
        low = [bm.verts.new(lower(v.co, thick_at(v))) for v in ring]
        m = len(ring)
        for k in range(m):
            k2 = (k + 1) % m
            bm.faces.new((ring[k2], ring[k], low[k], low[k2]))
        if under:
            # Untersicht nur im Ueberstand: Streifen vom unteren Rand nach innen (hinter die Waende), dann Faecher zur Mitte
            inner = []
            for v, lv in zip(ring, low):
                x, y = v.co.x, v.co.y
                xi = x - math.copysign(min(soffit, abs(x)), x) if abs(abs(x) - R.xe) < 1e-4 else x * (1 - soffit / max(R.xe, 1e-3))
                yi = y - math.copysign(min(soffit, abs(y - R.cy)), y - R.cy) if abs(abs(y - R.cy) - R.ye) < 0.05 else R.cy + (y - R.cy) * (1 - soffit / R.ye)
                inner.append(bm.verts.new(Vector((xi, yi, R.under_z(xi, yi, thick)))))
            for k in range(m):
                k2 = (k + 1) % m
                bm.faces.new((low[k], low[k2], inner[k2], inner[k]))
            cv = bm.verts.new((0.0, R.cy, R.ridge - 0.45))
            for k in range(m):
                k2 = (k + 1) % m
                bm.faces.new((inner[k], inner[k2], cv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh.obj_from_bm(name, bm)
    return ob


def uv_roof(obj, R, tile=1.0, seed=0):
    """Dach-UVs: U entlang des Firsts (x), V entlang der Falllinie (wahre Laenge); Walmflaechen: U entlang y"""
    me = obj.data
    uvl = me.uv_layers.get(UV) or me.uv_layers.new(name=UV)
    r = random.Random(seed)
    ou, ov = r.random(), r.random()
    k = math.sqrt(1 + R.t ** 2)
    kh = math.sqrt(1 + R.th ** 2)
    for p in me.polygons:
        n = p.normal
        hip = abs(n.x) > abs(n.y) * 1.2 and abs(n.x) > 0.25
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) < 0.35:  # senkrechte Schnittflaechen (Traufe, Ortgang, Lagenstirn): V = Hoehe
                u, v = (co.y, co.z) if abs(n.x) > abs(n.y) else (co.x, co.z)
            elif hip:
                u, v = co.y * math.copysign(1, co.x), (R.xe - abs(co.x)) * kh
            else:
                u, v = co.x, (R.ye - abs(co.y - R.cy)) * k
            uvl.data[li].uv = (u / tile + ou, v / tile + ov)
    return mark_world(obj)


def course_rows(name, R, side, rows, row_thick=0.03, lap=1.45, xmargin=0.0, depth0=0.02, seed=0, tooth=0.0, nseg=1,
                jitter=0.012, x_split=None, lean=False, split=False):
    """Schindel-/Ziegel-Lagen einer Dachseite (side -1 vorn, +1 hinten): ueberlappende Bretter von der Traufe zum First,
    jede Lage leicht verdreht/versetzt, Unterkante mit Zahnung (tooth > 0: Laengsunterteilung nseg mit Hoehenversatz).
    x_split: Liste von x-Grenzen, um die Lagen in Abschnitte zu teilen (unregelmaessige Stoesse)."""
    rnd = random.Random(seed)
    k = math.sqrt(1 + R.t ** 2)
    slope_len = R.ye * k
    seg = slope_len / rows
    out = []
    for r in range(rows):
        s0 = r * seg
        s1 = min(slope_len + 0.05, s0 + seg * lap)
        y0 = R.cy + side * (R.ye - s0 / k)
        y1 = R.cy + side * (R.ye - s1 / k)
        x_cuts = x_split or [-R.xe, R.xe]
        for ci in range(len(x_cuts) - 1):
            xa = x_cuts[ci] + rnd.uniform(-0.01, 0.01) + xmargin
            xb = x_cuts[ci + 1] + rnd.uniform(-0.01, 0.01) - xmargin
            # Fuss der Lage liegt auf der darunterliegenden Lage (um row_thick angehoben), Kopf auf der Lattung:
            # so liegt jede Lage sicher ueber der vorigen und zeigt eine Stirnkante
            za = R.z_main(0, y0) + depth0 + row_thick + rnd.uniform(0.0, jitter) * 0.5
            zb = R.z_main(0, y1) + depth0
            bm = bmesh.new()
            nsg = max(1, nseg)
            verts_top, verts_bot, mids = [], [], []
            faces_dir = []
            for i in range(nsg + 1):
                x = xa + (xb - xa) * i / nsg
                sag = R.z_main(x, y0) - R.z_main(0, y0)
                tz = (rnd.uniform(-1, 1) * tooth) if 0 < i < nsg else 0.0
                tw = rnd.uniform(0.0, jitter)
                # vier Punkte je Station: Unterkante oben/unten, Oberkante oben/unten
                pa = Vector((x, y0 + side * tz * 0.5, za + sag + tw))
                pb = Vector((x, y1, zb + sag))
                verts_top.append((bm.verts.new(pa), bm.verts.new(pb)))
                verts_bot.append((bm.verts.new(pa - Vector((0, 0, row_thick))), bm.verts.new(pb - Vector((0, 0, row_thick * 0.6)))))
                if split:  # Zwischenkante an der Grenze des sichtbaren Teils (gleichmaessige AO auf dem sichtbaren Teil)
                    mids.append(bm.verts.new(pa + (pb - pa) * min(0.95, 1.08 / lap)))
            for i in range(nsg):
                a0, b0 = verts_top[i]
                a1, b1 = verts_top[i + 1]
                c0, d0 = verts_bot[i]
                c1, d1 = verts_bot[i + 1]
                up = Vector((0, 0, 1))
                down_slope = Vector((0, side, 0))
                xdir = Vector((1, 0, 0))
                want = []
                if split:
                    m0, m1 = mids[i], mids[i + 1]
                    want.append((bm.faces.new((a0, a1, m1, m0)), up))
                    want.append((bm.faces.new((m0, m1, b1, b0)), up))
                else:
                    want.append((bm.faces.new((a0, a1, b1, b0)), up))   # Oberseite
                if i == 0:
                    want.append((bm.faces.new((c0, a0, b0, d0)), -xdir))
                if i == nsg - 1:
                    want.append((bm.faces.new((a1, c1, d1, b1)), xdir))
                if not lean or r == 0:
                    want.append((bm.faces.new((c1, c0, d0, d1)), -up))  # Unterseite (lean: nur unterste Lage)
                want.append((bm.faces.new((a0, c0, c1, a1)), down_slope))  # Stirn (Unterkante sichtbar)
                if not lean or r == rows - 1:
                    want.append((bm.faces.new((b0, b1, d1, d0)), -down_slope))  # obere Kante (lean: nur oberste Lage)
                faces_dir.extend(want)
            bm.normal_update()
            for f, wdir in faces_dir:  # Normalen nach der gewollten Richtung (offene Lagen: recalc ist unzuverlaessig)
                if f.normal.dot(wdir) < 0:
                    f.normal_flip()
            out.append(mesh.obj_from_bm(f'{name}_{r}_{ci}', bm))
    return out


# ---------------------------------------------------------------------------------------------------------------- Kleinteile

def log(name, p0, p1, r, segs=6, rnd=None):
    """Rundholz/Scheit: Zylinder zwischen zwei Punkten (U entlang, Hirnholz planar)"""
    rnd = rnd or random.Random(hash(name) & 0xffff)
    a, L, x, y, z = _frame_axes(p0, p1, (0, 0, 1))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new(UV)
    rings = []
    rr = [r * rnd.uniform(0.85, 1.12) for _ in range(segs)]
    for t in (0.0, 1.0):
        ring = []
        for k in range(segs):
            ang = 2 * math.pi * k / segs + rnd.uniform(-0.1, 0.1)
            co = a + x * (t * L) + (y * math.cos(ang) + z * math.sin(ang)) * rr[k]
            ring.append(bm.verts.new(co))
        rings.append(ring)
    ou = rnd.random()
    for k in range(segs):
        j = (k + 1) % segs
        f = bm.faces.new((rings[0][k], rings[0][j], rings[1][j], rings[1][k]))
        for lp, (uu, vv) in zip(f.loops, ((0, k), (0, k + 1), (1, k + 1), (1, k))):
            lp[uvl].uv = (uu * L + ou, vv * 2 * math.pi * r / segs)
    for k, rev in ((0, True), (1, False)):
        vs = list(reversed(rings[k])) if rev else rings[k]
        f = bm.faces.new(vs)
        for lp in f.loops:
            c = lp.vert.co
            lp[uvl].uv = (c.dot(y) * 3.3 + 0.3, c.dot(z) * 3.3 + 0.6)
    bm.normal_update()
    return mark_world(mesh.obj_from_bm(name, bm))


def woodpile(name, x0, y0, x1, y1, h, r=0.045, rnd=None, axis='y', split=True):
    """Gestapelte Scheite in [x0,x1]x[y0,y1], Hoehe h; Scheite entlang `axis`. Rueckgabe: Liste Objekte."""
    rnd = rnd or random.Random(5)
    out = []
    if axis == 'y':
        span, (a0, a1) = (x0, x1), (y0, y1)
    else:
        span, (a0, a1) = (y0, y1), (x0, x1)
    k = 0
    z = r
    row = 0
    while z + r * 0.4 < h:
        n = int((span[1] - span[0]) / (2 * r * 1.02))
        shift = (r if row % 2 else 0.0)
        for i in range(n - (1 if row % 2 else 0)):
            c = span[0] + r + shift + i * 2 * r * 1.02 + rnd.uniform(-0.006, 0.006)
            if rnd.random() < 0.08 and row > 0:
                continue
            e0 = a0 + rnd.uniform(-0.02, 0.03)
            e1 = a1 + rnd.uniform(-0.03, 0.02)
            zz = z + rnd.uniform(-0.006, 0.006)
            if axis == 'y':
                p0, p1 = (c, e0, zz), (c, e1, zz)
            else:
                p0, p1 = (e0, c, zz), (e1, c, zz)
            out.append(log(f'{name}_{k}', p0, p1, r * rnd.uniform(0.85, 1.1), segs=3 if split and rnd.random() < 0.5 else 5, rnd=rnd))
            k += 1
        z += r * 1.75
        row += 1
    return out


def barrel(name, x, y, r=0.13, h=0.34, segs=10, z=0.0, rnd=None):
    """Fass (bauchig, 3 Ringe) -> (Daubenkoerper, Reifen)"""
    bm = bmesh.new()
    rings = []
    zs = [0.0, 0.18, 0.5, 0.82, 1.0]
    for t in zs:
        rr = r * (0.86 + 0.14 * math.sin(math.pi * t))
        ring = [bm.verts.new((x + math.cos(2 * math.pi * k / segs) * rr, y + math.sin(2 * math.pi * k / segs) * rr, z + t * h)) for k in range(segs)]
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    lid = [bm.verts.new((v.co.x, v.co.y, v.co.z - 0.015)) for v in rings[-1]]
    for k in range(segs):
        j = (k + 1) % segs
        bm.faces.new((rings[-1][k], rings[-1][j], lid[j], lid[k]))
    bm.faces.new(lid)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = mesh.obj_from_bm(name, bm)
    hoops = []
    for t in (0.1, 0.9):
        rr = r * (0.86 + 0.14 * math.sin(math.pi * t)) + 0.004
        hoops.append(mesh.ring(f'{name}_hoop{t}', rr - 0.006, rr + 0.002, 0.03, segs=segs, loc=(x, y, z + t * h - 0.015)))
    return body, hoops


def sack(name, x, y, rnd, s=1.0, rot=0.0, lie=False):
    """Mehl-/Kornsack: bauchiger Koerper, eingeschnuerter Hals mit Zipfel (stehend) bzw. liegend"""
    bm = bmesh.new()
    segs = 7
    prof = [(0.0, 0.1), (0.08, 0.122), (0.16, 0.108), (0.205, 0.072), (0.24, 0.06)]
    rings = []
    for (z, r) in prof:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rr = r * s * (1 + rnd.uniform(-0.07, 0.07))
            ring.append(bm.verts.new((math.cos(a) * rr * 1.12, math.sin(a) * rr * 0.92, z * s)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    # Zipfel kippt etwas zur Seite, Sack sackt einseitig zusammen
    for v in rings[-1] + rings[-2]:
        v.co.x += 0.025 * s
    tilt_a = rnd.uniform(-0.18, 0.18)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(tilt_a, 3, 'X'), verts=bm.verts)
    for v in bm.verts:
        v.co.z = max(0.0, v.co.z)
    if lie:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2 - 0.1, 3, 'Y'), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((-0.14 * s, 0, 0.08 * s)), verts=bm.verts)
        for v in bm.verts:  # liegender Sack flacht ab
            v.co.z = max(0.0, v.co.z * 0.8)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((x, y, 0)), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def trough(name, cx, cy, z, L=0.48, W=0.22, H=0.13, flare=1.25, rim=0.022):
    """Trog (Teig-/Wassertrog): nach oben weiter werdender Kasten mit eingesenkter Innenflaeche"""
    bm = bmesh.new()

    def rect(w, l, zz):
        return [bm.verts.new((cx + sx * l / 2, cy + sy * w / 2, zz)) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    b0 = rect(W, L, z)
    t0 = rect(W * flare, L * 1.08, z + H)
    t1 = rect(W * flare - 2 * rim, L * 1.08 - 2 * rim, z + H)
    i0 = rect(W * 0.8 - rim, L * 0.95 - rim, z + H * 0.45)
    bm.faces.new(list(reversed(b0)))
    for ring_a, ring_b in ((b0, t0), (t0, t1), (t1, i0)):
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((ring_a[k], ring_a[j], ring_b[j], ring_b[k]))
    bm.faces.new(i0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def plaster_gable(wall, name, u_l, u_r, z0, u_apex, z_apex, rnd, inset=0.022, thick=0.07, cell=0.16, bulge=0.005):
    """Putzflaeche eines Giebeldreiecks (Trapez-Zeilen bis knapp unter die Spitze) hinter dem Giebelfachwerk"""
    nz = max(1, int(round((z_apex - z0) / cell)))
    nu = max(1, int(round((u_r - u_l) / cell)))
    bm = bmesh.new()
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), 0.0))
    rows = []
    for j in range(nz + 1):
        t = min(j / nz, 0.94)
        z = z0 + (z_apex - z0) * t
        a = u_l + (u_apex - u_l) * t
        b = u_r + (u_apex - u_r) * t
        row = []
        for i in range(nu + 1):
            u = a + (b - a) * i / nu
            edge = i in (0, nu) or j in (0, nz)
            bl = 0.0 if edge else bulge * (0.5 + noise.noise(Vector((u * 3.0, z * 3.0, 0)) + off))
            row.append(bm.verts.new(wall.p(u, z, inset - bl)))
        rows.append(row)
    for j in range(nz):
        for i in range(nu):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    # Rueckseite als einfache Flaeche (verdeckt)
    ring = rows[0] + [rows[j][nu] for j in range(1, nz + 1)] + list(reversed(rows[nz]))[1:] + [rows[j][0] for j in range(nz - 1, 0, -1)]
    back = [bm.verts.new(v.co - wall.out * thick) for v in ring]
    m = len(ring)
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((ring[k2], ring[k], back[k], back[k2]))
    bmesh.ops.contextual_create(bm, geom=back)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def place(obj, rot_z=0.0, offset=(0, 0, 0)):
    """Objekt um die Hochachse drehen und verschieben (in die Geometrie uebernommen)"""
    m = Matrix.Translation(Vector(offset)) @ Matrix.Rotation(rot_z, 4, 'Z')
    obj.data.transform(m)
    obj.data.update()
    return obj


def loaf(name, x, y, z, rnd, l=0.11, w=0.07, h=0.045, rot=0.0):
    """Brotlaib: abgeflachtes Ellipsoid mit Einschnitt-Andeutung"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=3, radius=0.5)
    for v in bm.verts:
        p = v.co
        if p.z < 0:
            p.z *= 0.25
        p.x *= l * (1 + rnd.uniform(-0.08, 0.08))
        p.y *= w
        p.z *= h * 2
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((x, y, z + h * 0.25)), verts=bm.verts)
    return mesh.obj_from_bm(name, bm)


def dome(name, cx, cy, z0, rx, ry, h, segs=12, rings=4, cut_y=None, rnd=None, wob=0.012):
    """Gewoelbe/Kuppel (Backofen) als halbes Ellipsoid ueber (cx, cy) ab Hoehe z0; cut_y: vorn bei y = cut_y abgeschnitten"""
    rnd = rnd or random.Random(3)
    bm = bmesh.new()
    rows = []
    for j in range(rings + 1):
        phi = (math.pi / 2) * j / (rings + 1)
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            r = math.cos(phi)
            x = cx + math.cos(a) * rx * r
            y = cy + math.sin(a) * ry * r
            z = z0 + math.sin(phi) * h
            if cut_y is not None and y < cut_y:
                y = cut_y
            n = noise.noise(Vector((x * 5.0, y * 5.0, z * 5.0)))
            row.append(bm.verts.new((x + n * wob, y + n * wob * (0 if cut_y is not None and y <= cut_y + 1e-6 else 1), z + n * wob * 0.5)))
        rows.append(row)
    top = bm.verts.new((cx, cy if cut_y is None else max(cy, cut_y), z0 + h))
    for j in range(rings):
        for i in range(segs):
            i2 = (i + 1) % segs
            bm.faces.new((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
    for i in range(segs):
        bm.faces.new((rows[rings][i], rows[rings][(i + 1) % segs], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def frame_lods(wall, members, rnd, prefix, z_lo, z_hi, key_posts=False, pegs=True, depth=0.09, post_pegs=True):
    """Fachwerk einer Wand in drei Stufen: LOD0 gefaste Hoelzer + Holznaegel, LOD1 einfache Kanthoelzer (Glieder > 0,25),
    LOD2 nur Schwelle, Rahm, Eck- (und mit key_posts alle) Staender. z_lo/z_hi: Bereich, in dem Naegel sitzen duerfen.
    Rueckgabe: (lod0, lod1, lod2) Listen von Objekten."""
    l0 = frame(wall, members, rnd, depth=depth, prefix=prefix)
    l1, l2 = [], []
    for i, (u0, z0, u1, z1, ww, role) in enumerate(members):
        p0, p1 = wall.p(u0, z0, depth / 2), wall.p(u1, z1, depth / 2)
        upv = (p1 - p0).normalized().cross(wall.out).normalized()
        if math.hypot(u1 - u0, z1 - z0) > 0.25:
            l1.append(timber(f'{prefix}_L1_{i}', p0, p1, depth, ww, ch=0.0, up=upv, rnd=rnd))
        key = role in ('sill', 'plate', 'rafter') or (role == 'post' and (key_posts or min(u0, u1) < 0.1 or max(u0, u1) > wall.L - 0.1))
        if key:
            l2.append(timber(f'{prefix}_L2_{i}', p0, p1, depth, ww, ch=0.0, up=upv, rnd=rnd))
        if not pegs:
            continue
        if role in ('rail', 'brace'):
            d = Vector((u1 - u0, z1 - z0)).normalized()
            for (u, z, sgn) in ((u0, z0, 1), (u1, z1, -1)):
                if 0.02 < u < wall.L - 0.02 and z_lo + 0.03 < z < z_hi - 0.02:
                    l0.append(peg(f'{prefix}_peg{i}_{sgn}', wall.p(u + sgn * 0.04 * d.x, z + sgn * 0.04 * d.y, 0.0), wall.out,
                                  rot=rnd.uniform(-0.3, 0.3)))
        elif role == 'post' and post_pegs:
            for z in (z0 + 0.04, z1 - 0.04):
                l0.append(peg(f'{prefix}_pegp{i}_{z:.2f}', wall.p((u0 + u1) / 2 + rnd.uniform(-0.01, 0.01), z, 0.0), wall.out,
                              rot=rnd.uniform(-0.3, 0.3)))
    return l0, l1, l2


def subdivided_box(name, size, loc, cuts=2):
    """Quader mit Gitterteilung (Datenfarbe/AO brauchen Vertices auf grossen Flaechen)"""
    o = mesh.box(name, size, loc=loc)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=cuts, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    return o


def chimney_shaft(name, cx, cy, z0, z1, w, d, rnd, taper=0.09, rings=4, jitter=0.009):
    """Gemauerter Schlot als durchgehender, leicht konischer Schaft mit unregelmaessigen Kanten (Ringe mit Versatz)"""
    bm = bmesh.new()
    rows = []
    for k in range(rings + 1):
        t = k / rings
        z = z0 + (z1 - z0) * t
        s = 1.0 - taper * t
        ox, oy = rnd.uniform(-jitter, jitter), rnd.uniform(-jitter, jitter)
        row = []
        for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            row.append(bm.verts.new((cx + ox + sx * (w / 2 * s + rnd.uniform(-jitter, jitter)),
                                     cy + oy + sy * (d / 2 * s + rnd.uniform(-jitter, jitter)), z)))
        rows.append(row)
    for k in range(rings):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
    bm.faces.new(rows[-1])
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)
