"""Szene zuruecksetzen und Grundeinstellungen (Einheiten, Cycles fuer Bake/Vorschau)."""
import bpy


def reset():
    """Leere Werksszene, metrische Einheiten 1:1, Cycles CPU (EEVEE braucht libEGL/GL und ist headless nicht verfuegbar)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0  # keine .blend1-Sicherungen neben den Quellen
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 32
    try:
        sc.cycles.use_denoising = False
    except AttributeError:
        pass
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    return sc


def collection(name, parent=None):
    """Sammlung anlegen/holen (nur zur Ordnung in der .blend; der Export nutzt eigene Knoten LOD0/LOD1/LOD2)."""
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def apply_transforms(obj):
    """Skalierung/Drehung in die Geometrie uebernehmen (Pruefung 'Skalierung angewandt'); Position bleibt."""
    if obj.type != 'MESH':
        return
    import mathutils
    m = obj.matrix_basis.copy()
    loc, rot, sca = m.decompose()
    rs = mathutils.Matrix.LocRotScale(None, rot, sca)
    obj.data.transform(rs)
    obj.matrix_basis = mathutils.Matrix.Translation(loc)
    obj.data.update()
