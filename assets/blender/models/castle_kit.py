"""Bausteine der Burgarchitektur (Bergfried, Mauerstuecke, Steintor) auf Basis der Pipeline-Bibliothek `sp`.

Kein eigenes Asset: wird von keep.py, wall_high_*.py und gate_stone.py importiert. Alles in Blender-Koordinaten
(Z oben, Vorderseite -Y). Fassadenelemente (Fenster, Tueren, Scharten, Konsolen) werden in einem kanonischen Rahmen
erzeugt - Wandebene y = -d, Aussenseite -Y, Fassaden-Achse u = +X - und danach mit `on_face` um die Hochachse auf die
gewuenschte Seite gedreht ('S' = Front -Y, 'E' = +X, 'N' = +Y, 'W' = -X; u laeuft von aussen gesehen nach rechts).

Werkzeuge:
  grid_cut      Mesh in ein Raster schneiden (Vertexdichte fuer gebackene AO/Schmutz, Unebenheiten)
  boolean       exakte Boolesche Differenz (Fensternischen, Ruestloecher), Materialien der Schneidkoerper uebernommen
  block         unregelmaessiger, gefaster Werkstein
  quoins        Eckquader (Laeufer/Binder im Wechsel)
  arch_opening  Rundbogenoeffnung: Schneidkoerper + Gewaendesteine + Keilsteine (+ Sohlbank)
  slit          Schiessscharte mit Werksteinrahmen
  corbel        Kragstein mit Stufenprofil
  shingle_*     Schindeldeckung in Lagen (Zeltdach, Kegeldach, Pultdach)
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils import noise

from sp import materials, mesh, scene, uv

FACE_ANG = {'S': 0.0, 'E': math.pi / 2, 'N': math.pi, 'W': -math.pi / 2}


# ---------------------------------------------------------------------------------------------------------------- Transformationen

def xform(obj, m):
    obj.data.transform(m)
    obj.data.update()
    return obj


def rot_z(obj, ang, center=(0.0, 0.0, 0.0)):
    if abs(ang) < 1e-12:
        return obj
    c = Vector(center)
    return xform(obj, Matrix.Translation(c) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation(-c))


def move(obj, v):
    return xform(obj, Matrix.Translation(Vector(v)))


def on_face(objs, face, center=(0.0, 0.0, 0.0)):
    """Im kanonischen Rahmen (Front -Y) gebaute Objekte auf die Seite `face` drehen."""
    ang = FACE_ANG[face] if isinstance(face, str) else float(face)
    out = []
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        if o is not None:
            rot_z(o, ang, center)
            out.append(o)
    return out


def mirror_x(obj):
    xform(obj, Matrix.Scale(-1, 4, Vector((1, 0, 0))))
    obj.data.flip_normals()
    return obj


# ---------------------------------------------------------------------------------------------------------------- Mesh-Werkzeuge

def grid_cut(obj, cell=0.3, axes='xyz', jitter=0.0, seed=0):
    """Schneidet das Mesh mit Ebenen im Abstand ~cell (je Achse) - mehr Vertices fuer gebackene AO, Schmutz und Unebenheiten."""
    rnd = random.Random(seed)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for ax in axes:
        i = 'xyz'.index(ax)
        lo = min(v.co[i] for v in bm.verts)
        hi = max(v.co[i] for v in bm.verts)
        n = int(round((hi - lo) / cell))
        if n < 2:
            continue
        no = Vector((1.0 if i == 0 else 0.0, 1.0 if i == 1 else 0.0, 1.0 if i == 2 else 0.0))
        for k in range(1, n):
            co = lo + (hi - lo) * (k + rnd.uniform(-jitter, jitter)) / n
            p = Vector((0, 0, 0))
            p[i] = co
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=p, plane_no=no)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return obj


def apply_mods(obj):
    """Modifikatoren anwenden (ohne Operator-Kontext)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def boolean(obj, cutters, op='DIFFERENCE'):
    """Exakte Boolesche Operation mit allen Schneidkoerpern; die neuen Flaechen erben deren Material. Schneidkoerper werden geloescht."""
    cutters = [c for c in cutters if c is not None]
    if not cutters:
        return obj
    coll = bpy.data.collections.new('_sp_cut')
    bpy.context.scene.collection.children.link(coll)
    for c in cutters:
        for uc in list(c.users_collection):
            uc.objects.unlink(c)
        coll.objects.link(c)
    m = obj.modifiers.new('cut', 'BOOLEAN')
    m.operation = op
    m.operand_type = 'COLLECTION'
    m.collection = coll
    m.solver = 'EXACT'
    try:
        m.material_mode = 'TRANSFER'
    except (AttributeError, TypeError):
        pass
    apply_mods(obj)
    for c in cutters:
        me = c.data
        bpy.data.objects.remove(c)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    bpy.data.collections.remove(coll)
    return obj


