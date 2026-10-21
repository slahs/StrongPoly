"""Schmiede (BT.Blacksmith, Footprint 3x3).

Fachwerk-Werkstatt auf Bruchsteinsockel mit Schindeldach; strassenseitig offener Arbeitsplatz unter einem Pultdach auf
Staendern mit Kopfbaendern: gemauerte Esse mit Glutbett, Rauchfang und Bruchsteinschlot (Rauch-Anker), Blasebalg,
Amboss auf Holzklotz (Funken-Anker), Loeschtrog, Werkzeugwand (Zangen, Haemmer), Kohlehaufen, Schleifstein, Eisenstangen,
Fass. Front = -Y.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/blacksmith.py [--no-preview] [--no-bake] [--fast]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import anchors, asset, materials, mesh, town, uv  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils import noise  # noqa: E402

A = asset.begin('blacksmith', target={'building': 'Blacksmith'}, footprint=(3, 3), klass='production',
                desc='Schmiede: Fachwerk-Werkstatt, offener Arbeitsplatz unter Pultdach, gemauerte Esse mit Schlot, Blasebalg, '
                     'Amboss, Loeschtrog, Werkzeugwand, Kohlehaufen, Schleifstein')
rnd = random.Random(97)

# ---------------------------------------------------------------- Werkstatt (geschlossen, hinten)
HX0, HX1 = -1.35, 1.0
HY0, HY1 = 0.02, 1.3
LX, LY = HX1 - HX0, HY1 - HY0
XC, CY = (HX0 + HX1) / 2, (HY0 + HY1) / 2
Z_PLINTH, Z_SILL = 0.22, 0.32
Z_PL0, Z_PL1 = 1.46, 1.56
PITCH = 45.0
TP = math.tan(math.radians(PITCH))

wf = town.Wall((HX0, HY0), (HX1, HY0), (0, -1), Z_SILL, Z_PL0)
wb = town.Wall((HX1, HY1), (HX0, HY1), (0, 1), Z_SILL, Z_PL0)
wl = town.Wall((HX0, HY1), (HX0, HY0), (-1, 0), Z_SILL, Z_PL0)
wr = town.Wall((HX1, HY0), (HX1, HY1), (1, 0), Z_SILL, Z_PL0)
DOOR = (0.93, 1.42, Z_SILL, Z_SILL + 1.08)
wf.opening(*DOOR, 'door')
wl.opening(0.42, 0.72, 0.8, 1.1, 'window')
wr.opening(0.5, 0.8, 0.8, 1.1, 'window')
wb.opening(1.4, 1.7, 0.85, 1.12, 'window')
P = 0.1


def T(u, w=P):
    a, b = town.tilt(u, Z_SILL, Z_PL0, rnd, 0.012)
    return (a, Z_SILL - 0.01, b, Z_PL0 + 0.01, w, 'post')


def Rl(u0, u1, z, w=0.07):
    z += rnd.uniform(-0.012, 0.012)
    return (u0, z, u1, z + rnd.uniform(-0.008, 0.008), w, 'rail')


def Br(u0, z0, u1, z1, w=0.08):
    return (u0, z0, u1, z1, w, 'brace')


ZS, ZP = (Z_PLINTH + Z_SILL) / 2, (Z_PL0 + Z_PL1) / 2
fm = [
    (-0.06, ZS, LX + 0.06, ZS, 0.10, 'sill'), (-0.07, ZP, LX + 0.07, ZP, 0.10, 'plate'),
    T(0.05), T(LX - 0.05), T(0.6), T(0.885), T(1.465), T(1.95),
    Rl(0.05, 0.6, 0.86), Br(0.08, Z_SILL + 0.02, 0.57, 1.3),
    Rl(0.6, 0.885, 0.9), Rl(1.465, 1.95, 0.9), Br(1.5, Z_PL0 - 0.02, 1.92, Z_SILL + 0.02),
    Rl(1.95, LX - 0.05, 0.82), Rl(1.95, LX - 0.05, 1.18),
    Rl(0.885, 1.465, DOOR[3] + 0.035, 0.07),
]
bm_ = [
    (-0.06, ZS, LX + 0.06, ZS, 0.10, 'sill'), (-0.07, ZP, LX + 0.07, ZP, 0.10, 'plate'),
    T(0.05), T(LX - 0.05), T(0.62), T(1.17), T(1.355), T(1.745),
    Br(0.08, Z_PL0 - 0.02, 0.6, Z_SILL + 0.02), Rl(0.05, 0.62, 0.92),
    Rl(0.62, 1.17, 0.78), Rl(0.62, 1.17, 1.16), Br(0.65, Z_SILL + 0.02, 1.14, 0.78),
    Rl(1.355, 1.745, 0.815), Rl(1.355, 1.745, 1.155),
    Br(LX - 0.08, Z_SILL + 0.02, 1.78, 1.3), Rl(1.745, LX - 0.05, 0.9),
]
sm_l = [
    (0.1, ZS, LY - 0.1, ZS, 0.10, 'sill'), (0.1, ZP, LY - 0.1, ZP, 0.10, 'plate'),
    T(0.37), T(0.77),
    Rl(0.37, 0.77, 0.765), Rl(0.37, 0.77, 1.135),
    Br(0.1, Z_SILL + 0.02, 0.35, 1.0), Br(LY - 0.1, Z_SILL + 0.02, 0.79, 1.0), Rl(0.77, LY - 0.05, 0.86),
]
sm_r = [
    (0.1, ZS, LY - 0.1, ZS, 0.10, 'sill'), (0.1, ZP, LY - 0.1, ZP, 0.10, 'plate'),
    T(0.45), T(0.85),
    Rl(0.45, 0.85, 0.765), Rl(0.45, 0.85, 1.135),
    Br(0.1, Z_PL0 - 0.02, 0.43, 0.9), Rl(0.05, 0.45, 0.88), Br(LY - 0.1, Z_SILL + 0.02, 0.87, 1.0),
]
F0, F1, F2 = [], [], []
for wi, (w, ms) in enumerate(((wf, fm), (wb, bm_), (wl, sm_l), (wr, sm_r))):
    a, b, c = town.frame_lods(w, ms, rnd, f'fw{wi}', Z_SILL, Z_PL0, key_posts=(wi == 0), pegs=wi in (0, 3), post_pegs=(wi == 0))
    F0 += a
    F1 += b
    F2 += c
# Giebel (links/rechts): Fachwerk mit Putz
RIDGE = Z_PL1 + 0.08 + (LY / 2) * TP
gpl = []
for gi, (w0, w1, out) in enumerate((((HX0, HY1), (HX0, HY0), (-1, 0)), ((HX1, HY0), (HX1, HY1), (1, 0)))):
    gw = town.Wall(w0, w1, out, Z_PL1, RIDGE)

    def zt(u):
        return RIDGE - 0.1 - abs(u - LY / 2) * TP
    ms = [
        (-0.03, zt(-0.03) - 0.06, LY / 2, zt(LY / 2) - 0.07, 0.1, 'rafter'),
        (LY + 0.03, zt(LY + 0.03) - 0.06, LY / 2, zt(LY / 2) - 0.07, 0.1, 'rafter'),
        (LY / 2, Z_PL1, LY / 2 + rnd.uniform(-0.01, 0.01), zt(LY / 2) - 0.1, 0.09, 'post'),
        (0.2, Z_PL1 + 0.02, LY / 2 - 0.05, Z_PL1 + 0.32, 0.07, 'brace'),
        (LY - 0.2, Z_PL1 + 0.02, LY / 2 + 0.05, Z_PL1 + 0.32, 0.07, 'brace'),
    ]
    a, b, c = town.frame_lods(gw, ms, rnd, f'gfw{gi}', Z_PL1, RIDGE - 0.25, pegs=False)
    F0 += a
    F1 += b
    F2 += c
    gp = town.plaster_gable(gw, f'gable_plaster{gi}', 0.02, LY - 0.02, Z_PL1, LY / 2, zt(LY / 2) - 0.1, rnd)
    gp1 = town.plaster_gable(gw, f'gable_plaster{gi}_L1', 0.02, LY - 0.02, Z_PL1, LY / 2, zt(LY / 2) - 0.1, rnd, cell=0.6, bulge=0.0)
    gpl.append((gp, gp1))
town.add(A, mesh.join(F0, 'frame'), mat='M_Timber_Oak', uv_mode=None, only=0, build=(0.24, 0.52), smooth=30, wear=1.3)
town.add(A, mesh.join(F1, 'frame_L1'), mat='M_Timber_Oak', uv_mode=None, only=1, build=(0.24, 0.52), smooth=0, wear=1.3)
town.add(A, mesh.join(F2, 'frame_L2'), mat='M_Timber_Oak', uv_mode=None, only=2, build=(0.24, 0.52), smooth=0)
for gp, gp1 in gpl:
    town.add(A, gp, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.5, 0.68), smooth=0)
    town.add(A, gp1, mat='M_Plaster_Lime', uv_mode='box', only=(1, 2), build=(0.5, 0.68), smooth=0)

# Putz: Russ zur Esse hin (Front, rechts), Flecken
for wi, w in enumerate((wf, wb, wl, wr)):
    u0, u1 = (0.0, w.L) if w in (wf, wb) else (0.1, w.L - 0.1)
    p0 = town.plaster(w, f'plaster{wi}', u0, u1, Z_SILL, Z_PL0, rnd, cell=0.17)
    town.grime_attr(p0, lambda x, y, z: 0.45 * max(0.0, noise.noise(Vector((x * 4.0, y * 4.0, z * 3.0 + 9.0))) - 0.15)
                    + (0.7 * max(0.0, 1.0 - abs(x - 0.52) / 0.6) * max(0.0, (z - 0.9) / 0.6) if y < HY0 + 0.05 else 0.0))
    town.add(A, p0, mat='M_Plaster_Lime', uv_mode='box', only=0, build=(0.4, 0.62), smooth=60)
    p1 = town.plaster(w, f'plaster{wi}_L1', u0, u1, Z_SILL, Z_PL0, rnd, cell=0.4, bulge=0.0)
    town.add(A, p1, mat='M_Plaster_Lime', uv_mode='box', only=1, build=(0.4, 0.62), smooth=0)
body2 = town.subdivided_box('body_L2', (LX - 0.04, LY - 0.04, Z_PL0 - Z_SILL), loc=(XC, CY, Z_SILL), cuts=1)
town.add(A, body2, mat='M_Plaster_Lime', uv_mode='box', only=2, build=(0.4, 0.62), smooth=0)

# Sockel (Bruchstein)
stones, core = town.plinth_ring('plinth', HX0, HY0, HX1, HY1, Z_PLINTH, rnd, proud=0.03, depth=0.15, lmin=0.3, lmax=0.46, small_prob=0.15)
town.add(A, mesh.join(stones, 'plinth_stones'), mat='M_Stone_Rubble', uv_mode='box', only=0, build=(0.02, 0.2), smooth=40, dirt=1.4)
town.add(A, core, mat='M_Stone_Rubble', uv_mode='box', lod2='drop', build=(0.02, 0.2), smooth=0, dirt=1.6)
for L in (1, 2):
    pb = mesh.box(f'plinth_L{L}', (LX + 0.06, LY + 0.06, Z_PLINTH + 0.03), loc=(XC, CY, -0.03))
    town.add(A, pb, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.02, 0.2), smooth=0, dirt=1.5)

# Fenster, Tuer
backs, bars = [], []
for w in (wl, wr, wb):
    for (u0, u1, z0, z1, kind) in w.openings:
        backs.append(town.opening_reveal(w, f'wback_{id(w)}', u0, u1, z0, z1, depth=0.088))
        um = (u0 + u1) / 2
        bars.append(town.wall_timber(w, f'wbar_{id(w)}', um, z0, um, z1, 0.035, 0.04, depth=0.055, rnd=rnd))
        bars.append(town.wall_timber(w, f'wbarh_{id(w)}', u0, (z0 + z1) / 2 + 0.03, u1, (z0 + z1) / 2 + 0.03, 0.028, 0.03, depth=0.06, rnd=rnd))
bk = mesh.join(backs, 'window_backs')
town.uv_world_box(bk, space='world')
town.add(A, bk, mat='M_Wood_Planks', uv_mode=None, build=(0.4, 0.62), smooth=0)
bk['sp_grime'] = 1.0
town.add(A, mesh.join(bars, 'window_bars'), mat='M_Timber_Oak', uv_mode=None, build=(0.5, 0.62), smooth=0, lod1='drop', lod2='drop')
door = []
u0, u1, z0, z1, _ = wf.openings[0]
for k in range(5):
    bw = (u1 - u0 - 0.01) / 5
    uu = u0 + 0.005 + bw * (k + 0.5)
    door.append(town.wall_timber(wf, f'door{k}', uu, z0 + 0.01, uu, z1 - 0.005 - rnd.uniform(0, 0.012), bw - 0.004, 0.035, depth=0.06, rnd=rnd))
town.add(A, mesh.join(door, 'door'), mat='M_Wood_Planks', uv_mode=None, build=(0.55, 0.65), smooth=0, dirt=1.3)
iron = [town.wall_timber(wf, f'hinge{z:.2f}', u0 + 0.12, z, u1 - 0.02, z, 0.035, 0.008, depth=0.038, rnd=rnd) for z in (z0 + 0.22, z1 - 0.22)]

# ---------------------------------------------------------------- Dach (Schindeln in Lagen), First entlang X
XE = LX / 2 + 0.14
YE = LY / 2 + 0.2
R = town.GableRoof(XE, YE, RIDGE, PITCH, sag=0.035, cy=0.0, seed=4)
rows0 = []
for side in (-1, 1):
    rows0 += town.course_rows(f'shingle{side}', R, side, rows=9, row_thick=0.03, depth0=0.03, seed=21 + side, tooth=0.016, nseg=8,
                              jitter=0.01, lean=True, split=True)
r0 = mesh.join(rows0, 'roof')
town.uv_roof(r0, R, seed=5)
town.place(r0, 0.0, (XC, CY, 0.0))
town.grime_attr(r0, lambda x, y, z: (0.32 if y > CY else 0.12) + 0.35 * max(0.0, noise.noise(Vector((x * 2.3, y * 2.3, 0.7))))
                + 0.5 * max(0.0, 1.0 - abs(x - 0.52) / 0.5) * (1.0 if y < CY else 0.3))
town.add(A, r0, mat='M_Roof_Shingle', uv_mode=None, only=0, build=(0.7, 0.93), smooth=0, dirt=1.2)
for L, rows in ((1, 4), (2, 1)):
    objs = []
    for side in (-1, 1):
        objs += town.course_rows(f'shingleL{L}{side}', R, side, rows=rows, row_thick=0.04, depth0=0.03, seed=3, nseg=1, jitter=0.0, lean=True)
    o = mesh.join(objs, f'roof_L{L}')
    town.uv_roof(o, R, seed=5)
    town.place(o, 0.0, (XC, CY, 0.0))
    town.add(A, o, mat='M_Roof_Shingle', uv_mode=None, only=L, build=(0.7, 0.93), smooth=0, dirt=1.2)
soff = []
for side in (-1, 1):
    bmS = __import__('bmesh').new()
    pts = [bmS.verts.new((XC + xx, CY + yy, R.z_main(xx, yy) - 0.004)) for (xx, yy) in ((-XE, side * YE), (XE, side * YE), (XE, 0.0), (-XE, 0.0))]
    f = bmS.faces.new(pts)
    bmS.normal_update()
    if f.normal.z > 0:
        f.normal_flip()
    soff.append(mesh.obj_from_bm(f'roof_under{side}', bmS))
so = mesh.join(soff, 'roof_underside')
town.uv_world_box(so, space='world')
town.add(A, so, mat='M_Wood_Planks', uv_mode=None, build=(0.68, 0.75), smooth=0, dirt=1.5)
cap = [town.timber(f'ridge_board{s}', (XC - XE - 0.02, CY + s * 0.05, RIDGE + 0.05), (XC + XE + 0.02, CY + s * 0.05, RIDGE + 0.05), 0.12, 0.022, ch=0.0,
                   up=(0, s * 0.7, 0.7), segs=2, rnd=rnd) for s in (-1, 1)]
for c in cap:
    mesh.sag(c, 0.035, 'X')
town.add(A, mesh.join(cap, 'ridge_boards'), mat='M_Wood_Planks', uv_mode=None, build=(0.9, 0.95), smooth=0, lod2='keep')
wbd = []
for sx in (-1, 1):
    xv = sx * (XE - 0.012)
    for side in (-1, 1):
        p0 = (XC + xv, CY + side * (YE - 0.01), R.z_main(xv, side * (YE - 0.01)) - 0.02)
        p1 = (XC + xv, CY, R.z_main(xv, 0.0) - 0.02)
        wbd.append(town.timber(f'barge{sx}_{side}', p0, p1, 0.028, 0.13, ch=0.004, up=(0, 0, 1), rnd=rnd))
town.add(A, mesh.join(wbd, 'barge_boards'), mat='M_Wood_Planks', uv_mode=None, build=(0.8, 0.9), smooth=0, dirt=1.0, lod2='drop')

# ---------------------------------------------------------------- Offener Arbeitsplatz: Pultdach auf Staendern
VX0, VX1 = HX0 + 0.04, HX1 - 0.04
VD = 1.05
ZV = Z_PL0 - 0.06
RV = town.GableRoof((VX1 - VX0) / 2, VD, ZV, 17.0, cy=0.0, seed=6)
rv = town.course_rows('vtiles', RV, -1, rows=5, row_thick=0.028, depth0=0.03, seed=7, tooth=0.016, nseg=7, jitter=0.009, lean=True, split=True)
vt = mesh.join(rv, 'shed_roof')
town.uv_roof(vt, RV, seed=7)
town.place(vt, 0.0, ((VX0 + VX1) / 2, HY0, 0.0))
town.grime_attr(vt, lambda x, y, z: 0.15 + 0.55 * max(0.0, 1.0 - abs(x - 0.52) / 0.45))
town.add(A, vt, mat='M_Roof_Shingle', uv_mode=None, build=(0.78, 0.92), smooth=0, dirt=1.2, lod1=0.45, lod2=0.3)
YP = HY0 - VD + 0.1
zt_front = RV.z_main(0, -VD + 0.1) - 0.05
posts, pbases = [], []
for k, x in enumerate((VX0 + 0.05, -0.45, VX1 - 0.05)):
    posts.append(town.timber(f'post{k}', (x, YP, 0.0), (x + rnd.uniform(-0.01, 0.01), YP, zt_front - 0.08), 0.1, 0.1, ch=0.012, rnd=rnd))
    pbases.append(mesh.stone(f'pbase{k}', (0.17, 0.17, 0.09), loc=(x, YP, 0.03), seed=90 + k, rough=0.02, subdiv=0, bevel=0.2))
    for s in (-1, 1):
        if (k == 0 and s < 0) or (k == 2 and s > 0):
            continue
        posts.append(town.timber(f'kb{k}{s}', (x, YP, zt_front - 0.42), (x + s * 0.3, YP, zt_front - 0.1), 0.07, 0.07, ch=0.008, up=(0, 1, 0), rnd=rnd))
posts.append(town.timber('shed_plate', (VX0 - 0.04, YP, zt_front - 0.05), (VX1 + 0.04, YP, zt_front - 0.05), 0.1, 0.1, ch=0.01, segs=2, rnd=rnd))
for k in range(5):
    x = VX0 + 0.05 + k * (VX1 - VX0 - 0.1) / 4
    posts.append(town.timber(f'shed_rafter{k}', (x, HY0 + 0.02, RV.z_main(0, 0) - 0.05), (x, HY0 - VD + 0.04, RV.z_main(0, -VD + 0.04) - 0.05), 0.06, 0.07, ch=0.0, rnd=rnd))
town.add(A, mesh.join(pbases, 'post_bases'), mat='M_Stone_Rubble', uv_mode='box', build=(0.05, 0.2), smooth=20, dirt=1.4, lod2='drop')
po = mesh.join(posts, 'shed_frame')
town.add(A, po, mat='M_Timber_Oak', uv_mode=None, build=(0.6, 0.78), smooth=0, wear=1.4)
po['sp_grime'] = 0.2

# ---------------------------------------------------------------- Esse mit Rauchfang und Schlot
EX0, EX1 = 0.17, 0.87
EY0 = HY0 - 0.5
EZ = 0.55
ecx = (EX0 + EX1) / 2
ef = town.Wall((EX0, EY0), (EX1, EY0), (0, -1), 0.0, EZ)
ef.opening(0.22, 0.48, 0.1, 0.34, 'niche')
for L, cell in ((0, 0.18), (1, 0.6)):
    fo = town.plaster(ef, f'forge_front_L{L}', 0.0, ef.L, 0.0, EZ, rnd, inset=0.0, thick=0.5, cell=cell, bulge=0.012 if L == 0 else 0.0)
    if L == 0:
        town.grime_attr(fo, lambda x, y, z: 0.35 + 0.4 * max(0.0, (z - 0.3) / 0.25))
    town.add(A, fo, mat='M_Stone_Rubble', uv_mode='box', only=L, build=(0.2, 0.4), smooth=0, dirt=1.3)
nb = town.opening_reveal(ef, 'forge_niche_back', 0.22, 0.48, 0.1, 0.34, depth=0.45)
town.uv_world_box(nb, space='world')
town.add(A, nb, mat='M_Stone_Rubble', uv_mode=None, build=(0.2, 0.4), smooth=0)
nb['sp_grime'] = 1.0
# Herdplatte mit Glutbett (dunkle Kohle, Mitte)
hearth = [town.timber('hearth_rim', (EX0 - 0.02, (EY0 + HY0) / 2, EZ + 0.03), (EX1 + 0.02, (EY0 + HY0) / 2, EZ + 0.03), HY0 - EY0 + 0.04, 0.06, ch=0.015, rnd=rnd)]
town.add(A, mesh.join(hearth, 'hearth_rim'), mat='M_Stone_Rubble', uv_mode='box', build=(0.35, 0.45), smooth=0, dirt=1.5)
coalbed = town.dome('coal_bed', ecx, (EY0 + HY0) / 2 + 0.04, EZ + 0.055, 0.2, 0.15, 0.06, segs=8, rings=1, rnd=rnd, wob=0.01)
town.add(A, coalbed, mat='M_Stone_Rubble', uv_mode='box', build=(0.4, 0.45), smooth=40)
coalbed['sp_grime'] = 1.0
# Rauchfang: Pyramidenstumpf ueber dem Herd, dann Schlot
hood_lo, hood_hi = EZ + 0.42, EZ + 0.74
bmh = __import__('bmesh').new()
lo = [bmh.verts.new(v) for v in ((EX0, EY0 - 0.04, hood_lo), (EX1, EY0 - 0.04, hood_lo), (EX1, HY0, hood_lo), (EX0, HY0, hood_lo))]
cx0, cx1 = ecx - 0.15, ecx + 0.15
hi = [bmh.verts.new(v) for v in ((cx0, HY0 - 0.27, hood_hi), (cx1, HY0 - 0.27, hood_hi), (cx1, HY0, hood_hi), (cx0, HY0, hood_hi))]
for i in range(4):
    j = (i + 1) % 4
    bmh.faces.new((lo[i], lo[j], hi[j], hi[i]))
lo_in = [bmh.verts.new(v.co + Vector((0, 0, 0.05))) for v in lo]
for i in range(4):
    j = (i + 1) % 4
    bmh.faces.new((lo_in[j], lo_in[i], lo[i], lo[j]))
__import__('bmesh').ops.recalc_face_normals(bmh, faces=bmh.faces)
hood = mesh.obj_from_bm('forge_hood', bmh)
town.grime_attr(hood, lambda x, y, z: 0.55 + 0.4 * (z - hood_lo) / (hood_hi - hood_lo))
town.add(A, hood, mat='M_Plaster_Lime', uv_mode='box', build=(0.45, 0.6), smooth=0, dirt=1.4)
# Hood-Traeger (Eisen)
iron.append(town.timber('hood_bar', (EX0 - 0.02, EY0 - 0.05, hood_lo - 0.02), (EX1 + 0.02, EY0 - 0.05, hood_lo - 0.02), 0.03, 0.03, ch=0.0, rnd=rnd))
# Schlot (Bruchstein in Lagen) durch Pult- und Hauptdach
CH_TOP = RIDGE + 0.35
chim = town.chimney_shaft('chimney', ecx, HY0 - 0.12, hood_hi, CH_TOP, 0.36, 0.3, rnd, rings=5)
bands = [town.timber('chim_band', (ecx - 0.2, HY0 - 0.12, CH_TOP - 0.5), (ecx + 0.2, HY0 - 0.12, CH_TOP - 0.5), 0.33, 0.05, ch=0.01, rnd=rnd)]
town.grime_attr(chim, lambda x, y, z: 0.35 + 0.6 * max(0.0, (z - (CH_TOP - 0.6)) / 0.6))
town.add(A, chim, mat='M_Stone_Rubble', uv_mode='box', build=(0.45, 0.92), smooth=0, dirt=1.3, lod1='keep', lod2='keep')
cc = mesh.join([town.timber('chim_cap', (ecx - 0.2, HY0 - 0.12, CH_TOP + 0.03), (ecx + 0.2, HY0 - 0.12, CH_TOP + 0.03), 0.34, 0.05, ch=0.012, rnd=rnd)] + bands, 'chimney_cap')
town.add(A, cc, mat='M_Stone_Rubble', uv_mode='box', build=(0.88, 0.94), smooth=0, dirt=1.5, lod2='drop')
cc['sp_grime'] = 0.9

# Blasebalg links der Esse (Bretter + Leder) an einem Hebel
bx, by, bz = EX0 - 0.2, EY0 + 0.22, 0.62
bel = []
for zz, wd in ((bz, 0.3), (bz + 0.12, 0.26)):
    bel.append(town.timber(f'bellows_board{zz:.2f}', (bx - 0.12, by - 0.18, zz), (bx - 0.12, by + 0.2, zz), wd, 0.025, ch=0.0, up=(0, 0, 1), rnd=rnd))
bel.append(town.timber('bellows_nozzle', (bx + 0.02, by + 0.2, bz + 0.05), (EX0 + 0.05, by + 0.26, EZ + 0.08), 0.03, 0.03, ch=0.0, rnd=rnd))
town.add(A, mesh.join(bel, 'bellows_wood'), mat='M_Wood_Planks', uv_mode=None, build=(0.85, 0.94), smooth=0, dirt=1.4, lod2='drop')
leather = town.dome('bellows_leather', bx - 0.12, by + 0.0, bz - 0.005, 0.13, 0.19, 0.13, segs=8, rings=1, rnd=rnd, wob=0.006)
town.add(A, leather, mat='M_Leather', uv_mode='box', build=(0.85, 0.94), smooth=40, dirt=1.0, lod2='drop')
stand = [town.timber(f'bellows_leg{k}', (bx - 0.12 + sx * 0.11, by + sy * 0.15, 0.0), (bx - 0.12 + sx * 0.11, by + sy * 0.15, bz), 0.04, 0.04, ch=0.0, rnd=rnd)
         for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]
stand.append(town.timber('bellows_lever', (bx - 0.12, by - 0.18, bz + 0.14), (bx - 0.14, by - 0.55, bz + 0.42), 0.03, 0.03, ch=0.0, rnd=rnd))
town.add(A, mesh.join(stand, 'bellows_stand'), mat='M_Timber_Oak', uv_mode=None, build=(0.82, 0.92), smooth=0, lod1='drop', lod2='drop')

# Amboss auf Klotz
ax, ay = 0.42, -0.78
stump = mesh.cylinder('anvil_stump', 0.13, 0.36, segs=8, loc=(ax, ay, 0.0), r_top=0.12)
mesh.displace(stump, 0.008, 9.0, seed=4)
materials.assign(stump, 'M_Timber_Oak')
uv.cylindrical(stump, center=(ax, ay, 0.0))
town.add(A, stump, mat=None, uv_mode=None, build=(0.85, 0.94), smooth=40, dirt=1.3, lod2='drop')
anv = [mesh.box('anvil_foot', (0.17, 0.12, 0.06), loc=(ax, ay, 0.36), bevel=0.008),
       mesh.box('anvil_waist', (0.1, 0.07, 0.07), loc=(ax, ay, 0.42), bevel=0.006),
       mesh.box('anvil_face', (0.26, 0.1, 0.06), loc=(ax - 0.02, ay, 0.49), bevel=0.006),
       mesh.cylinder('anvil_horn', 0.04, 0.13, segs=6, loc=(ax + 0.17, ay, 0.52), axis='X', r_top=0.004)]
iron += anv
# Werkzeug: Hammer auf dem Amboss, Zange gelehnt
iron.append(town.timber('hammer_head', (ax - 0.08, ay + 0.02, 0.565), (ax - 0.0, ay + 0.03, 0.565), 0.035, 0.035, ch=0.0, rnd=rnd))
tools = [town.timber('hammer_handle', (ax - 0.04, ay + 0.03, 0.56), (ax - 0.02, ay + 0.25, 0.55), 0.018, 0.018, ch=0.0, rnd=rnd)]

# Werkzeugwand links an der Frontwand: Brett mit Zangen und Haemmern
tw_u0, tw_u1 = 0.12, 0.55
tw = town.wall_timber(wf, 'toolboard', tw_u0, 1.02, tw_u1, 1.02, 0.36, 0.025, depth=-0.03, ch=0.0, rnd=rnd)
tools.append(tw)
for k in range(5):
    u = tw_u0 + 0.05 + k * (tw_u1 - tw_u0 - 0.1) / 4
    if k % 2 == 0:  # Zange: zwei Schenkel
        for s in (-1, 1):
            p0 = wf.p(u, 1.15, -0.05)
            p1 = wf.p(u + s * 0.025, 0.86, -0.05)
            iron.append(town.timber(f'tong{k}{s}', p0, p1, 0.012, 0.012, ch=0.0, rnd=rnd))
    else:  # Hammer: Stiel + Kopf
        tools.append(town.timber(f'whandle{k}', wf.p(u, 1.17, -0.05), wf.p(u, 0.9, -0.05), 0.018, 0.018, ch=0.0, rnd=rnd))
        iron.append(town.timber(f'whead{k}', wf.p(u - 0.035, 1.17, -0.05), wf.p(u + 0.035, 1.17, -0.05), 0.035, 0.035, ch=0.0, rnd=rnd))
town.add(A, mesh.join(tools, 'tools_wood'), mat='M_Wood_Planks', uv_mode=None, build=(0.88, 0.96), smooth=0, dirt=1.2, lod1='drop', lod2='drop')

# Loeschtrog
qx, qy = 0.82, -0.8
qt = town.trough('quench_trough', qx, qy, 0.0, L=0.36, W=0.26, H=0.3, flare=1.12)
town.uv_world_box(qt, along='x')
town.add(A, qt, mat='M_Wood_Planks', uv_mode=None, build=(0.86, 0.95), smooth=0, dirt=1.4, lod2='drop')
water = mesh.box('water', (0.32, 0.24, 0.01), loc=(qx, qy, 0.22))
town.add(A, water, mat='M_Iron_Wrought', uv_mode='box', build=(0.9, 0.96), smooth=0, dirt=0.0, lod2='drop')
water['sp_grime'] = 0.6

# Kohlehaufen (links der Esse) in einem Bretterverschlag
kx, ky = -0.27, -0.42
coal = town.dome('coal_heap', kx, ky, 0.0, 0.26, 0.24, 0.24, segs=10, rings=2, rnd=rnd, wob=0.03)
mesh.displace(coal, 0.025, 12.0, seed=8)
town.add(A, coal, mat='M_Stone_Rubble', uv_mode='box', build=(0.8, 0.92), smooth=20, lod2='keep')
coal['sp_grime'] = 1.0
pen = [town.timber(f'pen{k}', (kx - 0.3, ky + 0.3 - k * 0.0, 0.06 + k * 0.1), (kx + 0.3, ky + 0.3, 0.06 + k * 0.1), 0.025, 0.09, ch=0.0, up=(0, 0, 1), rnd=rnd) for k in range(3)]
pen += [town.timber(f'penx{k}', (kx - 0.31, ky + 0.3, 0.0), (kx - 0.31, ky - 0.15 - k * 0.05, 0.06 + k * 0.1), 0.025, 0.09, ch=0.0, up=(0, 0, 1), rnd=rnd) for k in range(2)]
town.add(A, mesh.join(pen, 'coal_pen'), mat='M_Wood_Planks', uv_mode=None, build=(0.78, 0.9), smooth=0, dirt=1.5, lod2='drop')

# Schleifstein (Rad auf Holzbock) links vorn
gx_, gy_ = -1.0, -0.62
wheel = mesh.cylinder('grindstone', 0.17, 0.08, segs=12, loc=(gx_, gy_, 0.36), axis='X')
town.add(A, wheel, mat='M_Stone_Rubble', uv_mode='box', build=(0.88, 0.96), smooth=40, dirt=1.0, lod2='drop')
gfr = [town.timber(f'gframe{s}', (gx_ + s * 0.07, gy_ - 0.18, 0.0), (gx_ + s * 0.07, gy_ + 0.04, 0.42), 0.04, 0.04, ch=0.0, rnd=rnd) for s in (-1, 1)]
gfr += [town.timber(f'gframeb{s}', (gx_ + s * 0.07, gy_ + 0.2, 0.0), (gx_ + s * 0.07, gy_ + 0.04, 0.42), 0.04, 0.04, ch=0.0, rnd=rnd) for s in (-1, 1)]
gfr.append(town.timber('gtrough', (gx_ - 0.1, gy_, 0.2), (gx_ + 0.1, gy_, 0.2), 0.16, 0.08, ch=0.0, rnd=rnd))
town.add(A, mesh.join(gfr, 'grind_frame'), mat='M_Timber_Oak', uv_mode=None, build=(0.86, 0.95), smooth=0, dirt=1.3, lod2='drop')
iron.append(town.timber('gcrank', (gx_ + 0.1, gy_, 0.36), (gx_ + 0.16, gy_, 0.36), 0.015, 0.015, ch=0.0, rnd=rnd))
iron.append(town.timber('gcrank2', (gx_ + 0.16, gy_, 0.36), (gx_ + 0.16, gy_ - 0.09, 0.3), 0.015, 0.015, ch=0.0, rnd=rnd))

# Eisenstangen an der Wand rechts, Fass
for k in range(5):
    x = HX1 + 0.06 + k * 0.03
    iron.append(town.timber(f'bar{k}', (x, -0.25 + k * 0.02, 0.0), (x - 0.02, -0.12 + k * 0.02, 0.95 - k * 0.04), 0.022, 0.022, ch=0.0, rnd=rnd))
body, hoops = town.barrel('barrel', HX1 + 0.12, 0.42, r=0.13, h=0.34, segs=9)
materials.assign(body, 'M_Wood_Planks')
uv.cylindrical(body, center=(HX1 + 0.12, 0.42, 0.0))
town.add(A, body, mat=None, uv_mode=None, build=(0.9, 0.97), smooth=40, dirt=1.2, lod2='drop')
iron += hoops
town.add(A, mesh.join(iron, 'iron'), mat='M_Iron_Wrought', uv_mode='box', build=(0.88, 0.97), smooth=0, dirt=0.6, lod1='drop', lod2='drop')
# Spielerfarbe: Tuch ueber dem Pultdach-Rahm (Zunftzeichen)
sign = town.timber('sign', (-0.45 + 0.2, YP - 0.065, zt_front - 0.14), (-0.45 - 0.08, YP - 0.065, zt_front - 0.14), 0.02, 0.2, ch=0.004, up=(0, 0, 1), rnd=rnd)
town.add(A, sign, mat='M_Wood_Planks', uv_mode='box', team=True, build=(0.92, 0.98), smooth=0, dirt=0.3, lod2='drop')

# Pflaster am Arbeitsplatz
flags = []
for k, (x, y, sx, sy) in enumerate(((0.45, -0.55, 0.36, 0.28), (0.1, -0.78, 0.32, 0.26), (0.72, -0.4, 0.3, 0.24), (-0.25, -0.86, 0.34, 0.24))):
    r_ = rnd.uniform(-0.25, 0.25)
    f = town.timber(f'flag{k}', (x - math.cos(r_) * sx / 2, y - math.sin(r_) * sx / 2, 0.01), (x + math.cos(r_) * sx / 2, y + math.sin(r_) * sx / 2, 0.01),
                    sy, 0.045, ch=0.012, rnd=rnd)
    flags.append(f)
fl = mesh.join(flags, 'flagstones')
town.add(A, fl, mat='M_Stone_Rubble', uv_mode='box', build=(0.02, 0.15), smooth=0, dirt=1.6, lod2='drop')

# ---------------------------------------------------------------- Anker
anchors.anchor('smokeDark', (ecx, HY0 - 0.12, CH_TOP + 0.12), rate=2.4, staffed=True)
anchors.anchor('anvil', (ax, ay, 0.56), rate=2.2, staffed=True)
anchors.anchor('work', (ax - 0.05, ay - 0.35, 0.0), note='Amboss')
anchors.anchor('door', (HX0 + (DOOR[0] + DOOR[1]) / 2, HY0 - 0.3, 0.0))

A.scaffold = Z_PL1  # Geruest bis zur Traufe, das Dach waechst darueber
asset.finish(A)
