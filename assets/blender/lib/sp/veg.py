"""Vegetation und Umgebungs-Requisiten (Baeume, Buesche, Gras, Blumen, Farn, Felsen, Zaeune) - schlanker Exportweg neben
sp.asset (Gebaeude). Teilschritt 5 der Phase 5A, Konventionen assets/PIPELINE.md (Abschnitt "Vegetation").

Unterschiede zum Gebaeude-Weg (sp.asset):
  - Geometrie entsteht direkt als Daten (VMesh: Ecken, Flaechen, je Ecke UV/Normale/Datenfarbe) - die Generatoren
    erzeugen Hunderte Blattkarten, das waere mit einzelnen Blender-Objekten zu langsam.
  - Eigene Normalen je Ecke (Blattkarten: Normale von der Kronenmitte nach aussen = weiche Kronenbeleuchtung).
  - Keine Bauanimations-/Teil-Attribute (_BUILD/_PART): Vegetation ist kein Gebaeude. Pflicht im GLB: POSITION, NORMAL,
    TEXCOORD_0, COLOR_0.
  - Datenfarbe COLOR_0 (Ecken) mit Vegetations-Bedeutung (Laufzeit: render/env/veg_material.ts):
        R  Ambient Occlusion (1 = frei; Baeume analytisch aus der Lage in der Krone, Felsen/Zaeune per Cycles-Bake)
        G  Biegsamkeit fuer den Wind (0 = starr .. 1 = Zweigspitze/Halmspitze); Felsen: Moos-Anteil
        B  Zufallswert je Zweig/Karte/Halm (Phase des Flatterns, Farbvariation)
        A  M_Foliage*/M_Flora: Durchlicht (1 = duennes Blatt); M_Bark: Birkenrinde (1 = weiss, 0 = Borke)
  - UVs im Weltmass / tile (wie sp.uv), zusaetzlich steht die beim Export gueltige Kachelgroesse je Material im
    Registereintrag (`uvTile`): aendert sich `tile` in assets/materials.json, gleicht die Laufzeit das aus
    (kein Neuexport noetig). Atlas-Materialien (M_Foliage, M_Foliage_Conifer, M_Flora) nutzen feste Atlas-UVs.
  - LOD-Stufen werden vom Generator selbst gebaut (gleiches Skelett, weniger Seiten/Segmente, groessere und weniger
    Karten, LOD2 = vereinfachte Krone aus grossen Karten), nicht per Decimate.
"""
import json
import math
import os
import struct
import sys
import time

import bpy
from mathutils import Vector

from . import bake, config, materials, scene

ARGS = set(a for a in sys.argv[1:] if a.startswith('--'))

# Budgets (Dreiecke LOD0, LOD1, LOD2) - Auftrag Teilschritt 5: Baum <= 6000/1500/300 (Karten zaehlen), Fels <= 1500
BUDGETS = {
    'tree': (6000, 1500, 300),
    'bush': (2400, 700, 160),
    'flora': (420, 140, 40),
    'rock': (1500, 500, 150),
    'prop': (1500, 600, 150),
}

