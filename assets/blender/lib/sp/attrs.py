"""Vertexattribute fuer die Laufzeit: Bauanimation (_BUILD/_BUILDH), Teile/Drehpunkte (_PART/_PIVOT), Figuren (_STYLE/_ARM)
und die Datenfarbe COLOR_0 ('Data': R AO, G Schmutz, B Kantenabnutzung, A Teamfarbe).

Objekt-Eigenschaften (Custom Properties), die der Asset-Autor setzt (alle optional):
  sp_part   : Teilname aus config.PART ('door', 'cloth', 'sail', ...) oder Zahl  -> Vertex-Animation im Shader
  sp_pivot  : Drehpunkt (Blender-Koordinaten, Welt)                           -> _PIVOT
  sp_build  : (s0, s1) Bauzeitfenster 0..1; ohne Angabe automatisch nach Hoehe (wie builder.ts)
  sp_team   : 1 = Spielerfarbe (Fahnen, Banner, Wappen)
  sp_dirt   : Faktor fuer den Schmutz (Standard 1; 0 = sauber, z. B. Metall)
  sp_wear   : Faktor fuer die Kantenabnutzung (Standard 1)
  sp_grime  : Mindest-Schmutz 0..1 (Standard 0), z. B. Lehmflecken/abgeplatzter Putz, Russ am Ofenloch.
              Je Vertex: Float-Attribut 'sp_grime' (Domaene POINT) am Mesh (Verwitterung/Moos auf Daechern, Russfahnen);
              es wird mit der Objekt-Eigenschaft per max() verknuepft und nicht exportiert.
  sp_style  : (Farbklasse, Sichtbarkeitsmaske, Hueft-/Oberkoerperhoehe, Slot) nur Figuren -> _STYLE (vec3) + _SLOT
  sp_arm    : Armstil (unit_shader.ts ARM) nur Figuren -> _ARM
"""
import math

import bmesh
from mathutils import Vector
from mathutils import noise

from . import config


def _attr(me, name, kind, domain='POINT'):
    a = me.attributes.get(name)
    if a is not None and (a.data_type != kind or a.domain != domain):
        me.attributes.remove(a)
        a = None
    return a or me.attributes.new(name, kind, domain)


def part_id(obj):
    p = obj.get('sp_part', 0)
    if isinstance(p, str):
        return float(config.PART[p])
    return float(p)


def build_window(y0, h, H, override=None):
    """Bauzeitfenster eines Teils (wie builder.ts Acc.geometry): tiefer liegende Teile zuerst, Dach zuletzt"""
    if override is not None:
        return float(override[0]), float(override[1])
    H = max(H, 1e-3)
    s0 = config.AUTO_LO + config.AUTO_SPAN * min(1.0, max(0.0, y0) / H)
    s1 = config.AUTO_LO + config.AUTO_SPAN * min(1.0, max(0.0, y0 + h) / H)
    return s0, max(s0 + 0.04, s1)


def write_part(obj, src, H, parts=True):
    """Schreibt _BUILD/_BUILDH/_PART/_PIVOT (+ _STYLE/_ARM bei Figuren) auf `obj` (Mesh bereits in Asset-Koordinaten).
    `src` ist das Quellobjekt (traegt die sp_*-Eigenschaften), H die Gesamthoehe des Assets. parts=False: _PART/_PIVOT
    weglassen (Asset ohne bewegte Teile; die Laufzeit setzt dann Teil 0 = statisch, spart 16 Byte je Vertex)."""
    me = obj.data
    zs = [v.co.z for v in me.vertices] or [0.0]
    y0, y1 = min(zs), max(zs)
    h = max(1e-4, y1 - y0)
    ov = src.get('sp_build')
    s0, s1 = build_window(y0, h, H, tuple(ov) if ov is not None else None)
    b = _attr(me, config.ATTR_BUILD, 'FLOAT_VECTOR')
    bh = _attr(me, config.ATTR_BUILDH, 'FLOAT')
    n = len(me.vertices)
    b.data.foreach_set('vector', [s0, s1, y0] * n)
    bh.data.foreach_set('value', [h] * n)
    if parts:
        pa = _attr(me, config.ATTR_PART, 'FLOAT')
        pv = _attr(me, config.ATTR_PIVOT, 'FLOAT_VECTOR')
        pa.data.foreach_set('value', [part_id(src)] * n)
        pv.data.foreach_set('vector', list(config.to_gltf(tuple(src.get('sp_pivot', (0.0, 0.0, 0.0))))) * n)
    if src.get('sp_style') is not None:
        sv = list(src['sp_style']) + [0.0] * 4
        st = _attr(me, config.ATTR_STYLE, 'FLOAT_VECTOR')
        st.data.foreach_set('vector', sv[:3] * n)
        sl = _attr(me, config.ATTR_SLOT, 'FLOAT')
        sl.data.foreach_set('value', [float(sv[3])] * n)
    if src.get('sp_arm') is not None:
        ar = _attr(me, config.ATTR_ARM, 'FLOAT')
        ar.data.foreach_set('value', [float(src['sp_arm'])] * n)
    return (s0, s1, y0, h)


