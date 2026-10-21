"""Asset-Ablauf: begin() -> Objekte modellieren und mit A.add() registrieren -> finish().

finish() erledigt in dieser Reihenfolge:
  1. Pruefungen der Quellobjekte (Skalierung angewandt, Bibliotheksmaterialien, UVs) und Footprint/Bounding-Box
  2. Speichern der bearbeitbaren Quelle assets/src/<id>.blend (nur Quellobjekte, Texturen extern)
  3. je LOD-Stufe: ausgewertete Kopien (Modifikatoren, Welttransformation) nach LOD-Regel (keep/drop/Verhaeltnis/Ersatzobjekt),
     Attribute je Teil (_BUILD/_BUILDH/_PART/_PIVOT), Datenfarbe, Zusammenfuegen zu EINEM Mesh je LOD (ein Primitive je
     Material), AO-Bake (Cycles), Schmutz/Abnutzung, Pruefung (Dreiecke gegen Budget, Normalen, Attribute)
  4. Knoten <id> -> LOD0/LOD1/LOD2 (+ ANCHOR_*), Export packages/client/public/assets/models/<id>.glb (Y oben, ohne Kameras/
     Lichter/Bilder; Materialien nur als Namen)
  5. Registereintrag assets/registry/<id>.json und Manifest (node scripts/asset-manifest.mjs)
  6. Vorschau assets/previews/<id>_{front,rts}.jpg (Cycles)

Kommandozeile der Asset-Skripte: --no-preview, --no-bake, --no-manifest, --fast (wenige Samples)
"""
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time

import bpy
from mathutils import Vector

from . import anchors, attrs, bake, checks, config, materials, mesh, preview, scene, uv

ARGS = set(a for a in sys.argv[1:] if a.startswith('--'))


class Asset:
    def __init__(self, asset_id, target, footprint, budget, klass, desc, lod_dist):
        self.id = asset_id
        self.target = target
        self.footprint = footprint
        self.budget = budget or config.BUDGETS.get(klass, config.BUDGETS['small'])
        self.klass = klass
        self.desc = desc
        self.lod_dist = lod_dist
        self.objects = []
        # Mauerstuecke: Schmutz-/Abnutzungsrauschen spiegelsymmetrisch in y (nahtlose Stoesse gedrehter Instanzen)
        self.noise_mirror_y = False
        self.coll = scene.collection(f'{asset_id}_src')
        self.t0 = time.time()
        # Figuren: Varianten (Hut/Haar/Werkzeug) getrennt backen (bake.bake_ao_groups), Ursprung = Fusspunkt statt Footprint
        self.figure = klass == 'figure'

    def add(self, obj, mat=None, uv_mode='box', tile=None, uv_space='world', along=None, part=None, pivot=None, build=None,
            team=False, dirt=None, wear=None, lod1=None, lod2=None, only=None, smooth=35.0):
        """Objekt in das Asset aufnehmen.
        mat: Bibliotheksmaterial (M_*) fuer alle Flaechen (oder None, wenn schon zugewiesen)
        uv_mode: 'box' | 'cyl' | None (vorhandene UVs behalten); tile/uv_space/along siehe uv.box
        part/pivot: Vertex-Animation (config.PART, Drehpunkt in Blender-Koordinaten); build=(s0, s1) Bauzeitfenster
        team: Spielerfarbe; dirt/wear: Faktoren fuer Schmutz/Abnutzung
        lod1/lod2: 'keep' | 'drop' | Verhaeltnis 0..1 (Decimate) | ('planar', Grad) ; Standard automatisch
        only: Objekt nur in diesen LOD-Stufen (int oder Liste) - fuer Ersatzformen (Proxies)
        smooth: Glaettungswinkel in Grad (None = nicht anfassen, 0 = flach)"""
        if obj.users_collection and self.coll not in obj.users_collection:
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            self.coll.objects.link(obj)
        scene.apply_transforms(obj)
        if mat:
            materials.assign(obj, mat)
        if smooth is not None:
            if smooth > 0:
                mesh.shade(obj, smooth)
            else:
                mesh.flat(obj)
        if uv_mode == 'box':
            uv.box(obj, tile=tile, space=uv_space, along=along)
        elif uv_mode == 'cyl':
            uv.cylindrical(obj, tile=tile, center=pivot if part else None)
        if part is not None:
            obj['sp_part'] = part
        if pivot is not None:
            obj['sp_pivot'] = tuple(pivot)
        if build is not None:
            obj['sp_build'] = tuple(build)
        if team:
            obj['sp_team'] = 1
        if dirt is not None:
            obj['sp_dirt'] = float(dirt)
        if wear is not None:
            obj['sp_wear'] = float(wear)
        for k, v in (('sp_lod1', lod1), ('sp_lod2', lod2)):
            if v is not None:
                # ('planar', Grad) wird als Text 'planar:Grad' gespeichert (ID-Eigenschaften kennen keine gemischten Listen)
                obj[k] = f'planar:{v[1] if len(v) > 1 else 5}' if isinstance(v, (tuple, list)) else v
        if only is not None:
            obj['sp_only'] = [only] if isinstance(only, int) else list(only)
        self.objects.append(obj)
        return obj


