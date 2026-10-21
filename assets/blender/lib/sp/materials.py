"""Material-Platzhalter nach Bibliotheksnamen (M_*).

Im GLB zaehlt nur der NAME des Materials: die Laufzeit (packages/client/src/render/assets/materials.ts) ersetzt jedes
glTF-Material durch ihr gemeinsames Material gleichen Namens (Texturen extern unter public/assets/textures/<M_Name>/,
ein Material/Shaderprogramm je M_* fuer alle Assets, kleine GLBs). In Blender bauen wir trotzdem einen brauchbaren
Principled-BSDF auf (Rueckfallfarben aus assets/materials.json, Texturen falls schon vorhanden, Vertexfarbe 'Data' fuer
AO/Schmutz), damit Cycles-Vorschauen dem Spiel aehneln.
"""
import json
import bpy

from . import config

_lib = None


def library():
    """{name: {base, rough, metal, tile, dirt, alphaTest?, doubleSided?}} aus assets/materials.json"""
    global _lib
    if _lib is None:
        with open(config.MATERIALS_JSON, encoding='utf-8') as f:
            _lib = json.load(f)['materials']
    return _lib


def names():
    return list(library().keys())


def tile(name):
    """Weltmass einer Texturwiederholung (UV = Welt / tile)"""
    return float(library()[name].get('tile', 2.0))


def _srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    h = h.lstrip('#')
    rgb = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(_srgb_to_lin(c) for c in rgb) if linear else rgb


def texture_file(name, kind):
    """Pfad der Laufzeittextur (albedo/normal/orm) oder None. Blender liest PNG/JPEG/WebP (KTX2 nicht)."""
    d = config.TEXTURES / name
    for ext in ('png', 'jpg', 'jpeg', 'webp'):
        p = d / f'{kind}.{ext}'
        if p.exists():
            return p
    return None


def get(name):
    """Bibliotheksmaterial holen/anlegen. Unbekannte Namen sind ein Fehler (Pruefung 'Materialnamen aus der Bibliothek')."""
    lib = library()
    if name not in lib:
        raise KeyError(f'Material {name!r} ist nicht in assets/materials.json ({", ".join(lib)})')
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    d = lib[name]
    m = bpy.data.materials.new(name)
    m.use_backface_culling = not d.get('doubleSided', False)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    base = hex_rgb(d['base'])
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Roughness'].default_value = float(d.get('rough', 0.8))
    bsdf.inputs['Metallic'].default_value = float(d.get('metal', 0.0))
    m.diffuse_color = (*base, 1.0)
    # Vertexfarbe 'Data': R = AO, G = Schmutz -> Vorschau wie im Spiel
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = config.DATA_COLOR
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(attr.outputs['Color'], sep.inputs['Color'])
    albedo = texture_file(name, 'albedo')
    if albedo:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(albedo), check_existing=True)
        col_out = tex.outputs['Color']
        if d.get('alphaTest'):
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    else:
        rgb = nt.nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = (*base, 1.0)
        col_out = rgb.outputs[0]
    # Schmutz: Richtung Schmutzfarbe mischen
    dirt = nt.nodes.new('ShaderNodeMix')
    dirt.data_type = 'RGBA'
    dirt.inputs['B'].default_value = (*hex_rgb(d.get('dirt', '#403428')), 1.0)
    nt.links.new(sep.outputs['Green'], dirt.inputs['Factor'])
    nt.links.new(col_out, dirt.inputs['A'])
    ao = nt.nodes.new('ShaderNodeMix')
    ao.data_type = 'RGBA'
    ao.blend_type = 'MULTIPLY'
    ao.inputs['Factor'].default_value = 1.0
    nt.links.new(dirt.outputs['Result'], ao.inputs['A'])
    nt.links.new(sep.outputs['Red'], ao.inputs['B'])
    nt.links.new(ao.outputs['Result'], bsdf.inputs['Base Color'])
    orm = texture_file(name, 'orm')
    if orm:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(str(orm), check_existing=True)
        t.image.colorspace_settings.name = 'Non-Color'
        s = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], s.inputs['Color'])
        nt.links.new(s.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(s.outputs['Blue'], bsdf.inputs['Metallic'])
    nrm = texture_file(name, 'normal')
    if nrm:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(str(nrm), check_existing=True)
        t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def assign(obj, name):
    """Objekt bekommt genau dieses Bibliotheksmaterial (alle Flaechen)."""
    m = get(name)
    obj.data.materials.clear()
    obj.data.materials.append(m)
    for p in obj.data.polygons:
        p.material_index = 0
    return m
