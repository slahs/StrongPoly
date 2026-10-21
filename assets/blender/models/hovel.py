"""Fachwerkhaus (Wohnhaus) fuer BT.Hovel, Footprint 2x2.

Kleines mitteleuropaeisches Fachwerkhaus des Hoch-/Spaetmittelalters: Bruchsteinsockel, Eichenfachwerk (Schwelle mit
Vorkoepfen, leicht schiefe Staender, Riegel in wechselnden Hoehen, Fuss-/Kopfstreben, durchhaengendes Rahm, Holznaegel),
Gefache mit Kalkputz (leicht ausgebeult, Lehmflecken/abgeplatzte Stellen ueber die Datenfarbe), steiles Strohdach mit
Krueppelwalm, Lagen, unruhiger Traufe und Grassodenfirst, verbretterte Giebeldreiecke mit Windbrettern, Sparrenkoepfe,
Bruchsteinkamin (Rauch-Anker), Bohlentuer mit Beschlaegen auf Trittstein, Fenster mit Laden (Spielerfarbe), Bank,
Brennholzstapel mit Hackklotz, Fass, Heugabel. Masse: Tuer 1,1, Fensterbruestung 0,5 ueber dem Boden der Stube.

Variante (--variant=b): andere Anordnung (Kamin links, Tuer rechts, Anbau-Holzlager statt Stapel, Schindeldach statt
Stroh) - eigenes Asset `hovel_b` fuer die Instanzvariation in Siedlungen.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/hovel.py [--variant=b] [--no-preview] [--no-bake] [--fast]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import anchors, asset, materials, mesh, scene, town, uv  # noqa: E402
from mathutils import Vector  # noqa: E402

VARIANT = 'b' if '--variant=b' in sys.argv else 'a'
if VARIANT == 'a':
    A = asset.begin('hovel', target={'building': 'Hovel'}, footprint=(2, 2), klass='house',
                    desc='Fachwerkhaus: Bruchsteinsockel, Eichenfachwerk, Kalkputz, Strohdach mit Krueppelwalm, Kamin, '
                         'Bohlentuer, Fensterladen (Spielerfarbe), Brennholz, Fass, Bank')
else:
    A = asset.begin('hovel_b', target={'building': 'Hovel', 'variant': 1}, footprint=(2, 2), klass='house',
                    desc='Fachwerkhaus (Variante B): Schindeldach, Kamin links, Tuer rechts, Holzlager-Anbau')
rnd = random.Random(41 if VARIANT == 'a' else 77)
MIRROR = -1.0 if VARIANT == 'b' else 1.0  # Variante B: Anordnung entlang X gespiegelt (Kamin, Tuer, Holz)

# ---------------------------------------------------------------- Grundmasse
X0, X1 = -0.90, 0.90          # Aussenflaechen der Giebelwaende
Y0, Y1 = -0.66, 0.70          # Traufwaende vorn / hinten
CY = (Y0 + Y1) / 2
Z_PLINTH = 0.16               # Oberkante Sockel = Unterkante Schwelle
Z_SILL = 0.25                 # Oberkante Schwelle = Fussboden der Stube
Z_PL0, Z_PL1 = 1.40, 1.50     # Rahm
LX = X1 - X0
LY = Y1 - Y0

# ---------------------------------------------------------------- Waende (Aussenflaeche der Hoelzer in der Wandebene)
front = town.Wall((X0, Y0), (X1, Y0), (0, -1), Z_SILL, Z_PL0)
back = town.Wall((X1, Y1), (X0, Y1), (0, 1), Z_SILL, Z_PL0)
left = town.Wall((X0, Y1), (X0, Y0), (-1, 0), Z_SILL, Z_PL0)
right = town.Wall((X1, Y0), (X1, Y1), (1, 0), Z_SILL, Z_PL0)


def fu(u):
    """u-Position auf der Vorder-/Rueckwand ggf. gespiegelt (Variante B)"""
    return u if MIRROR > 0 else LX - u


# Oeffnungen (u0, u1, z0, z1): Tuer 1,1 hoch, Fenster mit Bruestung ~0,5 ueber dem Stubenboden
DOOR = (0.51, 0.99, Z_SILL, Z_SILL + 1.10)
WIN_F = (1.08, 1.36, 0.75, 1.10)
WIN_B = (0.645, 0.935, 0.77, 1.07)
WIN_L = (0.33, 0.615, 0.80, 1.07)


def mo(o):
    """Oeffnung spiegeln"""
    return (fu(o[1]), fu(o[0]), o[2], o[3]) if MIRROR < 0 else o


front.opening(*mo(DOOR), 'door').opening(*mo(WIN_F), 'window')
back.opening(*(WIN_B if MIRROR > 0 else (LX - WIN_B[1], LX - WIN_B[0], WIN_B[2], WIN_B[3])), 'window')
side_win = left if MIRROR > 0 else right
side_win.opening(*WIN_L, 'window')

P = 0.095   # Staenderbreite
R_ = 0.07   # Riegelhoehe
B_ = 0.075  # Strebenbreite


def T(u, z0=Z_SILL, z1=Z_PL0, w=P):
    a, b = town.tilt(u, z0, z1, rnd, 0.014)
    return (a, z0 - 0.01, b, z1 + 0.01, w, 'post')


def Rl(u0, u1, z, w=R_):
    z = z + rnd.uniform(-0.012, 0.012)
    return (u0, z, u1, z + rnd.uniform(-0.008, 0.008), w, 'rail')


def Br(u0, z0, u1, z1, w=B_):
    return (u0, z0, u1, z1, w, 'brace')


def mirror_members(ms, L):
    if MIRROR > 0:
        return ms
    return [(L - m[0], m[1], L - m[2], m[3], m[4], m[5]) for m in ms]


ZS = (Z_PLINTH + Z_SILL) / 2
ZP = (Z_PL0 + Z_PL1) / 2
# Vorderwand: Eckstaender, Tuerstaender, Fensterstiel, Bruest-/Sturzriegel, Fussstrebe links, Riegel + Kopfband rechts
fm = [
    (-0.06, ZS, LX + 0.06, ZS, 0.10, 'sill'),
    (-0.07, ZP, LX + 0.07, ZP, 0.10, 'plate'),
    T(0.048), T(LX - 0.048),
    T(0.465), T(1.035),
    T(1.405, w=0.085),
    Rl(1.035, 1.405, 0.715), Rl(1.035, 1.405, 1.135),
    Rl(0.048, 0.465, 0.83),
    Br(0.44, Z_SILL, 0.06, 0.81),
    Rl(1.405, LX - 0.048, 0.92),
    Br(1.43, Z_SILL + 0.02, LX - 0.06, 0.90),
    Br(1.42, 1.10, LX - 0.07, Z_PL0),
    Rl(0.465, 1.035, Z_SILL + 1.10 + 0.035, 0.07),   # Tuersturz
]
fm = mirror_members(fm, LX)
# Rueckwand: Eckstaender, zwei Staender, Fenster mit Stiel, Mann-aehnliche Streben
bm_ = [
    (-0.06, ZS, LX + 0.06, ZS, 0.10, 'sill'),
    (-0.07, ZP, LX + 0.07, ZP, 0.10, 'plate'),
    T(0.048), T(LX - 0.048),
    T(0.60), T(0.98, w=0.085), T(1.30),
    Rl(0.60, 0.98, 0.735), Rl(0.60, 0.98, 1.105),
    Br(0.07, Z_SILL + 0.02, 0.58, 1.0), Rl(0.048, 0.60, 0.76),
    Rl(0.98, 1.30, 0.66), Rl(0.98, 1.30, 1.04),
    Br(1.32, 1.0, LX - 0.06, Z_SILL + 0.02), Rl(1.30, LX - 0.048, 0.87),
]
bm_ = mirror_members(bm_, LX)
# Giebelwaende: Schwelle/Rahm zwischen den Eckstaendern, Mittelstaender, Fenster (eine Seite), Streben
gl = [
    (0.09, ZS, LY - 0.09, ZS, 0.10, 'sill'),
    (0.09, ZP, LY - 0.09, ZP, 0.10, 'plate'),
    T(0.285, w=0.085), T(0.66),
    Rl(0.285, 0.66, 0.765), Rl(0.285, 0.66, 1.105),
    Rl(0.048, 0.285, 0.9),
    Br(0.70, Z_PL0, LY - 0.07, 0.80), Rl(0.66, LY - 0.048, 0.74),
]
gr = [
    (0.09, ZS, LY - 0.09, ZS, 0.10, 'sill'),
    (0.09, ZP, LY - 0.09, ZP, 0.10, 'plate'),
    T(0.62),
    Br(0.60, 0.97, 0.10, Z_SILL + 0.02), Br(0.64, 0.97, LY - 0.10, Z_SILL + 0.02),
    Rl(0.048, 0.62, 1.06), Rl(0.62, LY - 0.048, 1.1),
    Rl(0.048, 0.62, 0.58), Rl(0.62, LY - 0.048, 0.62),
]
walls = [(front, fm), (back, bm_), (left if MIRROR > 0 else right, gl), (right if MIRROR > 0 else left, gr)]

lod0, lod1, lod2 = [], [], []
for wi, (w, ms) in enumerate(walls):
    lod0 += town.frame(w, ms, rnd, prefix=f'fw{wi}')
    for i, m in enumerate(ms):
        u0, z0, u1, z1, ww, role = m
        p0, p1 = w.p(u0, z0, 0.045), w.p(u1, z1, 0.045)
        upv = (p1 - p0).normalized().cross(w.out).normalized()
        if math.hypot(u1 - u0, z1 - z0) > 0.25:
            lod1.append(town.timber(f'fw{wi}_L1_{i}', p0, p1, 0.09, ww, ch=0.0, up=upv, rnd=rnd))
        key = role in ('sill', 'plate') or (role == 'post' and (min(u0, u1) < 0.1 or max(u0, u1) > w.L - 0.1))
        if key or (wi == 0 and role == 'post'):
            lod2.append(town.timber(f'fw{wi}_L2_{i}', p0, p1, 0.09, ww, ch=0.0, up=upv, rnd=rnd))
    # Holznaegel an den Enden der Riegel und Streben
    for i, (u0, z0, u1, z1, ww, role) in enumerate(ms):
        if role in ('rail', 'brace'):
            for (u, z) in ((u0, z0), (u1, z1)):
                if 0.02 < u < w.L - 0.02 and z > Z_SILL + 0.03 and z < Z_PL0 - 0.02:
                    d = (Vector((u1 - u0, z1 - z0))).normalized()
                    uu = u + (0.04 if (u == u0) else -0.04) * d.x
                    zz = z + (0.04 if (u == u0) else -0.04) * d.y
                    lod0.append(town.peg(f'peg{wi}_{i}_{u:.2f}', w.p(uu, zz, 0.0), w.out, rot=rnd.uniform(-0.3, 0.3)))
        if role == 'post':
            for z in (Z_SILL - 0.05, ZP):
                lod0.append(town.peg(f'pegp{wi}_{i}_{z:.2f}', w.p((u0 + u1) / 2 + rnd.uniform(-0.01, 0.01), z, 0.0), w.out,
                                     rot=rnd.uniform(-0.3, 0.3)))
# Balkenkoepfe der Dachbalken ueber dem Rahm (Traufseiten)
for k, x in enumerate((-0.68, -0.23, 0.23, 0.68)):
    for sy, yy in ((-1, Y0), (1, Y1)):
        lod0.append(town.timber(f'beamhead_{k}_{sy}', (x, yy - sy * 0.3, Z_PL1 + 0.045), (x, yy + sy * 0.07, Z_PL1 + 0.045),
                                0.085, 0.09, ch=0.01, rnd=rnd))
frame0 = mesh.join(lod0, 'frame')
A.add(frame0, mat='M_Timber_Oak', uv_mode=None, only=0, build=(0.24, 0.52), smooth=30, wear=1.3)
A.add(mesh.join(lod1, 'frame_L1'), mat='M_Timber_Oak', uv_mode=None, only=1, build=(0.24, 0.52), smooth=0, wear=1.3)
A.add(mesh.join(lod2, 'frame_L2'), mat='M_Timber_Oak', uv_mode=None, only=2, build=(0.24, 0.52), smooth=0)

# ---------------------------------------------------------------- Sockel (Bruchstein)
stones, core = town.plinth_ring('plinth', X0, Y0, X1, Y1, Z_PLINTH, rnd, proud=0.03, depth=0.15, lmin=0.24, lmax=0.42)
A.add(mesh.join(stones, 'plinth_stones'), mat='M_Stone_Rubble', uv_mode='box', only=0, build=(0.02, 0.2), smooth=40, dirt=1.4)
A.add(core, mat='M_Stone_Rubble', uv_mode='box', lod2='drop', build=(0.02, 0.2), smooth=0, dirt=1.6)
for L in (1, 2):
    pb = mesh.box(f'plinth_L{L}', (LX + 0.06, LY + 0.06, Z_PLINTH + 0.03), loc=(0, CY, -0.03))
    A.add(pb, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.02, 0.2), smooth=0, dirt=1.5)
# Trittstein vor der Tuer
dcx = X0 + fu((DOOR[0] + DOOR[1]) / 2)
step = mesh.stone('step', (0.58, 0.26, 0.15), loc=(dcx, Y0 - 0.15, 0.04), seed=11, rough=0.05, subdiv=0, bevel=0.25)
A.add(step, mat='M_Stone_Rubble', uv_mode='box', build=(0.05, 0.2), smooth=40, dirt=1.3)

# ---------------------------------------------------------------- Gefache (Kalkputz)
for wi, (w, ms) in enumerate(walls):
    gable = w in (left, right)
    u0, u1 = (0.09, w.L - 0.09) if gable else (0.0, w.L)
    pl = town.plaster(w, f'plaster{wi}', u0, u1, Z_SILL, Z_PL0, rnd, cell=0.16)
    town.grime_attr(pl, lambda x, y, z: 0.55 * max(0.0, __import__('mathutils').noise.noise(Vector((x * 4.3, y * 4.3, z * 3.1 + 7.0))) - 0.18)
                    + 0.3 * max(0.0, 1.0 - (z - Z_SILL) / 0.25))
    A.add(pl, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.4, 0.66), smooth=60)
    pl1 = town.plaster(w, f'plaster{wi}_L1', u0, u1, Z_SILL, Z_PL0, rnd, cell=0.34, bulge=0.0)
    A.add(pl1, mat='M_Plaster_Lime', uv_mode='box', only=1, build=(0.4, 0.66), smooth=0)
body2 = mesh.box('body_L2', (LX - 0.04, LY - 0.04, Z_PL0 - Z_SILL + 0.02), loc=(0, CY, Z_SILL - 0.01))
_b = __import__('bmesh').new()
_b.from_mesh(body2.data)
__import__('bmesh').ops.subdivide_edges(_b, edges=_b.edges, cuts=2, use_grid_fill=True)
_b.to_mesh(body2.data)
_b.free()
A.add(body2, mat='M_Plaster_Lime', uv_mode='box', only=2, build=(0.4, 0.66), smooth=0)
# Lehmflecken / abgeplatzter Putz: unregelmaessige Flecken (Datenfarbe: Mindest-Schmutz)
patches = []
spots = [(front, fu(0.25) if MIRROR > 0 else fu(0.25), 0.55, 0.07), (front, fu(1.55), 0.42, 0.05), (back, 0.30, 1.25, 0.06),
         (back, 1.15, 0.45, 0.08), (left, 0.95, 0.52, 0.06), (right, 1.0, 1.28, 0.05), (right, 0.3, 0.9, 0.05)]
for k, (w, u, z, r) in enumerate(spots):
    patches.append(town.patch(w, f'patch{k}', u, z, r, rnd))
pt = mesh.join(patches, 'clay_patches')
A.add(pt, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.5, 0.66), smooth=0, dirt=1.0)
pt['sp_grime'] = 0.85

# ---------------------------------------------------------------- Oeffnungen: Tuer, Fenster, Laden
dw = front.openings[0]
# Bohlentuer: 5 Bohlen (unterschiedlich breit), leicht versetzt, in 4 cm Tiefe
boards = []
uu = dw[0] + 0.004
widths = [0.1, 0.09, 0.1, 0.085, 0.1]
sc = (dw[1] - dw[0] - 0.008) / sum(widths)
for k, bw in enumerate(widths):
    bw *= sc
    b = mesh.box(f'door_board{k}', (bw - 0.004, 0.03, dw[3] - dw[2] - 0.01 - rnd.uniform(0, 0.012)),
                 loc=tuple(front.p(uu + bw / 2, dw[2] + 0.002, 0.05)), bevel=0.003)
    boards.append(b)
    uu += bw
door = mesh.join(boards, 'door')
uv.box(door, tile=2.0, space='object', along='z')
A.add(door, mat='M_Wood_Planks', uv_mode=None, build=(0.6, 0.72), smooth=0, dirt=1.2, lod2='drop')
# Beschlaege: zwei Langbaender mit Kloben, Ring
iron = []
for z in (dw[2] + 0.22, dw[3] - 0.24):
    hinge_u = dw[1] - 0.02 if MIRROR > 0 else dw[0] + 0.02
    tip_u = dw[0] + 0.1 if MIRROR > 0 else dw[1] - 0.1
    iron.append(town.timber(f'hinge{z:.2f}', front.p(hinge_u, z, 0.03), front.p(tip_u, z, 0.03), 0.008, 0.035, ch=0.0, rnd=rnd))
ring_u = dw[0] + 0.08 if MIRROR > 0 else dw[1] - 0.08
ringo = mesh.ring('door_ring', 0.022, 0.03, 0.008, segs=8, loc=(0, 0, 0))
ringo.rotation_euler = (math.pi / 2, 0, 0)
ringo.location = front.p(ring_u, dw[2] + 0.55, 0.035)
scene.apply_transforms(ringo)
iron.append(ringo)
A.add(mesh.join(iron, 'door_iron'), mat='M_Iron_Wrought', uv_mode='box', build=(0.66, 0.72), smooth=0, dirt=0.5, lod1='drop', lod2='drop')

# Fenster: dunkle Rueckwand (Innenladen) + Mittelpfosten aus Eiche
win_backs, mullions = [], []
for w in (front, back, side_win):
    for (u0, u1, z0, z1, kind) in w.openings:
        if kind != 'window':
            continue
        win_backs.append(town.opening_reveal(w, f'winback_{w.out.x:.0f}{w.out.y:.0f}_{u0:.2f}', u0, u1, z0, z1, depth=0.088))
        um = (u0 + u1) / 2 + rnd.uniform(-0.01, 0.01)
        mullions.append(town.wall_timber(w, f'mullion_{u0:.2f}_{w.out.x:.0f}{w.out.y:.0f}', um, z0, um, z1, 0.035, 0.04, depth=0.055, rnd=rnd))
        mullions.append(town.wall_timber(w, f'transom_{u0:.2f}_{w.out.x:.0f}{w.out.y:.0f}', u0, (z0 + z1) / 2 + 0.03, u1, (z0 + z1) / 2 + 0.03, 0.028, 0.03,
                                         depth=0.06, rnd=rnd))
wb = mesh.join(win_backs, 'window_backs')
uv.box(wb, tile=2.0)
A.add(wb, mat='M_Wood_Planks', uv_mode=None, build=(0.55, 0.7), smooth=0, dirt=1.0)
wb['sp_grime'] = 1.0
A.add(mesh.join(mullions, 'window_bars'), mat='M_Timber_Oak', uv_mode=None, build=(0.6, 0.7), smooth=0, lod1='drop', lod2='drop')
# Fensterladen (einfluegelig, aufgeklappt flach an der Wand, Spielerfarbe)
wf = [o for o in front.openings if o[4] == 'window'][0]
sh_w = wf[1] - wf[0] + 0.02
su0 = wf[1] + 0.01 if MIRROR > 0 else wf[0] - 0.01 - sh_w
shutter = []
bw = sh_w / 3
for k in range(3):
    shutter.append(town.wall_timber(front, f'shutter_b{k}', su0 + bw * (k + 0.5), wf[2] - 0.02 + rnd.uniform(-0.006, 0.006),
                                    su0 + bw * (k + 0.5), wf[3] + 0.02 + rnd.uniform(-0.006, 0.006), bw - 0.004, 0.022, depth=-0.012,
                                    ch=0.003, rnd=rnd))
for z in (wf[2] + 0.06, wf[3] - 0.06):
    shutter.append(town.wall_timber(front, f'shutter_batten{z:.2f}', su0 + 0.012, z, su0 + sh_w - 0.012, z, 0.045, 0.016,
                                    depth=-0.03, ch=0.003, rnd=rnd))
sh = mesh.join(shutter, 'shutter')
A.add(sh, mat='M_Wood_Planks', uv_mode=None, team=True, build=(0.62, 0.72), smooth=0, dirt=0.8, lod2='drop')

# ---------------------------------------------------------------- Dach: Strohdach mit Krueppelwalm (A) / Schindeln (B)
PITCH = 50.0
over_eave = 0.18
over_verge = 0.12
XE = X1 + over_verge
YE = (LY / 2) + over_eave
t50 = math.tan(math.radians(PITCH))
if VARIANT == 'a':
    RIDGE = Z_PL1 + 0.06 + 0.25 + (LY / 2) * t50
    R = town.GableRoof(XE, YE, RIDGE, PITCH, hip_z=2.2, hip_deg=58.0, sag=0.035, cy=CY, seed=3)
    S = town.ThatchSurf(R, course=0.22, step=0.03, bump=0.022, seed=5)
    CHX = 0.47 * MIRROR

    def thatch_weather(x, y, z):
        """Verwitterung/Moos: Nordseite (hinten) und Traufe dunkler, Flecken, Laufspur unter dem Kamin"""
        sd = R.slope_dist(x, y)
        g = 0.0
        if sd < 9.0:
            g = max(g, 0.45 * max(0.0, 1.0 - sd / 0.45))
        nz = __import__('mathutils').noise.noise(Vector((x * 2.6, y * 2.6, 0.5)))
        g = max(g, (0.22 if y > CY + 0.05 else 0.05) + 0.4 * max(0.0, nz))
        if abs(x - CHX) < 0.22 and y > CY + 0.1:
            g = max(g, 0.5 * (1.0 - abs(x - CHX) / 0.22))
        return g
    th0 = town.thatch_roof('thatch', R, nx=14, thick=0.16, thick_eave=0.21, surf=S, extra=0)
    town.uv_roof(th0, R, tile=3.0, seed=1)
    town.grime_attr(th0, thatch_weather)
    A.add(th0, mat='M_Roof_Thatch', uv_mode=None, only=0, build=(0.7, 0.93), smooth=55, dirt=1.1)
    S1 = town.ThatchSurf(R, course=0.5, step=0.0, bump=0.012, seed=5)
    th1 = town.thatch_roof('thatch_L1', R, nx=7, thick=0.16, thick_eave=0.21, surf=S1, extra=0)
    town.uv_roof(th1, R, tile=3.0, seed=1)
    town.grime_attr(th1, thatch_weather)
    A.add(th1, mat='M_Roof_Thatch', uv_mode=None, only=1, build=(0.7, 0.93), smooth=55, dirt=1.1)
    S2 = town.ThatchSurf(R, course=2.0, step=0.0, bump=0.0, seed=5)
    th2 = town.thatch_roof('thatch_L2', R, nx=4, thick=0.16, thick_eave=0.2, surf=S2, extra=0, under=False)
    town.uv_roof(th2, R, tile=3.0, seed=1)
    A.add(th2, mat='M_Roof_Thatch', uv_mode=None, only=2, build=(0.7, 0.93), smooth=0, dirt=1.1)
    # Grassodenfirst
    x_r = XE - (RIDGE - 2.2) / math.tan(math.radians(58.0))
    ridge = mesh.cylinder('ridge_turf', 0.11, 2 * x_r + 0.12, segs=8, loc=(0, 0, 0), axis='X')
    for v in ridge.data.vertices:
        v.co.z *= 0.8
        v.co.y += CY
        v.co.z += S.z(v.co.x, CY) - 0.005 - 0.06 * (abs(v.co.x) / x_r) ** 4
    mesh.displace(ridge, amount=0.012, scale=8.0, seed=4)
    A.add(ridge, mat='M_Ground_Grass', uv_mode='box', build=(0.9, 0.95), smooth=50, dirt=1.0, lod1='keep', lod2='keep')
    ROOF_Z = S.z
else:
    RIDGE = Z_PL1 + 0.05 + 0.08 + (LY / 2) * t50
    R = town.GableRoof(XE, YE, RIDGE, PITCH, sag=0.03, cy=CY, seed=3)
    ROOF_Z = R.z
    rows0 = []
    for side in (-1, 1):
        rows0 += town.course_rows(f'shingle{side}', R, side, rows=9, row_thick=0.028, depth0=0.03, seed=7 + side, tooth=0.012,
                                  nseg=6, jitter=0.01, x_split=[-XE, -0.2 + rnd.uniform(-0.1, 0.1), XE])
    sh0 = mesh.join(rows0, 'shingles')
    town.uv_roof(sh0, R, tile=2.0, seed=2)
    A.add(sh0, mat='M_Roof_Shingle', uv_mode=None, only=0, build=(0.7, 0.93), smooth=0, dirt=1.2)
    for L, rows in ((1, 4), (2, 1)):
        objs = []
        for side in (-1, 1):
            objs += town.course_rows(f'shingleL{L}{side}', R, side, rows=rows, row_thick=0.04, depth0=0.03, seed=3, nseg=1, jitter=0.0)
        o = mesh.join(objs, f'shingles_L{L}')
        town.uv_roof(o, R, tile=2.0, seed=2)
        A.add(o, mat='M_Roof_Shingle', uv_mode=None, only=L, build=(0.7, 0.93), smooth=0, dirt=1.2)
    cap = town.timber('ridge_board_a', (-XE - 0.02, CY - 0.05, RIDGE + 0.05), (XE + 0.02, CY - 0.05, RIDGE + 0.05), 0.12, 0.022, ch=0.0,
                      up=(0, -0.6, 0.8), segs=2, rnd=rnd)
    cap2 = town.timber('ridge_board_b', (-XE - 0.02, CY + 0.05, RIDGE + 0.05), (XE + 0.02, CY + 0.05, RIDGE + 0.05), 0.12, 0.022, ch=0.0,
                       up=(0, 0.6, 0.8), segs=2, rnd=rnd)
    for c in (cap, cap2):
        mesh.sag(c, 0.03, 'X')
    A.add(mesh.join([cap, cap2], 'ridge_boards'), mat='M_Wood_Planks', uv_mode=None, build=(0.9, 0.95), smooth=0, lod2='keep')

# Sparrenkoepfe unter der Traufe, Windbretter am Ortgang, verbretterte Giebeldreiecke
under = 0.27 if VARIANT == 'a' else 0.03
TH_UNDER = 0.17 if VARIANT == 'a' else 0.05
raft = []
for side in (-1, 1):
    for k, x in enumerate((-0.72, -0.36, 0.0, 0.36, 0.72)):
        y_in = CY + side * (LY / 2 - 0.1)
        y_out = CY + side * (YE - 0.04)
        raft.append(town.timber(f'rafter{side}_{k}', (x, y_in, R.z_main(x, y_in) - under - 0.04), (x, y_out, R.z_main(x, y_out) - under - 0.04),
                                0.055, 0.07, ch=0.0, rnd=rnd))
A.add(mesh.join(raft, 'rafters'), mat='M_Timber_Oak', uv_mode=None, build=(0.58, 0.72), smooth=0, lod1='drop', lod2='drop')

gb = []
gx = X1 + 0.03
for sx in (-1, 1):
    n = 9
    y_lo, y_hi = Y0 - 0.02, Y1 + 0.02
    for k in range(n):
        ya = y_lo + (y_hi - y_lo) * k / n + 0.003
        yb = y_lo + (y_hi - y_lo) * (k + 1) / n - 0.003
        zt_a = R.under_z(sx * gx, ya, TH_UNDER) - 0.015
        zt_b = R.under_z(sx * gx, yb, TH_UNDER) - 0.015
        zb = Z_PL1 - 0.06 - rnd.uniform(0.0, 0.025)
        if min(zt_a, zt_b) < zb + 0.05:
            continue
        pts = [(ya, zb), (yb, zb), (yb, zt_b), (ya, zt_a)]
        bmb = __import__('bmesh').new()
        v0 = [bmb.verts.new((sx * gx, y, z)) for (y, z) in pts]
        v1 = [bmb.verts.new((sx * (gx - 0.025), y, z)) for (y, z) in pts]
        bmb.faces.new(v0)
        bmb.faces.new(list(reversed(v1)))
        for i in range(4):
            j = (i + 1) % 4
            bmb.faces.new((v0[i], v1[i], v1[j], v0[j]))
        __import__('bmesh').ops.recalc_face_normals(bmb, faces=bmb.faces)
        gb.append(mesh.obj_from_bm(f'gableboard{sx}_{k}', bmb))
    # Deckleisten auf den Fugen
gbo = mesh.join(gb, 'gable_boards')
uv.box(gbo, tile=2.0, space='object', along='z')
A.add(gbo, mat='M_Wood_Planks', uv_mode=None, build=(0.55, 0.74), smooth=0, dirt=1.1, lod2='keep')
# Windbretter: entlang der Ortgangkante unter der Dachhaut
wb_ = []
for sx in (-1, 1):
    xv = sx * (XE - 0.015)
    y_top = (R.ridge - R.z_hip(xv)) / R.t if VARIANT == 'a' else 0.0
    for side in (-1, 1):
        ys = [CY + side * (YE - 0.02), CY + side * (y_top + 0.02)]
        pts = []
        for t in (0.0, 0.5, 1.0):
            y = ys[0] + (ys[1] - ys[0]) * t
            pts.append((xv, y, R.under_z(xv, y, TH_UNDER) - 0.06))
        for i in range(len(pts) - 1):
            wb_.append(town.timber(f'windboard{sx}_{side}_{i}', pts[i], pts[i + 1], 0.025, 0.12, ch=0.0, up=(0, 0, 1), rnd=rnd))
A.add(mesh.join(wb_, 'wind_boards'), mat='M_Wood_Planks', uv_mode=None, build=(0.6, 0.8), smooth=0, dirt=1.2, lod1='keep', lod2='drop')

# ---------------------------------------------------------------- Kamin (Bruchstein) mit Abdeckplatte
cx = 0.47 * MIRROR
cyk = CY + 0.16
ch_top = RIDGE + 0.42
zb = min(ROOF_Z(cx + dx, cyk + dy) for dx in (-0.14, 0.14) for dy in (-0.13, 0.13)) - 0.12
chim = mesh.box('chimney', (0.27, 0.25, ch_top - zb), loc=(cx, cyk, zb))
bmc = __import__('bmesh').new()
bmc.from_mesh(chim.data)
__import__('bmesh').ops.subdivide_edges(bmc, edges=[e for e in bmc.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1], cuts=2)
bmc.to_mesh(chim.data)
bmc.free()
for v in chim.data.vertices:
    t = (v.co.z - zb) / (ch_top - zb)
    v.co.x = cx + (v.co.x - cx) * (1.0 - 0.08 * t)
    v.co.y = cyk + (v.co.y - cyk) * (1.0 - 0.08 * t)
for v in chim.data.vertices:
    v.co.x += rnd.uniform(-0.008, 0.008)
    v.co.y += rnd.uniform(-0.008, 0.008)
town.grime_attr(chim, lambda x, y, z: max(0.0, (z - (ch_top - 0.35)) / 0.35) * 0.8)
A.add(chim, mat='M_Stone_Rubble', uv_mode='box', build=(0.3, 0.9), smooth=0, dirt=1.2)
caps = [mesh.stone('chim_cap', (0.33, 0.31, 0.06), loc=(cx, cyk, ch_top + 0.02), seed=3, rough=0.03, subdiv=0, bevel=0.2),
        mesh.stone('chim_band', (0.3, 0.28, 0.05), loc=(cx, cyk, ch_top - 0.17), seed=4, rough=0.03, subdiv=0, bevel=0.2)]
cp = mesh.join(caps, 'chimney_cap')
A.add(cp, mat='M_Stone_Rubble', uv_mode='box', build=(0.85, 0.93), smooth=30, dirt=1.6, lod2='drop')
cp['sp_grime'] = 0.55
anchors.anchor('smoke', (cx, cyk, ch_top + 0.12), rate=0.4, staffed=False)

# ---------------------------------------------------------------- Gebrauchsspuren: Bank, Fass, Brennholz, Hackklotz, Heugabel
bx0 = X0 + fu(0.08) if MIRROR > 0 else X0 + fu(0.44)
bench = [
    town.timber('bench_seat', (bx0, Y0 - 0.13, 0.245), (bx0 + 0.36, Y0 - 0.13, 0.245), 0.12, 0.03, ch=0.006, rnd=rnd),
    mesh.box('bench_leg0', (0.03, 0.1, 0.23), loc=(bx0 + 0.05, Y0 - 0.13, 0.0)),
    mesh.box('bench_leg1', (0.03, 0.1, 0.23), loc=(bx0 + 0.31, Y0 - 0.13, 0.0)),
]
for o in bench[1:]:
    uv.box(o, tile=2.0, space='object', along='z')
A.add(mesh.join(bench, 'bench'), mat='M_Wood_Planks', uv_mode=None, build=(0.88, 0.96), smooth=0, dirt=1.3, lod2='drop')

bx, by = (0.66 * MIRROR, Y0 - 0.25)
body, hoops = town.barrel('barrel', bx, by, r=0.12, h=0.32, segs=9)
materials.assign(body, 'M_Wood_Planks')
uv.cylindrical(body, center=(bx, by, 0.0))
A.add(body, mat=None, uv_mode=None, build=(0.9, 0.97), smooth=40, dirt=1.2, lod2='drop')
A.add(mesh.join(hoops, 'barrel_hoops'), mat='M_Iron_Wrought', uv_mode='box', build=(0.92, 0.97), smooth=40, dirt=0.6, lod1='drop', lod2='drop')

wx0 = X1 + 0.035 if MIRROR > 0 else X0 - 0.035 - 0.25
logs = town.woodpile('woodpile', wx0, -0.34, wx0 + 0.25, 0.42, 0.62, r=0.05, rnd=rnd, axis='x')
A.add(mesh.join(logs, 'woodpile'), mat='M_Wood_Planks', uv_mode=None, only=0, build=(0.86, 0.97), smooth=0, dirt=1.0)
for L in (1, 2):
    wp = mesh.box(f'woodpile_L{L}', (0.25, 0.76, 0.6), loc=(wx0 + 0.125, 0.04, 0.0))
    A.add(wp, mat='M_Wood_Planks', uv_mode='box', only=L, build=(0.86, 0.97), smooth=0, dirt=1.0)
# Abdeckbretter auf dem Stapel
cover = [town.timber(f'pile_cover{k}', (wx0 - 0.02, -0.36 + k * 0.27, 0.66 + k * 0.004), (wx0 + 0.29, -0.33 + k * 0.27, 0.64), 0.25, 0.022,
                     ch=0.0, rnd=rnd) for k in range(3)]
A.add(mesh.join(cover, 'pile_cover'), mat='M_Wood_Planks', uv_mode=None, build=(0.95, 0.98), smooth=0, dirt=1.5, lod2='drop')

hx, hy = (X1 + 0.2) * MIRROR, -0.72
block = mesh.cylinder('chop_block', 0.1, 0.2, segs=8, loc=(hx, hy, 0.0))
mesh.displace(block, 0.008, 9.0, seed=2)
materials.assign(block, 'M_Timber_Oak')
uv.cylindrical(block, center=(hx, hy, 0.0))
A.add(block, mat=None, uv_mode=None, build=(0.9, 0.97), smooth=40, dirt=1.3, lod2='drop')
axe_h = town.timber('axe_handle', (hx - 0.02, hy + 0.01, 0.2), (hx - 0.2 * MIRROR, hy - 0.1, 0.42), 0.022, 0.026, ch=0.005, rnd=rnd)
A.add(axe_h, mat='M_Wood_Planks', uv_mode=None, build=(0.95, 0.98), smooth=0, lod1='drop', lod2='drop')
axe_b = mesh.box('axe_blade', (0.11, 0.015, 0.06), loc=(hx + 0.02, hy + 0.01, 0.185), rot=(0, 0.25, 0.3))
A.add(axe_b, mat='M_Iron_Wrought', uv_mode='box', build=(0.95, 0.98), smooth=0, dirt=0.3, lod1='drop', lod2='drop')

fx = (X0 - 0.03) * MIRROR
f0 = Vector((fx - 0.2 * MIRROR, 0.25, 0.0))
f1 = Vector((fx, 0.32, 1.0))
fd = (f1 - f0).normalized()
fork = [town.timber('fork_handle', f0, f1, 0.024, 0.024, ch=0.006, rnd=rnd)]
for k in range(3):
    o = Vector((0, (k - 1) * 0.035, 0))
    fork.append(town.timber(f'fork_tine{k}', f1 + o * 0.4, f1 + fd * 0.2 + o, 0.01, 0.01, ch=0.0, rnd=rnd))
A.add(mesh.join(fork, 'hayfork'), mat='M_Wood_Planks', uv_mode=None, build=(0.9, 0.98), smooth=0, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Anker
anchors.anchor('door', (dcx, Y0 - 0.3, 0.0))

asset.finish(A)