def begin(asset_id, target=None, footprint=None, budget=None, klass='small', desc='', lod_dist=None):
    """Neue Szene fuer ein Asset. target: {'building': 'Well'} | {'wall': 'WallHigh', 'piece': 'arm'} | {'unit': 'Peasant'} |
    {'prop': 'woodpile'}. footprint: (w, h) in Kacheln (Gebaeude). budget: (LOD0, LOD1, LOD2) Dreiecke; sonst nach klass."""
    scene.reset()
    anchors.reset()
    return Asset(asset_id, target or {}, footprint, budget, klass, desc, lod_dist)


# ---------------------------------------------------------------------------------------------------------------- LOD-Regeln

def _policy(obj, level):
    only = obj.get('sp_only')
    if only is not None:
        return 'keep' if level in list(only) else 'drop'
    if level == 0:
        return 'keep'
    p = obj.get(f'sp_lod{level}')
    if p is not None:
        return p
    # automatisch: winzige Teile fallen weg, kleine bleiben, grosse werden reduziert
    dims = obj.dimensions
    diag = math.sqrt(dims.x ** 2 + dims.y ** 2 + dims.z ** 2)
    if diag < config.LOD_DROP_SMALL.get(level, 0):
        return 'drop'
    if mesh.tris(obj) <= 16:
        return 'keep'
    return config.LOD_RATIO[level]


def _copy(src, name, coll):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = src.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    me.transform(src.matrix_world)
    if src.matrix_world.determinant() < 0:
        me.flip_normals()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def _reduce(ob, policy, coll):
    if policy == 'keep':
        return ob
    mod = ob.modifiers.new('sp_lod', 'DECIMATE')
    if isinstance(policy, str) and policy.startswith('planar'):
        mod.decimate_type = 'DISSOLVE'
        mod.angle_limit = math.radians(float(policy.split(':')[1]) if ':' in policy else 5.0)
        mod.delimit = {'MATERIAL', 'SEAM', 'SHARP', 'UV'}
    else:
        mod.decimate_type = 'COLLAPSE'
        # nie unter einen Quader (12 Dreiecke) reduzieren: kleine Teile behalten ihre Form
        n = max(1, sum(len(p.vertices) - 2 for p in ob.data.polygons))
        mod.ratio = max(0.01, min(1.0, max(float(policy), 12.0 / n)))
        mod.use_collapse_triangulate = True
    out = _copy(ob, ob.name + '_r', coll)
    bpy.data.objects.remove(ob)
    return out


def _bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def _glb_info(path):
    d = open(path, 'rb').read()
    ln = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + ln]), len(d)


# ---------------------------------------------------------------------------------------------------------------- Abschluss