# Atlas-Zellen (Blender-UV, Ursprung unten links): M_Foliage 2x2 (Materialbibliothek), siehe M_Foliage.py
FOLIAGE_CELLS = {
    'oak': (0.0, 0.5, 0.5, 1.0),
    'beech': (0.5, 0.5, 1.0, 1.0),
    'shrub': (0.0, 0.0, 0.5, 0.5),
    'birch': (0.5, 0.0, 1.0, 0.5),
}
# M_Foliage_Conifer: eine Zelle (Nadelzweig, Basis unten Mitte)
CONIFER_CELL = (0.0, 0.0, 1.0, 1.0)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0)) if e1 != e0 else (1.0 if x >= e1 else 0.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


class VMesh:
    """Geometrie als Daten: Ecken (co), Flaechen (Indizes), je Flaechenecke UV, Normale, Datenfarbe; Material je Flaeche."""

    def __init__(self):
        self.co = []
        self.faces = []
        self.fmat = []
        self.luv = []
        self.lnor = []
        self.ldata = []
        self.mats = []

    def mat(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def vert(self, p):
        self.co.append((float(p[0]), float(p[1]), float(p[2])))
        return len(self.co) - 1

    def face(self, vids, uvs, nors, datas, mat):
        """Flaeche aus Eckindizes; uvs/nors/datas je Ecke (gleiche Reihenfolge)."""
        self.faces.append(tuple(vids))
        self.fmat.append(self.mat(mat))
        for k in range(len(vids)):
            self.luv.append((float(uvs[k][0]), float(uvs[k][1])))
            n = Vector(nors[k])
            if n.length < 1e-8:
                n = Vector((0, 0, 1))
            n.normalize()
            self.lnor.append((n.x, n.y, n.z))
            d = datas[k]
            self.ldata.append((float(d[0]), float(d[1]), float(d[2]), float(d[3])))

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def tris_of(self, mat):
        if mat not in self.mats:
            return 0
        i = self.mats.index(mat)
        return sum(len(f) - 2 for f, m in zip(self.faces, self.fmat) if m == i)

    def extend(self, other):
        off = len(self.co)
        self.co.extend(other.co)
        for f, m in zip(other.faces, other.fmat):
            self.faces.append(tuple(i + off for i in f))
            self.fmat.append(self.mat(other.mats[m]))
        self.luv.extend(other.luv)
        self.lnor.extend(other.lnor)
        self.ldata.extend(other.ldata)

    def bounds(self):
        if not self.co:
            return Vector((0, 0, 0)), Vector((0, 0, 0))
        xs, ys, zs = zip(*self.co)
        return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

    def to_object(self, name, coll=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.co, [], self.faces)
        for m in self.mats:
            me.materials.append(materials.get(m))
        me.polygons.foreach_set('material_index', self.fmat)
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', [c for uv in self.luv for c in uv])
        col = me.color_attributes.new(config.DATA_COLOR, 'FLOAT_COLOR', 'CORNER')
        col.data.foreach_set('color', [c for d in self.ldata for c in d])
        me.color_attributes.active_color = col
        me.shade_smooth()
        me.normals_split_custom_set(self.lnor)
        me.update()
        ob = bpy.data.objects.new(name, me)
        scene.link(ob, coll)
        return ob


# ---------------------------------------------------------------------------------------------------------------- Bausteine

def frames(pts):
    """Rahmen (Tangente, Normale, Binormale) entlang einer Polylinie, parallel transportiert (keine Verdrehung)."""
    n = len(pts)
    T = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        t = (b - a)
        T.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    ref = Vector((1, 0, 0)) if abs(T[0].x) < 0.9 else Vector((0, 1, 0))
    N0 = T[0].cross(ref).normalized()
    out = []
    N = N0
    for i in range(n):
        if i > 0:
            N = N - T[i] * N.dot(T[i])
            if N.length < 1e-6:
                N = T[i].cross(ref).normalized()
            N.normalize()
        B = T[i].cross(N).normalized()
        out.append((T[i], N, B))
    return out


def tube(vm, pts, radii, sides, mat, tile, data_fn, cap=True, lobes=0.0, lobe_seed=0.0, flare_h=0.0, flare_k=0.0, u_rep=None, swap_uv=False):
    """Ast/Stamm als Roehre entlang pts mit Radien radii. UV: U um den Umfang (ganzzahlige Wiederholungen, nahtlos),
    V entlang der Laenge (Weltmass / tile). data_fn(p, t, ring_angle) -> (ao, flex, rnd, a). lobes: Wurzelanlauf-Rippen
    (Stammfuss), flare_h/flare_k: Verbreiterung am Fuss. Rueckgabe: Dreiecke."""
    n = len(pts)
    if n < 2:
        return 0
    fr = frames(pts)
    r_mean = sum(radii) / len(radii)
    rep = u_rep if u_rep is not None else max(1, round(2 * math.pi * r_mean / tile))
    rings = []
    vlen = 0.0
    vcoord = []
    for i in range(n):
        if i > 0:
            vlen += (pts[i] - pts[i - 1]).length
        vcoord.append(vlen / tile)
    t_of = [vcoord[i] / max(1e-6, vcoord[-1]) for i in range(n)]
    for i in range(n):
        T, N, B = fr[i]
        r = radii[i]
        z = pts[i].z
        if flare_h > 0:
            r *= 1.0 + flare_k * (1.0 - smooth(0.0, flare_h, z)) ** 2
        ring = []
        for j in range(sides + 1):
            a = 2 * math.pi * (j % sides) / sides
            rr = r
            if lobes > 0:
                lob = 0.5 + 0.5 * math.cos(a * 5 + lobe_seed) * math.cos(a * 3 - lobe_seed * 0.7)
                rr = r * (1.0 + lobes * lob * (1.0 - smooth(0.0, flare_h if flare_h > 0 else 0.3, z)))
            off = N * math.cos(a) + B * math.sin(a)
            p = pts[i] + off * rr
            ring.append((vm.vert(p), off.copy(), j / sides * rep, a))
        rings.append(ring)
    tri = 0
    for i in range(n - 1):
        for j in range(sides):
            a0 = rings[i][j]
            a1 = rings[i][j + 1]
            b0 = rings[i + 1][j]
            b1 = rings[i + 1][j + 1]
            ids = (a0[0], a1[0], b1[0], b0[0])
            uvs = ((a0[2], vcoord[i]), (a1[2], vcoord[i]), (b1[2], vcoord[i + 1]), (b0[2], vcoord[i + 1]))
            if swap_uv:
                # Holz: Maserung laeuft entlang U (Konvention sp.uv.box along=...)
                uvs = tuple((v, u) for (u, v) in uvs)
            nors = (a0[1], a1[1], b1[1], b0[1])
            datas = (data_fn(pts[i], t_of[i], a0[3]), data_fn(pts[i], t_of[i], a1[3]), data_fn(pts[i + 1], t_of[i + 1], b1[3]),
                     data_fn(pts[i + 1], t_of[i + 1], b0[3]))
            vm.face(ids, uvs, nors, datas, mat)
            tri += 2
    if cap and radii[-1] > 1e-4:
        # Spitze: Kegel zu einem Punkt etwas hinter dem letzten Ring
        T = fr[-1][0]
        tip = pts[-1] + T * radii[-1] * 1.5
        tid = vm.vert(tip)
        last = rings[-1]
        vt = vcoord[-1] + radii[-1] * 1.5 / tile
        for j in range(sides):
            a0 = last[j]
            a1 = last[j + 1]
            cuv = ((a0[2], vcoord[-1]), (a1[2], vcoord[-1]), ((a0[2] + a1[2]) / 2, vt))
            if swap_uv:
                cuv = tuple((v, u) for (u, v) in cuv)
            vm.face((a0[0], a1[0], tid), cuv,
                    (a0[1], a1[1], T), (data_fn(pts[-1], 1.0, a0[3]),) * 3, mat)
            tri += 1
    return tri


def card(vm, base, up, side, w, h, cell, mat, nor_fn, data, bend=0.0, cols=1, flip_v=False):
    """Blattkarte: Basis (Zweigansatz) unten Mitte, `up` = Richtung zur Spitze, `side` = Breitenrichtung (beide normiert).
    cell = Atlas-Zelle (u0, v0, u1, v1). bend > 0 knickt die Karte entlang der Mittellinie (V-Form, mehr Volumen,
    4 statt 2 Dreiecke). nor_fn(p, face_normal) -> Normale je Ecke (Kronennormale). data: (ao, flex, rnd, a) oder fn(p, v)."""
    u0, v0, u1, v1 = cell
    if flip_v:
        v0, v1 = v1, v0
    fn = up.cross(side).normalized()
    ncol = 2 if bend > 0 else 1
    us = [k / ncol for k in range(ncol + 1)]
    grid = []
    for row in (0, 1):
        line = []
        for k, s in enumerate(us):
            x = (s - 0.5) * w
            off = fn * (bend * w * (1.0 - abs(s - 0.5) * 2.0)) if ncol == 2 else Vector((0, 0, 0))
            p = base + side * x + up * (h * row) + off
            uv = (lerp(u0, u1, s), lerp(v0, v1, row))
            line.append((vm.vert(p), p, uv))
        grid.append(line)
    tri = 0
    for k in range(ncol):
        a0, a1 = grid[0][k], grid[0][k + 1]
        b0, b1 = grid[1][k], grid[1][k + 1]
        quad = (a0, a1, b1, b0)
        vm.face([q[0] for q in quad], [q[2] for q in quad], [nor_fn(q[1], fn) for q in quad],
                [data(q[1], q[2]) if callable(data) else data for q in quad], mat)
        tri += 2
    return tri


# ---------------------------------------------------------------------------------------------------------------- Export

def _glb_info(path):
    d = open(path, 'rb').read()
    ln = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + ln]), len(d)


