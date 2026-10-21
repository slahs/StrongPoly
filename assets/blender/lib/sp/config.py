"""Konstanten der Pipeline: Pfade, Achsen, Attributnamen, Budgets. Gegenstueck zur Laufzeit: packages/client/src/render/assets/."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
ASSETS = ROOT / 'assets'
MATERIALS_JSON = ASSETS / 'materials.json'
REGISTRY = ASSETS / 'registry'
SRC = ASSETS / 'src'
PREVIEWS = ASSETS / 'previews'
PUBLIC = ROOT / 'packages' / 'client' / 'public' / 'assets'
MODELS_OUT = PUBLIC / 'models'
TEXTURES = PUBLIC / 'textures'

# ---------------------------------------------------------------- Massstab und Achsen
# 1 Blender-Einheit = 1 Spiel-Einheit = 1 Kachel. Blender Z oben -> glTF/three Y oben (Exporter: (x, y, z) -> (x, z, -y)).
# Ursprung = Mitte des Footprints auf Bodenhoehe 0. Breite def.w entlang Blender X, Tiefe def.h entlang Blender Y.
# VORDERSEITE (Eingang) zeigt nach Blender -Y (= Blender-Vorderansicht, Numpad 1) -> three +Z: das entspricht der
# Front der prozeduralen Modelle (building_parts.ts: "Gebaeudefront zeigt nach +z") bei Drehung b.r = 0; b.r = 1 dreht
# im Spiel um +90 Grad um die Hochachse (Front -> +x), genau wie bei den prozeduralen Modellen.
FRONT = (0.0, -1.0, 0.0)


def to_gltf(v):
    """Blender-Vektor (x, y, z) in glTF/three-Koordinaten (x, z, -y). Eigene Vektorattribute rechnet der Exporter NICHT um."""
    return (v[0], v[2], -v[1])


# ---------------------------------------------------------------- Vertexattribute (Namen im GLB; three liest sie kleingeschrieben)
# COLOR_0 (Farbattribut 'Data', FLOAT_COLOR, Ecken): R = Ambient Occlusion (1 = frei), G = Schmutz (0 sauber .. 1),
#                                                  B = Kantenabnutzung (0 .. 1), A = Teamfarbe (1 = Spielerfarbe).
DATA_COLOR = 'Data'
# _BUILD (vec3) = (s0, s1, y0): Bauzeitfenster (0..1 Fortschritt) und Unterkante des Teils (Hoehe, glTF-Y);
# _BUILDH (float) = Hoehe des Teils. Laufzeit setzt daraus aBuild = (s0, s1, y0, h) wie builder.ts.
ATTR_BUILD = '_BUILD'
ATTR_BUILDH = '_BUILDH'
# _PART (float) = Teil-Kennung fuer die Vertex-Animation (materials.ts PART / unit_shader.ts UPART), _PIVOT (vec3, glTF-Raum)
ATTR_PART = '_PART'
ATTR_PIVOT = '_PIVOT'
# nur Figuren (kompatibel zu unit_shader.ts): _STYLE (vec3) + _SLOT (float) = aStyle (Farbklasse, Sichtbarkeitsmaske,
# Hueft-/Oberkoerperhoehe | Slot), _ARM (float) = Armstil (aMeta.z). Keine vec4-Farbattribute fuer Daten: der Exporter
# schreibt FLOAT_COLOR-Attribute zusaetzlich als COLOR_n.
ATTR_STYLE = '_STYLE'
ATTR_SLOT = '_SLOT'
ATTR_ARM = '_ARM'

# Teil-Kennungen (gleich materials.ts PART / unit_shader.ts UPART)
PART = {
    'static': 0, 'leg_l': 1, 'leg_r': 2, 'arm_r': 3, 'arm_l': 4, 'bow': 5, 'wheel': 6, 'lever': 7, 'slide': 8,
    'sail': 10, 'cloth': 11, 'door': 12, 'cape': 13, 'head': 14, 'shin_l': 15, 'shin_r': 16, 'mane': 17,
}

# Bauzeitfenster wie builder.ts (AUTO_LO, AUTO_SPAN)
AUTO_LO = 0.1
AUTO_SPAN = 0.72

# ---------------------------------------------------------------- LOD
LOD_NAMES = ('LOD0', 'LOD1', 'LOD2')
# Standard-Verhaeltnisse (Anteil Dreiecke) wenn ein Objekt nichts anderes sagt
LOD_RATIO = (1.0, 0.35, 0.1)
# kleine Objekte (Diagonale der Bounding-Box) fallen ab dieser LOD-Stufe weg
LOD_DROP_SMALL = {1: 0.06, 2: 0.18}

# Dreiecksbudgets je Klasse (LOD0, LOD1, LOD2) - PIPELINE.md
BUDGETS = {
    'keep': (25000, 8750, 2500),
    'house': (8000, 2800, 800),
    'production': (8000, 2800, 800),
    'wall': (1500, 600, 200),
    'gate': (6000, 2100, 600),
    'small': (3000, 1100, 350),
    'figure': (2500, 800, 250),
    'prop': (1500, 600, 150),
}

# Footprint-Toleranz: Dachueberstaende duerfen den Footprint geringfuegig ueberschreiten (je Seite, Einheiten)
FOOTPRINT_TOL = 0.35
