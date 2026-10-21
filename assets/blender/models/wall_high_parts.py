"""Hohe Steinmauer (BT.WallHigh, Laufhoehe 2,4): gemeinsame Geometrie der drei Mauerstuecke und des Toranschlusses.

Kein eigenes Asset; die Asset-Skripte wall_high_arm.py / wall_high_post.py / wall_high_stub.py rufen build(piece) auf.
Zusammenspiel wie wallParts (models_castle.ts) / EntityRenderer: je Mauerkachel ein Pfosten (post, Kachelmitte) und je
Nachbar ein Arm (arm, x = 0 .. 0,5, gedreht in Richtung des Nachbarn); ohne Nachbarn ein Einzelpfeiler (stub).

Nahtlosigkeit:
  - Arme stossen an x = 0 (Gegenarm derselben Kachel, um 180 Grad gedreht) und x = 0,5 (Arm der Nachbarkachel, gespiegelt)
    -> das Profil (y, z) ist symmetrisch, Stirnflaechen sind eigene Teile (keine Abnutzungskanten am Stoss), Unebenheiten
    klingen zu den Enden aus, das Schmutzrauschen ist in y gespiegelt (A.noise_mirror_y), die UVs laufen stetig (wall_uv).
  - Der Pfosten fuellt Ecken/T-Stoesse: Kern, Sockel, Gesims als Quadrat 6 mm innerhalb der Armflaechen (im geraden Lauf
    verdeckt), Laufbelag 6 mm tiefer. Die vier Zinnen des Pfostens (Mitte +-0,25) bilden mit den Bruestungen der Arme den
    Zinnenrhythmus 0,5 und schliessen an Ecken die Bruestung.
"""
import math
import random

import castle_kit as K
from sp import mesh

RUB = 'M_Stone_Rubble'
ASH = 'M_Stone_Ashlar'
OAK = 'M_Timber_Oak'
TILE = 1.0          # Kachelgroesse der Mauertexturen (1/TILE ganzzahlig -> nahtlos ueber die Stoesse)

WALK = 2.4          # BUILDINGS[WallHigh].height
Z_PL = 0.38         # Sockel bis
Z_BODY = 0.4        # Mauerkoerper ab
Y_PL0 = 0.45        # Sockel halbe Dicke am Boden
Y_PL1 = 0.385       # Sockel oben
Y_IN = 0.19         # Innenkante der Bruestungen (Wehrgang |y| < Y_IN)
BR_TOP = WALK + 0.3  # Oberkante Bruestung
GS_Z = 2.06         # Gesims unter dem Wehrgang
INSET = 0.006       # Pfosten liegt so weit innerhalb der Armflaechen


def yb(z):
    """Halbe Mauerdicke (leichter Anlauf)."""
    return 0.362 - 0.016 * (z - Z_BODY) / (BR_TOP - Z_BODY)


def body_profile():
    return [(-yb(Z_BODY), Z_BODY), (yb(Z_BODY), Z_BODY), (yb(BR_TOP), BR_TOP), (Y_IN, BR_TOP), (Y_IN, WALK - 0.03), (-Y_IN, WALK - 0.03),
            (-Y_IN, BR_TOP), (-yb(BR_TOP), BR_TOP)]


def plinth_profile():
    return [(-Y_PL0, 0.0), (Y_PL0, 0.0), (Y_PL1, Z_PL), (-Y_PL1, Z_PL)]


def water_profile():
    return [(-Y_PL1 - 0.01, Z_PL - 0.03), (Y_PL1 + 0.01, Z_PL - 0.03), (Y_PL1 + 0.01, Z_PL + 0.015), (yb(Z_BODY) - 0.004, Z_PL + 0.075),
            (-yb(Z_BODY) + 0.004, Z_PL + 0.075), (-Y_PL1 - 0.01, Z_PL + 0.015)]


def string_profile(side):
    y = yb(GS_Z)
    p = [(y - 0.02, GS_Z - 0.035), (y + 0.028, GS_Z - 0.035), (y + 0.028, GS_Z + 0.02), (y - 0.02, GS_Z + 0.055)]
    return [(side * a, b) for a, b in p]


