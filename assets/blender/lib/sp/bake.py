"""Ambient-Occlusion-Bake in die Vertexfarbe (Cycles CPU, headless). Jede LOD-Stufe wird in einer eigenen Szene mit
Bodenplatte gebacken (Kontaktverschattung am Boden, keine Ueberlagerung durch andere LOD-Stufen)."""
import time

import bmesh
import bpy

from . import config


def _ground(size=40.0):
    me = bpy.data.meshes.new('_sp_bake_ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new('_sp_bake_ground', me)


def bake_ao(obj, samples=64, distance=1.2, ground=True):
    """AO des Objekts (inkl. Bodenplatte) in den Kanal R der Datenfarbe. Rueckgabe: Dauer in s."""
    t0 = time.time()
    sc = bpy.data.scenes.new('_sp_bake')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.world = bpy.data.worlds.new('_sp_bake_world')
    sc.world.light_settings.distance = distance
    sc.collection.objects.link(obj)
    g = None
    if ground:
        g = _ground()
        sc.collection.objects.link(g)
    me = obj.data
    tmp = me.color_attributes.new('_sp_ao', 'FLOAT_COLOR', 'CORNER')
    prev = me.color_attributes.active_color
    me.color_attributes.active_color = tmp
    vl = sc.view_layers[0]
    for o in sc.objects:
        o.select_set(o is obj, view_layer=vl)
    vl.objects.active = obj
    with bpy.context.temp_override(scene=sc, view_layer=vl, active_object=obj, object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
    data = me.color_attributes[config.DATA_COLOR]
    ao = [0.0] * (len(tmp.data) * 4)
    tmp.data.foreach_get('color', ao)
    cols = [0.0] * (len(data.data) * 4)
    data.data.foreach_get('color', cols)
    for i in range(len(data.data)):
        # etwas anheben: der Shader nutzt die AO zusaetzlich zur Licht-AO, volle Schwaerze wirkt schmutzig
        cols[i * 4] = 0.12 + 0.88 * ao[i * 4]
    data.data.foreach_set('color', cols)
    me.color_attributes.remove(tmp)
    me.color_attributes.active_color = me.color_attributes.get(config.DATA_COLOR) or prev
    sc.collection.objects.unlink(obj)
    if g is not None:
        bpy.data.objects.remove(g)
    bpy.data.scenes.remove(sc)
    return time.time() - t0
