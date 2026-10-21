"""Ankerpunkte (Empties) fuer Laufzeit-Effekte. Sie werden als glTF-Knoten `ANCHOR_<art>_<n>` mit `extras` exportiert
(Position in three-Koordinaten im Manifest). Arten, die die Laufzeit kennt (wie work_fx.ts EMITTERS):
  smoke, smokeDark, steam, flame, sparks, anvil, dust, flour, chips   -> Partikelemitter (extras: rate je s, staffed)
  flag, banner, door, work, fx                                         -> Merkpunkte (z. B. fuer spaetere Effekte/Figuren)
"""
import bpy

from . import scene

EMITTER_KINDS = ('smoke', 'smokeDark', 'steam', 'flame', 'sparks', 'anvil', 'dust', 'flour', 'chips')
MARKER_KINDS = ('flag', 'banner', 'door', 'work', 'fx')

_count = {}


def anchor(kind, loc, coll=None, **extras):
    """Ankerpunkt an `loc` (Blender-Koordinaten) anlegen. Beispiel: anchor('smoke', (0.4, 0.2, 2.1), rate=2.2, staffed=True)"""
    if kind not in EMITTER_KINDS + MARKER_KINDS:
        raise ValueError(f'unbekannte Ankerart {kind!r}')
    n = _count.get(kind, 0)
    _count[kind] = n + 1
    e = bpy.data.objects.new(f'ANCHOR_{kind}_{n}', None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.2
    e.location = loc
    e['kind'] = kind
    for k, v in extras.items():
        e[k] = v
    scene.link(e, coll)
    return e


def reset():
    _count.clear()


def is_anchor(obj):
    return obj.type == 'EMPTY' and obj.name.startswith('ANCHOR_')
