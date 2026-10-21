"""Pruefungen vor dem Export. Fehler brechen den Export ab, Warnungen werden nur gemeldet."""
import bmesh

from . import config, materials


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def ok(self):
        return not self.errors

    def text(self):
        out = [f'FEHLER: {e}' for e in self.errors] + [f'Warnung: {w}' for w in self.warnings]
        return '\n'.join(out) if out else 'Pruefungen bestanden'


def source_object(rep, obj):
    """Quellobjekt: Skalierung angewandt, Bibliotheksmaterialien, UVs."""
    if obj.type != 'MESH':
        return
    s = obj.scale
    if abs(s.x - 1) > 1e-4 or abs(s.y - 1) > 1e-4 or abs(s.z - 1) > 1e-4:
        rep.err(f'{obj.name}: Skalierung nicht angewandt ({s.x:.3f}, {s.y:.3f}, {s.z:.3f}) - scene.apply_transforms(obj)')
    if not obj.data.materials or any(m is None for m in obj.data.materials):
        rep.err(f'{obj.name}: kein Material')
    for m in obj.data.materials:
        if m is not None and m.name not in materials.library():
            rep.err(f'{obj.name}: Material {m.name!r} ist kein Bibliotheksmaterial (assets/materials.json)')
    if not obj.data.uv_layers:
        rep.err(f'{obj.name}: keine UVs (uv.box/uv.cylindrical)')
    if len(obj.data.polygons) == 0:
        rep.warn(f'{obj.name}: leeres Mesh')


def lod_mesh(rep, obj, level, budget, parts=True, build=True):
    """Exportfertiges LOD-Mesh: Dreiecke gegen Budget, Normalen, entartete Flaechen."""
    me = obj.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if budget and tris > budget:
        rep.err(f'LOD{level}: {tris} Dreiecke > Budget {budget}')
    bm = bmesh.new()
    bm.from_mesh(me)
    tiny = sum(1 for f in bm.faces if f.calc_area() < 1e-7)
    if tiny:
        rep.warn(f'LOD{level}: {tiny} entartete Flaechen (Flaeche ~0)')
    # Normalen: Flaechen, die nach innen zeigen, finden (nur geschlossene Teile sind aussagekraeftig)
    before = [f.normal.copy() for f in bm.faces]
    closed = all(e.is_manifold for e in bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    flipped = sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < -0.5)
    bm.free()
    if closed and flipped:
        rep.err(f'LOD{level}: {flipped} Flaechen zeigen nach innen (Normalen umdrehen)')
    elif flipped:
        rep.warn(f'LOD{level}: {flipped} Flaechen evtl. falsch orientiert (offenes Mesh, bitte pruefen)')
    if config.DATA_COLOR not in me.color_attributes:
        rep.err(f'LOD{level}: Datenfarbe {config.DATA_COLOR!r} fehlt')
    for a in ((config.ATTR_BUILD, config.ATTR_BUILDH) if build else ()) + ((config.ATTR_PART, config.ATTR_PIVOT) if parts else ()):
        if a not in me.attributes:
            rep.err(f'LOD{level}: Attribut {a} fehlt')
    return tris


def footprint(rep, bbox_min, bbox_max, fp, tol=config.FOOTPRINT_TOL):
    """Bounding-Box (Blender-Koordinaten) gegen den Footprint (w entlang X, h entlang Y, Ursprung Mitte)."""
    if fp is None:
        return
    w, h = fp
    if bbox_min[0] < -w / 2 - tol or bbox_max[0] > w / 2 + tol:
        rep.err(f'Breite {bbox_min[0]:.2f}..{bbox_max[0]:.2f} ueberschreitet Footprint {w} (+/-{tol})')
    if bbox_min[1] < -h / 2 - tol or bbox_max[1] > h / 2 + tol:
        rep.err(f'Tiefe {bbox_min[1]:.2f}..{bbox_max[1]:.2f} ueberschreitet Footprint {h} (+/-{tol})')
    if bbox_min[2] < -0.3:
        rep.warn(f'Modell reicht {bbox_min[2]:.2f} unter den Boden (Fundament ok, sonst Ursprung pruefen)')
    if bbox_min[2] > 0.05:
        rep.warn(f'Modell schwebt ({bbox_min[2]:.2f} ueber Boden)')
    cx = (bbox_min[0] + bbox_max[0]) / 2
    cy = (bbox_min[1] + bbox_max[1]) / 2
    if abs(cx) > w * 0.25 + 0.1 or abs(cy) > h * 0.25 + 0.1:
        rep.warn(f'Ursprung nicht mittig im Footprint (Mitte der Box {cx:.2f}, {cy:.2f})')
