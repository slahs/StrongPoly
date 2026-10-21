"""Steintor / Torhaus (BT.GateStone, Footprint 4 x 3, Laufhoehe 3,6). Eigener Entwurf:

  - zwei vorspringende Flankentuerme mit Eckquadern, Sockel mit Wasserschlag und Gesims auf Hoehe der Mauer (Anschluss der
    Hohen Steinmauer an den Seiten bei x = +-2: gleiche Hoehenlinien), Schiessscharten, Tueren vom Wehrgang in die Tuerme
  - zurueckgesetzte Tordurchfahrt mit Rundbogen aus Keilsteinen und Gewaenden, Tonnengewoelbe, Fallgitterschlitz
  - Fallgitter aus Eichenbalken mit eisernen Spitzen und Baendern: Teil 'door' (hebt sich beim Oeffnen um 1,7 in den
    Mauerkoerper; die Laufzeit kennt fuer Tore nur das Heben - die Torfluegel stehen deshalb offen an den Laibungen)
  - zwei Torfluegel aus Bohlen mit Eisenbaendern (offen), Pechnase: vorgezogene Bruestung auf Kragsteinen ueber dem Tor
  - umlaufender Wehrgang mit unregelmaessigen Zinnen und Abdeckplatten, Banner in Spielerfarbe, Wimpelmast

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/gate_stone.py [--fast] [--no-preview]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import bpy  # noqa: E402

from sp import anchors, asset, mesh  # noqa: E402
import castle_kit as K  # noqa: E402
import wall_high_parts as W  # noqa: E402

A = asset.begin('gate_stone', target={'building': 'GateStone'}, footprint=(4, 3), klass='gate',
                desc='Steintor: Torhaus mit zwei Flankentuermen, Rundbogendurchfahrt, Fallgitter (hebt sich), offene Bohlenfluegel, '
                     'Pechnase auf Kragsteinen, Zinnen, Banner in Spielerfarbe')
rnd = random.Random(1311)

RUB, ASH, OAK, PLK, IRON, CLOTH = 'M_Stone_Rubble', 'M_Stone_Ashlar', 'M_Timber_Oak', 'M_Wood_Planks', 'M_Iron_Wrought', 'M_Cloth_Linen'

WALK = 3.6                   # BUILDINGS[GateStone].height
TOP = WALK - 0.03            # Oberkante Mauerkoerper (darauf Plattenbelag)
TX0, TX1 = 0.72, 1.99        # Turm innen/aussen (|x|)
YF, YB = -1.45, 1.22         # Turmfront, Rueckseite
YC = -1.05                   # zurueckgesetzte Torfront
PW, SPRING = 0.6, 1.25       # halbe Durchfahrtsbreite, Kaempferhoehe (Scheitel 1,85)
APEX = SPRING + PW
Z_PL, GS_Z = W.Z_PL, W.GS_Z  # Sockel/Gesims auf Mauerhoehe
PT = 0.18                    # Bruestungsdicke
BR_TOP = WALK + 0.3
SLOT_Y = (-0.985, -0.905)    # Fallgitterschlitz


def rect_frustum(name, lo, hi, z0, z1):
    """Quader mit unterschiedlichen Rechtecken unten/oben (xmin, xmax, ymin, ymax) - Sockel mit Anlauf je Seite."""
    import bmesh
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in ((lo[0], lo[2]), (lo[1], lo[2]), (lo[1], lo[3]), (lo[0], lo[3]))]
    b = [bm.verts.new((x, y, z1)) for x, y in ((hi[0], hi[2]), (hi[1], hi[2]), (hi[1], hi[3]), (hi[0], hi[3]))]
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh.obj_from_bm(name, bm)


def cheap_quoins(name, cx, cy, sx, sy, z0, z1, course=0.22, long=0.32, short=0.19, proud=0.016):
    """Eckquader als ungefaste, leicht unregelmaessige Bloecke (12 Dreiecke je Stein; Kantenabnutzung aus der Datenfarbe)."""
    st = []
    z = z0
    k = rnd.randrange(2)
    while z < z1 - 0.05:
        h = course * rnd.uniform(0.88, 1.12)
        if z1 - (z + h) < course * 0.5:
            h = z1 - z
        lx, ly = (long, short) if k % 2 == 0 else (short, long)
        lx *= rnd.uniform(0.88, 1.1)
        ly *= rnd.uniform(0.88, 1.1)
        p = proud + rnd.uniform(-0.006, 0.006)
        x_out, x_in = cx + sx * p, cx - sx * lx
        y_out, y_in = cy + sy * p, cy - sy * ly
        b = mesh.box(f'{name}_{k}', (abs(x_out - x_in), abs(y_out - y_in), h - 0.012), loc=((x_out + x_in) / 2, (y_out + y_in) / 2, z + 0.006))
        st.append(b)
        z += h
        k += 1
    return mesh.join(st, name)


# ---------------------------------------------------------------- Mauerkoerper: Tuerme + Mittelteil, Durchfahrt, Schlitze
towers = [mesh.box(f'tower_{s}', (TX1 - TX0, YB - YF, TOP), loc=(s * (TX0 + TX1) / 2, (YF + YB) / 2, 0.0)) for s in (-1, 1)]
center = mesh.box('center', (2 * TX0 + 0.02, YB - YC, TOP), loc=(0, (YC + YB) / 2, 0.0))
body = K.boolean(towers[0], [towers[1], center], op='UNION')
body.name = 'gate_body'
K.grid_cut(body, cell=0.5, jitter=0.15, seed=2)
K.mat(body, RUB)
cuts = []
tun = K._prism_xz('tunnel', K.arch_outline(0.0, -0.2, 2 * PW, APEX + 0.2, 10), YF - 0.5, YB + 0.5)
cuts.append(K.mat(tun, ASH))
slot = mesh.box('portcullis_slot', (2 * PW + 0.16, SLOT_Y[1] - SLOT_Y[0], TOP + 0.1 - 0.01), loc=(0, sum(SLOT_Y) / 2, -0.1))
cuts.append(K.mat(slot, ASH))
stones, backs = [], []
# Schiessscharten: Turmfronten (unten), Aussenseiten oberhalb der Mauerkrone, Rueckseiten
for s in (-1, 1):
    for (u, z, h, cross) in ((s * 1.35, 0.72, 0.46, False), (s * 0.98, 2.45, 0.42, True)):
        c, st = K.slit(f'slit_f_{s}_{z}', u, z, h, -YF, rnd, cross=cross)
        cuts += c
        stones += st
    # Aussenseite (Ost/West) vorn, oberhalb des Wehrgangs der Mauer
    c, st = K.slit(f'slit_side_{s}', -0.85 * (1 if s > 0 else -1), 2.95, 0.36, TX1, rnd)
    K.on_face(c + st, 'E' if s > 0 else 'W')
    cuts += c
    stones += st
    # Rueckseite: Fenster oben
    c, st, bk = K.arch_opening(f'win_b_{s}', -s * 1.3, 2.55, 0.26, 0.5, YB, rnd, depth=0.3, ring=0.08, n_vouss=5, back=0.03)
    K.on_face([c] + st + bk, 'N')
    cuts.append(c)
    stones += st
    backs += bk
    # Tuer vom Wehrgang der Mauer in den Turm (Aussenseite, Mitte)
    c, st, _ = K.arch_opening(f'walk_door_{s}', 0.0, W.WALK, 0.38, 0.8, TX1, rnd, depth=0.16, ring=0.08, n_vouss=5, sill=False)
    leaf = K.planks_leaf(f'walk_leaf_{s}', 0.0, W.WALK, 0.38, 0.8, -TX1 + 0.12, rnd, t=0.035, n=4)
    band = K.iron_bands(f'walk_band_{s}', 0.0, [W.WALK + 0.16, W.WALK + 0.55], 0.34, -TX1 + 0.095)
    K.on_face([c] + st + leaf + band, 'E' if s > 0 else 'W')
    cuts.append(c)
    stones += st
    backs += leaf + band
K.boolean(body, cuts)
K.finish_uv(body)
A.add(body, mat=None, uv_mode=None, smooth=35, lod1=('planar', 5), lod2='drop')

# Torbogen vorn (zurueckgesetzt) und hinten: Keilsteine und Gewaende
for face, d in (('S', -YC), ('N', YB)):
    c, st, _ = K.arch_opening(f'gate_arch_{face}', 0.0, 0.0, 2 * PW, APEX, d, rnd, depth=0.05, ring=0.17, n_vouss=9, sill=False, segs=12)
    bpy.data.objects.remove(c)
    K.on_face(st, face)
    stones += st
# LOD1: Bogenring als ein Prisma je Seite (statt Einzelsteinen)
rings = []
for face, d in (('S', -YC), ('N', YB)):
    outer = K.arch_outline(0.0, 0.0, 2 * PW + 0.34, APEX + 0.17, 8)
    inner = K.arch_outline(0.0, 0.0, 2 * PW, APEX, 8)
    pts = [p for p in outer[2:]] + list(reversed(inner[2:]))
    r = K._prism_xz(f'arch_ring_l1_{face}', [(x, z) for x, z in pts], -d - 0.02, -d + 0.03)
    K.on_face([r], face)
    rings.append(r)
A.add(K.mesh.join(rings, 'arch_ring_lod1'), mat=ASH, uv_mode='box', smooth=30, only=1)
# Prellsteine an der Durchfahrt (Radabweiser)
for s in (-1, 1):
    for y in (YC + 0.12,):
        stones.append(K.mat(mesh.cylinder(f'guard_{s}_{y:.2f}', 0.08, 0.3, segs=6, loc=(s * (PW - 0.03), y, 0.0), r_top=0.05), ASH))
A.add(K.mesh.join(stones, 'arch_stones'), mat=None, uv_mode='box', smooth=30, wear=1.5, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Sockel, Wasserschlag, Gesims, Eckquader
pls, wts, gss = [], [], []
for s in (-1, 1):
    xi, xo = sorted((s * TX0, s * TX1))
    lo = (xi - (0.0 if s > 0 else 0.01), xo + (0.01 if s > 0 else 0.0), YF - 0.06, YB + 0.06)
    hi = (xi, xo, YF - 0.012, YB + 0.012)
    # Anlauf nur nach vorn/hinten/aussen (die Innenseite ist die Durchfahrt)
    if s > 0:
        lo = (TX0, TX1 + 0.01, YF - 0.06, YB + 0.06)
        hi = (TX0, TX1 + 0.002, YF - 0.012, YB + 0.012)
    else:
        lo = (-TX1 - 0.01, -TX0, YF - 0.06, YB + 0.06)
        hi = (-TX1 - 0.002, -TX0, YF - 0.012, YB + 0.012)
    p = rect_frustum(f'plinth_{s}', lo, hi, 0.0, Z_PL)
    K.grid_cut(p, cell=0.55, axes='xy')
    pls.append(p)
    w0 = (hi[0] - (0.03 if s < 0 else 0), hi[1] + (0.03 if s > 0 else 0), hi[2] - 0.03, hi[3] + 0.03)
    w1 = (hi[0] + (0.01 if s < 0 else 0), hi[1] - (0.01 if s > 0 else 0), hi[2] + 0.01, hi[3] - 0.01)
    wts.append(rect_frustum(f'water_{s}', w0, w1, Z_PL - 0.03, Z_PL + 0.07))
    g0 = (xi - (0.03 if s < 0 else 0), xo + (0.03 if s > 0 else 0), YF - 0.03, YB + 0.03)
    g1 = (xi - (0.0 if s < 0 else 0), xo, YF + 0.005, YB - 0.005)
    gss.append(K.mesh.box(f'string_{s}', (g0[1] - g0[0], g0[3] - g0[2], 0.055), loc=((g0[0] + g0[1]) / 2, (g0[2] + g0[3]) / 2, GS_Z - 0.035)))
    gss.append(rect_frustum(f'string_top_{s}', g0, (g1[0] + (0.01 if s < 0 else 0), g1[1] - (0.01 if s > 0 else 0), g1[2], g1[3]), GS_Z + 0.02, GS_Z + 0.055))
A.add(K.mesh.join(pls, 'plinth'), mat=RUB, uv_mode='box', smooth=30, dirt=1.6, lod1=('planar', 4), lod2='drop')
A.add(K.mesh.join(wts, 'water_table'), mat=ASH, uv_mode='box', smooth=20, lod1='keep', lod2='drop')
A.add(K.mesh.join(gss, 'string_course'), mat=ASH, uv_mode='box', smooth=20, wear=1.3, lod2='drop')
qs, qp = [], []
for s in (-1, 1):
    for (cx, cy, sx, sy) in ((s * TX1, YF, s, -1), (s * TX1, YB, s, 1)):
        qs.append(cheap_quoins(f'q_{s}_{cx:.2f}_{cy:.2f}', cx, cy, sx, sy, Z_PL + 0.07, TOP - 0.02))
A.add(K.mesh.join(qs, 'quoins'), mat=ASH, uv_mode='box', smooth=0, wear=1.7, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Pechnase ueber dem Tor, Bruestung, Zinnen, Belag
corb = []
for u in (-0.48, 0.0, 0.48):
    corb.append(K.corbel(f'mach_corbel_{u}', u, 3.02, -YC, (YC - YF) - 0.005, 0.2, rnd, steps=3, step_h=0.15))
A.add(K.mesh.join(corb, 'mach_corbels'), mat=ASH, uv_mode='box', smooth=25, wear=1.2, lod1=0.6, lod2='drop')
mach = K.mesh.box('mach_wall', (2 * TX0 - 0.002, PT + 0.02, TOP - 3.02), loc=(0, YF + (PT + 0.02) / 2, 3.02))
K.grid_cut(mach, cell=0.25, axes='x')
A.add(mach, mat=RUB, uv_mode='box', smooth=30, lod1='keep', lod2='keep')
cor = K.ring_box('cornice', (TX1 + 0.035, (YB - YF) / 2 + 0.035), (TX1 - 0.12, (YB - YF) / 2 - 0.12), TOP - 0.06, TOP + 0.02, loc=(0, (YF + YB) / 2))
A.add(cor, mat=ASH, uv_mode='box', smooth=20, wear=1.4, lod2='drop')
par = K.ring_box('parapet', (TX1, (YB - YF) / 2), (TX1 - PT, (YB - YF) / 2 - PT), TOP + 0.02, BR_TOP, loc=(0, (YF + YB) / 2))
K.grid_cut(par, cell=0.3, axes='xy')
A.add(par, mat=RUB, uv_mode='box', smooth=30, lod1=('planar', 4), lod2=('planar', 8))
# Plattenbelag (die Pechnase bleibt offen: Schlitz zwischen Bruestung und Torfront)
fl = [K.mesh.box('floor_c', (2 * (TX1 - PT), YB - PT - YC, 0.03), loc=(0, (YC + YB - PT) / 2, TOP)),
      K.mesh.box('floor_l', (TX1 - PT - TX0, YC - (YF + PT), 0.03), loc=(-(TX0 + TX1 - PT) / 2, (YC + YF + PT) / 2, TOP)),
      K.mesh.box('floor_r', (TX1 - PT - TX0, YC - (YF + PT), 0.03), loc=((TX0 + TX1 - PT) / 2, (YC + YF + PT) / 2, TOP))]
A.add(K.mesh.join(fl, 'floor'), mat=ASH, uv_mode='box', smooth=0, dirt=1.2, lod2='drop')

merl, caps, mprox = [], [], []
half_w = TX1
half_d = (YB - YF) / 2
ymid = (YF + YB) / 2
for face, L, Lside in (('S', half_w, half_d), ('N', half_w, half_d), ('E', half_d, half_w), ('W', half_d, half_w)):
    m_f, c_f, p_f = [], [], []
    x = -L if face in ('S', 'N') else -L + PT + rnd.uniform(0.16, 0.24)
    xe = L if face in ('S', 'N') else L - PT
    first = True
    while x < xe - 0.08:
        w = 0.38 if first else rnd.uniform(0.3, 0.4)
        if x + w > xe - 0.1:
            w = xe - x
        mh = rnd.uniform(0.3, 0.4)
        m = mesh.box(f'merlon_{face}_{x:.2f}', (w - 0.008, PT + 0.012, mh), loc=(x + w / 2, -Lside + PT / 2, BR_TOP - 0.01), rot=(0, 0, rnd.uniform(-0.015, 0.015)))
        m_f.append(m)
        c_f.append(mesh.box(f'mcap_{face}_{x:.2f}', (w + 0.036, PT + 0.044, 0.055), loc=(x + w / 2, -Lside + PT / 2, BR_TOP + mh - 0.025), rot=(0, rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02))))
        p_f.append(mesh.box(f'mp_{face}_{x:.2f}', (w, PT, mh), loc=(x + w / 2, -Lside + PT / 2, BR_TOP - 0.01)))
        gap = rnd.uniform(0.22, 0.29)
        gx0, gx1 = x + w, min(xe, x + w + gap)
        if gx1 - gx0 > 0.05:
            c_f.append(mesh.box(f'cope_{face}_{x:.2f}', (gx1 - gx0 + 0.004, PT + 0.035, 0.05), loc=((gx0 + gx1) / 2, -Lside + PT / 2 - 0.0025, BR_TOP - 0.01),
                                rot=(rnd.uniform(-0.02, 0.02), 0, 0)))
        x = gx1
        first = False
    objs = m_f + c_f + p_f
    K.on_face(objs, face)
    for o in objs:
        K.move(o, (0, ymid, 0))
    merl += m_f
    caps += c_f
    mprox += p_f
A.add(K.mesh.join(merl, 'merlons'), mat=RUB, uv_mode='box', smooth=0, wear=1.3, lod1='drop', lod2='drop')
A.add(K.mesh.join(caps, 'merlon_caps'), mat=ASH, uv_mode='box', smooth=25, wear=1.6, lod1='drop', lod2='drop')
A.add(K.mesh.join(mprox, 'merlons_proxy'), mat=RUB, uv_mode='box', smooth=0, only=(1, 2))

# ---------------------------------------------------------------- Fallgitter (Teil 'door': hebt sich um 1,7 in den Mauerkoerper)
PY = sum(SLOT_Y) / 2
gate_oak, gate_iron = [], []
nb = 7
G_TOP = APEX
for i in range(nb):
    x = -PW + 0.05 + (2 * PW - 0.1) * i / (nb - 1)
    gate_oak.append(mesh.beam(f'pc_v_{i}', (x, PY, 0.12), (x, PY, G_TOP), 0.055, 0.05))
    gate_iron.append(mesh.cylinder(f'pc_spike_{i}', 0.03, 0.13, segs=4, loc=(x, PY, -0.005), r_top=0.004))
for k, z in enumerate((0.42, 0.9, 1.38, 1.8)):
    gate_oak.append(mesh.beam(f'pc_h_{k}', (-PW + 0.0, PY + 0.012, z), (PW - 0.0, PY + 0.012, z), 0.045, 0.05))
for k, z in enumerate((0.42, 1.38)):
    gate_iron.append(mesh.box(f'pc_strap_{k}', (2 * PW - 0.02, 0.012, 0.03), loc=(0, PY - 0.03, z - 0.015)))
A.add(K.mesh.join(gate_oak, 'portcullis'), mat=OAK, uv_mode='box', uv_space='object', smooth=30, dirt=1.3, part='door', pivot=(0, PY, 0),
      lod1=0.6, lod2='drop')
A.add(K.mesh.join(gate_iron, 'portcullis_iron'), mat=IRON, uv_mode='box', smooth=30, dirt=0.6, part='door', pivot=(0, PY, 0), lod1='keep', lod2='drop')
pcl2 = mesh.box('portcullis_l2', (2 * PW - 0.04, 0.05, G_TOP), loc=(0, PY, 0.0))
A.add(pcl2, mat=OAK, uv_mode='box', smooth=0, part='door', pivot=(0, PY, 0), only=2)

# ---------------------------------------------------------------- Windenhaus ueber dem Fallgitterschlitz (Bohlenwaende, Satteldach)
HX0, HX1 = -0.66, 0.66
HY0, HY1 = SLOT_Y[0] - 0.12, -0.12
HZ = WALK
HW = 0.72                     # Wandhoehe
YC_R = (HY0 + HY1) / 2        # First
RISE = 0.42
hw, hp = [], []
for (x0, x1, y0, y1) in ((HX0, HX1, HY0, HY0 + 0.05), (HX0, HX1, HY1 - 0.05, HY1), (HX0, HX0 + 0.05, HY0, HY1), (HX1 - 0.05, HX1, HY0, HY1)):
    hw.append(mesh.box(f'wh_wall_{x0:.2f}_{y0:.2f}', (x1 - x0, y1 - y0, HW), loc=((x0 + x1) / 2, (y0 + y1) / 2, HZ)))
for x in (HX0, HX1):
    hw.append(mesh.prism(f'wh_gable_{x:.2f}', [(HY0, HZ + HW), (HY1, HZ + HW), (YC_R, HZ + HW + RISE - 0.03)], 0.05, loc=(x + (0.025 if x < 0 else -0.025), 0, 0),
                         plane='YZ'))
A.add(K.mesh.join(hw, 'winch_house_walls'), mat=PLK, uv_mode='box', uv_space='world', along='z', smooth=0, dirt=1.2, lod1='keep', lod2='keep')
for x in (HX0 + 0.03, HX1 - 0.03):
    for y in (HY0 + 0.03, HY1 - 0.03):
        hp.append(mesh.beam(f'wh_post_{x:.2f}_{y:.2f}', (x, y, HZ), (x, y, HZ + HW), 0.07, 0.07))
hp.append(mesh.beam('wh_ridge', (HX0 - 0.16, YC_R, HZ + HW + RISE - 0.02), (HX1 + 0.16, YC_R, HZ + HW + RISE - 0.02), 0.06, 0.06))
for y in (HY0 + 0.03, HY1 - 0.03):
    hp.append(mesh.beam(f'wh_plate_{y:.2f}', (HX0 - 0.1, y, HZ + HW - 0.03), (HX1 + 0.1, y, HZ + HW - 0.03), 0.06, 0.06))
A.add(K.mesh.join(hp, 'winch_house_timber'), mat=OAK, uv_mode='box', uv_space='object', smooth=0, wear=1.3, lod1='keep', lod2='drop')
rf = []
for sgn in (-1, 1):
    r = K.shed_roof(f'wh_roof_{sgn}', HX0 - 0.15, HX1 + 0.15, YC_R, (HY1 - HY0) / 2 + 0.14, HZ + HW + RISE, RISE + 0.08, 4, rnd, segs=5)
    if sgn > 0:
        K.rot_z(r, math.pi, (0, YC_R, 0))
    rf.append(r)
A.add(K.mesh.join(rf, 'winch_house_roof'), mat='M_Roof_Shingle', uv_mode='box', smooth=25, dirt=0.9, lod1='drop', lod2='drop')
rp = []
for sgn in (-1, 1):
    y_e = YC_R + sgn * ((HY1 - HY0) / 2 + 0.14)
    rp.append(mesh.prism(f'wh_roof_core_{sgn}', [(YC_R, HZ + HW + RISE), (y_e, HZ + HW - 0.08), (y_e, HZ + HW - 0.11), (YC_R, HZ + HW + RISE - 0.05)],
                         HX1 - HX0 + 0.3, loc=(0, 0, 0), plane='YZ'))
A.add(K.mesh.join(rp, 'winch_house_roof_core'), mat='M_Roof_Shingle', uv_mode='box', smooth=0, lod1='keep', lod2='keep')

# ---------------------------------------------------------------- Torfluegel (offen an den Laibungen), Bohlen mit Eisenbaendern
leaves, liron = [], []
for s in (-1, 1):
    x = s * (PW - 0.035)
    y0, y1 = SLOT_Y[1] + 0.07, SLOT_Y[1] + 0.07 + PW - 0.02
    n = 5
    for i in range(n):
        ya = y0 + (y1 - y0) * i / n + 0.003
        yb = y0 + (y1 - y0) * (i + 1) / n - 0.003
        leaves.append(mesh.box(f'leaf_{s}_{i}', (0.04, yb - ya, 1.7 + rnd.uniform(-0.01, 0.01)), loc=(x, (ya + yb) / 2, 0.04)))
    for z in (0.3, 1.0, 1.55):
        liron.append(mesh.box(f'leaf_band_{s}_{z}', (0.012, y1 - y0 - 0.02, 0.04), loc=(x - s * 0.026, (y0 + y1) / 2, z)))
A.add(K.mesh.join(leaves, 'gate_leaves'), mat=PLK, uv_mode='box', uv_space='object', along='z', smooth=25, dirt=1.4, lod1='keep', lod2='drop')
b_iron = [o for o in backs if o.data.materials[0].name == IRON]
b_wood = [o for o in backs if o.data.materials[0].name == PLK]
A.add(K.mesh.join(liron + b_iron, 'gate_iron'), mat=IRON, uv_mode='box', smooth=25, dirt=0.5, lod1='drop', lod2='drop')
A.add(K.mesh.join(b_wood, 'doors_shutters'), mat=PLK, uv_mode='box', uv_space='object', along='z', smooth=25, lod1=0.6, lod2='drop')

# ---------------------------------------------------------------- Banner in Spielerfarbe (Turmfronten), Wimpelmast
bi, bc = [], []
for s in (-1, 1):
    bu = s * 1.38
    bw, bz0, bz1 = 0.42, 1.62, 2.55
    BY = YF - 0.07
    bi.append(mesh.beam(f'brod_{s}', (bu - bw / 2 - 0.05, BY, bz1 + 0.03), (bu + bw / 2 + 0.05, BY, bz1 + 0.03), 0.02, 0.02))
    for e in (-1, 1):
        bi.append(mesh.beam(f'bbr_{s}{e}', (bu + e * (bw / 2 + 0.02), YF + 0.01, bz1 + 0.03), (bu + e * (bw / 2 + 0.02), BY - 0.01, bz1 + 0.03), 0.018, 0.018))
    b = mesh.prism(f'banner_{s}', [(bu - bw / 2, bz0 + 0.11), (bu, bz0), (bu + bw / 2, bz0 + 0.11), (bu + bw / 2, bz1), (bu - bw / 2, bz1)], 0.014,
                   loc=(0, BY - 0.004, 0), plane='XZ')
    K.grid_cut(b, cell=0.15, axes='z')
    for v in b.data.vertices:
        v.co.y += math.sin(v.co.x * 23.0 + s) * 0.007 * (1.0 - (v.co.z - bz0) / (bz1 - bz0) * 0.6)
    bc.append(b)
A.add(K.mesh.join(bi, 'banner_iron'), mat=IRON, uv_mode='box', smooth=30, lod1='keep', lod2='drop')
A.add(K.mesh.join(bc, 'banners'), mat=CLOTH, uv_mode='box', smooth=40, team=True, dirt=0.35, lod1='keep', lod2=0.3)
PX, PY2 = -TX1 + 0.2, YB - 0.2
POLE_TOP = BR_TOP + 1.25
pole = mesh.cylinder('pole', 0.026, POLE_TOP - TOP, segs=6, loc=(PX, PY2, TOP), r_top=0.018)
A.add(pole, mat=OAK, uv_mode='box', uv_space='object', smooth=50, lod1='keep', lod2='keep')
pen = mesh.prism('pennant', [(PX + 0.02 + x, POLE_TOP - 0.06 - z) for x, z in ((0.0, 0.0), (0.78, -0.13), (0.0, -0.3))], 0.014, plane='XZ')
K.grid_cut(pen, cell=0.15, axes='x')
K.move(pen, (0, PY2, 0))  # Prisma liegt bei y = 0 -> an den Mast
A.add(pen, mat=CLOTH, uv_mode='box', smooth=30, team=True, part='cloth', pivot=(PX, PY2, POLE_TOP - 0.06), dirt=0.3, lod1='keep', lod2='keep')

# ---------------------------------------------------------------- LOD2-Ersatzform
l2 = [mesh.box('l2_tower_l', (TX1 - TX0, YB - YF, TOP + 0.04), loc=(-(TX0 + TX1) / 2, (YF + YB) / 2, 0)),
      mesh.box('l2_tower_r', (TX1 - TX0, YB - YF, TOP + 0.04), loc=((TX0 + TX1) / 2, (YF + YB) / 2, 0)),
      mesh.box('l2_center', (2 * TX0, YB - YC, TOP + 0.04 - APEX), loc=(0, (YC + YB) / 2, APEX))]
A.add(K.mesh.join(l2, 'lod2_body'), mat=RUB, uv_mode='box', smooth=0, only=2)

anchors.anchor('door', (0.0, YF - 0.3, 0.0), note='vor der Durchfahrt (aussen)')
anchors.anchor('flag', (PX, PY2, POLE_TOP), note='Wimpelmast')
for s in (-1, 1):
    anchors.anchor('banner', (s * 1.38, YF - 0.07, 2.1), note='Turmbanner')

asset.finish(A)
