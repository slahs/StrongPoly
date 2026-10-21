"""Referenzgebaeude Bergfried / Wohnturm (BT.Keep, Footprint 5x5, Laufhoehe der Plattform 4,2).

Mitteleuropaeischer Wohnturm des 12.-14. Jh., eigener Entwurf:
  - Bruchsteinschaft mit Eckquadern (Laeufer/Binder), Sockel mit Anlauf und Wasserschlag, Geschossgesims mit Ruecksprung
  - Hocheingang im ersten Obergeschoss: Rundbogenportal mit Bohlentuer und Eisenbaendern, hoelzerne Aussentreppe mit
    Podest, Gelaender und kleinem Schindel-Vordach
  - Schiessscharten, kleine Rundbogenfenster mit Gewaenden/Sohlbank (teils mit Laeden), Ruestloecher in Reihen,
    Ausbesserungen in Werkstein, Abtritterker auf Kragsteinen, Wasserspeier
  - Konsolfries mit Pechnasen-Schlitzen, vorkragende Bruestung mit unregelmaessigen Zinnen und Abdeckplatten,
    zwei Scharwachttuermchen an den Frontecken mit Kegeldach
  - Turmaufsatz (Wohngeschoss) mit Zwillingsfenstern, Tuer zur Plattform, Zeltdach aus Schindellagen, Gratbretter,
    Knauf und Fahnenmast mit Banner in Spielerfarbe; Fassadenbanner in Spielerfarbe
Gebrauchsspuren: gebackene AO, Schmutz am Sockel/unter Gesimsen, Kantenabnutzung (Datenfarbe) + Bibliotheksmaterialien.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/keep.py [--fast] [--no-preview] [--no-bake]
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

A = asset.begin('keep', target={'building': 'Keep'}, footprint=(5, 5), klass='keep',
                desc='Bergfried/Wohnturm: Bruchstein mit Eckquadern, Hocheingang mit Holztreppe, Konsolfries, Zinnen, '
                     'Scharwachttuerme, Turmaufsatz mit Zeltdach, Banner in Spielerfarbe')
rnd = random.Random(1207)

RUB = 'M_Stone_Rubble'
ASH = 'M_Stone_Ashlar'
OAK = 'M_Timber_Oak'
PLK = 'M_Wood_Planks'
ROOF = 'M_Roof_Shingle'
IRON = 'M_Iron_Wrought'
CLOTH = 'M_Cloth_Linen'

# ---------------------------------------------------------------- Hauptmasse (Blender: Front -Y)
WALK = 4.2          # Laufhoehe Plattform (BUILDINGS[Keep].height)
PL_Z = 0.62         # Oberkante Sockel
PL_H0 = 2.13        # halbe Breite Sockel am Boden (Anlauf)
S1 = 2.0            # halbe Breite Schaft unten
GS_Z = 2.78         # Geschossgesims (2. OG)
S2 = 1.965          # halbe Breite Schaft oben (Ruecksprung)
CORB_TOP = 3.9      # Oberkante Konsolen = Unterkante Bruestung
PA = 2.22           # Bruestung aussen (halbe Breite)
PT = 0.17           # Bruestungsdicke
BR_TOP = 4.56       # Oberkante Bruestung (0,36 ueber der Plattform)
UT = 1.2            # Turmaufsatz halbe Breite
UT_TOP = 6.35       # Traufe Turmaufsatz
ROOF_OVER = 0.22
ROOF_RISE = 1.85

# Oeffnungen je Seite: (art, u, z0, w, h, extra) - Erdgeschoss Scharten, 1. OG (Saal, Hocheingang) und 2. OG Fenster
OPEN = {
    'S': [('door', -0.42, 1.42, 0.6, 1.16, None), ('win', 0.58, 1.8, 0.28, 0.54, 'shutter'), ('slit', -1.3, 0.8, 0, 0.44, None),
          ('win', -0.25, 2.95, 0.28, 0.48, 'open'), ('slit', 0.68, 2.98, 0, 0.38, None)],
    'E': [('slit', -0.95, 0.85, 0, 0.44, None), ('slit', 0.85, 0.9, 0, 0.42, None), ('win', -0.6, 1.8, 0.3, 0.54, 'open'),
          ('win', 0.15, 2.95, 0.28, 0.48, 'shutter'), ('slit', -1.2, 3.0, 0, 0.36, 'cross')],
    'N': [('slit', -1.0, 0.88, 0, 0.44, None), ('slit', 1.05, 0.85, 0, 0.44, None), ('win', 0.15, 1.8, 0.3, 0.54, 'shutter'),
          ('slit', -0.95, 3.0, 0, 0.36, None), ('slit', 1.1, 3.02, 0, 0.36, None), ('win', 0.2, 2.95, 0.28, 0.48, 'open')],
    'W': [('slit', -0.9, 0.85, 0, 0.44, None), ('slit', 0.9, 0.88, 0, 0.44, None), ('win', 0.6, 1.78, 0.3, 0.54, 'open'),
          ('win', -0.7, 2.95, 0.28, 0.48, 'shutter'), ('slit', 0.45, 3.0, 0, 0.36, 'cross')],
}
GARDEROBE = ('E', 0.75, 1.86)   # Seite, u, Unterkante
BANNER = ('S', 1.32, 2.5, 3.48)  # Seite, u, unten, oben

# ---------------------------------------------------------------- Schaft unten / oben: Rasterkoerper, Unebenheit, Oeffnungen


def body(name, half, z0, z1, seed, cell=0.27):
    b = mesh.box(name, (2 * half, 2 * half, z1 - z0), loc=(0, 0, z0))
    K.grid_cut(b, cell=cell, jitter=0.18, seed=seed)

    def fade(co):
        # an den Kanten (Eckquader) und oben/unten keine Verschiebung
        ex = min(half - abs(co.x), half - abs(co.y))
        return max(0.0, min(1.0, ex / 0.35)) * max(0.0, min(1.0, (co.z - z0) / 0.2, (z1 - co.z) / 0.2))
    K.wobble(b, amount=0.0035, scale=0.7, seed=seed, fade=fade)
    K.mat(b, RUB)
    return b


def face_openings(face, d, zlo, zhi, tag):
    """Oeffnungen einer Seite im Hoehenbereich: Schneidkoerper, Werksteine, Ruecken (Laden/Tuer), Rechtecke (fuer Ruestloecher)."""
    cuts, stones, backs, rects = [], [], [], []
    for k, (kind, u, z0, w, h, extra) in enumerate(OPEN[face]):
        if not (zlo <= z0 < zhi):
            continue
        nm = f'{tag}_{face}_{k}'
        if kind == 'slit':
            c, st = K.slit(nm, u, z0, h, d, rnd, cross=(extra == 'cross'))
            cuts += c
            stones += st
            rects.append((u - 0.2, u + 0.2, z0 - 0.15, z0 + h + 0.15))
        elif kind == 'win':
            back = 0.035 if extra == 'shutter' else None
            c, st, bk = K.arch_opening(nm, u, z0, w, h, d, rnd, depth=0.24 if back else 0.42, ring=0.09, n_vouss=5, back=back)
            cuts.append(c)
            stones += st
            backs += bk
            rects.append((u - w / 2 - 0.2, u + w / 2 + 0.2, z0 - 0.15, z0 + h + 0.2))
        elif kind == 'door':
            c, st, _ = K.arch_opening(nm, u, z0, w, h, d, rnd, depth=0.2, ring=0.12, n_vouss=7, sill=False)
            cuts.append(c)
            stones += st
            # Tuerschwelle (Werkstein) und Bohlentuer mit Eisenbaendern in der Laibung
            stones.append(K.mat(K.block(nm + '_thr', (w + 0.08, 0.26, 0.06), (u, -d + 0.04, z0 - 0.03), rnd, rough=0.02, bevel=0.1), ASH))
            leaf_y = -d + 0.2 - 0.04
            backs += K.planks_leaf(nm + '_leaf', u, z0, w, h, leaf_y, rnd, t=0.04, n=5)
            backs += K.iron_bands(nm + '_band', u, [z0 + 0.22, z0 + 0.72], w * 0.92, leaf_y - 0.026)
            ring = K.mesh.cylinder(nm + '_ring', 0.035, 0.012, segs=8, loc=(u + w * 0.28, leaf_y - 0.03, z0 + 0.5), axis='Y')
            backs.append(K.mat(ring, IRON))
            rects.append((u - w / 2 - 0.25, u + w / 2 + 0.25, z0 - 0.2, z0 + h + 0.25))
    return cuts, stones, backs, rects


def putlogs(face, d, rows, half, rects, tag):
    """Ruestloecher: kleine quadratische Nischen in Reihen, Abstand ~0,8, nicht an Oeffnungen/Ecken."""
    cuts = []
    for zr in rows:
        u = -half + 0.5 + rnd.uniform(0.0, 0.35)
        while u < half - 0.45:
            z = zr + rnd.uniform(-0.03, 0.03)
            if not any(r[0] < u < r[1] and r[2] < z < r[3] for r in rects) and rnd.random() > 0.18:
                s = rnd.uniform(0.06, 0.08)
                c = K.mesh.box(f'{tag}_{face}_pl_{len(cuts)}', (s, 0.4, s * rnd.uniform(0.9, 1.15)), loc=(u, -d - 0.3 + 0.2 + 0.09, z))
                cuts.append(K.mat(c, RUB))
            u += rnd.uniform(0.7, 0.95)
    return cuts


def patch(obj, face, u0, u1, z0, z1, seed):
    """Ausbesserung in Werkstein: Rasterflaechen einer Seite in einem unregelmaessigen Bereich bekommen M_Stone_Ashlar."""
    idx = K.ensure_mats(obj, [RUB, ASH])
    ang = K.FACE_ANG[face]
    c, s = math.cos(-ang), math.sin(-ang)
    off = K.Vector((seed * 3.1, seed * 1.7, 0.0))
    for p in obj.data.polygons:
        n = p.normal
        # in den kanonischen Rahmen (Front -Y) zurueckdrehen
        nx, ny = n.x * c - n.y * s, n.x * s + n.y * c
        if ny > -0.9:
            continue
        x = p.center.x * c - p.center.y * s
        z = p.center.z
        r = K.noise.noise(K.Vector((x * 2.2, z * 2.2, 0)) + off) * 0.18
        if u0 - r < x < u1 + r and z0 - r < z < z1 + r:
            p.material_index = idx[ASH]


lower = body('shaft_lower', S1, 0.0, GS_Z + 0.04, 3)
upper = body('shaft_upper', S2, GS_Z, WALK - 0.04, 4)
low_cuts, up_cuts, stones_all, backs_all = [], [], [], []
for face in ('S', 'E', 'N', 'W'):
    for (zlo, zhi, d, cuts, rows, half, tag) in ((0.0, GS_Z, S1, low_cuts, (1.22, 2.45), S1, 'lo'), (GS_Z, WALK, S2, up_cuts, (3.32,), S2, 'up')):
        c, st, bk, rects = face_openings(face, d, zlo, zhi, tag)
        if face == GARDEROBE[0] and tag == 'lo':
            rects.append((GARDEROBE[1] - 0.45, GARDEROBE[1] + 0.45, 1.5, 2.8))
        if face == BANNER[0]:
            rects.append((BANNER[1] - 0.35, BANNER[1] + 0.35, 2.3, 3.6))
        if face == 'S' and tag == 'lo':
            rects.append((-1.2, 2.0, 0.0, 2.75))  # Treppe/Podest/Vordach
        c += putlogs(face, d, rows, half, rects, tag)
        K.on_face(c + st + bk, face)
        cuts += c
        stones_all += st
        backs_all += bk
K.boolean(lower, low_cuts)
K.boolean(upper, up_cuts)
patch(lower, 'W', -1.4, -0.4, 0.75, 1.55, 1)
patch(lower, 'N', 0.7, 1.5, 2.1, 2.65, 2)
patch(upper, 'E', -1.5, -0.6, 3.25, 3.5, 3)
for b in (lower, upper):
    K.finish_uv(b)
    A.add(b, mat=None, uv_mode=None, smooth=40, lod1=('planar', 6), lod2='drop')

# Sockel mit Anlauf und Wasserschlag
plinth = K.frustum('plinth', PL_H0, PL_H0, S1 + 0.03, S1 + 0.03, 0.0, PL_Z)
K.grid_cut(plinth, cell=0.3, axes='xy')
K.mat(plinth, RUB)
A.add(plinth, mat=None, uv_mode='box', smooth=30, dirt=1.6, lod1=('planar', 4), lod2='drop')
wt = K.frustum('water_table', S1 + 0.075, S1 + 0.075, S1 - 0.01, S1 - 0.01, PL_Z - 0.04, PL_Z + 0.07)
A.add(wt, mat=ASH, uv_mode='box', smooth=20, lod1='keep', lod2='drop')
# Geschossgesims mit Ruecksprung (Schraege oben)
gs = K.mesh.box('string_course', (2 * S1 + 0.08, 2 * S1 + 0.08, 0.07), loc=(0, 0, GS_Z - 0.04), bevel=0.012)
gs2 = K.frustum('string_course_top', S1 + 0.04, S1 + 0.04, S2 - 0.005, S2 - 0.005, GS_Z + 0.03, GS_Z + 0.1)
A.add(K.mesh.join([gs, gs2], 'string_course'), mat=ASH, uv_mode='box', smooth=20, wear=1.3, lod2='drop')

# Eckquader
qs = []
for sx in (-1, 1):
    for sy in (-1, 1):
        qs.append(K.quoins(f'q_lo_{sx}{sy}', sx * S1, sy * S1, sx, sy, PL_Z + 0.06, GS_Z - 0.04, rnd))
        if not (sy < 0):  # Frontecken oben tragen die Scharwachttuermchen (Konsolen), dort bis unter die Konsole
            qs.append(K.quoins(f'q_up_{sx}{sy}', sx * S2, sy * S2, sx, sy, GS_Z + 0.1, CORB_TOP - 0.02, rnd))
        else:
            qs.append(K.quoins(f'q_up_{sx}{sy}', sx * S2, sy * S2, sx, sy, GS_Z + 0.1, 3.2, rnd))
A.add(K.mesh.join(qs, 'quoins'), mat=ASH, uv_mode='box', smooth=35, wear=1.6, lod1='drop', lod2='drop')
qp = []
for sx in (-1, 1):
    for sy in (-1, 1):
        qp.append(K.quoin_proxy(f'qp_lo_{sx}{sy}', sx * S1, sy * S1, sx, sy, PL_Z + 0.06, GS_Z - 0.04))
        qp.append(K.quoin_proxy(f'qp_up_{sx}{sy}', sx * S2, sy * S2, sx, sy, GS_Z + 0.1, CORB_TOP - 0.02 if sy > 0 else 3.2))
A.add(K.mesh.join(qp, 'quoins_proxy'), mat=ASH, uv_mode='box', smooth=0, only=1)

# Werksteine der Oeffnungen, Laeden/Tuer
A.add(K.mesh.join(stones_all, 'openings_stone'), mat=None, uv_mode='box', smooth=30, wear=1.4, lod1=0.35, lod2='drop')
wood_b = [o for o in backs_all if o.data.materials[0].name == PLK]
iron_b = [o for o in backs_all if o.data.materials[0].name == IRON]
A.add(K.mesh.join(wood_b, 'shutters_door'), mat=PLK, uv_mode='box', uv_space='object', along='z', smooth=25, lod2='drop')
A.add(K.mesh.join(iron_b, 'door_iron'), mat=IRON, uv_mode='box', smooth=30, dirt=0.4, lod1='keep', lod2='drop')

# ---------------------------------------------------------------- Abtritterker (Kragsteine, Kasten, Pultdeckel)
gf, gu, gz = GARDEROBE
gparts = []
for du in (-0.18, 0.18):
    gparts.append(K.corbel(f'gar_corbel_{du}', gu + du, gz, S1, 0.3, 0.12, rnd, steps=2, step_h=0.14))
gbox = K.mesh.box('gar_box', (0.52, 0.34, 0.6), loc=(gu, -S1 - 0.16, gz), bevel=0.015)
K.grid_cut(gbox, cell=0.2)
gparts.append(gbox)
gcap = K.mesh.prism('gar_cap', [(-S1 - 0.36, gz + 0.6), (-S1 + 0.02, gz + 0.6), (-S1 + 0.02, gz + 0.78)], 0.6, loc=(gu, 0, 0), plane='YZ')
gparts.append(gcap)
gslit = K.mesh.box('gar_slit', (0.05, 0.02, 0.22), loc=(gu, -S1 - 0.335, gz + 0.22))
K.on_face(gparts, gf)
K.on_face([gslit], gf)
A.add(K.mesh.join(gparts, 'garderobe'), mat=ASH, uv_mode='box', smooth=30, lod2='drop')
A.add(gslit, mat=IRON, uv_mode='box', smooth=0, dirt=2.0, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Konsolfries, Bruestung, Zinnen, Wasserspeier
corbels = []
for face in ('S', 'E', 'N', 'W'):
    n = 8
    cs = []
    for i in range(n):
        u = -S2 + 0.32 + (2 * S2 - 0.64) * i / (n - 1) + rnd.uniform(-0.02, 0.02)
        if face == 'S' and abs(abs(u) - S2) < 0.5:
            continue  # Frontecken: Scharwachttuerme
        cs.append(K.corbel(f'corbel_{face}_{i}', u, CORB_TOP, S2, PA - S2 + 0.01, 0.17, rnd, steps=3, step_h=0.12))
    K.on_face(cs, face)
    corbels += cs
A.add(K.mesh.join(corbels, 'corbels'), mat=ASH, uv_mode='box', smooth=25, wear=1.2, lod1=0.5, lod2='drop')
cband = K.ring_box('corbel_band_proxy', (PA - 0.04, PA - 0.04), (S2 - 0.05, S2 - 0.05), CORB_TOP - 0.3, CORB_TOP)
A.add(cband, mat=ASH, uv_mode='box', smooth=0, only=2)

par = K.ring_box('parapet', (PA, PA), (PA - PT, PA - PT), CORB_TOP, BR_TOP)
K.grid_cut(par, cell=0.28, axes='xyz')
K.wobble(par, amount=0.008, scale=2.0, seed=9)
A.add(par, mat=RUB, uv_mode='box', smooth=35, lod1=('planar', 6), lod2=('planar', 10))
# Plattform (Wehrgangboden) ueber dem Schaft; zwischen Schaft und Bruestung bleibt der Pechnasen-Schlitz offen
floor = K.mesh.box('platform', (2 * S2 + 0.0, 2 * S2 + 0.0, 0.04), loc=(0, 0, WALK - 0.04))
A.add(floor, mat=ASH, uv_mode='box', smooth=0, lod2='drop')

merl, caps, copes = [], [], []
merl_p = []
for face in ('S', 'E', 'N', 'W'):
    m_f, c_f, k_f, p_f = [], [], [], []
    L = PA
    # Ecken: Eckzinnen gehoeren zu S/N (S: Scharwachttuerme); E/W beginnen und enden um die Bruestungsdicke versetzt
    x = -L if face in ('S', 'N') else -L + PT + rnd.uniform(0.18, 0.26)
    xe = L if face in ('S', 'N') else L - PT
    first = True
    while x < xe - 0.05:
        corner_w = 0.36
        w = corner_w if first else rnd.uniform(0.27, 0.36)
        if x + w > xe - 0.12:
            w = xe - x
        if face == 'S' and (x < -L + 0.55 or x + w > L - 0.55):
            gap_w = rnd.uniform(0.2, 0.27)
            x += w + gap_w
            first = False
            continue
        mh = rnd.uniform(0.32, 0.42)
        lean = rnd.uniform(-0.012, 0.012)
        m = K.block(f'merlon_{face}_{x:.2f}', (w - 0.01, PT + 0.012, mh), (x + w / 2, -L + PT / 2, BR_TOP + mh / 2 - 0.01), rnd, rough=0.02, bevel=0.05,
                    rot=lean)
        m_f.append(m)
        cap = K.cap_slab(f'mcap_{face}_{x:.2f}', x - 0.02, x + w + 0.02, -L - 0.025, -L + PT + 0.025, BR_TOP + mh - 0.02, 0.06)
        K.rot_z(cap, rnd.uniform(-0.02, 0.02), (x + w / 2, -L + PT / 2, 0))
        c_f.append(cap)
        p_f.append(K.mesh.box(f'mp_{face}_{x:.2f}', (w, PT + 0.01, mh + 0.05), loc=(x + w / 2, -L + PT / 2, BR_TOP - 0.01)))
        gap = rnd.uniform(0.2, 0.28)
        # Abdeckplatte der Zinnenluecke (Schraege nach aussen)
        gx0 = x + w
        gx1 = min(xe, gx0 + gap)
        if gx1 - gx0 > 0.05:
            k_f.append(K.mesh.prism(f'cope_{face}_{x:.2f}', [(-L - 0.03, BR_TOP - 0.01), (-L + PT + 0.02, BR_TOP - 0.01), (-L + PT + 0.02, BR_TOP + 0.05),
                                                              (-L - 0.03, BR_TOP + 0.025)], gx1 - gx0 + 0.004, loc=((gx0 + gx1) / 2, 0, 0), plane='YZ'))
        x = gx1
        first = False
    K.on_face(m_f + c_f + k_f + p_f, face)
    merl += m_f
    caps += c_f
    copes += k_f
    merl_p += p_f
A.add(K.mesh.join(merl, 'merlons'), mat=RUB, uv_mode='box', smooth=35, wear=1.3, lod1='drop', lod2='drop')
A.add(K.mesh.join(caps + copes, 'merlon_caps'), mat=ASH, uv_mode='box', smooth=30, wear=1.5, lod1='drop', lod2='drop')
A.add(K.mesh.join(merl_p, 'merlons_proxy'), mat=RUB, uv_mode='box', smooth=0, only=(1, 2))

# Wasserspeier: Rinnsteine unter der Bruestung (Mitte jeder Seite, versetzt)
spouts = []
for face, u in (('S', 0.35), ('E', -0.2), ('N', 0.45), ('W', -0.4)):
    s = K.mesh.beam(f'spout_{face}', (u, -PA + 0.05, WALK + 0.02), (u, -PA - 0.2, WALK - 0.02), 0.09, 0.08, bevel=0.012)
    K.on_face([s], face)
    spouts.append(s)
A.add(K.mesh.join(spouts, 'spouts'), mat=ASH, uv_mode='box', smooth=30, dirt=1.4, lod2='drop')

# ---------------------------------------------------------------- Scharwachttuermchen an den Frontecken
for sx in (-1, 1):
    cx, cy = sx * S2, -S2
    R = 0.37
    parts = []
    # Auskragung: gestufte Kegelringe
    for k, (z0, z1, r0, r1) in enumerate(((3.2, 3.45, 0.06, 0.2), (3.45, 3.68, 0.2, 0.31), (3.68, CORB_TOP, 0.31, R + 0.03))):
        parts.append(K.mesh.cylinder(f'bart_cone_{sx}_{k}', r0, z1 - z0, segs=12, loc=(cx, cy, z0), r_top=r1))
    A.add(K.mesh.join(parts, f'bartizan_corbel_{sx}'), mat=ASH, uv_mode='cyl', smooth=50, wear=1.3, lod2='drop')
    shaft = K.mesh.cylinder(f'bart_shaft_{sx}', R, 5.2 - CORB_TOP, segs=14, loc=(cx, cy, CORB_TOP))
    K.grid_cut(shaft, cell=0.22, axes='z')
    cuts = []
    for a in (-math.pi / 2 - sx * 0.1, -math.pi / 2 + sx * 0.85, -math.pi / 2 + sx * 1.75):
        c = K.mesh.box(f'bart_slit_{sx}_{a:.2f}', (0.05, 0.4, 0.34), loc=(cx + math.cos(a) * R, cy + math.sin(a) * R, 4.55), rot=(0, 0, a + math.pi / 2))
        cuts.append(K.mat(c, RUB))
    K.mat(shaft, RUB)
    K.boolean(shaft, cuts)
    A.add(shaft, mat=None, uv_mode='cyl', smooth=50, lod1=0.5, lod2=0.3)
    # Traufgesims und Kegeldach
    cor = K.mesh.cylinder(f'bart_cornice_{sx}', R + 0.04, 0.08, segs=14, loc=(cx, cy, 5.16))
    A.add(cor, mat=ASH, uv_mode='cyl', smooth=50, lod2='drop')
    core = K.mesh.cylinder(f'bart_roof_core_{sx}', R + 0.1, 0.92, segs=12, loc=(cx, cy, 5.22), r_top=0.02)
    A.add(core, mat=ROOF, uv_mode='cyl', smooth=50, only=(1, 2))
    rf = K.cone_roof(f'bart_roof_{sx}', R + 0.12, 5.2, 0.95, 5, rnd, segs=14, center=(cx, cy))
    A.add(rf, mat=ROOF, uv_mode='cyl', smooth=40, dirt=0.8, lod1='drop', lod2='drop')
    under = K.mesh.cylinder(f'bart_soffit_{sx}', R + 0.1, 0.02, segs=12, loc=(cx, cy, 5.2))
    A.add(under, mat=PLK, uv_mode='cyl', smooth=50, lod1='drop', lod2='drop')
    knob = K.mesh.cylinder(f'bart_knob_{sx}', 0.03, 0.22, segs=6, loc=(cx, cy, 6.1))
    A.add(knob, mat=IRON, uv_mode='box', smooth=40, lod1='keep', lod2='drop')

# ---------------------------------------------------------------- Turmaufsatz (Wohngeschoss) mit Zeltdach
ut = body('upper_tower', UT, WALK - 0.06, UT_TOP, 7, cell=0.26)
ut_cuts, ut_st, ut_bk = [], [], []
# Tuer zur Plattform (S), Fenster darueber
c, st, _ = K.arch_opening('ut_door', 0.35, WALK, 0.46, 0.92, UT, rnd, depth=0.16, ring=0.1, n_vouss=5, sill=False)
leaf = K.planks_leaf('ut_leaf', 0.35, WALK, 0.46, 0.92, -UT + 0.12, rnd, t=0.035, n=4)
ut_bk += leaf + K.iron_bands('ut_band', 0.35, [WALK + 0.2, WALK + 0.6], 0.42, -UT + 0.095)
K.on_face([c] + st + ut_bk[-len(leaf) - 2:], 'S')
ut_cuts.append(c)
ut_st += st
c, st, bk = K.arch_opening('ut_win_s', -0.45, 5.35, 0.26, 0.48, UT, rnd, depth=0.36, ring=0.08, n_vouss=5)
K.on_face([c] + st + bk, 'S')
ut_cuts.append(c)
ut_st += st
# Zwillingsfenster (E/W), Einzelfenster (N)
for face in ('E', 'W', 'N'):
    group = []
    if face in ('E', 'W'):
        for du in (-0.17, 0.17):
            c, st, bk = K.arch_opening(f'ut_bi_{face}_{du}', du, 5.1, 0.22, 0.56, UT, rnd, depth=0.38, ring=0.075, n_vouss=5, sill=False, key=False)
            group += [c] + st
            ut_cuts.append(c)
            ut_st += st
        sill = K.mat(K.block(f'ut_bi_sill_{face}', (0.86, 0.12, 0.075), (0, -UT - 0.01, 5.065), rnd, rough=0.02, bevel=0.15), ASH)
        ut_st.append(sill)
        group.append(sill)
        # Entlastungsbogen ueber dem Zwillingsfenster
        c2, st2, _ = K.arch_opening(f'ut_rel_{face}', 0.0, 5.66 - 0.4, 0.8, 0.4 + 0.4, UT, rnd, depth=0.0, ring=0.08, n_vouss=9, jamb=False, sill=False)
        bpy.data.objects.remove(c2)
        group += st2
        ut_st += st2
    else:
        c, st, bk = K.arch_opening(f'ut_win_{face}', 0.2, 5.1, 0.26, 0.5, UT, rnd, depth=0.24, ring=0.08, n_vouss=5, back=0.035)
        group += [c] + st + bk
        ut_cuts.append(c)
        ut_st += st
        ut_bk += bk
    K.on_face(group, face)
rects_ut = []
for face in ('S', 'E', 'N', 'W'):
    ut_cuts += [K.on_face([o], face)[0] for o in putlogs(face, UT, (5.85,), UT, [(-0.6, 0.6, 4.8, 6.2)] if face != 'S' else [(-0.8, 0.8, 4.2, 6.0)], 'ut')]
K.boolean(ut, ut_cuts)
K.finish_uv(ut)
A.add(ut, mat=None, uv_mode=None, smooth=40, lod1=('planar', 6), lod2='drop')
uq = []
for sx in (-1, 1):
    for sy in (-1, 1):
        uq.append(K.quoins(f'uq_{sx}{sy}', sx * UT, sy * UT, sx, sy, WALK - 0.02, UT_TOP - 0.1, rnd, course=0.22, long=0.4, short=0.24))
A.add(K.mesh.join(uq, 'ut_quoins'), mat=ASH, uv_mode='box', smooth=35, wear=1.6, lod1=0.35, lod2='drop')
A.add(K.mesh.join(ut_st, 'ut_openings_stone'), mat=None, uv_mode='box', smooth=30, wear=1.3, lod1=0.35, lod2='drop')
ut_wood = [o for o in ut_bk if o.data.materials[0].name == PLK]
ut_iron = [o for o in ut_bk if o.data.materials[0].name == IRON]
A.add(K.mesh.join(ut_wood, 'ut_door_shutter'), mat=PLK, uv_mode='box', uv_space='object', along='z', smooth=25, lod2='drop')
A.add(K.mesh.join(ut_iron, 'ut_iron'), mat=IRON, uv_mode='box', smooth=25, lod1='keep', lod2='drop')
# Traufgesims
tg = K.frustum('ut_cornice', UT + 0.02, UT + 0.02, UT + 0.08, UT + 0.08, UT_TOP - 0.12, UT_TOP)
A.add(tg, mat=ASH, uv_mode='box', smooth=20, lod2='drop')
# Sparrenkoepfe unter der Traufe
rafters = []
for face in ('S', 'E', 'N', 'W'):
    rr = []
    for i in range(5):
        u = -UT + 0.2 + (2 * UT - 0.4) * i / 4
        rr.append(K.mesh.beam(f'raft_{face}_{i}', (u, -UT + 0.1, UT_TOP + 0.04), (u, -UT - ROOF_OVER + 0.04, UT_TOP - 0.06), 0.06, 0.07))
    K.on_face(rr, face)
    rafters += rr
A.add(K.mesh.join(rafters, 'rafter_ends'), mat=OAK, uv_mode='box', uv_space='object', smooth=30, lod1='drop', lod2='drop')

RH = UT + ROOF_OVER
roof = K.tent_roof('roof', RH, UT_TOP - 0.04, ROOF_RISE, 13, rnd, th=0.024, step=0.0075, segs=12)
A.add(roof, mat=ROOF, uv_mode='box', smooth=30, dirt=0.9, lod1='drop', lod2='drop')
# Dachkern (Unterseite/Traufbrett; LOD1/2: glatte Pyramide)
core = K.mesh.cylinder('roof_core', RH * math.sqrt(2) - 0.02, ROOF_RISE - 0.05, segs=4, loc=(0, 0, UT_TOP - 0.05), r_top=0.02)
K.rot_z(core, math.pi / 4)
A.add(core, mat=ROOF, uv_mode='box', smooth=0, lod1='keep', lod2='keep')
hips = []
for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
    p0 = (sx * (RH + 0.01), sy * (RH + 0.01), UT_TOP + 0.02)
    p1 = (0, 0, UT_TOP - 0.04 + ROOF_RISE + 0.13)
    hips.append(K.mesh.beam(f'hip_{sx}{sy}', p0, p1, 0.06, 0.04, bevel=0.008))
A.add(K.mesh.join(hips, 'hip_boards'), mat=PLK, uv_mode='box', uv_space='object', smooth=30, lod1='keep', lod2='drop')
# Kamin des Wohngeschosses (Rueckseite), Rauch-Anker an der Muendung
CH_X, CH_Y = -0.5, 0.48
ch = K.mesh.box('chimney', (0.26, 0.24, 1.35), loc=(CH_X, CH_Y, UT_TOP + 0.35), bevel=0.012)
K.grid_cut(ch, cell=0.22, axes='z')
K.wobble(ch, amount=0.006, scale=3.0, seed=11)
A.add(ch, mat=RUB, uv_mode='box', smooth=30, dirt=1.3, lod1='keep', lod2='keep')
chc = K.cap_slab('chimney_cap', CH_X - 0.17, CH_X + 0.17, CH_Y - 0.16, CH_Y + 0.16, UT_TOP + 1.7, 0.06)
A.add(chc, mat=ASH, uv_mode='box', smooth=20, dirt=2.0, lod2='drop')
apex = UT_TOP - 0.04 + ROOF_RISE
fin = [K.mesh.cylinder('finial_base', 0.09, 0.12, segs=8, loc=(0, 0, apex - 0.02)),
       K.mesh.cylinder('finial_knob', 0.06, 0.1, segs=8, loc=(0, 0, apex + 0.1), r_top=0.03)]
A.add(K.mesh.join(fin, 'finial'), mat=IRON, uv_mode='box', smooth=40, lod2='drop')
POLE_TOP = apex + 1.25
pole = K.mesh.cylinder('flagpole', 0.028, POLE_TOP - apex, segs=6, loc=(0, 0, apex), r_top=0.02)
A.add(pole, mat=OAK, uv_mode='box', uv_space='object', smooth=50, lod1='keep', lod2='keep')
# Fahne in Spielerfarbe (flattert: Teil 'cloth', Drehpunkt am Mast)
FL_W, FL_H = 0.95, 0.5
flag_pts = [(0.0, 0.0), (FL_W, 0.03), (FL_W * 0.82, FL_H * 0.5), (FL_W, FL_H - 0.03), (0.0, FL_H)]
flag = K.mesh.prism('flag', [(0.03 + x, POLE_TOP - 0.05 - FL_H + z) for x, z in flag_pts], 0.018, plane='XZ')
K.grid_cut(flag, cell=0.16, axes='x')
A.add(flag, mat=CLOTH, uv_mode='box', smooth=30, team=True, part='cloth', pivot=(0.0, 0.0, POLE_TOP - 0.05), dirt=0.3, lod1='keep', lod2='keep')

# ---------------------------------------------------------------- Hocheingang: Aussentreppe, Podest, Gelaender, Vordach (Front -Y)
D_U, D_Z = -0.42, 1.42      # Tuer (u, Schwelle)
LAND_Z = D_Z - 0.02         # Podest-Oberkante
Y_IN, Y_OUT = -S1 - 0.13, -2.47
LX0, LX1 = -1.0, 0.12       # Podest x
ST_X0, ST_X1 = 1.9, LX1      # Treppe: Fuss bei x=ST_X0 (Boden), Kopf bei ST_X1 (Podest)
wood, planks_w, iron_w = [], [], []
# Podest: Bohlenbelag auf Balken, zwei Pfosten mit Kopfbaendern, Wandbalken
for i in range(6):
    x0 = LX0 + (LX1 - LX0) * i / 6 + 0.004
    x1 = LX0 + (LX1 - LX0) * (i + 1) / 6 - 0.004
    planks_w.append(K.mesh.box(f'land_plank_{i}', (x1 - x0, Y_IN - Y_OUT + rnd.uniform(-0.02, 0.0), 0.035), loc=((x0 + x1) / 2, (Y_IN + Y_OUT) / 2, LAND_Z - 0.035 + rnd.uniform(-0.004, 0.003))))
for yy in (Y_OUT + 0.04, Y_IN - 0.03):
    wood.append(K.mesh.beam(f'land_joist_{yy:.2f}', (LX0 - 0.05, yy, LAND_Z - 0.08), (LX1 + 0.04, yy, LAND_Z - 0.08), 0.07, 0.09, bevel=0.008))
for xx in (LX0 + 0.04, LX1 - 0.05):
    wood.append(K.mesh.beam(f'land_post_{xx:.2f}', (xx, Y_OUT + 0.05, 0.0), (xx, Y_OUT + 0.05, LAND_Z - 0.03), 0.075, 0.075, bevel=0.008))
    wood.append(K.mesh.beam(f'land_brace_{xx:.2f}', (xx, Y_OUT + 0.06, LAND_Z - 0.45), (xx, Y_IN - 0.02, LAND_Z - 0.1), 0.05, 0.05, bevel=0.006))
    wood.append(K.mesh.box(f'land_pad_{xx:.2f}', (0.14, 0.14, 0.06), loc=(xx, Y_OUT + 0.05, 0.0), bevel=0.01))
# Treppe: zwei Wangen, Trittstufen, Gelaender aussen
rise = LAND_Z
nst = 8
for yy in (Y_OUT + 0.04, Y_IN - 0.02):
    wood.append(K.mesh.beam(f'stringer_{yy:.2f}', (ST_X0 + 0.06, yy, 0.02), (ST_X1, yy, LAND_Z - 0.04), 0.05, 0.13, bevel=0.008, up=(0, 0, 1)))
for i in range(nst - 1):
    t = (i + 1) / nst
    x = ST_X0 + (ST_X1 - ST_X0) * t
    z = rise * t
    planks_w.append(K.mesh.box(f'tread_{i}', (0.2, Y_IN - Y_OUT - 0.02, 0.035), loc=(x + 0.04, (Y_IN + Y_OUT) / 2 + rnd.uniform(-0.01, 0.01), z - 0.035 + rnd.uniform(-0.005, 0.005)),
                               rot=(0, 0, rnd.uniform(-0.03, 0.03))))
RAIL_H = 0.5
for xx, zz in ((ST_X0 - 0.08, 0.0), (ST_X0 + (ST_X1 - ST_X0) * 0.5, rise * 0.5 - 0.06), (LX1 - 0.05, LAND_Z), (LX0 + 0.04, LAND_Z)):
    wood.append(K.mesh.beam(f'rail_post_{xx:.2f}', (xx, Y_OUT + 0.03, zz), (xx, Y_OUT + 0.03, zz + RAIL_H + (0.08 if zz == 0 else 0)), 0.045, 0.045, bevel=0.006))
wood.append(K.mesh.beam('handrail', (ST_X0 - 0.08, Y_OUT + 0.03, RAIL_H + 0.08), (LX1 - 0.05, Y_OUT + 0.03, LAND_Z + RAIL_H), 0.04, 0.035, bevel=0.006))
wood.append(K.mesh.beam('handrail_land', (LX1 - 0.05, Y_OUT + 0.03, LAND_Z + RAIL_H), (LX0 + 0.04, Y_OUT + 0.03, LAND_Z + RAIL_H), 0.04, 0.035, bevel=0.006))
wood.append(K.mesh.beam('land_rail_side', (LX0 + 0.04, Y_OUT + 0.03, LAND_Z + RAIL_H), (LX0 + 0.04, Y_IN, LAND_Z + RAIL_H), 0.04, 0.035, bevel=0.006))
# Vordach ueber Tuer und Podest: Konsolbalken aus der Wand, Pultdach
VZ = D_Z + 1.16 + 0.42
for xx in (LX0 + 0.06, LX1 - 0.06):
    wood.append(K.mesh.beam(f'pent_arm_{xx:.2f}', (xx, -S2 + 0.03, VZ - 0.06), (xx, Y_OUT + 0.02, VZ - 0.2), 0.06, 0.07, bevel=0.008))
    wood.append(K.mesh.beam(f'pent_strut_{xx:.2f}', (xx, -S1 + 0.02, VZ - 0.55), (xx, Y_OUT + 0.12, VZ - 0.19), 0.045, 0.05, bevel=0.006))
A.add(K.mesh.join(wood, 'stair_timber'), mat=OAK, uv_mode='box', uv_space='object', smooth=30, wear=1.2, dirt=1.2, lod1=0.5, lod2='drop')
A.add(K.mesh.join(planks_w, 'stair_planks'), mat=PLK, uv_mode='box', smooth=25, dirt=1.4, lod1=0.6, lod2='drop')
pent = K.shed_roof('pent_roof', LX0 - 0.08, LX1 + 0.08, -S2 + 0.01, (-S2 + 0.01) - (Y_OUT - 0.03), VZ, 0.22, 4, rnd)
A.add(pent, mat=ROOF, uv_mode='box', smooth=30, lod1=0.6, lod2='drop')
pent_core = K.mesh.prism('pent_core', [(-S2 + 0.01, VZ - 0.01), (Y_OUT - 0.02, VZ - 0.22), (Y_OUT - 0.02, VZ - 0.25), (-S2 + 0.01, VZ - 0.06)],
                         LX1 - LX0 + 0.14, loc=((LX0 + LX1) / 2, 0, 0), plane='YZ')
A.add(pent_core, mat=PLK, uv_mode='box', smooth=0, lod2='drop')
# LOD2: Treppe als Block
stair_p = K.mesh.beam('stair_proxy', (ST_X0, (Y_IN + Y_OUT) / 2, 0.05), (ST_X1, (Y_IN + Y_OUT) / 2, LAND_Z - 0.05), 0.12, Y_IN - Y_OUT, up=(0, 0, 1))
A.add(stair_p, mat=OAK, uv_mode='box', smooth=0, only=2)

# ---------------------------------------------------------------- Fassadenbanner in Spielerfarbe (Front)
bf, bu, bz0, bz1 = BANNER
bw = 0.44
BY = -S1 - 0.1
rod = K.mesh.beam('banner_rod', (bu - bw / 2 - 0.06, BY, bz1 + 0.02), (bu + bw / 2 + 0.06, BY, bz1 + 0.02), 0.022, 0.022)
brk = [K.mesh.beam(f'banner_bracket_{s}', (bu + s * (bw / 2 + 0.03), -S2 + 0.01, bz1 + 0.02), (bu + s * (bw / 2 + 0.03), BY - 0.01, bz1 + 0.02), 0.02, 0.02)
       for s in (-1, 1)]
A.add(K.mesh.join([rod] + brk, 'banner_iron'), mat=IRON, uv_mode='box', smooth=30, lod1='keep', lod2='drop')
bpts = [(bu - bw / 2, bz0 + 0.12), (bu, bz0), (bu + bw / 2, bz0 + 0.12), (bu + bw / 2, bz1), (bu - bw / 2, bz1)]
ban = K.mesh.prism('banner', bpts, 0.016, loc=(0, BY - 0.005, 0), plane='XZ')
K.grid_cut(ban, cell=0.15, axes='z')
for v in ban.data.vertices:  # leichter Faltenwurf
    v.co.y += math.sin(v.co.x * 22.0) * 0.008 * (1.0 - (v.co.z - bz0) / (bz1 - bz0) * 0.6)
A.add(ban, mat=CLOTH, uv_mode='box', smooth=40, team=True, dirt=0.35, lod1='keep', lod2='keep')

# ---------------------------------------------------------------- LOD2-Ersatzformen (Silhouette)
lo2 = [K.mesh.box('l2_shaft', (2 * S1, 2 * S1, CORB_TOP), loc=(0, 0, 0)),
       K.frustum('l2_plinth', PL_H0, PL_H0, S1 + 0.02, S1 + 0.02, 0.0, PL_Z)]
A.add(K.mesh.join(lo2, 'lod2_shaft'), mat=RUB, uv_mode='box', smooth=0, only=2)
lo2u = K.mesh.box('l2_ut', (2 * UT, 2 * UT, UT_TOP - WALK), loc=(0, 0, WALK - 0.05))
A.add(lo2u, mat=RUB, uv_mode='box', smooth=0, only=2)

# ---------------------------------------------------------------- Ankerpunkte
anchors.anchor('flag', (0.0, 0.0, POLE_TOP), note='Mastspitze')
anchors.anchor('banner', (BANNER[1], BY, (BANNER[2] + BANNER[3]) / 2), note='Fassadenbanner')
anchors.anchor('door', (D_U, Y_OUT - 0.1, 0.0), note='Fuss der Aussentreppe vor dem Hocheingang')
anchors.anchor('smoke', (CH_X, CH_Y, UT_TOP + 1.82), rate=0.7, staffed=False, note='Rauch aus dem Kamin des Wohngeschosses')

asset.finish(A)