def mat(obj, name):
    """Material setzen und Objekt zurueckgeben (fuer Schneidkoerper/Teile vor dem Zusammenfuegen)."""
    materials.assign(obj, name)
    return obj


def ensure_mats(obj, names):
    """Materialliste eines Objekts um diese Bibliotheksmaterialien ergaenzen; Rueckgabe: Index je Name."""
    me = obj.data
    idx = {}
    for n in names:
        m = materials.get(n)
        if m.name not in [x.name for x in me.materials if x]:
            me.materials.append(m)
        idx[n] = [x.name if x else None for x in me.materials].index(m.name)
    return idx


def wobble(obj, amount=0.01, scale=1.6, seed=0, fade=None):
    """Grossflaechige Unebenheit entlang der Vertexnormalen (Mauerbauch, Setzungen). fade(co) -> 0..1 daempft (Stoesse)."""
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    me = obj.data
    me.update()
    for v in me.vertices:
        n = noise.noise(v.co * scale + off) + 0.35 * noise.noise(v.co * scale * 3.1 + off * 1.7)
        f = 1.0 if fade is None else fade(v.co)
        v.co += v.normal * (n * amount * f)
    me.update()
    return obj


def finish_uv(obj, tile=None, space='world', along=None):
    uv.box(obj, tile=tile, space=space, along=along)
    return obj


# ---------------------------------------------------------------------------------------------------------------- Grundformen

def block(name, size, center, rnd, rough=0.025, bevel=0.12, rot=0.0):
    """Werkstein: gefaster Quader mit leichter Unregelmaessigkeit (size = x, y, z; center = Mitte)."""
    return mesh.stone(name, size, loc=center, seed=rnd.randrange(1 << 20), rough=rough, subdiv=0, rot_z=rot, bevel=bevel)


