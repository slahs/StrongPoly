"""Cycles-Vorschau fuer Figuren: Reihe von Instanzen (Variante, Beruf, Toene, Spielerfarbe, LOD) nebeneinander.
Die Laufzeit toent Haut/Haar/Stoffe je Instanz im Shader; hier wird das mit festen Farben je Objekt nachgestellt
(Grundfarbe = Ton, Rauheit/Metall aus der Materialbibliothek). Ausgabe assets/previews/<name>_{front,rts,...}.jpg."""
import math
import time

import bmesh
import bpy
from mathutils import Vector

from . import config, materials
from .figure import CLOTH_HEX, visible

SKIN_HEX = [0xf0cfa8, 0xe6b98e, 0xd9a679, 0xc68e60, 0xa9754a, 0x8a5a38, 0x6c4429, 0xe9c19c]
HAIR_HEX = [0x2b2118, 0x4a3222, 0x6b4a2b, 0x8f6a3a, 0xc4a060, 0xd6c9a8, 0x9a9590, 0xa8502d]
TONES = SKIN_HEX + HAIR_HEX + CLOTH_HEX


def _lin(h):
    return tuple(((c / 255) / 12.92 if (c / 255) <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4) for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))


_mats = {}


def _mat(col, lib):
    d = materials.library()[lib]
    key = (col, lib)
    m = _mats.get(key)
    if m:
        return m
    m = bpy.data.materials.new(f'_prev_{lib}_{col:06x}')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*_lin(col), 1)
    b.inputs['Roughness'].default_value = float(d.get('rough', 0.8))
    b.inputs['Metallic'].default_value = float(d.get('metal', 0.0))
    if lib.startswith('M_Cloth'):
        # Stoffstruktur andeuten (Wellen-Bump), damit die Vorschau nicht wie Plastik wirkt
        nt = m.node_tree
        tex = nt.nodes.new('ShaderNodeTexWave')
        tex.inputs['Scale'].default_value = 900.0
        tex.inputs['Distortion'].default_value = 2.0
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.15
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    _mats[key] = m
    return m


def _color(o, t):
    st = o.get('sp_style')
    cls = int(st[0]) if st is not None else 0
    lib = o.data.materials[0].name if o.data.materials and o.data.materials[0] else 'M_Figure'
    if o.get('sp_team'):
        return t['team'], lib
    if cls == 1:
        return t['skin'], lib
    if cls == 2:
        return t['hair'], lib
    if cls == 3:
        return t['a'], lib
    if cls == 4:
        return t['b'], lib
    if cls >= 16:
        return TONES[min(len(TONES) - 1, cls - 16)], lib
    h = materials.library()[lib]['base'].lstrip('#')
    return int(h, 16), lib


def render(objs, lineup, name, cams=('front', 'rts'), res=(1000, 560), samples=24, spacing=0.42, focus=None):
    """objs: Quellobjekte der Figur (mit sp_only/sp_style); lineup: [{'lod':0,'bits':..,'job':0,'tints':{..}}]"""
    t0 = time.time()
    sc = bpy.data.scenes.new('_fig_prev')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 2
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 86
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        pass
    w = bpy.data.worlds.new('_fig_world')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.55, 0.66, 0.82, 1)
    bg.inputs['Strength'].default_value = 0.8
    sc.world = w
    made = []
    n = len(lineup)
    for i, e in enumerate(lineup):
        x = (i - (n - 1) / 2) * spacing
        for o in objs:
            only = o.get('sp_only')
            if only is not None and e['lod'] not in list(only):
                continue
            if not visible(o, e.get('bits', 0), 1 << e.get('job', 0)):
                continue
            me = o.data.copy()
            ob = bpy.data.objects.new(f'_p{i}_{o.name}', me)
            ob.matrix_world = o.matrix_world.copy()
            ob.location.x += x
            if e.get('rot'):
                ob.rotation_euler.z = e['rot']
                ob.location = Vector((x, 0, 0)) + (o.matrix_world.translation)
            col, lib = _color(o, e['tints'])
            me.materials.clear()
            me.materials.append(_mat(col, lib))
            sc.collection.objects.link(ob)
            made.append(ob)
    gme = bpy.data.meshes.new('_fig_ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    bm.to_mesh(gme)
    bm.free()
    g = bpy.data.objects.new('_fig_ground', gme)
    gm = bpy.data.materials.new('_fig_ground_m')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*materials.hex_rgb('#6f6248'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    gme.materials.append(gm)
    sc.collection.objects.link(g)
    sun = bpy.data.objects.new('_fig_sun', bpy.data.lights.new('_fig_sun', 'SUN'))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.9, 0.75)
    sun.data.angle = math.radians(3)
    d = Vector((-0.38, -0.46, 0.8)).normalized()
    sun.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('_fig_cam', bpy.data.cameras.new('_fig_cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    width = max(1.0, n * spacing)
    out = []
    config.PREVIEWS.mkdir(parents=True, exist_ok=True)
    for cname in cams:
        tgt = Vector((0, 0, 0.5)) if focus is None else Vector(focus)
        if cname == 'front':
            yaw, pitch, lens = math.radians(-18), math.radians(6), 50
            dist = width * 1.25 + 0.6
        elif cname == 'close':
            yaw, pitch, lens = math.radians(-20), math.radians(4), 85
            dist = width * 1.5 + 0.4
            tgt = Vector((tgt.x, tgt.y, 0.62))
        elif cname == 'back':
            yaw, pitch, lens = math.radians(160), math.radians(10), 50
            dist = width * 1.25 + 0.6
        else:
            yaw, pitch, lens = math.radians(-35), math.radians(52), 50
            dist = width * 1.45 + 1.0
        cam.data.lens = lens
        dv = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        cam.location = tgt + dv * dist
        cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
        f = config.PREVIEWS / f'{name}_{cname}.jpg'
        sc.render.filepath = str(f)
        with bpy.context.temp_override(scene=sc):
            bpy.ops.render.render(write_still=True, scene=sc.name)
        out.append(f)
    for o in made:
        bpy.data.objects.remove(o)
    for o in (g, sun, cam):
        bpy.data.objects.remove(o)
    bpy.data.scenes.remove(sc)
    print(f'Figuren-Vorschau {name}: {len(out)} Bilder in {time.time() - t0:.1f} s')
    return out