def coping_profile(side):
    y0, y1 = Y_IN - 0.012, yb(BR_TOP) + 0.022
    p = [(y0, BR_TOP - 0.01), (y1, BR_TOP - 0.01), (y1, BR_TOP + 0.03), (y1 - 0.02, BR_TOP + 0.05), (y0 + 0.015, BR_TOP + 0.06), (y0, BR_TOP + 0.045)]
    return [(side * a, b) for a, b in p]


def paving_profile():
    return [(-Y_IN, WALK - 0.03), (Y_IN, WALK - 0.03), (Y_IN, WALK), (-Y_IN, WALK)]


def _fade_x(x0, x1, w=0.12):
    def f(co):
        return max(0.0, min(1.0, (co.x - x0) / w, (x1 - co.x) / w))
    return f


EPS = 0.003  # Ueberlappung an den Stoessen: verhindert Pixel-Risse zwischen gedrehten Instanzen (gleiche UVs/Normalen -> unsichtbar)


def arm_pieces(x0=0.0, x1=0.5, rnd=None, tag='arm', holes=False, eps0=EPS, eps1=EPS):
    """Mauerabschnitt von x0 bis x1 (Arm: 0 .. 0,5; Toranschluss: beliebig). Rueckgabe: Liste (obj, mat, kwargs fuer A.add)."""
    rnd = rnd or random.Random(5)
    out = []
    xa, xb = x0, x1
    x0, x1 = x0 - eps0, x1 + eps1
    pl = K.xprism(f'{tag}_plinth', plinth_profile(), x0, x1, seg=0.2)
    out.append((pl, RUB, dict(dirt=1.5, lod1='keep', lod2='drop')))
    wt = K.xprism(f'{tag}_water', water_profile(), x0, x1, seg=0)
    out.append((wt, ASH, dict(wear=1.3, lod1='keep', lod2='drop')))
    body = K.xprism(f'{tag}_body', body_profile(), x0, x1, xcell=0.17, seg=0.24, caps=True)
    cuts = []
    if holes:
        # Ruestloecher und Balkenloecher (Hurdenbalken) nur ausserhalb des Pfostenbereichs (x > 0,36), seitenweise versetzt
        for side, z, s in ((-1, 1.28, 0.07), (1, 0.92, 0.065), (-1, 2.22 - 0.0, 0.0), (1, 1.72, 0.06)):
            if s <= 0:
                continue
            xc = xa + (xb - xa) * 0.84
            c = mesh.box(f'{tag}_hole_{side}_{z}', (s, 0.3, s), loc=(xc, side * (yb(z) + 0.15 - 0.09), z))
            cuts.append(K.mat(c, RUB))
    K.mat(body, RUB)
    if cuts:
        K.boolean(body, cuts)
    K.strip_x_ends(body, (x0, x1))  # Stirnflaechen sind eigene Teile (keine Kanten am Stoss)
    out.append((body, None, dict(lod1=('planar', 4), lod2='drop')))
    for side in (-1, 1):
        sc = K.xprism(f'{tag}_string_{side}', string_profile(side), x0, x1, seg=0)
        out.append((sc, ASH, dict(wear=1.4, lod1='keep', lod2='drop')))
        cp = K.xprism(f'{tag}_coping_{side}', coping_profile(side), x0, x1, seg=0)
        out.append((cp, ASH, dict(wear=1.6, lod1='keep', lod2='drop')))
    pv = K.xprism(f'{tag}_paving', paving_profile(), x0, x1, seg=0)
    out.append((pv, ASH, dict(dirt=1.2, lod1='keep', lod2='drop')))
    # Stirnflaechen (eigene Teile): Koerper inkl. Bruestungen, Sockel, Wasserschlag, Gesimse, Abdeckungen
    caps = []
    for x, sg in ((x0, -1), (x1, 1)):
        caps.append(K.xcap(f'{tag}_cap_body_{sg}', body_profile(), x, sg))
        caps.append(K.xcap(f'{tag}_cap_pl_{sg}', plinth_profile(), x, sg))
    out.append((mesh.join(caps, f'{tag}_caps'), RUB, dict(lod1='keep', lod2='drop')))
    caps2 = []
    for x, sg in ((x0, -1), (x1, 1)):
        caps2.append(K.xcap(f'{tag}_cap_wt_{sg}', water_profile(), x, sg))
        for side in (-1, 1):
            caps2.append(K.xcap(f'{tag}_cap_sc_{sg}{side}', string_profile(side), x, sg))
            caps2.append(K.xcap(f'{tag}_cap_cp_{sg}{side}', coping_profile(side), x, sg))
    out.append((mesh.join(caps2, f'{tag}_caps_ashlar'), ASH, dict(lod1='keep', lod2='drop')))
    # LOD2: ein Profil (Sockel + Koerper mit Bruestungen) mit Stirnflaechen
    l2 = [K.xprism(f'{tag}_l2', [(-Y_PL0, 0.0), (Y_PL0, 0.0), (yb(Z_BODY), Z_BODY), (yb(BR_TOP), BR_TOP + 0.04), (Y_IN, BR_TOP + 0.04), (Y_IN, WALK),
                                  (-Y_IN, WALK), (-Y_IN, BR_TOP + 0.04), (-yb(BR_TOP), BR_TOP + 0.04), (-yb(Z_BODY), Z_BODY)], x0, x1, xcell=0, seg=0)]
    for x, sg in ((x0, -1), (x1, 1)):
        l2.append(K.xcap(f'{tag}_l2cap_{sg}', [(-Y_PL0, 0.0), (Y_PL0, 0.0), (yb(Z_BODY), Z_BODY), (yb(BR_TOP), BR_TOP + 0.04), (Y_IN, BR_TOP + 0.04),
                                               (Y_IN, WALK), (-Y_IN, WALK), (-Y_IN, BR_TOP + 0.04), (-yb(BR_TOP), BR_TOP + 0.04), (-yb(Z_BODY), Z_BODY)], x, sg))
    out.append((mesh.join(l2, f'{tag}_lod2'), RUB, dict(only=2)))
    return out