def init_data(obj, src):
    """Datenfarbe anlegen: AO 1, Schmutz/Abnutzung 0 (werden in bake.py gefuellt), Teamfarbe aus sp_team.
    Faktoren sp_dirt/sp_wear landen voruebergehend in einem Hilfsattribut (wird beim Export entfernt)."""
    me = obj.data
    c = me.color_attributes.get(config.DATA_COLOR)
    if c is None:
        c = me.color_attributes.new(config.DATA_COLOR, 'FLOAT_COLOR', 'CORNER')
    team = 1.0 if src.get('sp_team') else 0.0
    c.data.foreach_set('color', [1.0, 0.0, 0.0, team] * len(c.data))
    me.color_attributes.active_color = c
    n = len(me.vertices)
    g0 = float(src.get('sp_grime', 0.0))
    gv = me.attributes.get('sp_grime')
    grime = [g0] * n
    if gv is not None and gv.domain == 'POINT' and gv.data_type == 'FLOAT' and len(gv.data) == n:
        vals = [0.0] * n
        gv.data.foreach_get('value', vals)
        grime = [max(g0, v) for v in vals]
    f = _attr(me, '_spfac', 'FLOAT_VECTOR')
    vec = []
    dd, ww = float(src.get('sp_dirt', 1.0)), float(src.get('sp_wear', 1.0))
    for g in grime:
        vec += (dd, ww, g)
    f.data.foreach_set('vector', vec)
    return c


def _smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def fill_dirt_wear(obj, ground_h=0.55, seed=0, mirror_y=False):
    """Schmutz (G) und Kantenabnutzung (B) aus Geometrie: Spritzzone am Boden, Hohlraeume (aus dem AO-Kanal), Rauschen;
    Abnutzung an konvexen Kanten. Benoetigt die bereits gebackene AO im Kanal R.
    mirror_y: Rauschen mit |y| statt y auswerten (Mauerstuecke, die gedreht aneinanderstossen: gleiche Werte an den Stoessen)."""
    me = obj.data
    c = me.color_attributes[config.DATA_COLOR]
    fac = me.attributes.get('_spfac')
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    convex = [0.0] * len(bm.verts)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        a = e.calc_face_angle_signed(0.0)
        k = _smooth(0.35, 1.3, a)
        for v in e.verts:
            convex[v.index] = max(convex[v.index], k)
    bm.free()
    off = Vector((seed * 3.7 + 11.0, seed * 1.3 + 5.0, 2.0))
    cols = [0.0] * (len(c.data) * 4)
    c.data.foreach_get('color', cols)
    for li, loop in enumerate(me.loops):
        vi = loop.vertex_index
        co = me.vertices[vi].co
        if mirror_y:
            co = Vector((co.x, abs(co.y), co.z))
        ao = cols[li * 4]
        n1 = noise.noise(co * 3.0 + off) * 0.5 + 0.5
        n2 = noise.noise(co * 11.0 + off * 2.0) * 0.5 + 0.5
        fd, fw, fg = (fac.data[vi].vector[0], fac.data[vi].vector[1], fac.data[vi].vector[2]) if fac else (1.0, 1.0, 0.0)
        ground = (1.0 - _smooth(0.0, ground_h, co.z)) * (0.55 + 0.45 * n1)
        cavity = _smooth(0.92, 0.45, ao) * 0.7
        streak = _smooth(0.55, 0.85, n1) * 0.18
        dirt = min(1.0, (ground * 0.8 + cavity + streak) * (0.75 + 0.5 * n2)) * fd
        dirt = max(dirt, fg * (0.8 + 0.2 * n1))
        wear = min(1.0, convex[vi] * (0.35 + 0.65 * _smooth(0.35, 0.75, n2))) * fw
        cols[li * 4 + 1] = dirt
        cols[li * 4 + 2] = wear
    c.data.foreach_set('color', cols)
    me.update()


def strip_helpers(obj):
    for name in ('_spfac', 'sp_grime'):
        a = obj.data.attributes.get(name)
        if a is not None:
            obj.data.attributes.remove(a)
