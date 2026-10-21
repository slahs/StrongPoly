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


def bake_ao_groups(parts, keys, samples=64, distance=0.5, ground=True):
    """AO fuer Figuren mit Varianten (Hut/Haar/Werkzeug je Instanz ein- oder ausgeblendet): der gemeinsame Koerper (Schluessel
    (0, 0)) wird allein gebacken, jede Variante zusammen mit dem Koerper als Verdecker - so verschattet ein unsichtbarer Hut
    nicht das Gesicht. parts: Objekte mit Datenfarbe, keys: Variantenschluessel je Objekt. Rueckgabe: Dauer in s."""
    t0 = time.time()
    base = [p for p, k in zip(parts, keys) if k == (0, 0)]
    groups = {}
    for p, k in zip(parts, keys):
        if k != (0, 0):
            groups.setdefault(k, []).append(p)
    _bake_multi(base, [], samples, distance, ground)
    for k, objs in groups.items():
        _bake_multi(objs, base, samples, distance, ground)
    return time.time() - t0


def _bake_multi(targets, occluders, samples, distance, ground):
    if not targets:
        return
    sc = bpy.data.scenes.new('_sp_bake_g')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 2
    sc.world = bpy.data.worlds.new('_sp_bake_world')
    sc.world.light_settings.distance = distance
    for o in targets + occluders:
        sc.collection.objects.link(o)
    g = None
    if ground:
        g = _ground()
        sc.collection.objects.link(g)
    tmps = []
    for o in targets:
        me = o.data
        tmp = me.color_attributes.new('_sp_ao', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = tmp
        tmps.append(tmp)
    vl = sc.view_layers[0]
    for o in sc.objects:
        o.select_set(o in targets, view_layer=vl)
    vl.objects.active = targets[0]
    with bpy.context.temp_override(scene=sc, view_layer=vl, active_object=targets[0], object=targets[0], selected_objects=targets,
                                   selected_editable_objects=targets):
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
    for o in targets:
        me = o.data
        tmp = me.color_attributes['_sp_ao']
        data = me.color_attributes[config.DATA_COLOR]
        ao = [0.0] * (len(tmp.data) * 4)
        tmp.data.foreach_get('color', ao)
        cols = [0.0] * (len(data.data) * 4)
        data.data.foreach_get('color', cols)
        for i in range(len(data.data)):
            cols[i * 4] = 0.12 + 0.88 * ao[i * 4]
        data.data.foreach_set('color', cols)
        me.color_attributes.remove(tmp)
        me.color_attributes.active_color = me.color_attributes.get(config.DATA_COLOR)
    for o in targets + occluders:
        sc.collection.objects.unlink(o)
    if g is not None:
        bpy.data.objects.remove(g)
    bpy.data.scenes.remove(sc)