def merlon(name, cx, cy, rnd, h, slit=False, w=0.2, t=0.21, z0=WALK - 0.006):
    """Zinne (Bruchstein) mit Abdeckplatte; optional Schiessscharte quer durch (in y)."""
    m = K.block(name, (w, t, h), (cx, cy, z0 + h / 2), rnd, rough=0.02, bevel=0.06)
    K.grid_cut(m, cell=0.14, axes='z')
    K.mat(m, RUB)
    if slit:
        c = mesh.box(name + '_slit', (0.042, t + 0.2, 0.26), loc=(cx, cy, z0 + h * 0.3))
        K.boolean(m, [K.mat(c, ASH)])
    cap = K.cap_slab(name + '_cap', cx - w / 2 - 0.018, cx + w / 2 + 0.018, cy - t / 2 - 0.02, cy + t / 2 + 0.02, z0 + h - 0.015, 0.05)
    K.rot_z(cap, rnd.uniform(-0.03, 0.03), (cx, cy, 0))
    return m, cap


def post_pieces(rnd, stub=False):
    """Pfosten (Kachelmitte): Kern/Sockel/Gesims als Quadrat (innerhalb der Arme), Laufbelag, vier Zinnen an den Ecken.
    stub: Einzelpfeiler ohne Nachbarn - mit umlaufender Bruestung und Abdeckungen."""
    out = []
    i = 0.0 if stub else INSET
    pl = K.frustum('post_plinth', Y_PL0 - i, Y_PL0 - i, Y_PL1 - i, Y_PL1 - i, 0.0, Z_PL)
    K.grid_cut(pl, cell=0.2, axes='xy')
    out.append((pl, RUB, dict(dirt=1.5, lod1=('planar', 4), lod2=('planar', 8))))
    wt = K.frustum('post_water', Y_PL1 + 0.01 - i, Y_PL1 + 0.01 - i, yb(Z_BODY) - 0.004 - i, yb(Z_BODY) - 0.004 - i, Z_PL - 0.03, Z_PL + 0.075)
    out.append((wt, ASH, dict(lod1='keep', lod2='drop')))
    top = BR_TOP if stub else WALK - 0.03 - i
    core = K.frustum('post_core', yb(Z_BODY) - i, yb(Z_BODY) - i, yb(top) - i, yb(top) - i, Z_BODY - 0.02, top)
    K.grid_cut(core, cell=0.18, axes='xyz')
    K.mat(core, RUB)
    if stub:
        # umlaufende Bruestung: Innenraum ausschneiden
        inner = mesh.box('post_core_in', (2 * Y_IN, 2 * Y_IN, 1.0), loc=(0, 0, WALK - 0.03))
        K.boolean(core, [K.mat(inner, ASH)])
    out.append((core, None, dict(lod1=('planar', 4), lod2=('planar', 8))))
    sc = K.mesh.box('post_string', (2 * (yb(GS_Z) + 0.028 - i), 2 * (yb(GS_Z) + 0.028 - i), 0.055 - 2 * i), loc=(0, 0, GS_Z - 0.035 + i))
    sc2 = K.frustum('post_string_top', yb(GS_Z) + 0.028 - i, yb(GS_Z) + 0.028 - i, yb(GS_Z) - 0.02 - i, yb(GS_Z) - 0.02 - i, GS_Z + 0.02 + i - 0.001,
                    GS_Z + 0.055 - i)
    out.append((mesh.join([sc, sc2], 'post_string'), ASH, dict(lod1='keep', lod2='drop')))
    pv = K.mesh.box('post_paving', (2 * (yb(WALK) - i), 2 * (yb(WALK) - i), 0.03), loc=(0, 0, WALK - 0.03 - i))
    if stub:
        pv = K.mesh.box('post_paving', (2 * Y_IN, 2 * Y_IN, 0.03), loc=(0, 0, WALK - 0.03))
    out.append((pv, ASH, dict(dirt=1.2, lod1='keep', lod2='drop')))
    ms, caps = [], []
    hs = [0.6, 0.66, 0.62, 0.69]
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        cx, cy = sx * 0.25, sy * (yb(BR_TOP) + 0.006 - 0.105)
        m, c = merlon(f'merlon_{k}', cx, cy, rnd, hs[k] * rnd.uniform(0.97, 1.03), slit=(k % 2 == 0))
        ms.append(m)
        caps.append(c)
    out.append((mesh.join(ms, 'merlons'), None, dict(wear=1.3, lod1=0.5, lod2='drop')))
    if stub:
        # Abdeckplatten der Bruestung zwischen den Zinnen (alle vier Seiten)
        for side in ('S', 'E', 'N', 'W'):
            cp = K.cap_slab(f'stub_cope_{side}', -0.15, 0.15, -yb(BR_TOP) - 0.022, -Y_IN + 0.012, BR_TOP - 0.01, 0.06)
            K.on_face([cp], side)
            caps.append(cp)
    out.append((mesh.join(caps, 'merlon_caps'), ASH, dict(wear=1.6, lod1='keep', lod2='drop')))
    # Ersatzformen
    mp = [K.mesh.box(f'mp_{k}', (0.2, 0.21, 0.64), loc=(sx * 0.25, sy * (yb(BR_TOP) + 0.006 - 0.105), WALK - 0.01))
          for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)))]
    out.append((mesh.join(mp, 'merlons_proxy'), RUB, dict(only=2)))
    return out


H_REF = 3.1  # gemeinsame Bezugshoehe der Bauzeitfenster (Pfosten und Arme wachsen gleich schnell)


def add_all(A, pieces, uv_fn):
    for obj, m, kw in pieces:
        if m:
            K.mat(obj, m)
        uv_fn(obj)
        zs = [v.co.z for v in obj.data.vertices]
        s0 = 0.1 + 0.72 * max(0.0, min(zs)) / H_REF
        s1 = 0.1 + 0.72 * min(H_REF, max(zs)) / H_REF
        A.add(obj, mat=None, uv_mode=None, smooth=kw.pop('smooth', 40), build=(s0, max(s0 + 0.04, s1)), **kw)
