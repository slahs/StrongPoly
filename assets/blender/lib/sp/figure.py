"""Figuren-Baukasten (Bauer, Speerkaempfer, spaeter weitere Einheiten): organische Formen aus Querschnitten (Loft), Kopf mit
Gesicht, Haende, Schuhe, Kleidung mit Falten/Saum, Variation und Teile fuer die Vertex-Animation von unit_shader.ts.

Massstab (PIPELINE.md): 1 Einheit = 1 Kachel ~ 1,85 m; Figur ~0,93 hoch (~1,72 m, ~7,3 Kopfhoehen). Blender Z oben,
Figur blickt nach Blender -Y (= three +Z wie die prozeduralen Figuren), rechte Seite = +X (Teil arm_r wie HAND_R in
unit_items.ts).

Schnittstelle zur Laufzeit (je Objekt, siehe attrs.py):
  sp_part/sp_pivot : Teil (config.PART) und Drehpunkt; Schienbeine drehen um das Knie und dann um die Huefte (aStyle.z)
  sp_style         : (Farbklasse, Sichtbarkeitsmaske, Hueft-/Oberkoerperhoehe, Slot)
                     Farbklasse 0 fest, 1 Haut, 2 Haar, 3 Hauptstoff, 4 Nebenstoff (units_style.ts TC),
                     >= 16: fester Ton (Klasse - 16) aus der Tonetabelle UNIT_TINTS (Haut 0-7, Haar 8-15, Stoffe 16-47) -
                     so tragen auch Holz, Stroh, Leder und Eisen ihre Farbe ohne weiteres Material (Erweiterung 5A).
                     Maske: VIS-Bits (Haar-/Bart-/Hutvarianten), Slot: Berufs-Bits (1 << JOB) - 0 = immer sichtbar
  sp_arm           : Armstil (unit_shader.ts ARM; 9/10 = Bauernarm, Stil folgt dem Beruf)
  sp_team          : Spielerfarbe
Getoente Teile werden im Shader auf die Grundfarbe ihres Materials normiert (Textur liefert nur noch die Struktur), damit
Spielerfarbe und Stofftoene unabhaengig von der Bibliothekstextur stimmen (render/assets/materials.ts, SP_UNIT).
"""
import math

import bmesh
import bpy
from mathutils import Vector

from . import scene

# ---------------------------------------------------------------------------------------------------------------- Konstanten
FIXED, SKIN, HAIR, CA, CB = 0, 1, 2, 3, 4
# Stofftoene (units_style.ts CLOTH) - fuer feste Toene TONE(...)
CLOTH = dict(linen=0, linenLight=1, wool=2, brown=3, ochre=4, mustard=5, moss=6, olive=7, forest=8, blueGrey=9, slate=10,
             indigo=11, rust=12, brick=13, rose=14, coal=15, stone=16, lightGrey=17, steel=18, darkSteel=19, sand=20,
             sandDark=21, white=22, cream=23, leather=24, leatherDark=25, black=26)
CLOTH_HEX = [0xd8ccb0, 0xe6dcc3, 0x7a5a3c, 0x5b4330, 0xc79a3e, 0xbf9a4f, 0x6b7a3c, 0x7d7a45, 0x45603a, 0x5f7388, 0x4a5d78,
             0x38476a, 0xa2552f, 0x8f3f32, 0xa86b5a, 0x3a3836, 0x8a867c, 0xb3aea2, 0x9aa2a8, 0x6a7078, 0xd1b678, 0xb69a5c,
             0xeeeadf, 0xe3d7b8, 0x6b4a2e, 0x4a3322, 0x2a2724]


def TONE(name):
    """Farbklasse 'fester Stoffton' (Tonetabelle: Haut 0-7, Haar 8-15, Stoffe ab 16; Klasse = 16 + Index)"""
    return 16 + 16 + CLOTH[name]


VIS = dict(Near=1, Far=2, Hair0=4, Hair1=8, Hair2=16, Beard=32, Hat0=64, Hat1=128, Hat2=256, Detail=512)
HAIR_BITS = (VIS['Hair0'], VIS['Hair1'], VIS['Hair2'])
HAT_BITS = (VIS['Hat0'], VIS['Hat1'], VIS['Hat2'])

