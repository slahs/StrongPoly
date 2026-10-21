"""Vorschau-Renderings (Cycles CPU, feste Kameras) als JPEG unter assets/previews/<id>_<kamera>.jpg.
Kameras: 'front' (3/4-Ansicht von vorn-links auf Augenhoehe einer Figur), 'rts' (Spielkamera-Neigung 52 Grad).
Das Licht entspricht grob der Spielsonne (scene.ts SUN_DIR, warm) mit kuehlem Himmel."""
import math
import time

import bmesh
import bpy
from mathutils import Vector

from . import config, materials


def _sun_dir_blender():
    # scene.ts: SUN_DIR = (-0.38, 0.8, 0.46) in three -> Blender (x, -z, y)
    d = Vector((-0.38, -0.46, 0.8)).normalized()
    return d


def render(objs, asset_id, size, height, cams=('front', 'rts'), res=448, samples=24):
    """Rendert die Objekte (Asset-Koordinaten) in einer eigenen Szene. Rueckgabe: Liste der Dateien."""
    t0 = time.time()
    sc = bpy.data.scenes.new('_sp_preview')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 88
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        pass
    w = bpy.data.worlds.new('_sp_prev_world')
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.55, 0.66, 0.82, 1)
    bg.inputs['Strength'].default_value = 0.9
    sc.world = w
    for o in objs:
        sc.collection.objects.link(o)
    # Boden mit Erdmaterial
    me = bpy.data.meshes.new('_sp_prev_ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(me)
    bm.free()
    g = bpy.data.objects.new('_sp_prev_ground', me)
    gm = bpy.data.materials.new('_sp_prev_ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*materials.hex_rgb('#6f6248'), 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    me.materials.append(gm)
    sc.collection.objects.link(g)
    sun = bpy.data.objects.new('_sp_sun', bpy.data.lights.new('_sp_sun', 'SUN'))
    sun.data.energy = 4.2
    sun.data.color = (1.0, 0.88, 0.7)
    sun.data.angle = math.radians(2.5)
    d = _sun_dir_blender()
    sun.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('_sp_cam', bpy.data.cameras.new('_sp_cam'))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    ext = max(size[0], size[1], height) * 1.0 + 0.6
    target = Vector((0, 0, height * 0.42))
    out = []
    config.PREVIEWS.mkdir(parents=True, exist_ok=True)
    for name in cams:
        if name == 'front':
            yaw, pitch, dist = math.radians(-35), math.radians(14), ext * 1.75
        else:
            yaw, pitch, dist = math.radians(-45), math.radians(52), ext * 2.3
        dirv = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        cam.location = target + dirv * dist
        cam.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
        f = config.PREVIEWS / f'{asset_id}_{name}.jpg'
        sc.render.filepath = str(f)
        with bpy.context.temp_override(scene=sc):
            bpy.ops.render.render(write_still=True, scene=sc.name)
        out.append(f)
    for o in objs:
        sc.collection.objects.unlink(o)
    for o in (g, sun, cam):
        bpy.data.objects.remove(o)
    bpy.data.scenes.remove(sc)
    print(f'Vorschau {asset_id}: {len(out)} Bilder in {time.time() - t0:.1f} s')
    return out
