"""UV-Hilfen fuer kachelbare Bibliotheksmaterialien.

Texeldichte: Die UVs werden im Weltmass (Spiel-Einheiten) erzeugt und durch die Kachelgroesse `tile` des Materials
(assets/materials.json) geteilt - eine UV-Einheit = eine Texturwiederholung. Bei 1024-px-Texturen und tile = 4 ergibt das
256 px je Einheit (Richtwert PIPELINE.md); tile = 2 -> 512 px/Einheit. Die Laufzeit wiederholt die Texturen 1:1 (repeat 1).
Jedes Objekt bekommt einen festen Versatz aus seinem Namen, damit gleiche Teile nicht identisch aussehen.
"""
import hashlib
import math

from mathutils import Vector

from . import materials

UV_NAME = 'UVMap'


def _layer(me, name=UV_NAME):
    uvl = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    return uvl


def _seed_offset(obj, enabled):
    if not enabled:
        return (0.0, 0.0)
    h = hashlib.md5(obj.name.encode()).digest()
    return (h[0] / 255.0, h[1] / 255.0)


def _tile_of(obj, tile):
    if tile is not None:
        return float(tile)
    if obj.data.materials and obj.data.materials[0] is not None and obj.data.materials[0].name in materials.library():
        return materials.tile(obj.data.materials[0].name)
    return 2.0


def box(obj, tile=None, space='world', jitter=True, along=None):
    """Wuerfel-/Box-Projektion je Flaeche nach dominanter Normalenachse.
    space='world': nahtlos ueber benachbarte Objekte (Mauern, Boden); 'object': folgt dem Objekt (Balken: Maserung entlang
    der lokalen X-Achse, siehe mesh.beam). along='x'|'y'|'z': diese Achse laeuft auf Seitenflaechen entlang U (Maserung).
    tile=None: Kachelgroesse des ersten Materials."""
    me = obj.data
    t = _tile_of(obj, tile)
    ou, ov = _seed_offset(obj, jitter)
    uvl = _layer(me)
    mw = obj.matrix_world if space == 'world' else None
    nm = mw.to_3x3().inverted().transposed() if mw is not None else None
    for p in me.polygons:
        n = p.normal.copy()
        if nm is not None:
            n = (nm @ n).normalized()
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            c = (mw @ co) if mw is not None else co
            top = az >= ax and az >= ay
            if top:
                u, v = c.x, c.y * (1 if n.z >= 0 else -1)
                if along == 'y':
                    u, v = c.y, -c.x
            elif ax >= ay:
                u, v = c.y * (1 if n.x >= 0 else -1), c.z
            else:
                u, v = c.x * (-1 if n.y >= 0 else 1), c.z
            # Maserung/Laufrichtung der Textur = U: senkrechte Teile (Pfosten) drehen ihre Seitenflaechen
            if along == 'z' and not top:
                u, v = v, -u
            uvl.data[li].uv = (u / t + ou, v / t + ov)
    return obj


def cylindrical(obj, tile=None, center=None, jitter=True):
    """Zylinderprojektion um die lokale Z-Achse (Turm, Brunnenkranz, Pfosten): U = Bogenlaenge, V = Hoehe; Deckel planar."""
    me = obj.data
    t = _tile_of(obj, tile)
    ou, ov = _seed_offset(obj, jitter)
    uvl = _layer(me)
    c0 = Vector(center) if center is not None else Vector((0, 0, 0))
    for p in me.polygons:
        cap = abs(p.normal.z) > 0.8
        # Naht: Winkel je Flaeche am Flaechenmittelpunkt ausrichten
        pc = p.center - c0
        a0 = math.atan2(pc.y, pc.x)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co - c0
            if cap:
                u, v = co.x, co.y
            else:
                r = math.hypot(co.x, co.y)
                a = math.atan2(co.y, co.x)
                d = a - a0
                if d > math.pi:
                    a -= 2 * math.pi
                elif d < -math.pi:
                    a += 2 * math.pi
                u, v = a * max(r, 1e-4), co.z
            uvl.data[li].uv = (u / t + ou, v / t + ov)
    return obj


def ensure(obj):
    """Hat das Objekt keine UVs, Box-Projektion im Weltmass (Pruefung verlangt UVs auf allen exportierten Meshes)."""
    if not obj.data.uv_layers:
        box(obj)
    return obj