FRONT = Vector((0.0, -1.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
SIDE = Vector((1.0, 0.0, 0.0))

# Skelett (Blender, Z oben). Hoehen in Einheiten (~1,72-m-Mann).
SK = dict(
    hip_z=0.478, hip_x=0.052, knee_z=0.268, ankle_z=0.052,
    sho_z=0.745, sho_x=0.1, neck_z=0.79, chin_z=0.802, crown_z=0.93,
)
UPPER = SK['hip_z']  # Hoehe der Huefte fuer Neigung des Oberkoerpers und die Beinkette (aStyle.z)


# ---------------------------------------------------------------------------------------------------------------- Loft
class Sec:
    """Querschnitt: Mittelpunkt c, Halbachsen rx (seitlich), rf (nach vorn), rb (nach hinten).
    fn(theta, k, t) -> Faktor oder (Faktor, Versatz-Vektor): Falten, Steppnaehte, Nase usw. (theta 0 = vorn, +90 = +X)."""
    __slots__ = ('c', 'rx', 'rf', 'rb', 'fn')

    def __init__(self, c, rx, rf=None, rb=None, fn=None):
        self.c = Vector(c)
        self.rx = rx
        self.rf = rx if rf is None else rf
        self.rb = self.rf if rb is None else rb
        self.fn = fn


def _frame(d, fwd):
    d = d.normalized()
    f = Vector(fwd)
    if abs(d.dot(f.normalized())) > 0.95:
        f = UP if abs(d.dot(UP)) < 0.95 else Vector((0, 1, 0))
    f = (f - d * d.dot(f)).normalized()
    s = SIDE - d * d.dot(SIDE) - f * f.dot(SIDE)
    if s.length < 1e-4:
        s = d.cross(f)
    return f, s.normalized()


def _ring_r(sec, th):
    wf, ws = math.cos(th), math.sin(th)
    rf = max(1e-5, sec.rf if wf >= 0 else sec.rb)
    return 1.0 / math.sqrt((ws / max(1e-5, sec.rx)) ** 2 + (wf / rf) ** 2)


def loft(name, secs, segs=12, arc=None, cap0=None, cap1=None, fwd=FRONT, axis=None, orient='radial', coll=None):
    """Huelle durch Querschnitte. arc=(a0, a1) Grad: offener Bogen (0 vorn, 90 = +X, -90 = -X, 180 hinten), sonst Ring.
    cap0/cap1: None oder Versatz (Einheiten) der Deckelspitze entlang der Laufrichtung (0 = flacher Faecher).
    axis: feste Laufrichtung (Scheiben, Krempen); orient 'radial' (Normalen von der Achse weg) | 'auto' (bmesh)."""
    bm = bmesh.new()
    n = len(secs)
    closed = arc is None
    cnt = segs if closed else segs + 1
    if closed:
        ths = [2 * math.pi * i / segs for i in range(segs)]
    else:
        a0, a1 = math.radians(arc[0]), math.radians(arc[1])
        ths = [a0 + (a1 - a0) * i / segs for i in range(cnt)]
    rings = []
    dirs = []
    for k, s in enumerate(secs):
        if axis is not None:
            d = Vector(axis)
        elif n == 1:
            d = UP
        else:
            a = secs[max(0, k - 1)].c
            b = secs[min(n - 1, k + 1)].c
            d = b - a
            if d.length < 1e-6:
                d = UP
        d = d.normalized()
        dirs.append(d)
        f, sd = _frame(d, fwd)
        t = k / max(1, n - 1)
        ring = []
        for th in ths:
            r = _ring_r(s, th)
            w = f * math.cos(th) + sd * math.sin(th)
            off = Vector((0, 0, 0))
            if s.fn is not None:
                res = s.fn(th, k, t)
                if isinstance(res, tuple):
                    r *= res[0]
                    off = Vector(res[1])
                else:
                    r *= res
            ring.append(bm.verts.new(s.c + w * r + off))
        rings.append(ring)
    centers = [s.c for s in secs]
    faces = []
    for k in range(n - 1):
        A, B = rings[k], rings[k + 1]
        for i in range(segs):
            j = (i + 1) % cnt if closed else i + 1
            try:
                fc = bm.faces.new((A[i], A[j], B[j], B[i]))
            except ValueError:
                continue
            faces.append((fc, (centers[k] + centers[k + 1]) / 2))
    caps = []
    for cap, k, sign in ((cap0, 0, -1), (cap1, n - 1, 1)):
        if cap is None:
            continue
        ring = rings[k]
        tip = bm.verts.new(centers[k] + dirs[k] * (sign * cap))
        for i in range(len(ring) - (0 if closed else 1)):
            j = (i + 1) % len(ring)
            try:
                fc = bm.faces.new((ring[i], ring[j], tip))
            except ValueError:
                continue
            caps.append((fc, dirs[k] * sign))
    bm.normal_update()
    if orient == 'auto':
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    elif not isinstance(orient, str):
        v = Vector(orient)
        for fc in bm.faces:
            if fc.normal.dot(v) < 0:
                fc.normal_flip()
    else:
        for fc, c in faces:
            if fc.normal.dot(fc.calc_center_median() - c) < 0:
                fc.normal_flip()
        for fc, d in caps:
            if fc.normal.dot(d) < 0:
                fc.normal_flip()
    from . import mesh as _m
    return _m.obj_from_bm(name, bm, coll)


def tube(name, pts, radii, segs=8, cap0=0.0, cap1=0.0, fwd=FRONT, rf=None):
    """Rohr durch Punkte (Werkzeugstiele, Riemen, Schaefte); radii je Punkt oder eine Zahl; rf = Tiefe/Breite-Verhaeltnis"""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    secs = [Sec(p, r, r * (rf or 1.0), r * (rf or 1.0)) for p, r in zip(pts, radii)]
    return loft(name, secs, segs=segs, cap0=cap0, cap1=cap1, fwd=fwd)


def blob(name, c, r, segs=8, rings=5, fwd=FRONT):
    """Ellipsoid (Ohren, Beutel, Knaeufe): r = (rx, ry, rz)"""
    c = Vector(c)
    secs = []
    for k in range(rings):
        a = math.pi * (k + 1) / (rings + 1)
        z = -math.cos(a) * r[2]
        s = math.sin(a)
        secs.append(Sec(c + Vector((0, 0, z)), r[0] * s, r[1] * s, r[1] * s))
    tip = r[2] * (1 - math.cos(math.pi / (rings + 1)))
    return loft(name, secs, segs=segs, cap0=tip, cap1=tip, fwd=fwd)


def cut(obj, pred):
    """Flaechen loeschen, deren Mittelpunkt pred(Vector) erfuellt (Gesichtsoeffnung in Kapuze/Kettenhaube)"""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = [f for f in bm.faces if pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def split_z(obj, z, name_lo, name_hi):
    """Objekt an der Hoehe z teilen (Flaechen nach Mittelpunkt): (unten, oben) - z. B. Kragen statisch, Kapuze am Kopf"""
    lo = obj
    hi = bpy.data.objects.new(name_hi, obj.data.copy())
    scene.link(hi, obj.users_collection[0] if obj.users_collection else None)
    lo.name = name_lo
    cut(lo, lambda c: c.z > z)
    cut(hi, lambda c: c.z <= z)
    return lo, hi


def mirror_x(obj, name):
    """Gespiegelte Kopie an der YZ-Ebene (linke Seite aus der rechten)"""
    me = obj.data.copy()
    me.name = name
    for v in me.vertices:
        v.co.x = -v.co.x
    me.flip_normals()
    ob = bpy.data.objects.new(name, me)
    scene.link(ob, obj.users_collection[0] if obj.users_collection else None)
    return ob


def translate(obj, v):
    v = Vector(v)
    for p in obj.data.vertices:
        p.co += v
    obj.data.update()
    return obj


def rotate(obj, axis, angle, center=(0, 0, 0)):
    from mathutils import Matrix
    c = Vector(center)
    m = Matrix.Rotation(angle, 3, axis)
    for p in obj.data.vertices:
        p.co = c + m @ (p.co - c)
    obj.data.update()
    return obj


# ---------------------------------------------------------------------------------------------------------------- Formfunktionen
def folds(n=7, amp=0.05, power=1.6, phase=0.0, skew=0.0):
    """Faltenwurf: radiale Wellen, nach unten (t -> 1) staerker; skew verschiebt die Falten je Querschnitt"""
    def fn(th, k, t):
        return 1.0 + amp * (t ** power) * math.sin(n * th + phase + skew * t)
    return fn


def quilt(n=10, depth=0.045, base=None):
    """Steppnaehte (senkrechte Kammern): Rillen in regelmaessigen Winkelabstaenden (Gambeson)"""
    def fn(th, k, t):
        c = 0.5 + 0.5 * math.cos(n * th)
        f = 1.0 - depth * (1.0 - c) ** 2
        if base is not None:
            b = base(th, k, t)
            if isinstance(b, tuple):
                return (b[0] * f, b[1])
            f *= b
        return f
    return fn


def chain(*fns):
    def fn(th, k, t):
        f = 1.0
        off = Vector((0, 0, 0))
        for g in fns:
            r = g(th, k, t)
            if isinstance(r, tuple):
                f *= r[0]
                off += Vector(r[1])
            else:
                f *= r
        return (f, off)
    return fn


# ---------------------------------------------------------------------------------------------------------------- Registrierung
class Fig:
    """Sammelt die Teile einer Figur je LOD und reicht sie mit allen Attributen an asset.Asset.add weiter."""

    def __init__(self, A, lod):
        self.A = A
        self.L = lod
        self.n = 0

    def name(self, base):
        self.n += 1
        return f'{base}.L{self.L}'

    def add(self, obj, mat, cls=FIXED, part=None, pivot=None, mask=0, slot=0, arm=None, team=False, up=UPPER, smooth=55.0,
            uv='box', dirt=None, wear=None, rough=None):
        obj.name = f'{obj.name}.L{self.L}' if not obj.name.endswith(f'.L{self.L}') else obj.name
        # Stoff in LOD0: leichte Unregelmaessigkeit (Knitter, ~1,5 mm), damit die Flaechen nicht wie Plastik wirken
        if rough is None:
            rough = 0.0015 if (self.L == 0 and mat and mat.startswith('M_Cloth')) else 0.0
        if rough > 0:
            from . import mesh as _mesh
            _mesh.displace(obj, amount=rough, scale=26.0, seed=self.n)
            self.n += 1
        obj['sp_style'] = (float(cls), float(mask), float(up), float(slot))
        if arm is not None:
            obj['sp_arm'] = float(arm)
        self.A.add(obj, mat=mat, uv_mode=uv, part=part, pivot=pivot, team=team, only=self.L, smooth=smooth,
                   dirt=0.45 if dirt is None else dirt, wear=0.6 if wear is None else wear,
                   uv_space='object')
        return obj


def variant_key(obj):
    """(Maske ohne Nah/Fern/Detail, Slot) eines Quellobjekts; (0, 0) = gemeinsamer Koerper"""
    st = obj.get('sp_style')
    if st is None:
        return (0, 0)
    mask = int(st[1]) & ~(VIS['Near'] | VIS['Far'] | VIS['Detail'])
    slot = int(st[3]) if len(st) > 3 else 0
    return (mask, slot)


def visible(obj, bits, jobbit):
    """Sichtbarkeit wie im Shader: alle Maskenbits an der Instanz gesetzt und (Slot 0 oder Slot & Berufsbit)"""
    st = obj.get('sp_style')
    if st is None:
        return True
    mask = int(st[1])
    slot = int(st[3]) if len(st) > 3 else 0
    if (bits & mask) != mask:
        return False
    return slot == 0 or (slot & jobbit) != 0