def finish(A, preview_on=None, bake_on=None, manifest_on=None):
    preview_on = ('--no-preview' not in ARGS) if preview_on is None else preview_on
    bake_on = ('--no-bake' not in ARGS) if bake_on is None else bake_on
    manifest_on = ('--no-manifest' not in ARGS) if manifest_on is None else manifest_on
    fast = '--fast' in ARGS
    rep = checks.Report()
    meshes = [o for o in A.objects if o.type == 'MESH']
    for o in meshes:
        checks.source_object(rep, o)
    lod0_src = [o for o in meshes if _policy(o, 0) != 'drop']
    lo, hi = _bbox(lod0_src)
    H = hi.z
    checks.footprint(rep, lo, hi, A.footprint)
    if not rep.ok():
        print(rep.text())
        raise SystemExit(f'{A.id}: Pruefung der Quellobjekte fehlgeschlagen')

    # 2. bearbeitbare Quelle
    config.SRC.mkdir(parents=True, exist_ok=True)
    blend = config.SRC / f'{A.id}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True, relative_remap=True, copy=True)

    # 3. LOD-Stufen
    exp = scene.collection(f'{A.id}_export')
    root = bpy.data.objects.new(A.id, None)
    exp.objects.link(root)
    lod_objs = []
    lod_info = []
    bake_s = 0.0
    table = {}
    animated = any(attrs.part_id(o) != 0 for o in meshes) or any(o.get('sp_style') is not None for o in meshes)
    for L in range(3):
        parts = []
        srcs = []
        for o in meshes:
            pol = _policy(o, L)
            if pol == 'drop':
                continue
            c = _copy(o, f'{o.name}.L{L}', exp)
            c = _reduce(c, pol, exp)
            table.setdefault(o.name, ['-', '-', '-'])[L] = str(sum(len(p.vertices) - 2 for p in c.data.polygons))
            attrs.write_part(c, o, H, parts=animated, build=not A.figure)
            attrs.init_data(c, o)
            parts.append(c)
            srcs.append(o)
        if not parts:
            raise SystemExit(f'{A.id}: LOD{L} ist leer')
        if bake_on and A.figure:
            from . import figure
            bake_s += bake.bake_ao_groups(parts, [figure.variant_key(o) for o in srcs], samples=16 if fast else 64, distance=0.12)
        lod = mesh.join(parts, f'{A.id}_LOD{L}')
        lod.data.name = lod.name
        if bake_on and not A.figure:
            bake_s += bake.bake_ao(lod, samples=16 if fast else 64, distance=max(0.6, min(2.0, H * 0.6)))
        attrs.fill_dirt_wear(lod, seed=L, ground_h=0.14 if A.figure else 0.55, mirror_y=A.noise_mirror_y)
        attrs.strip_helpers(lod)
        tris = checks.lod_mesh(rep, lod, L, A.budget[L] if A.budget else None, parts=animated, build=not A.figure)
        e = bpy.data.objects.new(config.LOD_NAMES[L], None)
        exp.objects.link(e)
        e.parent = root
        lod.parent = e
        mats = sorted({m.name for m in lod.data.materials if m})
        lod_info.append({'node': config.LOD_NAMES[L], 'tris': tris, 'materials': mats})
        lod_objs.append(lod)
    print(f'{"Teil":28s} {"LOD0":>6s} {"LOD1":>6s} {"LOD2":>6s}  (Dreiecke)')
    for k, v in table.items():
        print(f'{k:28s} {v[0]:>6s} {v[1]:>6s} {v[2]:>6s}')
    if not rep.ok():
        print(rep.text())
        raise SystemExit(f'{A.id}: Pruefung der LOD-Stufen fehlgeschlagen')

    anc = []
    for o in list(bpy.context.scene.objects):
        if anchors.is_anchor(o):
            if o.name not in exp.objects:
                exp.objects.link(o)
            o.parent = root
            ex = {k: (v.to_list() if hasattr(v, 'to_list') else v) for k, v in o.items() if not k.startswith('_')}
            anc.append({'name': o.name, 'kind': o['kind'], 'pos': [round(x, 4) for x in config.to_gltf(o.location)], 'extras': ex})

    # 4. Export
    config.MODELS_OUT.mkdir(parents=True, exist_ok=True)
    glb = config.MODELS_OUT / f'{A.id}.glb'
    vl = bpy.context.view_layer
    for o in bpy.context.scene.objects:
        o.select_set(False)
    sel = [root] + [o for o in exp.objects if o.parent is not None or o is root]
    for o in exp.objects:
        o.select_set(o in sel)
    vl.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_attributes=True, export_extras=True, export_vertex_color='ACTIVE', export_cameras=False, export_lights=False,
        export_image_format='NONE', export_materials='EXPORT', export_texcoords=True, export_normals=True, export_tangents=False,
        export_animations=False, export_skins=False, export_morph=False,
    )
    gj, nbytes = _glb_info(glb)
    need = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'] + (['_BUILD', '_BUILDH'] if not A.figure else []) + (['_PART', '_PIVOT'] if animated else [])
    if A.figure:
        need += [config.ATTR_STYLE, config.ATTR_SLOT, config.ATTR_ARM]
    for m in gj.get('meshes', []):
        for p in m['primitives']:
            miss = [a for a in need if a not in p['attributes']]
            if miss:
                rep.err(f'GLB {m["name"]}: fehlende Attribute {miss}')
    if not rep.ok():
        print(rep.text())
        raise SystemExit(f'{A.id}: GLB unvollstaendig')

    # 5. Registereintrag (Gegenstueck: scripts/asset-manifest.mjs -> public/assets/manifest.json)
    blo, bhi = _bbox(lod_objs[:1])
    gmin = config.to_gltf((blo.x, bhi.y, blo.z))
    gmax = config.to_gltf((bhi.x, blo.y, bhi.z))
    script = os.path.relpath(os.path.abspath(sys.argv[0]), config.ROOT) if sys.argv and sys.argv[0].endswith('.py') else None
    entry = {
        'id': A.id,
        'desc': A.desc,
        'file': f'models/{A.id}.glb',
        'target': A.target,
        'class': A.klass,
        'footprint': list(A.footprint) if A.footprint else None,
        'height': round(H, 3),
        'bbox': {'min': [round(v, 3) for v in gmin], 'max': [round(v, 3) for v in gmax]},
        'lods': lod_info,
        'tris': [li['tris'] for li in lod_info],
        'budget': list(A.budget) if A.budget else None,
        'materials': sorted({m for li in lod_info for m in li['materials']}),
        'anchors': anc,
        'attributes': need[3:],
        'bytes': nbytes,
        'source': script,
        'blend': os.path.relpath(blend, config.ROOT),
        'license': 'Eigenerstellung StrongPoly (Skript + Blender), keine Fremdquellen',
    }
    if A.lod_dist:
        entry['lodDist'] = list(A.lod_dist)
    config.REGISTRY.mkdir(parents=True, exist_ok=True)
    with open(config.REGISTRY / f'{A.id}.json', 'w', encoding='utf-8') as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)
        f.write('\n')
    if manifest_on and shutil.which('node'):
        subprocess.run(['node', str(config.ROOT / 'scripts' / 'asset-manifest.mjs')], cwd=str(config.ROOT), check=False)

    # 6. Vorschau
    if preview_on:
        preview.render(lod_objs[:1], A.id, A.footprint or (1, 1), H, samples=12 if fast else 32)

    print(rep.text())
    print(f'{A.id}: LOD-Dreiecke {entry["tris"]} (Budget {entry["budget"]}), {nbytes / 1024:.1f} KiB GLB, '
          f'AO-Bake {bake_s:.1f} s, gesamt {time.time() - A.t0:.1f} s -> {os.path.relpath(glb, config.ROOT)}')
    return entry