def frustum(name, hx0, hy0, hx1, hy1, z0, z1, loc=(0.0, 0.0)):
    """Pyramidenstumpf (Sockel mit Anlauf/Boeschung): halbe Breiten unten (hx0, hy0), oben (hx1, hy1)."""
    bm = bmesh.new()
    x, y = loc
    lo = [bm.verts.new((x + sx * hx0, y + sy * hy0, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    hi = [bm.verts.new((x + sx * hx1, y + sy * hy1, z1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def ring_box(name, ho, hi, z0, z1, loc=(0.0, 0.0)):
    """Quadratischer Ring (Bruestung um eine Plattform): Aussen-/Innenhalbbreite ho/hi (je (x, y))."""
    o = mesh.box(name, (2 * ho[0], 2 * ho[1], z1 - z0), loc=(loc[0], loc[1], z0))
    i = mesh.box(name + '_in', (2 * hi[0], 2 * hi[1], z1 - z0 + 0.2), loc=(loc[0], loc[1], z0 - 0.1))
    return boolean(o, [i])


def quoins(name, cx, cy, sx, sy, z0, z1, rnd, course=0.24, long=0.46, short=0.27, proud=0.022, joint=0.012, depth=None):
    """Eckquader an der Aussenecke (cx, cy) mit Aussenrichtungen (sx, sy): Laeufer und Binder im Wechsel. Rueckgabe: ein Objekt."""
    stones = []
    z = z0
    k = int(rnd.random() * 2)
    while z < z1 - 0.04:
        h = course * rnd.uniform(0.86, 1.14)
        if z1 - (z + h) < course * 0.55:
            h = z1 - z
        lx, ly = (long, short) if k % 2 == 0 else (short, long)
        lx *= rnd.uniform(0.86, 1.12)
        ly *= rnd.uniform(0.86, 1.12)
        p = proud + rnd.uniform(-0.007, 0.008)
        x_out, x_in = cx + sx * p, cx - sx * lx
        y_out, y_in = cy + sy * p, cy - sy * ly
        if depth is not None:
            x_in = cx - sx * max(lx if k % 2 == 0 else depth, 0.05)
        s = block(f'{name}_{k}', (abs(x_out - x_in), abs(y_out - y_in), h - joint), ((x_out + x_in) / 2, (y_out + y_in) / 2, z + h / 2), rnd,
                  rough=0.03, bevel=0.1)
        stones.append(s)
        z += h
        k += 1
    return mesh.join(stones, name)


def quoin_proxy(name, cx, cy, sx, sy, z0, z1, course=0.24, long=0.46, short=0.27, proud=0.02):
    """Ersatzform fuer LOD1: Eckquader als ungefaste Bloecke (gleicher Wechsel, 12 Dreiecke je Stein)."""
    stones = []
    z = z0
    k = 0
    while z < z1 - 0.04:
        h = min(course, z1 - z)
        lx, ly = (long, short) if k % 2 == 0 else (short, long)
        x_out, x_in = cx + sx * proud, cx - sx * lx
        y_out, y_in = cy + sy * proud, cy - sy * ly
        stones.append(mesh.box(f'{name}_{k}', (abs(x_out - x_in), abs(y_out - y_in), h - 0.01), loc=((x_out + x_in) / 2, (y_out + y_in) / 2, z)))
        z += h
        k += 1
    return mesh.join(stones, name)


# ---------------------------------------------------------------------------------------------------------------- Fassadenelemente (kanonisch: Wandebene y = -d, aussen -Y)

def _prism_xz(name, pts, y0, y1):
    """Prisma aus einem Umriss in der XZ-Ebene, von y0 (aussen) bis y1 (innen)."""
    o = mesh.prism(name, pts, abs(y1 - y0), loc=(0, (y0 + y1) / 2, 0), plane='XZ')
    return o


def arch_outline(u, z0, w, h, segs=8):
    """Rundbogen-Umriss (u Mitte, z0 Unterkante, Breite w, Gesamthoehe h) gegen den Uhrzeigersinn ab unten links."""
    r = w / 2
    zc = z0 + h - r
    pts = [(u - r, z0), (u + r, z0)]
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((u + r * math.cos(a), zc + r * math.sin(a)))
    return pts


def arch_opening(name, u, z0, w, h, d, rnd, depth=0.22, ring=0.1, proud=0.025, n_vouss=7, jamb=True, sill=True, cut_mat='M_Stone_Ashlar',
                 stone_mat='M_Stone_Ashlar', segs=8, back=None, back_mat='M_Wood_Planks', key=True):
    """Rundbogenoeffnung in einer Wand (Ebene y = -d). Rueckgabe: (Schneidkoerper, [Werksteine], [Rueckwand/Laden]).
    Gewaende: Steine im Wechsel schmal/breit, Bogen aus Keilsteinen (Schlussstein etwas hoeher), Sohlbank darunter."""
    yo = -d - proud
    r = w / 2
    zc = z0 + h - r
    cutter = _prism_xz(name + '_cut', arch_outline(u, z0, w, h, segs), -d - 0.3, -d + depth)
    mat(cutter, cut_mat)
    stones = []
    # Keilsteine
    for i in range(n_vouss):
        a0 = math.pi * i / n_vouss + 0.012
        a1 = math.pi * (i + 1) / n_vouss - 0.012
        R = r + ring * (1.25 if (key and i == n_vouss // 2) else rnd.uniform(0.9, 1.1))
        pts = [(u + r * math.cos(a0), zc + r * math.sin(a0)), (u + R * math.cos(a0), zc + R * math.sin(a0)),
               (u + R * math.cos(a1), zc + R * math.sin(a1)), (u + r * math.cos(a1), zc + r * math.sin(a1))]
        pts = list(reversed(pts))
        v = _prism_xz(f'{name}_v{i}', pts, yo + rnd.uniform(-0.004, 0.006), -d + 0.06)
        stones.append(v)
    # Gewaendesteine
    if jamb:
        for side in (-1, 1):
            z = z0 if not sill else z0
            k = int(rnd.random() * 2)
            while z < zc - 0.02:
                hh = min(zc - z, rnd.uniform(0.17, 0.26))
                if zc - (z + hh) < 0.08:
                    hh = zc - z
                jw = ring * (1.35 if k % 2 == 0 else 0.85) * rnd.uniform(0.92, 1.08)
                x0 = u + side * r
                x1 = u + side * (r + jw)
                p = proud + rnd.uniform(-0.004, 0.006)
                stones.append(mesh.box(f'{name}_j{side}_{k}', (abs(x1 - x0), d * 0 + p + 0.06, hh - 0.008), loc=((x0 + x1) / 2, -d - p + (p + 0.06) / 2, z + 0.004)))
                z += hh
                k += 1
    if sill:
        sw = w + 2 * ring + 0.08
        stones.append(cap_slab(name + '_sill', u - sw / 2, u + sw / 2, -d - proud - 0.03, -d + 0.07, z0 - 0.075, 0.075, ch=0.015))
    backs = []
    if back is not None:
        # Fensterladen/Tuerblatt in der Nische (Bohlen)
        b = _prism_xz(name + '_back', arch_outline(u, z0, w, h, segs), -d + depth - back, -d + depth + 0.01)
        mat(b, back_mat)
        backs.append(b)
    for s in stones:
        mat(s, stone_mat)
    return cutter, stones, backs


def slit(name, u, z0, h, d, rnd, w=0.055, depth=0.3, frame=0.07, proud=0.02, stone_mat='M_Stone_Ashlar', cross=False):
    """Schiessscharte: schmaler Schlitz mit zwei hohen Gewaendesteinen, Sturz und Sohlstein (optional Kreuzscharte)."""
    cutter = mesh.box(name + '_cut', (w, 0.3 + depth, h), loc=(u, -d - 0.3 + (0.3 + depth) / 2, z0))
    mat(cutter, 'M_Stone_Rubble')
    parts = [cutter]
    if cross:
        c2 = mesh.box(name + '_cut2', (w * 3.2, 0.3 + depth, w * 0.9), loc=(u, -d - 0.3 + (0.3 + depth) / 2, z0 + h * 0.55))
        mat(c2, 'M_Stone_Rubble')
        parts.append(c2)
    st = []
    for side in (-1, 1):
        x0 = u + side * w / 2
        x1 = u + side * (w / 2 + frame * rnd.uniform(0.9, 1.15))
        p = proud + rnd.uniform(-0.004, 0.005)
        st.append(mesh.box(f'{name}_j{side}', (abs(x1 - x0), p + 0.05, h + 0.02), loc=((x0 + x1) / 2, -d - p + (p + 0.05) / 2, z0 - 0.01)))
    fw = w + 2 * frame + 0.04
    # Sturz und Sohlstein: ungefaste Bloecke, leicht verdreht (12 Dreiecke)
    st.append(mesh.box(name + '_lintel', (fw, 0.07 + proud, 0.09), loc=(u, -d - proud / 2 + 0.01, z0 + h), rot=(0, rnd.uniform(-0.02, 0.02), 0)))
    st.append(mesh.box(name + '_sole', (fw * 0.9, 0.07 + proud, 0.07), loc=(u, -d - proud / 2 + 0.01, z0 - 0.07), rot=(0, rnd.uniform(-0.02, 0.02), 0)))
    for s in st:
        mat(s, stone_mat)
    return parts, st


def corbel(name, u, z_top, d, proj, width, rnd, steps=3, step_h=0.13):
    """Kragstein mit Stufenprofil (Konsole) unter einer vorkragenden Bruestung: unten am wenigsten ausladend."""
    pts = []
    y_in = -d + 0.05
    ys = []
    for k in range(steps):
        ys.append(-d - proj * (k + 1) / steps * rnd.uniform(0.94, 1.04))
    z = z_top - steps * step_h
    pts.append((y_in, z))
    pts.append((ys[0] + 0.03, z))
    # Unterseite der untersten Stufe leicht abgeschraegt
    pts.append((ys[0], z + step_h * 0.45))
    for k in range(steps):
        zk = z + step_h * (k + 1)
        pts.append((ys[k], zk - 0.002 if k < steps - 1 else zk))
        if k < steps - 1:
            pts.append((ys[k + 1], zk))
    pts.append((y_in, z_top))
    # Umriss in der YZ-Ebene -> Prisma entlang X
    pts2 = [(p[0], p[1]) for p in pts]
    o = mesh.prism(name, pts2, width * rnd.uniform(0.95, 1.05), loc=(u, 0, 0), plane='YZ')
    return o


# ---------------------------------------------------------------------------------------------------------------- Holzteile

def planks_leaf(name, u, z0, w, h, y, rnd, t=0.035, n=None, arch=True, segs=8):
    """Bohlentuer/Torfluegel (Bretter senkrecht, Bogen oben): Rueckgabe Liste von Brettern (Material M_Wood_Planks)."""
    n = n or max(3, int(round(w / 0.11)))
    out = []
    r = w / 2
    zc = z0 + h - r
    for i in range(n):
        x0 = u - r + w * i / n + 0.004
        x1 = u - r + w * (i + 1) / n - 0.004
        xm = (x0 + x1) / 2
        if arch:
            top = zc + math.sqrt(max(0.0, r * r - (xm - u) ** 2)) - 0.01
        else:
            top = z0 + h
        top += rnd.uniform(-0.008, 0.0)
        b = mesh.box(f'{name}_{i}', (x1 - x0, t * rnd.uniform(0.9, 1.1), top - z0), loc=(xm, y + rnd.uniform(-0.004, 0.004), z0))
        out.append(mat(b, 'M_Wood_Planks'))
    return out


def iron_bands(name, u, z_list, w, y, t=0.012, hgt=0.035):
    out = []
    for k, z in enumerate(z_list):
        b = mesh.box(f'{name}_{k}', (w, t, hgt), loc=(u, y, z))
        out.append(mat(b, 'M_Iron_Wrought'))
    return out


# ---------------------------------------------------------------------------------------------------------------- Schindeldeckung

def tent_roof(name, half, z0, rise, rows, rnd, th=0.03, lap=0.45, step=0.012, segs=14, jag=0.07, sag=0.012, hx=None):
    """Zeltdach (Pyramide) aus Schindellagen: je Lage und Seite eine Bahn mit ausgefranster Unterkante.
    half: halbe Breite an der Traufe (oder hx fuer Rechteck nicht noetig), z0: Traufhoehe, rise: Hoehe bis zur Spitze."""
    bm = bmesh.new()
    for side in range(4):
        ang = side * math.pi / 2
        R = Matrix.Rotation(ang, 3, 'Z')
        nrm = Vector((0.0, -rise, half)).normalized()
        for k in range(rows):
            t0 = k / rows
            t1 = min(1.0, (k + 1 + lap) / rows)
            off = nrm * (step * k + 0.004)
            # Unterkante: Polylinie mit Zacken (einzelne Schindeln)
            bot = []
            for i in range(segs + 1):
                s = -1 + 2 * i / segs
                tt = t0 + (rnd.uniform(-jag, jag) / rows if 0 < i < segs else 0.0)
                hh = half * (1 - tt)
                dz = -sag * (1 - s * s) * (1 - t0)
                bot.append(Vector((s * hh * (1 + 0.012), -hh, z0 + rise * tt + dz)) + off)
            hh1 = half * (1 - t1)
            top = [Vector((s * hh1, -hh1, z0 + rise * t1)) + off for s in [(-1 + 2 * i / segs) for i in range(segs + 1)]]
            vb = [bm.verts.new(R @ p) for p in bot]
            vt = [bm.verts.new(R @ p) for p in top]
            vl = [bm.verts.new(R @ (p - nrm * th)) for p in bot]
            for i in range(segs):
                bm.faces.new((vb[i], vb[i + 1], vt[i + 1], vt[i]))
                bm.faces.new((vl[i], vl[i + 1], vb[i + 1], vb[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return mesh.obj_from_bm(name, bm)


def cone_roof(name, r, z0, rise, rows, rnd, segs=12, th=0.025, lap=0.5, step=0.01, jag=0.22, center=(0.0, 0.0)):
    """Kegeldach aus Schindellagen (Rundtuerme, Scharwachttuerme)."""
    bm = bmesh.new()
    cx, cy = center
    sl = math.hypot(r, rise)
    for k in range(rows):
        t0 = k / rows
        t1 = min(1.0, (k + 1 + lap) / rows)
        bot, top, lip = [], [], []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c, s = math.cos(a), math.sin(a)
            tt = t0 + rnd.uniform(-jag, jag) / rows * (1 if k > 0 else 0.5)
            off = step * k + 0.004
            rr = r * (1 - tt) + off * rise / sl
            rt = r * (1 - t1) + off * rise / sl
            zz = z0 + rise * tt + off * r / sl
            zt = z0 + rise * t1 + off * r / sl
            bot.append(bm.verts.new((cx + c * rr, cy + s * rr, zz)))
            top.append(bm.verts.new((cx + c * rt, cy + s * rt, zt)))
            lip.append(bm.verts.new((cx + c * (rr - th * rise / sl), cy + s * (rr - th * rise / sl), zz - th * r / sl)))
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
            bm.faces.new((lip[i], lip[j], bot[j], bot[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def shed_roof(name, x0, x1, y_wall, depth, z_wall, drop, rows, rnd, th=0.022, lap=0.45, segs=6, jag=0.2):
    """Pultdach (Vordach) an einer Wand bei y_wall (Wand im +Y), faellt nach -Y um drop ueber depth."""
    bm = bmesh.new()
    nrm = Vector((0.0, -drop, depth)).normalized()
    for k in range(rows):
        t0 = k / rows
        t1 = min(1.0, (k + 1 + lap) / rows)
        off = nrm * (0.01 * k + 0.003)
        bot, top, lip = [], [], []
        for i in range(segs + 1):
            x = x0 + (x1 - x0) * i / segs
            tt = t0 + (rnd.uniform(-jag, jag) / rows if 0 < i < segs else 0)
            p = Vector((x, y_wall - depth * (1 - tt), z_wall - drop * (1 - tt))) + off
            q = Vector((x, y_wall - depth * (1 - t1), z_wall - drop * (1 - t1))) + off
            bot.append(bm.verts.new(p))
            top.append(bm.verts.new(q))
            lip.append(bm.verts.new(p - nrm * th))
        for i in range(segs):
            bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
            bm.faces.new((lip[i], lip[i + 1], bot[i + 1], bot[i]))
    return mesh.obj_from_bm(name, bm)


def cap_slab(name, x0, x1, y0, y1, z0, h, ch=0.018, over=0.0):
    """Abdeckplatte mit gefasten Oberkanten (Prisma entlang X, 20 Dreiecke): Zinnenkappen, Mauerabdeckung."""
    y0 -= over
    y1 += over
    pts = [(y0, z0), (y1, z0), (y1, z0 + h - ch), (y1 - ch, z0 + h), (y0 + ch, z0 + h), (y0, z0 + h - ch)]
    return mesh.prism(name, pts, abs(x1 - x0), loc=((x0 + x1) / 2, 0, 0), plane='YZ')


# ---------------------------------------------------------------------------------------------------------------- Mauerprofile (Stuecke entlang X)

def _subdiv_profile(pts, seg, closed=True):
    """Lange Profilkanten unterteilen (Vertexdichte fuer AO/Schmutz)."""
    out = []
    n = len(pts)
    for i in range(n if closed else n - 1):
        a = Vector(pts[i])
        b = Vector(pts[(i + 1) % n])
        k = max(1, int(round((b - a).length / seg))) if seg else 1
        for j in range(k):
            out.append(tuple(a + (b - a) * (j / k)))
    if not closed:
        out.append(tuple(pts[-1]))
    return out


def xprism(name, pts, x0, x1, xcell=0.25, seg=0.3, caps=False):
    """Offenes Prisma entlang X (ohne Stirnflaechen) aus einem geschlossenen Profil (y, z). Stirnflaechen separat (xcap):
    so entstehen an den Stoessen der Mauerstuecke keine Kanten (keine Abnutzungslinien, nahtlose Normalen)."""
    prof = _subdiv_profile(pts, seg)
    area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof)))
    if area < 0:  # gegen den Uhrzeigersinn in (y, z) -> Aussennormale (dz, -dy)
        prof = list(reversed(prof))
    nx = max(1, int(round(abs(x1 - x0) / xcell))) if xcell else 1
    xs = [x0 + (x1 - x0) * i / nx for i in range(nx + 1)]
    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, z)) for (y, z) in prof] for x in xs]
    n = len(prof)
    for i in range(nx):
        for j in range(n):
            k = (j + 1) % n
            a, b, c, d = rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]
            f = bm.faces.new((a, b, c, d))
            f.normal_update()
            dy, dz = prof[k][0] - prof[j][0], prof[k][1] - prof[j][1]
            if f.normal.dot(Vector((0.0, dz, -dy))) < 0:
                f.normal_flip()
    if caps:  # geschlossen (fuer Boolesche Schnitte; danach strip_x_ends)
        for row, sg in ((rows[0], -1 if x1 > x0 else 1), (rows[-1], 1 if x1 > x0 else -1)):
            f = bm.faces.new(row)
            f.normal_update()
            if f.normal.x * sg < 0:
                f.normal_flip()
    return mesh.obj_from_bm(name, bm)


def strip_x_ends(obj, xs, tol=1e-4):
    """Stirnflaechen (Normale +-X) in den Ebenen x in xs entfernen."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    dead = [f for f in bm.faces if abs(f.normal.x) > 0.99 and all(any(abs(v.co.x - x) < tol for x in xs) for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def inset_polygon(pts, d):
    """Polygon (y, z) um d nach innen versetzen (Gehrung an den Ecken)."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e0 = (p1 - p0).normalized()
        e1 = (p2 - p1).normalized()
        n0 = Vector((-e0.y, e0.x)) * sgn  # Innennormale (gegen den Uhrzeigersinn: links)
        n1 = Vector((-e1.y, e1.x)) * sgn
        m = (n0 + n1)
        if m.length < 1e-6:
            m = n0
        m.normalize()
        k = d / max(0.3, m.dot(n0))
        out.append(tuple(p1 + m * k))
    return out


def xcap(name, pts, x, sign, inset=0.008):
    """Stirnflaeche eines Profils bei x, Normale in Richtung sign (+1: +X). Um `inset` nach innen versetzt: die Kanten liegen
    nicht in den Aussenflaechen (sonst blitzt die Stirnflaeche am Stoss als Linie durch)."""
    if inset:
        pts = inset_polygon(pts, inset)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for (y, z) in pts]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.x * sign < 0:
        f.normal_flip()
    bmesh.ops.triangulate(bm, faces=[f])
    return mesh.obj_from_bm(name, bm)


def wall_uv(obj, tile=1.0, x_seam=0.5):
    """UVs fuer Mauerarme (x von 0 bis 0,5), die an x=0 und x=0,5 an gedrehte Instanzen stossen: auf den Seitenflaechen
    laeuft u stetig ueber beide Stoesse (u = +-(x - x_seam)/tile je Seite), v = z. Erfordert eine Kachelgroesse, deren Kehrwert
    ganzzahlig ist (tile = 1): die Wiederholung passt dann zum Kachelraster der Mauer."""
    me = obj.data
    uvl = me.uv_layers.get(uv.UV_NAME) or me.uv_layers.new(name=uv.UV_NAME)
    for p in me.polygons:
        n = p.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, abs(co.y)
            elif ay >= ax:
                u, v = (x_seam - co.x) if n.y > 0 else (co.x - x_seam), co.z
            else:
                u, v = co.y * (1 if n.x > 0 else -1), co.z
            uvl.data[li].uv = (u / tile, v / tile)
    return obj
