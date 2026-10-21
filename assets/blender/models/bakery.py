"""Baeckerei (BT.Bakery, Footprint 3x3).

Giebelstaendiges Haus: Erdgeschoss aus Bruchstein mit Eckquadern und Eichenstuerzen, Obergeschoss in Eichenfachwerk mit
Auskragung zur Strasse (sichtbare Balkenkoepfe), Fachwerkgiebel, steiles Ziegeldach in Lagen. Strassenseitig Verkaufsfenster
mit heruntergeklapptem Laden als Theke (Brote) und hochgestelltem Oberladen, Vordach auf Kopfbaendern, Bohlentuer,
Zunftschild (Spielerfarbe). Seitlich angebaut: gewoelbter Backofen (Lehmkuppel auf Bruchsteinsockel, Ofenloch in einer
Stirnmauer mit Russfahne, Holznische, Rauchabzug mit Rauch-Anker, kleines Schutzdach), Reisigbuendel, Teigtrog,
Brotschieber, Mehlsaecke. Front = -Y.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/bakery.py [--no-preview] [--no-bake] [--fast]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import anchors, asset, mesh, scene, town, uv  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils import noise  # noqa: E402

A = asset.begin('bakery', target={'building': 'Bakery'}, footprint=(3, 3), klass='production',
                desc='Baeckerei: Bruchstein-Erdgeschoss, Fachwerk-Obergeschoss mit Auskragung, Ziegeldach, Backofen mit '
                     'Lehmkuppel und Rauchabzug, Verkaufsladen mit Broten, Vordach, Mehlsaecke, Reisig, Zunftschild')
rnd = random.Random(53)

# ---------------------------------------------------------------- Grundmasse Haupthaus
HX0, HX1 = -1.38, 0.30
HY0, HY1 = -0.85, 1.30
LX, LY = HX1 - HX0, HY1 - HY0
XC = (HX0 + HX1) / 2
Z_G = 1.36                    # Oberkante Bruchsteinmauer
Z_J = 1.45                    # Oberkante Deckenbalken
Z_US0, Z_US1 = Z_J, Z_J + 0.10  # Schwelle Obergeschoss
Z_UP0, Z_UP1 = 2.25, 2.35     # Rahm Obergeschoss
JET = 0.09                    # Auskragung der Strassenseite
YF = HY0 - JET
PITCH = 50.0
TP = math.tan(math.radians(PITCH))
RIDGE = Z_UP1 + 0.09 + (LX / 2) * TP
YC = (YF + HY1) / 2

# ---------------------------------------------------------------- Erdgeschoss: Bruchsteinmauern mit Oeffnungen
gf = town.Wall((HX0, HY0), (HX1, HY0), (0, -1), 0.0, Z_G)
gb = town.Wall((HX1, HY1), (HX0, HY1), (0, 1), 0.0, Z_G)
gl = town.Wall((HX0, HY1), (HX0, HY0), (-1, 0), 0.0, Z_G)
gr = town.Wall((HX1, HY0), (HX1, HY1), (1, 0), 0.0, Z_G)
DOOR = (0.28, 0.78, 0.0, 1.12)
SHOP = (1.0, 1.54, 0.50, 0.98)
gf.opening(*DOOR, 'door').opening(*SHOP, 'window')
gb.opening(0.75, 1.05, 0.62, 0.95, 'window')
gl.opening(0.85, 1.12, 0.62, 0.95, 'window')
SIDE_DOOR = (0.10, 0.54, 0.0, 1.10)
gr.opening(*SIDE_DOOR, 'door')
WT = 0.2  # Mauerstaerke
for wi, w in enumerate((gf, gb, gl, gr)):
    u0, u1 = (0.0, w.L) if w in (gf, gb) else (WT, w.L - WT)
    for L, cell, bl in ((0, 0.26, 0.012), (1, 0.6, 0.0)):
        st = town.plaster(w, f'gwall{wi}_L{L}', u0, u1, 0.0, Z_G, rnd, inset=0.0, thick=WT, cell=cell, bulge=bl)
        if L == 0:
            town.grime_attr(st, lambda x, y, z: 0.3 * max(0.0, noise.noise(Vector((x * 3.0, y * 3.0, z * 3.0 + 4))) - 0.1))
        A.add(st, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.05, 0.4), smooth=0 if L else 50, dirt=1.2)
gbox = town.subdivided_box('gwalls_L2', (LX, LY, Z_G), loc=(XC, (HY0 + HY1) / 2, 0.0), cuts=1)
A.add(gbox, mat='M_Stone_Rubble', uv_mode='box', only=2, build=(0.05, 0.4), smooth=0)
# Sockelvorsprung
base = mesh.box('base_course', (LX + 0.05, LY + 0.05, 0.12), loc=(XC, (HY0 + HY1) / 2, -0.02))
A.add(base, mat='M_Stone_Rubble', uv_mode='box', build=(0.02, 0.1), smooth=0, dirt=1.5, lod2='drop')
# Eckquader (Laeufer/Binder im Wechsel) an den vier Ecken
quoins = []
for ci, (cx, cy, sx, sy) in enumerate(((HX0, HY0, 1, 1), (HX1, HY0, -1, 1), (HX1, HY1, -1, -1), (HX0, HY1, 1, -1))):
    z = 0.06
    k = 0
    while z < Z_G - 0.1:
        h = rnd.uniform(0.22, 0.28)
        h = min(h, Z_G - z)
        long_x = (k % 2 == 0)
        lx = rnd.uniform(0.34, 0.42) if long_x else rnd.uniform(0.2, 0.25)
        ly = rnd.uniform(0.2, 0.25) if long_x else rnd.uniform(0.34, 0.42)
        qc = (cx + sx * (lx / 2 - 0.012), cy + sy * (ly / 2 - 0.012))
        q = town.timber(f'quoin{ci}_{k}', (qc[0], qc[1], z + 0.005), (qc[0] + rnd.uniform(-0.004, 0.004), qc[1] + rnd.uniform(-0.004, 0.004), z + h - 0.005),
                        lx, ly, ch=0.018, up=(0, 1, 0), rnd=rnd, tile=2.0)
        for v in q.data.vertices:
            v.co.x += rnd.uniform(-0.004, 0.004)
            v.co.y += rnd.uniform(-0.004, 0.004)
        quoins.append(q)
        z += h
        k += 1
A.add(mesh.join(quoins, 'quoins'), mat='M_Stone_Rubble', uv_mode='box', lod1='drop', lod2='drop', build=(0.05, 0.4), smooth=30, dirt=1.1)
# Stuerze (Eiche) ueber Tuer, Fenstern; Seitentuer
lint = []
for w in (gf, gb, gl, gr):
    for (u0, u1, z0, z1, kind) in w.openings:
        lint.append(town.wall_timber(w, f'lintel_{w.out.x:.0f}{w.out.y:.0f}_{u0:.2f}', u0 - 0.1, z1 + 0.06, u1 + 0.1, z1 + 0.06 + rnd.uniform(-0.01, 0.01),
                                     0.12, WT + 0.01, depth=WT / 2, ch=0.01, rnd=rnd))
        if kind == 'window':
            lint.append(town.wall_timber(w, f'sill_{w.out.x:.0f}{w.out.y:.0f}_{u0:.2f}', u0 - 0.04, z0 - 0.03, u1 + 0.04, z0 - 0.03,
                                         0.06, WT + 0.03, depth=WT / 2 - 0.015, ch=0.006, rnd=rnd))
A.add(mesh.join(lint, 'lintels'), mat='M_Timber_Oak', uv_mode=None, build=(0.3, 0.42), smooth=0, wear=1.4, lod2='drop')

# ---------------------------------------------------------------- Deckenbalken (Auskragung vorn: Balkenkoepfe) und Streichbalken
joists = []
for k in range(6):
    x = HX0 + 0.1 + k * (LX - 0.2) / 5
    joists.append(town.timber(f'joist{k}', (x, HY0 + 0.25, (Z_G + Z_J) / 2), (x, YF - 0.035, (Z_G + Z_J) / 2), 0.09, Z_J - Z_G, ch=0.01, rnd=rnd))
for sx, xx in ((-1, HX0), (1, HX1)):
    joists.append(town.timber(f'sidebeam{sx}', (xx - sx * 0.045, YF - 0.03, (Z_G + Z_J) / 2), (xx - sx * 0.045, HY1 + 0.03, (Z_G + Z_J) / 2),
                              0.09, Z_J - Z_G, ch=0.0, rnd=rnd))
joists.append(town.timber('backbeam', (HX0, HY1 - 0.045, (Z_G + Z_J) / 2), (HX1, HY1 - 0.045, (Z_G + Z_J) / 2), 0.09, Z_J - Z_G, ch=0.0, rnd=rnd))
A.add(mesh.join(joists, 'joists'), mat='M_Timber_Oak', uv_mode=None, only=0, build=(0.4, 0.46), smooth=0, wear=1.2)
jl = [town.timber(f'joistL1_{k}', (HX0 + 0.1 + k * (LX - 0.2) / 5, HY0 + 0.05, (Z_G + Z_J) / 2), (HX0 + 0.1 + k * (LX - 0.2) / 5, YF - 0.035, (Z_G + Z_J) / 2),
                  0.09, Z_J - Z_G, ch=0.0, rnd=rnd) for k in range(6)]
for sx, xx in ((-1, HX0), (1, HX1)):
    jl.append(town.timber(f'sidebeamL1{sx}', (xx - sx * 0.045, YF - 0.03, (Z_G + Z_J) / 2), (xx - sx * 0.045, HY1 + 0.03, (Z_G + Z_J) / 2), 0.09, Z_J - Z_G, ch=0.0, rnd=rnd))
A.add(mesh.join(jl, 'joists_L1'), mat='M_Timber_Oak', uv_mode=None, only=1, build=(0.4, 0.46), smooth=0)

# ---------------------------------------------------------------- Obergeschoss: Fachwerk
uf = town.Wall((HX0, YF), (HX1, YF), (0, -1), Z_US1, Z_UP0)
ub = town.Wall((HX1, HY1), (HX0, HY1), (0, 1), Z_US1, Z_UP0)
ul = town.Wall((HX0, HY1), (HX0, YF), (-1, 0), Z_US1, Z_UP0)
ur = town.Wall((HX1, YF), (HX1, HY1), (1, 0), Z_US1, Z_UP0)
ZS = (Z_US0 + Z_US1) / 2
ZP = (Z_UP0 + Z_UP1) / 2
P = 0.1


def T(u, w=P):
    a, b = town.tilt(u, Z_US1, Z_UP0, rnd, 0.012)
    return (a, Z_US1 - 0.01, b, Z_UP0 + 0.01, w, 'post')


def Rl(u0, u1, z, w=0.07):
    z += rnd.uniform(-0.012, 0.012)
    return (u0, z, u1, z + rnd.uniform(-0.008, 0.008), w, 'rail')


def Br(u0, z0, u1, z1, w=0.08):
    return (u0, z0, u1, z1, w, 'brace')


W1 = (0.10, 0.37, 1.74, 2.0)
W2 = (1.31, 1.58, 1.74, 2.0)
uf.opening(*W1, 'window').opening(*W2, 'window')
WB = (0.65, 1.03, 1.74, 2.0)
ub.opening(*WB, 'window')
WR = (0.62, 0.96, 1.74, 2.0)
ur.opening(*WR, 'window')
WL = (1.18, 1.52, 1.74, 2.0)
ul.opening(*WL, 'window')
fm = [
    (-0.05, ZS, LX + 0.05, ZS, 0.10, 'sill'), (-0.06, ZP, LX + 0.06, ZP, 0.10, 'plate'),
    T(0.05), T(LX - 0.05), T(0.42), T(0.84, 0.11), T(1.26),
    Rl(0.05, 0.42, 1.71), Rl(0.05, 0.42, 2.03), Rl(1.26, LX - 0.05, 1.71), Rl(1.26, LX - 0.05, 2.03),
    Rl(0.42, 0.84, 1.80), Rl(0.84, 1.26, 1.84),
    Br(0.46, Z_US1, 0.84, 1.80), Br(1.22, Z_US1, 0.84, 1.84),        # Fussstreben (Mann-Figur)
    Br(0.84, 1.95, 0.48, Z_UP0), Br(0.84, 1.95, 1.20, Z_UP0),         # Kopfwinkel
]
bm_ = [
    (-0.05, ZS, LX + 0.05, ZS, 0.10, 'sill'), (-0.06, ZP, LX + 0.06, ZP, 0.10, 'plate'),
    T(0.05), T(LX - 0.05), T(0.60), T(1.08),
    Rl(0.60, 1.08, 1.71), Rl(0.60, 1.08, 2.03),
    Br(0.08, Z_US1, 0.58, Z_UP0 - 0.02), Rl(0.05, 0.60, 1.86),
    Br(1.60, Z_US1, 1.10, Z_UP0 - 0.02), Rl(1.08, LX - 0.05, 1.82),
]
rm = [
    (0.1, ZS, LY + JET - 0.1, ZS, 0.10, 'sill'), (0.1, ZP, LY + JET - 0.1, ZP, 0.10, 'plate'),
    T(0.57), T(1.01), T(1.55),
    Rl(0.57, 1.01, 1.71), Rl(0.57, 1.01, 2.03),
    Br(0.12, Z_US1, 0.55, 2.05), Rl(0.05, 0.57, 1.78),
    Rl(1.01, 1.55, 1.80), Br(1.03, 1.92, 1.53, Z_US1 + 0.02),
    Br(1.57, Z_US1, LY + JET - 0.12, 2.1), Rl(1.55, LY + JET - 0.05, 1.86),
]
lm = [
    (0.1, ZS, LY + JET - 0.1, ZS, 0.10, 'sill'), (0.1, ZP, LY + JET - 0.1, ZP, 0.10, 'plate'),
    T(0.62), T(1.13), T(1.57),
    Rl(1.13, 1.57, 1.71), Rl(1.13, 1.57, 2.03),
    Br(0.12, Z_US1, 0.60, 2.08), Rl(0.05, 0.62, 1.84),
    Br(0.64, 2.05, 1.11, Z_US1 + 0.02), Rl(0.62, 1.13, 1.76),
    Br(LY + JET - 0.12, Z_US1, 1.59, 2.05), Rl(1.57, LY + JET - 0.05, 1.80),
]
F0, F1, F2 = [], [], []
for wi, (w, ms) in enumerate(((uf, fm), (ub, bm_), (ur, rm), (ul, lm))):
    a, b, c = town.frame_lods(w, ms, rnd, f'uf{wi}', Z_US1, Z_UP0, key_posts=(wi == 0), pegs=wi in (0, 2), post_pegs=(wi == 0))
    F0 += a
    F1 += b
    F2 += c

# Giebelfachwerk vorn und hinten (Ortgangsparren, Kehlbalken, Giebelstaender, Streben)


def z_top(u):
    return RIDGE - 0.09 - abs(u - LX / 2) * TP


ZK = Z_UP1 + 0.5   # Kehlbalken
gables = []
for gi, (w0, w1, out) in enumerate((((HX0, YF), (HX1, YF), (0, -1)), ((HX1, HY1), (HX0, HY1), (0, 1)))):
    gw = town.Wall(w0, w1, out, Z_UP1, RIDGE)
    uk = (RIDGE - 0.09 - 0.08 - ZK) / TP
    ms = [
        (-0.02, z_top(-0.02) - 0.075, LX / 2, z_top(LX / 2) - 0.09, 0.12, 'rafter'),
        (LX + 0.02, z_top(LX + 0.02) - 0.075, LX / 2, z_top(LX / 2) - 0.09, 0.12, 'rafter'),
        (-0.02, Z_UP1 + 0.045, LX + 0.02, Z_UP1 + 0.045, 0.09, 'sill'),
        (LX / 2 - uk, ZK, LX / 2 + uk, ZK, 0.08, 'rail'),
        T_ := (LX / 2, Z_UP1 + 0.08, LX / 2 + 0.005, z_top(LX / 2) - 0.12, 0.1, 'post'),
        (LX / 2 - 0.05, Z_UP1 + 0.09, 0.30, Z_UP1 + 0.09 + 0.16, 0.075, 'brace') if False else (0.33, Z_UP1 + 0.09, LX / 2 - 0.05, ZK - 0.05, 0.075, 'brace'),
        (LX - 0.33, Z_UP1 + 0.09, LX / 2 + 0.05, ZK - 0.05, 0.075, 'brace'),
    ]
    a, b, c = town.frame_lods(gw, ms, rnd, f'gable{gi}', Z_UP1, RIDGE - 0.3, pegs=(gi == 0), post_pegs=False)
    F0 += a
    F1 += b
    F2 += c
    gp = town.plaster_gable(gw, f'gable_plaster{gi}', 0.02, LX - 0.02, Z_UP1 + 0.09, LX / 2, z_top(LX / 2) - 0.1, rnd)
    gp1 = town.plaster_gable(gw, f'gable_plaster{gi}_L1', 0.02, LX - 0.02, Z_UP1 + 0.09, LX / 2, z_top(LX / 2) - 0.1, rnd, cell=0.6, bulge=0.0)
    gables.append((gp, gp1))
A.add(mesh.join(F0, 'frame'), mat='M_Timber_Oak', uv_mode=None, only=0, build=(0.45, 0.66), smooth=30, wear=1.3)
A.add(mesh.join(F1, 'frame_L1'), mat='M_Timber_Oak', uv_mode=None, only=1, build=(0.45, 0.66), smooth=0, wear=1.3)
A.add(mesh.join(F2, 'frame_L2'), mat='M_Timber_Oak', uv_mode=None, only=2, build=(0.45, 0.66), smooth=0)

# Putzfelder Obergeschoss + Giebel
for wi, w in enumerate((uf, ub, ur, ul)):
    u0, u1 = (0.0, w.L) if w in (uf, ub) else (0.1, w.L - 0.1)
    p0 = town.plaster(w, f'uplaster{wi}', u0, u1, Z_US1, Z_UP0, rnd, cell=0.18)
    town.grime_attr(p0, lambda x, y, z: 0.5 * max(0.0, noise.noise(Vector((x * 4.1, y * 4.1, z * 3.3 + 2.0))) - 0.2))
    A.add(p0, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.55, 0.72), smooth=60)
    p1 = town.plaster(w, f'uplaster{wi}_L1', u0, u1, Z_US1, Z_UP0, rnd, cell=0.4, bulge=0.0)
    A.add(p1, mat='M_Plaster_Lime', uv_mode='box', only=1, build=(0.55, 0.72), smooth=0)
for gi, (gp, gp1) in enumerate(gables):
    A.add(gp, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.6, 0.76), smooth=0)
    A.add(gp1, mat='M_Plaster_Lime', uv_mode='box', only=(1, 2), build=(0.6, 0.76), smooth=0)
ubox = town.subdivided_box('ufloor_L2', (LX - 0.04, LY + JET - 0.04, Z_UP0 - Z_US1), loc=(XC, YC, Z_US1), cuts=1)
A.add(ubox, mat='M_Plaster_Lime', uv_mode='box', only=2, build=(0.55, 0.72), smooth=0)
# Lehmflecken
spots = [(uf, 0.62, 1.66, 0.06), (uf, 1.42, 2.12, 0.05), (ur, 1.3, 1.95, 0.07), (ub, 0.3, 2.1, 0.06), (ul, 0.35, 1.7, 0.06)]
pt = mesh.join([town.patch(w, f'patch{k}', u, z, r, rnd) for k, (w, u, z, r) in enumerate(spots)], 'clay_patches')
A.add(pt, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.6, 0.72), smooth=0)
pt['sp_grime'] = 0.85

# Fenster: dunkle Rueckwand, Sprossen; Laeden am Obergeschoss
backs, bars, shut = [], [], []
for w in (gb, gl, uf, ub, ur, ul):
    for (u0, u1, z0, z1, kind) in w.openings:
        if kind != 'window':
            continue
        deep = WT - 0.02 if w in (gb, gl) else 0.088
        backs.append(town.opening_reveal(w, f'wback_{id(w)}_{u0:.2f}', u0, u1, z0, z1, depth=deep))
        um = (u0 + u1) / 2
        bars.append(town.wall_timber(w, f'wbar_{id(w)}_{u0:.2f}', um, z0, um, z1, 0.035, 0.04, depth=deep * 0.6, rnd=rnd))
        bars.append(town.wall_timber(w, f'wbarh_{id(w)}_{u0:.2f}', u0, (z0 + z1) / 2 + 0.03, u1, (z0 + z1) / 2 + 0.03, 0.028, 0.03, depth=deep * 0.6, rnd=rnd))
        if w in (uf, ur):
            # einfluegeliger Laden, zur Wandmitte hin aufgeklappt
            sw = u1 - u0 + 0.02
            ua = u1 + 0.005 if (u0 + u1) / 2 < w.L / 2 else u0 - 0.005 - sw
            for k in range(2):
                uc = ua + sw / 4 + k * sw / 2
                shut.append(town.wall_timber(w, f'shut_{id(w)}_{u0:.2f}_{k}', uc, z0 - 0.02 + rnd.uniform(-0.005, 0.005), uc,
                                             z1 + 0.02 + rnd.uniform(-0.005, 0.005), sw / 2 - 0.004, 0.02, depth=-0.012, ch=0.0, rnd=rnd))
            for z in (z0 + 0.05, z1 - 0.05):
                shut.append(town.wall_timber(w, f'shutb_{id(w)}_{u0:.2f}_{z:.2f}', ua + 0.01, z, ua + sw - 0.01, z, 0.04, 0.014, depth=-0.028, rnd=rnd))
wbk = mesh.join(backs, 'window_backs')
uv.box(wbk, tile=2.0)
A.add(wbk, mat='M_Wood_Planks', uv_mode=None, build=(0.4, 0.7), smooth=0)
wbk['sp_grime'] = 1.0
A.add(mesh.join(bars, 'window_bars'), mat='M_Timber_Oak', uv_mode=None, build=(0.4, 0.7), smooth=0, lod1='drop', lod2='drop')
A.add(mesh.join(shut, 'shutters'), mat='M_Wood_Planks', uv_mode=None, build=(0.6, 0.74), smooth=0, dirt=0.9, lod2='drop')

# Tueren (Bohlen) mit Beschlaegen
doors, iron = [], []
for w, (u0, u1, z0, z1, kind) in ((gf, gf.openings[0]), (gr, gr.openings[0])):
    n = 5
    bw = (u1 - u0 - 0.01) / n
    for k in range(n):
        uu = u0 + 0.005 + bw * (k + 0.5)
        doors.append(town.wall_timber(w, f'door_{id(w)}_{k}', uu, z0 + 0.01, uu, z1 - 0.005 - rnd.uniform(0, 0.012), bw - 0.004, 0.035,
                                      depth=0.06, ch=0.0, rnd=rnd))
    for z in (z0 + 0.22, z1 - 0.22):
        iron.append(town.wall_timber(w, f'hinge_{id(w)}_{z:.2f}', u0 + 0.02, z, u1 - 0.12, z, 0.035, 0.008, depth=0.038, rnd=rnd))
A.add(mesh.join(doors, 'doors'), mat='M_Wood_Planks', uv_mode=None, build=(0.38, 0.45), smooth=0, dirt=1.2)

# ---------------------------------------------------------------- Dach: Ziegellagen (First entlang Y)
XE_L = (HY1 - YF) / 2 + 0.14
YE_L = LX / 2 + 0.2
R = town.GableRoof(XE_L, YE_L, RIDGE, PITCH, sag=0.03, cy=0.0, seed=2)
ROT = math.pi / 2


def roofw(o):
    return town.place(o, ROT, (XC, YC, 0.0))


def roof_z_world(x, y):
    return R.z(y - YC, XC - x)


rows0 = []
for side in (-1, 1):
    rows0 += town.course_rows(f'tiles{side}', R, side, rows=9, row_thick=0.032, depth0=0.03, seed=11 + side, tooth=0.014, nseg=5,
                              jitter=0.009, lean=True, split=True)
t0 = mesh.join(rows0, 'roof_tiles')
town.uv_roof(t0, R, tile=2.0, seed=4)
roofw(t0)
town.grime_attr(t0, lambda x, y, z: 0.25 * max(0.0, noise.noise(Vector((x * 2.2, y * 2.2, 1.0)))) + (0.3 if x > XC + 0.2 else 0.0) * max(0.0, 1.0 - (z - 2.3) / 0.6))
A.add(t0, mat='M_Roof_ClayTile', uv_mode=None, only=0, build=(0.72, 0.94), smooth=0, dirt=1.1)
for L, rows in ((1, 4), (2, 1)):
    objs = []
    for side in (-1, 1):
        objs += town.course_rows(f'tilesL{L}{side}', R, side, rows=rows, row_thick=0.045, depth0=0.03, seed=3, nseg=1, jitter=0.0, lean=True)
    o = mesh.join(objs, f'roof_L{L}')
    town.uv_roof(o, R, tile=2.0, seed=4)
    roofw(o)
    A.add(o, mat='M_Roof_ClayTile', uv_mode=None, only=L, build=(0.72, 0.94), smooth=0, dirt=1.1)
# Firstziegel (Hohlziegel in Reihe)
rz = []
nr = 5
for k in range(nr):
    xa = -XE_L + 2 * XE_L * k / nr - 0.01
    xb = -XE_L + 2 * XE_L * (k + 1) / nr + 0.02
    c = mesh.cylinder(f'ridge_tile{k}', 0.065, xb - xa, segs=6, loc=((xa + xb) / 2, 0, 0), axis='X', r_top=0.058)
    for v in c.data.vertices:
        v.co.z = max(v.co.z, -0.01) + R.z_main(v.co.x, 0) + 0.03 + rnd.uniform(-0.003, 0.003)
    rz.append(c)
ridge = mesh.join(rz, 'ridge_tiles')
roofw(ridge)
A.add(ridge, mat='M_Roof_ClayTile', uv_mode='box', build=(0.92, 0.96), smooth=40, dirt=1.4, lod1=0.5, lod2=0.3)
# Windbretter an beiden Giebeln
wbd = []
for sx in (-1, 1):
    xv = sx * (XE_L - 0.012)
    for side in (-1, 1):
        p0 = (xv, side * (YE_L - 0.01), R.z_main(xv, side * (YE_L - 0.01)) - 0.02)
        p1 = (xv, 0.0, R.z_main(xv, 0.0) - 0.02)
        wbd.append(town.timber(f'barge{sx}_{side}', p0, p1, 0.028, 0.14, ch=0.004, up=(0, 0, 1), rnd=rnd))
wbo = mesh.join(wbd, 'barge_boards')
roofw(wbo)
A.add(wbo, mat='M_Wood_Planks', uv_mode=None, build=(0.8, 0.9), smooth=0, dirt=1.0, lod2='drop')
# Dachunterseite (Schalung) im Ueberstand: einfache Flaechen unter den Lagen
soff = []
for side in (-1, 1):
    bmS = __import__('bmesh').new()
    pts = []
    for (xx, yy) in ((-XE_L, side * YE_L), (XE_L, side * YE_L), (XE_L, 0.0), (-XE_L, 0.0)):
        pts.append(bmS.verts.new((xx, yy, R.z_main(xx, yy) - 0.005)))
    bmS.faces.new(pts if side < 0 else list(reversed(pts)))
    __import__('bmesh').ops.recalc_face_normals(bmS, faces=bmS.faces)
    f = list(bmS.faces)[0]
    if f.normal.z > 0:
        f.normal_flip()
    soff.append(mesh.obj_from_bm(f'roof_under{side}', bmS))
so = mesh.join(soff, 'roof_underside')
uv.box(so, tile=2.0)
roofw(so)
A.add(so, mat='M_Wood_Planks', uv_mode=None, build=(0.7, 0.8), smooth=0, dirt=1.5)

# ---------------------------------------------------------------- Vordach strassenseitig (Pultdach auf Kopfbaendern)
VX0, VX1 = HX0 + 0.06, HX1 - 0.06
VD = 0.46
RV = town.GableRoof((VX1 - VX0) / 2, VD, Z_G - 0.03, 24.0, cy=0.0, seed=7)
rowsV = town.course_rows('vtiles', RV, -1, rows=3, row_thick=0.03, depth0=0.03, seed=5, tooth=0.012, nseg=5, jitter=0.008, lean=True)
vt = mesh.join(rowsV, 'vordach_tiles')
town.uv_roof(vt, RV, tile=2.0, seed=6)
town.place(vt, 0.0, (XC + (VX0 + VX1) / 2 - XC, HY0, 0.0))
A.add(vt, mat='M_Roof_ClayTile', uv_mode=None, build=(0.8, 0.9), smooth=0, dirt=1.0, lod1=0.5, lod2='drop')
vframe = []
zf = RV.z_main(0, -VD + 0.06) - 0.06
vframe.append(town.timber('v_purlin', (VX0, HY0 - VD + 0.06, zf), (VX1, HY0 - VD + 0.06, zf), 0.07, 0.08, ch=0.008, segs=2, rnd=rnd))
for x in (VX0 + 0.05, (VX0 + VX1) / 2 - 0.05, VX1 - 0.05):
    vframe.append(town.timber(f'v_rafter{x:.2f}', (x, HY0, RV.z_main(0, 0) - 0.05), (x, HY0 - VD + 0.02, RV.z_main(0, -VD + 0.02) - 0.05), 0.05, 0.06, ch=0.006, rnd=rnd))
for x in (VX0 + 0.05, VX1 - 0.05):
    vframe.append(town.timber(f'v_brace{x:.2f}', (x, HY0 - 0.02, zf - 0.42), (x, HY0 - VD + 0.08, zf - 0.03), 0.06, 0.07, ch=0.006, rnd=rnd))
A.add(mesh.join(vframe, 'vordach_frame'), mat='M_Timber_Oak', uv_mode=None, build=(0.75, 0.82), smooth=0, lod2='drop')

# Verkaufsfenster: Unterladen als Theke (mit Broten), Oberladen aufgestellt
su0, su1, sz0, sz1, _ = gf.openings[1]
sx0, sx1 = HX0 + su0, HX0 + su1
counter = [town.timber('counter', (sx0 - 0.03, HY0 - 0.15, sz0 - 0.02), (sx1 + 0.03, HY0 - 0.15, sz0 - 0.02), 0.3, 0.035, ch=0.004, rnd=rnd)]
flap = town.timber('flap_up', ((sx0 + sx1) / 2, HY0 - 0.015, sz1 + 0.015), ((sx0 + sx1) / 2, HY0 - 0.27, sz1 + 0.215), sx1 - sx0 + 0.02, 0.025, ch=0.003, rnd=rnd)
counter.append(flap)
for x in (sx0 + 0.04, sx1 - 0.04):
    counter.append(town.timber(f'counter_strut{x:.2f}', (x, HY0 - 0.01, sz0 - 0.28), (x, HY0 - 0.25, sz0 - 0.05), 0.03, 0.04, ch=0.0, rnd=rnd))
    counter.append(town.timber(f'flap_stick{x:.2f}', (x, HY0 - 0.27, sz0 + 0.0), (x, HY0 - 0.26, sz1 + 0.2), 0.016, 0.016, ch=0.0, rnd=rnd))
A.add(mesh.join(counter, 'counter'), mat='M_Wood_Planks', uv_mode=None, build=(0.85, 0.92), smooth=0, dirt=1.1, lod2='drop')
breads = []
for k in range(7):
    x = sx0 + 0.06 + k * (sx1 - sx0 - 0.1) / 6 + rnd.uniform(-0.01, 0.01)
    y = HY0 - 0.1 - (0.1 if k % 2 else 0.0) + rnd.uniform(-0.015, 0.015)
    breads.append(town.loaf(f'loaf{k}', x, y, sz0 - 0.002, rnd, rot=rnd.uniform(-0.6, 0.6), l=rnd.uniform(0.1, 0.13)))
A.add(mesh.join(breads, 'breads'), mat='M_Roof_ClayTile', uv_mode='box', build=(0.95, 0.99), smooth=60, dirt=0.0, lod1='keep', lod2='drop')

# Zunftschild an eisernem Ausleger (Spielerfarbe)
iron.append(town.timber('sign_arm', (HX0 + 0.12, YF - 0.01, 1.98), (HX0 + 0.12, YF - 0.42, 1.98), 0.02, 0.025, ch=0.0, rnd=rnd))
iron.append(town.timber('sign_strut', (HX0 + 0.12, YF - 0.01, 1.78), (HX0 + 0.12, YF - 0.3, 1.97), 0.016, 0.016, ch=0.0, rnd=rnd))
for y in (YF - 0.16, YF - 0.38):
    iron.append(town.timber(f'sign_chain{y:.2f}', (HX0 + 0.12, y, 1.97), (HX0 + 0.12, y, 1.88), 0.008, 0.008, ch=0.0, rnd=rnd))
ring = mesh.ring('sign_pretzel', 0.05, 0.065, 0.012, segs=8, loc=(0, 0, 0))
ring.rotation_euler = (0, math.pi / 2, 0)
ring.location = (HX0 + 0.1, YF - 0.27, 1.72)
scene.apply_transforms(ring)
iron.append(ring)
A.add(mesh.join(iron, 'iron'), mat='M_Iron_Wrought', uv_mode='box', build=(0.9, 0.96), smooth=0, dirt=0.5, lod1='drop', lod2='drop')
sign = town.timber('sign_board', (HX0 + 0.12, YF - 0.12, 1.875), (HX0 + 0.12, YF - 0.42, 1.875), 0.025, 0.26, ch=0.004, up=(0, 0, 1), rnd=rnd)
for v in sign.data.vertices:
    v.co.z -= 0.13
A.add(sign, mat='M_Wood_Planks', uv_mode=None, team=True, build=(0.92, 0.97), smooth=0, dirt=0.4, lod2='drop')

# ---------------------------------------------------------------- Backofen (Anbau +X)
OX0, OX1 = 0.42, 1.40
OY0, OY1 = -0.25, 1.05
OZ = 0.5
OCX = (OX0 + OX1) / 2
pf = town.Wall((OX0, OY0), (OX1, OY0), (0, -1), 0.0, OZ)
NICHE = (0.12, 0.44, 0.07, 0.38)
pf.opening(*NICHE, 'niche')
for L, cell in ((0, 0.2), (1, 0.6)):
    po = town.plaster(pf, f'oven_front_L{L}', 0.0, pf.L, 0.0, OZ, rnd, inset=0.0, thick=0.32, cell=cell, bulge=0.01 if L == 0 else 0.0)
    A.add(po, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.1, 0.3), smooth=0, dirt=1.3)
ob = town.subdivided_box('oven_base', (OX1 - OX0, OY1 - OY0 - 0.32, OZ), loc=(OCX, (OY0 + 0.32 + OY1) / 2, 0.0), cuts=2)
mesh.displace(ob, 0.012, 6.0, seed=3)
A.add(ob, mat='M_Stone_Rubble', uv_mode='box', build=(0.1, 0.3), smooth=0, dirt=1.3)
ob2 = mesh.box('oven_base_L2', (OX1 - OX0, OY1 - OY0, OZ), loc=(OCX, (OY0 + OY1) / 2, 0.0))
A.add(ob2, mat='M_Stone_Rubble', uv_mode='box', only=2, build=(0.1, 0.3), smooth=0)
oslab = town.subdivided_box('oven_slab', (OX1 - OX0 + 0.04, OY1 - OY0 + 0.04, 0.05), loc=(OCX, (OY0 + OY1) / 2, OZ - 0.01), cuts=1)
mesh.displace(oslab, 0.006, 7.0, seed=5)
A.add(oslab, mat='M_Stone_Rubble', uv_mode='box', build=(0.28, 0.34), smooth=0, dirt=1.2, lod2='drop')
# Holznische: dunkle Rueckwand + Scheite
nb = town.opening_reveal(pf, 'niche_back', NICHE[0], NICHE[1], NICHE[2], NICHE[3], depth=0.3)
uv.box(nb, tile=2.0)
A.add(nb, mat='M_Wood_Planks', uv_mode=None, build=(0.1, 0.3), smooth=0)
nb['sp_grime'] = 1.0
nlogs = []
for k in range(8):
    row, col = divmod(k, 4)
    x = OX0 + NICHE[0] + 0.045 + col * 0.075 + rnd.uniform(-0.006, 0.006)
    z = NICHE[2] + 0.04 + row * 0.07
    nlogs.append(town.log(f'nlog{k}', (x, OY0 + 0.28, z), (x + rnd.uniform(-0.01, 0.01), OY0 + 0.015, z + rnd.uniform(-0.005, 0.005)), 0.034, segs=4, rnd=rnd))
A.add(mesh.join(nlogs, 'niche_logs'), mat='M_Wood_Planks', uv_mode=None, build=(0.85, 0.95), smooth=0, lod1='drop', lod2='drop')
# Lehmkuppel
for L, (segs, rings) in enumerate(((14, 4), (9, 2), (7, 1))):
    d = town.dome(f'oven_dome_L{L}', OCX, 0.43, OZ + 0.04, 0.44, 0.58, 0.46, segs=segs, rings=rings, cut_y=OY0 + 0.12, rnd=rnd)
    town.grime_attr(d, lambda x, y, z: 0.15 + 0.8 * max(0.0, 1.0 - (y - (OY0 + 0.12)) / 0.45) * max(0.0, (z - OZ) / 0.46) + 0.2 * max(0.0, noise.noise(Vector((x * 6, y * 6, z * 6)))))
    from sp import materials as _m  # noqa: E402
    _m.assign(d, 'M_Roof_ClayTile')
    uv.cylindrical(d, center=(OCX, 0.43, 0.0))
    A.add(d, mat=None, uv_mode=None, only=L, build=(0.3, 0.6), smooth=50 if L < 2 else 0, dirt=1.0)
# Stirnmauer mit Ofenloch
of = town.Wall((OX0 + 0.18, OY0), (OX1 - 0.18, OY0), (0, -1), OZ, OZ + 0.62)
MOUTH = (of.L / 2 - 0.12, of.L / 2 + 0.12, OZ + 0.04, OZ + 0.27)
of.opening(*MOUTH, 'mouth')
for L, cell in ((0, 0.16), (1, 0.6)):
    fw = town.plaster(of, f'oven_wall_L{L}', 0.0, of.L, OZ, OZ + 0.62, rnd, inset=0.0, thick=0.15, cell=cell, bulge=0.008 if L == 0 else 0.0)
    if L == 0:
        mc = OX0 + 0.18 + of.L / 2
        town.grime_attr(fw, lambda x, y, z: max(0.0, 1.0 - abs(x - mc) / (0.14 + 0.25 * max(0.0, z - OZ - 0.2))) * max(0.0, min(1.0, (z - OZ - 0.15) / 0.12)) * 0.95)
    A.add(fw, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.3, 0.45), smooth=0, dirt=1.2)
mb = town.opening_reveal(of, 'mouth_back', *MOUTH[:4], depth=0.14)
uv.box(mb, tile=2.0)
A.add(mb, mat='M_Stone_Rubble', uv_mode=None, build=(0.3, 0.45), smooth=0)
mb['sp_grime'] = 1.0
arch = []
mcx = OX0 + 0.18 + of.L / 2
for k, a in enumerate((-0.55, 0.0, 0.55)):
    ac = Vector((mcx + math.sin(a) * 0.14, OY0 + 0.075, OZ + 0.28 + math.cos(a) * 0.04))
    dv = Vector((math.sin(a), 0, math.cos(a)))
    arch.append(town.timber(f'arch{k}', ac - dv * 0.045, ac + dv * 0.045, 0.17, 0.11, ch=0.012, up=(0, 1, 0), rnd=rnd))
arch.append(town.timber('mouth_sill', (mcx - 0.16, OY0 + 0.07, OZ + 0.02), (mcx + 0.16, OY0 + 0.07, OZ + 0.02), 0.2, 0.05, ch=0.01, rnd=rnd))
ar = mesh.join(arch, 'mouth_arch')
A.add(ar, mat='M_Stone_Rubble', uv_mode='box', build=(0.4, 0.48), smooth=20, dirt=1.4, lod1='drop', lod2='drop')
ar['sp_grime'] = 0.6
# Rauchabzug ueber dem Ofenloch
CH_TOP = 2.7
chim = town.chimney_shaft('oven_chimney', mcx, OY0 + 0.1, OZ + 0.6, CH_TOP, 0.28, 0.23, rnd, rings=5)
town.grime_attr(chim, lambda x, y, z: max(0.0, (z - (CH_TOP - 0.5)) / 0.5) * 0.9 + 0.2)
A.add(chim, mat='M_Stone_Rubble', uv_mode='box', build=(0.45, 0.9), smooth=0, dirt=1.2, lod1='keep', lod2='keep')
ccap = [town.timber('ch_cap', (mcx - 0.165, OY0 + 0.1, CH_TOP + 0.045), (mcx + 0.165, OY0 + 0.1, CH_TOP + 0.045), 0.29, 0.05, ch=0.012, rnd=rnd),
        town.timber('ch_band', (mcx - 0.155, OY0 + 0.1, CH_TOP - 0.42), (mcx + 0.155, OY0 + 0.1, CH_TOP - 0.42), 0.27, 0.05, ch=0.012, rnd=rnd)]
cc = mesh.join(ccap, 'chimney_cap')
A.add(cc, mat='M_Stone_Rubble', uv_mode='box', build=(0.88, 0.94), smooth=20, dirt=1.5, lod2='drop')
cc['sp_grime'] = 0.75
# Schutzdach ueber dem Ofenloch
RH = town.GableRoof(0.34, 0.42, OZ + 0.95, 28.0, cy=0.0, seed=9)
rh = town.course_rows('hood_tiles', RH, -1, rows=3, row_thick=0.028, depth0=0.03, seed=8, tooth=0.012, nseg=4, jitter=0.008, lean=True)
hood = mesh.join(rh, 'hood_tiles')
town.uv_roof(hood, RH, tile=2.0, seed=8)
town.place(hood, 0.0, (mcx, OY0 + 0.16, 0.0))
A.add(hood, mat='M_Roof_ClayTile', uv_mode=None, build=(0.85, 0.92), smooth=0, dirt=1.4, lod2='drop')
hb = [town.timber(f'hood_bracket{s}', (mcx + s * 0.28, OY0 + 0.05, OZ + 0.5), (mcx + s * 0.28, OY0 + 0.16 - 0.38, RH.z_main(0, -0.38) - 0.06), 0.04, 0.05, ch=0.0, rnd=rnd)
      for s in (-1, 1)]
A.add(mesh.join(hb, 'hood_brackets'), mat='M_Timber_Oak', uv_mode=None, build=(0.8, 0.88), smooth=0, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Gebrauchsspuren: Mehlsaecke, Reisig, Trog, Brotschieber, Pflaster
sacks = [town.sack('sack0', HX0 + 0.16, HY0 - 0.2, rnd, s=1.0, rot=0.3), town.sack('sack1', HX0 + 0.38, HY0 - 0.17, rnd, s=0.92, rot=-0.2),
         town.sack('sack2', HX0 + 0.26, HY0 - 0.42, rnd, s=0.95, rot=1.2, lie=True), town.sack('sack3', OX1 - 0.05, OY0 - 0.42, rnd, s=0.9, rot=0.6)]
sk = mesh.join(sacks, 'flour_sacks')
A.add(sk, mat='M_Cloth_Linen', uv_mode='box', build=(0.92, 0.98), smooth=50, dirt=0.7, lod2='drop')
bundles = []
for k, (x, y) in enumerate(((OX1 + 0.06, OY1 - 0.18), (OX1 + 0.07, OY1 - 0.33))):
    bundles.append(town.log(f'bundle_lean{k}', (x + 0.05, y, 0.0), (x - 0.01, y + 0.05, 0.64), 0.055, segs=6, rnd=rnd))
for k, (x, z) in enumerate(((OX1 + 0.065, 0.058), (OX1 + 0.18, 0.058), (OX1 + 0.12, 0.16))):
    y0 = OY0 + 0.05 + rnd.uniform(-0.03, 0.03)
    bundles.append(town.log(f'reisig{k}', (x, y0, z), (x + rnd.uniform(-0.015, 0.015), y0 + 0.52, z + rnd.uniform(-0.01, 0.01)), 0.058, segs=6, rnd=rnd))
A.add(mesh.join(bundles, 'brushwood'), mat='M_Wood_Planks', uv_mode=None, build=(0.9, 0.97), smooth=0, dirt=1.3, lod2='drop')
# Teigtrog vor dem Ofen
tx, ty = OX0 + 0.12, OY0 - 0.62
trough = [town.trough('trough_body', tx + 0.23, ty, 0.24, L=0.46, W=0.2, H=0.13)]
for k, dx in enumerate((0.05, 0.41)):
    trough.append(town.timber(f'trough_leg{k}a', (tx + dx, ty - 0.07, 0.0), (tx + dx, ty - 0.03, 0.26), 0.035, 0.035, ch=0.0, rnd=rnd))
    trough.append(town.timber(f'trough_leg{k}b', (tx + dx, ty + 0.07, 0.0), (tx + dx, ty + 0.03, 0.26), 0.035, 0.035, ch=0.0, rnd=rnd))
tr = mesh.join(trough, 'trough')
uv.box(tr, tile=2.0, space='object', along='x')
A.add(tr, mat='M_Wood_Planks', uv_mode=None, build=(0.9, 0.97), smooth=0, dirt=1.0, lod2='drop')
peel = [town.timber('peel_handle', (mcx - 0.3, OY0 - 0.28, 0.0), (mcx - 0.24, OY0 - 0.02, 1.18), 0.025, 0.025, ch=0.0, rnd=rnd),
        town.timber('peel_blade', (mcx - 0.3, OY0 - 0.28, 0.0), (mcx - 0.31, OY0 - 0.32, 0.2), 0.012, 0.16, ch=0.0, rnd=rnd)]
A.add(mesh.join(peel, 'peel'), mat='M_Wood_Planks', uv_mode=None, build=(0.92, 0.98), smooth=0, lod1='drop', lod2='drop')
# Pflastersteine vor Ofen und Tuer
flags = []
for k, (x, y, sx, sy) in enumerate(((mcx - 0.2, OY0 - 0.3, 0.34, 0.26), (mcx + 0.16, OY0 - 0.28, 0.3, 0.24), (mcx - 0.02, OY0 - 0.56, 0.32, 0.22),
                                   (HX0 + 0.53, HY0 - 0.16, 0.5, 0.26))):
    r_ = rnd.uniform(-0.2, 0.2)
    dx, dy = math.cos(r_) * sx / 2, math.sin(r_) * sx / 2
    f = town.timber(f'flag{k}', (x - dx, y - dy, 0.012), (x + dx, y + dy, 0.012), sy, 0.05, ch=0.012, rnd=rnd)
    for v in f.data.vertices:
        v.co.x += rnd.uniform(-0.012, 0.012)
        v.co.y += rnd.uniform(-0.012, 0.012)
    flags.append(f)
A.add(mesh.join(flags, 'flagstones'), mat='M_Stone_Rubble', uv_mode='box', build=(0.02, 0.15), smooth=20, dirt=1.6, lod2='drop')

# ---------------------------------------------------------------- Anker: Rauch (Rauchabzug), Glut am Ofenloch, Arbeitsplaetze
anchors.anchor('smoke', (mcx, OY0 + 0.1, CH_TOP + 0.12), rate=2.2, staffed=True)
anchors.anchor('work', (mcx, OY0 - 0.45, 0.0), note='Ofenloch')
anchors.anchor('work', ((sx0 + sx1) / 2, HY0 - 0.5, 0.0), note='Verkaufsladen')
anchors.anchor('door', (HX0 + (DOOR[0] + DOOR[1]) / 2, HY0 - 0.3, 0.0))

asset.finish(A)