def export(asset_id, lods, kind, desc='', target=None, budget=None, bake_ao=False, bake_distance=0.6, lod_dist=None,
           extras=None, save_blend=True):
    """LOD-Stufen (Liste von VMesh, LOD0 zuerst) als GLB exportieren, Registereintrag schreiben, Manifest erneuern.
    kind: Budgetklasse (BUDGETS) und Laufzeitklasse ('tree', 'bush', 'flora', 'rock', 'prop'). bake_ao: Cycles-AO in R."""
    t0 = time.time()
    scene.reset()
    budget = budget or BUDGETS[kind]
    coll = scene.collection(f'{asset_id}_export')
    root = bpy.data.objects.new(asset_id, None)
    coll.objects.link(root)
    lod_info = []
    objs = []
    errors = []
    fast = '--fast' in ARGS
    for L, vm in enumerate(lods):
        n = vm.tris()
        if n == 0:
            errors.append(f'LOD{L} leer')
            continue
        if budget and L < len(budget) and n > budget[L]:
            errors.append(f'LOD{L}: {n} Dreiecke > Budget {budget[L]}')
        if L > 0 and n > lod_info[-1]['tris']:
            errors.append(f'LOD{L}: mehr Dreiecke als LOD{L - 1}')
        for m in vm.mats:
            if m not in materials.library():
                errors.append(f'Material {m} nicht in assets/materials.json')
        ob = vm.to_object(f'{asset_id}_LOD{L}', coll)
        if bake_ao and '--no-bake' not in ARGS:
            bake.bake_ao(ob, samples=12 if fast else 48, distance=bake_distance)
        e = bpy.data.objects.new(config.LOD_NAMES[L], None)
        coll.objects.link(e)
        e.parent = root
        ob.parent = e
        objs.append(ob)
        lod_info.append({'node': config.LOD_NAMES[L], 'tris': n, 'materials': sorted(vm.mats)})
    if errors:
        raise SystemExit(f'{asset_id}: ' + '; '.join(errors))
    if save_blend and '--no-blend' not in ARGS:
        config.SRC.mkdir(parents=True, exist_ok=True)
        (config.SRC / 'veg').mkdir(parents=True, exist_ok=True)
        blend = config.SRC / 'veg' / f'{asset_id}.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True, relative_remap=True, copy=True)
    else:
        blend = None
    config.MODELS_OUT.mkdir(parents=True, exist_ok=True)
    glb = config.MODELS_OUT / f'{asset_id}.glb'
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in coll.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_attributes=False, export_extras=False, export_vertex_color='ACTIVE', export_cameras=False, export_lights=False,
        export_image_format='NONE', export_materials='EXPORT', export_texcoords=True, export_normals=True, export_tangents=False,
        export_animations=False, export_skins=False, export_morph=False,
    )
    gj, nbytes = _glb_info(glb)
    for m in gj.get('meshes', []):
        for p in m['primitives']:
            miss = [a for a in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0') if a not in p['attributes']]
            if miss:
                raise SystemExit(f'{asset_id}: GLB {m["name"]}: fehlende Attribute {miss}')
    lo, hi = lods[0].bounds()
    gmin = config.to_gltf((lo.x, hi.y, lo.z))
    gmax = config.to_gltf((hi.x, lo.y, hi.z))
    mats = sorted({m for li in lod_info for m in li['materials']})
    script = os.path.relpath(os.path.abspath(sys.argv[0]), config.ROOT) if sys.argv and sys.argv[0].endswith('.py') else None
    entry = {
        'id': asset_id,
        'desc': desc,
        'file': f'models/{asset_id}.glb',
        'target': target or {'prop': asset_id},
        'class': kind,
        'footprint': None,
        'height': round(hi.z, 3),
        'bbox': {'min': [round(v, 3) for v in gmin], 'max': [round(v, 3) for v in gmax]},
        'lods': lod_info,
        'tris': [li['tris'] for li in lod_info],
        'budget': list(budget) if budget else None,
        'materials': mats,
        'anchors': [],
        'attributes': ['COLOR_0'],
        'bytes': nbytes,
        'veg': dict({'kind': kind}, **(extras or {})),
        'uvTile': {m: materials.tile(m) for m in mats},
        'source': script,
        'blend': os.path.relpath(blend, config.ROOT) if blend else None,
        'license': 'Eigenerstellung StrongPoly (Skript + Blender), keine Fremdquellen',
    }
    if lod_dist:
        entry['lodDist'] = list(lod_dist)
    config.REGISTRY.mkdir(parents=True, exist_ok=True)
    with open(config.REGISTRY / f'{asset_id}.json', 'w', encoding='utf-8') as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'{asset_id}: LOD-Dreiecke {entry["tris"]} (Budget {entry["budget"]}), Materialien {mats}, '
          f'{nbytes / 1024:.1f} KiB, {time.time() - t0:.1f} s')
    return entry


def manifest():
    """Manifest neu schreiben (node scripts/asset-manifest.mjs) - einmal am Ende eines Skripts mit mehreren Assets."""
    import shutil
    import subprocess
    if '--no-manifest' in ARGS or not shutil.which('node'):
        return
    subprocess.run(['node', str(config.ROOT / 'scripts' / 'asset-manifest.mjs')], cwd=str(config.ROOT), check=False)


def only_filter():
    """--only=a,b: nur diese Asset-IDs bauen"""
    for a in sys.argv[1:]:
        if a.startswith('--only='):
            return set(a.split('=', 1)[1].split(','))
    return None
