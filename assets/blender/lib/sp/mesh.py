"""Modellier-Hilfen (bmesh, ohne Operator-Kontext): gefaste Quader, Balken zwischen Punkten, Zylinder/Ringe, Prismen,
unregelmaessige Steine, Rausch-Verschiebung, Glaettung mit harten Kanten. Alles in Blender-Koordinaten (Z oben)."""
import math
import random

import bmesh
import bpy
import mathutils
from mathutils import Matrix, Vector
from mathutils import noise

from . import scene


def obj_from_bm(name, bm, coll=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.link(ob, coll)
    return ob


def _bevel(bm, width, segments=1, edges=None):
    if width <= 0:
        return
    bmesh.ops.bevel(bm, geom=list(edges if edges is not None else bm.edges), offset=width, offset_type='OFFSET', segments=segments, profile=0.5, affect='EDGES', clamp_overlap=True)


def box(name, size, loc=(0, 0, 0), bevel=0.0, segments=1, rot=(0, 0, 0), origin='bottom', coll=None):
    """Quader (Kantenmasse size = (x, y, z)), optional gefast. origin='bottom': loc ist die Mitte der Unterseite."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if origin == 'bottom':
        bmesh.ops.translate(bm, vec=Vector((0, 0, size[2] / 2)), verts=bm.verts)
    _bevel(bm, bevel, segments)
    m = Matrix.LocRotScale(Vector(loc), mathutils.Euler(rot).to_quaternion(), None)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def beam(name, p0, p1, w, h=None, bevel=0.0, up=(0, 0, 1), twist=0.0, coll=None):
    """Balken mit Querschnitt w x h von p0 nach p1 (Laengsachse = lokale X-Achse; Holzmaserung per uv.box(space='object'))."""
    h = h if h is not None else w
    a, b = Vector(p0), Vector(p1)
    d = b - a
    L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((L, w, h)), verts=bm.verts)
    _bevel(bm, bevel)
    x = d.normalized()
    u = Vector(up)
    if abs(x.dot(u)) > 0.98:
        u = Vector((0, 1, 0)) if abs(x.y) < 0.9 else Vector((1, 0, 0))
    y = u.cross(x).normalized()
    z = x.cross(y).normalized()
    rot = Matrix((x, y, z)).transposed().to_4x4()
    if twist:
        rot = rot @ Matrix.Rotation(twist, 4, 'X')
    m = Matrix.Translation((a + b) / 2) @ rot
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def cylinder(name, r, depth, segs=12, loc=(0, 0, 0), r_top=None, cap=True, axis='Z', bevel=0.0, coll=None):
    """Zylinder/Kegelstumpf, Unterseite bei loc (axis='Z'), sonst entlang X/Y um loc zentriert."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r if r_top is None else r_top, depth=depth)
    if axis == 'Z':
        bmesh.ops.translate(bm, vec=Vector((0, 0, depth / 2)), verts=bm.verts)
    elif axis == 'X':
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=bm.verts)
    elif axis == 'Y':
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=bm.verts)
    if bevel > 0:
        _bevel(bm, bevel, edges=[e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6])
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def ring(name, r_in, r_out, h, segs=24, loc=(0, 0, 0), coll=None):
    """Hohlzylinder (Brunnenkranz, Fassreifen)"""
    bm = bmesh.new()
    outer, inner = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c, s = math.cos(a), math.sin(a)
        outer.append((bm.verts.new((c * r_out, s * r_out, 0)), bm.verts.new((c * r_out, s * r_out, h))))
        inner.append((bm.verts.new((c * r_in, s * r_in, 0)), bm.verts.new((c * r_in, s * r_in, h))))
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((outer[i][0], outer[j][0], outer[j][1], outer[i][1]))
        bm.faces.new((inner[j][0], inner[i][0], inner[i][1], inner[j][1]))
        bm.faces.new((outer[i][1], outer[j][1], inner[j][1], inner[i][1]))
        bm.faces.new((inner[i][0], inner[j][0], outer[j][0], outer[i][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def prism(name, pts, depth, loc=(0, 0, 0), plane='XZ', coll=None):
    """Prisma aus einem Polygon (Giebel, Boegen): pts in der Ebene plane ('XZ': x, z), extrudiert entlang Y um depth (zentriert)."""
    bm = bmesh.new()
    vs0, vs1 = [], []
    for (u, v) in pts:
        if plane == 'XZ':
            vs0.append(bm.verts.new((u, -depth / 2, v)))
            vs1.append(bm.verts.new((u, depth / 2, v)))
        else:  # 'YZ'
            vs0.append(bm.verts.new((-depth / 2, u, v)))
            vs1.append(bm.verts.new((depth / 2, u, v)))
    n = len(pts)
    bm.faces.new(vs0)
    bm.faces.new(list(reversed(vs1)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def stone(name, size, loc=(0, 0, 0), seed=0, rough=0.18, subdiv=1, rot_z=0.0, bevel=0.25, coll=None):
    """Unregelmaessiger Stein (Bruch-/Feldstein): gefaster Quader, unterteilt, mit Rauschen verformt. size = (x, y, z)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    _bevel(bm, bevel, segments=1)
    if subdiv:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=subdiv, use_grid_fill=True)
    off = Vector((rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50)))
    for v in bm.verts:
        p = v.co
        n = noise.noise_vector(p * 2.1 + off)
        v.co = p + n * rough + p * (rnd.uniform(-0.04, 0.04))
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return obj_from_bm(name, bm, coll)


def displace(obj, amount=0.02, scale=4.0, seed=0, axis_mask=(1, 1, 1)):
    """Rauschverschiebung entlang der Vertexnormalen (Holzverzug, unebene Waende). Vor uv.box() aufrufen."""
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    me = obj.data
    me.update()
    for v in me.vertices:
        n = noise.noise(v.co * scale + off)
        d = v.normal * (n * amount)
        v.co += Vector((d.x * axis_mask[0], d.y * axis_mask[1], d.z * axis_mask[2]))
    me.update()
    return obj


def sag(obj, amount=0.03, axis='X'):
    """Leichtes Durchhaengen entlang einer Achse (alte Balken, Dachfirste): Mitte sinkt um amount."""
    me = obj.data
    xs = [getattr(v.co, axis.lower()) for v in me.vertices]
    lo, hi = min(xs), max(xs)
    span = max(1e-6, hi - lo)
    for v in me.vertices:
        t = (getattr(v.co, axis.lower()) - lo) / span
        v.co.z -= amount * math.sin(math.pi * t)
    me.update()
    return obj


def join(objs, name):
    """Objekte zu einem verbinden (Materialien bleiben je Flaeche erhalten). Rueckgabe: das verbundene Objekt."""
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    target = objs[0]
    with bpy.context.temp_override(active_object=target, selected_editable_objects=objs, selected_objects=objs, object=target):
        bpy.ops.object.join()
    target.name = name
    return target


def shade(obj, angle_deg=35.0):
    """Glatt schattieren, Kanten ueber angle_deg hart (der glTF-Exporter teilt dort die Normalen)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            e.smooth = False
        else:
            e.smooth = e.calc_face_angle(0.0) < lim
    bm.to_mesh(me)
    bm.free()
    me.update()
    return obj


def flat(obj):
    """Flach schattiert (alle Kanten hart) - fuer sehr kleine/kantige Teile"""
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def tris(obj):
    """Dreiecke des ausgewerteten Meshes (Modifikatoren angewandt)"""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    ev.to_mesh_clear()
    return n
