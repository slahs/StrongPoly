"""Figur Speerkaempfer (U.Spearman), Fusssoldat des 13./14. Jh.: gesteppter Gambeson (Wollstoff, senkrechte Steppkammern)
mit geschlitzten Schoessen, Waffenrock in Spielerfarbe (Brust- und Rueckenbahn, an den Seiten offen), Ledergurt mit Messer,
Wollbeinlinge, Lederstiefel, Lederhandschuhe, Eisenhut mit breiter Krempe; darunter je Instanz Steppkappe (Hat0),
Kettenhaube (Hat1) oder nur Haar (Hat2). Speer (Eschenschaft, Blattspitze mit Tuelle, Schuh) in der rechten Faust,
Rundschild (Holz, bemalt in Spielerfarbe, Lederrand, Eisenbuckel) am linken Unterarm. Arme im Armstil Stoss (1).

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/spearman.py [--no-preview] [--no-bake] [--fast]
"""
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import asset, figpreview, gear, human  # noqa: E402
from mathutils import Vector  # noqa: E402  (nach bpy verfuegbar)
from sp.figure import CA, CB, VIS, Fig, Sec, TONE, blob, cut, loft, quilt, split_z, tube  # noqa: E402

A = asset.begin('spearman', target={'unit': 'Spearman'}, klass='figure',
                # LOD-Grenzen x0,45 (Mittel: LOD0 bis ~13, LOD1 bis ~32 Einheiten): grosse Heere fast nur in LOD2
                lod_dist=(0.45,),
                desc='Speerkaempfer: Gambeson mit Steppnaehten, Waffenrock+Schild in Spielerfarbe, Eisenhut, Kettenhaube/Steppkappe, Speer')

WOOL = 'M_Cloth_Wool'
LEATHER = 'M_Leather'
IRON = 'M_Iron_Wrought'
FIG = 'M_Figure'
THRUST = 1
HP = human.HEAD_PIVOT
PH = human.P['head']

# Speer: Richtung aus der Faust nach vorn oben (~55 Grad), Gesamtlaenge ~2,3 m
SPEAR_D = Vector((0.0, -0.57, 0.82)).normalized()
SPEAR_BACK = 0.3
SPEAR_FWD = 0.95


def coif(F, q, mask, mat, cls, rows_grow=0.0, fn=None, name='coif'):
    """Haube um Kopf und Hals mit kurzem Schulterkragen, Gesichtsoeffnung (Steppkappe bzw. Kettenhaube)"""
    g = rows_grow
    rows = [(0.735, 0.112, 0.08, 0.082), (0.758, 0.092, 0.072, 0.074), (0.782, 0.064, 0.064, 0.066), (0.81, 0.057, 0.062, 0.066),
            (0.845, 0.057, 0.062, 0.069), (0.875, 0.058, 0.06, 0.07), (0.902, 0.055, 0.056, 0.068), (0.926, 0.047, 0.045, 0.06),
            (0.944, 0.03, 0.028, 0.042)]
    if q == 1:
        rows = [rows[i] for i in (0, 2, 4, 6, 8)]
    elif q == 2:
        rows = [rows[i] for i in (0, 3, 8)]
    secs = [Sec((0, 0.01, z), rx + g, rf + g, rb + g, fn=fn if q == 0 else None) for (z, rx, rf, rb) in rows]
    o = loft(name, secs, segs=(9, 5, 4)[q], cap1=0.005)
    if q < 2:
        cut(o, lambda c: 0.796 < c.z < 0.905 and abs(math.atan2(c.x, -(c.y - 0.01))) < 0.9)
    # Kragen statisch am Rumpf, Haube am Kopf
    lo, hi = split_z(o, 0.783, name + '_collar', name)
    F.add(lo, mat, cls, mask=mask, smooth=55)
    F.add(hi, mat, cls, part=PH, pivot=HP, mask=mask, smooth=55)


def mail_fn(th, k, t):
    """Kettengeflecht andeuten: versetztes Rautenrelief (Ringreihen) auf der Haube"""
    return 1.0 + 0.035 * math.cos(5 * th + (math.pi if k % 2 else 0.0))


def surcoat(F, q, cloth):
    """Waffenrock in Spielerfarbe: Schulterpasse, Brust- und Rueckenbahn (Seiten offen, Gambeson sichtbar), geschlitzte Schoesse"""
    g = 0.012
    n = (4, 3, 2)[q]
    # Passe (geschlossener Ring ueber den Schultern)
    yoke = [Sec((0, 0.01, 0.784), 0.046, 0.044, 0.046), Sec((0, 0.009, 0.768), 0.08 + g, 0.058 + g, 0.06 + g),
            Sec((0, 0.008, 0.746), 0.104 + g, 0.068 + g, 0.068 + g)]
    if q < 2:
        o = loft('surcoat_yoke', yoke if q == 0 else [yoke[0], yoke[2]], segs=(12, 7)[q])
        F.add(o, cloth, 0, team=True, smooth=55)
    rows = [(0.746, 0.104, 0.068, 0.068), (0.70, 0.108, 0.078, 0.07), (0.64, 0.105, 0.08, 0.069), (0.585, 0.099, 0.074, 0.064),
            (0.53, 0.094, 0.064, 0.059)]
    if q == 1:
        rows = [rows[0], rows[2], rows[4]]
    elif q == 2:
        rows = [rows[0], rows[4]]
    if q == 2:
        rows = [(0.78, 0.05, 0.046, 0.048)] + rows
    # leichter Faltenwurf: Bahnen haengen von der Brust, flache senkrechte Falten zur Taille
    drape = (lambda th, k, t: 1.0 + 0.018 * math.sin(6 * th + 0.8) * t) if q == 0 else None
    for name, arc in (('surcoat_front', (-58, 58)), ('surcoat_back', (122, 238))):
        secs = [Sec((0, 0.006, z), rx + g, rf + g, rb + g, fn=drape) for (z, rx, rf, rb) in rows]
        o = loft(name, secs, segs=n * 2, arc=arc)
        F.add(o, cloth, 0, team=True, smooth=55)
    # Schoesse des Waffenrocks: vorn und hinten je zwei Haelften (folgen den Oberschenkeln)
    if q < 2:
        zs = [(0.53, 0.094, 0.066, 0.06), (0.44, 0.122, 0.096, 0.09), (0.31, 0.142, 0.116, 0.11)]
        if q == 1:
            zs = [zs[0], zs[2]]
        for side in (1, -1):
            for name, arc in (('surcoat_skirt_f', (0, 58)), ('surcoat_skirt_b', (122, 180))):
                a = arc if side > 0 else (-arc[1], -arc[0])
                fo = (lambda th, k, t: 1.0 + 0.045 * t * math.sin(11 * th + 1.3)) if q == 0 else None
                secs = [Sec((0, 0.006, z), rx + g, rf + g, rb + g, fn=fo) for (z, rx, rf, rb) in zs]
                o = loft(f'{name}_{side}', secs, segs=n + (1 if q == 0 else 0), arc=a)
                part = human.P['leg_r'] if side > 0 else human.P['leg_l']
                F.add(o, cloth, 0, part=part, pivot=(side * human.HIP_X, 0, human.HIP_Z), team=True, smooth=55)


def shield(F, q, cloth):
    """Rundschild am linken Unterarm: gewoelbte Holzscheibe, Vorderseite in Spielerfarbe, Lederrand, Eisenbuckel"""
    part = human.P['arm_l']
    piv = (-human.SHO_X, 0.0, human.SHO_Z)
    c = Vector((-0.172, -0.045, 0.455))
    nrm = Vector((-0.88, -0.47, 0.0)).normalized()
    R = 0.168
    n = (16, 10, 6)[q]
    dome = 0.022
    def disc(name, offset, scale, sign, rings):
        secs = []
        for u in rings:
            z = dome * (1 - u * u)
            secs.append(Sec(c + nrm * (offset + z), R * u * scale, R * u * scale, R * u * scale))
        return loft(name, secs, segs=n, axis=nrm, cap0=0.0, orient=nrm * sign, fwd=(0, 0, 1))
    front = disc('shield_face', 0.006, 1.0, 1, [0.15, 0.6, 1.0] if q == 0 else [0.15, 1.0] if q == 1 else [1.0])
    F.add(front, cloth, 0, part=part, pivot=piv, arm=THRUST, team=True, smooth=40)
    if q < 2:
        back = disc('shield_back', -0.006, 0.985, -1, [0.15, 0.6, 1.0] if q == 0 else [1.0])
        F.add(back, FIG, TONE('sandDark'), part=part, pivot=piv, arm=THRUST, smooth=40)
    if q == 0:
        rim = loft('shield_rim', [Sec(c + nrm * -0.008, R * 1.0, R * 1.0, R * 1.0), Sec(c + nrm * 0.01, R * 1.012, R * 1.012, R * 1.012)],
                   segs=n, axis=nrm, fwd=(0, 0, 1))
        F.add(rim, LEATHER if q == 0 else FIG, TONE('leatherDark'), part=part, pivot=piv, arm=THRUST, smooth=30)
    if q < 2:
        boss = blob('shield_boss', c + nrm * (0.006 + dome + 0.004), (0.038, 0.038, 0.022), segs=(8, 4, 4)[q], rings=2 if q == 0 else 1)
        # Buckel entlang der Schildnormalen ausrichten
        rot = Vector((0, 0, 1)).rotation_difference(nrm).to_matrix()
        cc = c + nrm * (0.006 + dome + 0.004)
        for v in boss.data.vertices:
            v.co = cc + rot @ (v.co - cc)
        boss.data.update()
        F.add(boss, IRON if q == 0 else FIG, TONE('steel'), part=part, pivot=piv, arm=THRUST, smooth=40, wear=1.6)


def spear(F, q):
    part = human.P['arm_r']
    piv = (human.SHO_X, 0.0, human.SHO_Z)
    fist = human.fist_of(1)
    d = SPEAR_D
    butt = fist - d * SPEAR_BACK
    tip = fist + d * SPEAR_FWD
    head_len = 0.13
    sock = tip - d * head_len
    n = (6, 4, 3)[q]
    shaft = tube('spear_shaft', [butt + d * 0.02, sock], [0.011, 0.0105], segs=n, cap0=0.0 if q < 2 else None, cap1=None)
    F.add(shaft, FIG, TONE('sandDark'), part=part, pivot=piv, arm=THRUST, smooth=50)
    im, ic = ('M_Iron_Wrought', TONE('steel')) if q == 0 else (FIG, TONE('steel'))
    if q == 0:
        so = tube('spear_socket', [sock - d * 0.06, sock + d * 0.012], [0.0125, 0.012], segs=6, cap0=0.0, cap1=None)
        F.add(so, im, ic, part=part, pivot=piv, arm=THRUST, smooth=40, wear=1.5)
        # Blattspitze: flache Raute mit Mittelgrat (Querschnitt flach entlang X)
        secs = [Sec(sock + d * 0.008, 0.012, 0.007, 0.007), Sec(sock + d * 0.05, 0.03, 0.007, 0.007),
                Sec(sock + d * 0.095, 0.02, 0.005, 0.005)]
        b = loft('spear_blade', secs, segs=4, cap0=0.0, cap1=0.035, fwd=(0, 0, 1))
        F.add(b, im, ic, part=part, pivot=piv, arm=THRUST, smooth=20, wear=2.0)
    else:
        b = tube('spear_blade', [sock, sock + d * 0.05, tip] if q == 1 else [sock, tip], [0.012, 0.024, 0.0] if q == 1 else [0.02, 0.0], segs=n, rf=0.35, cap0=None, cap1=None)
        F.add(b, im, ic, part=part, pivot=piv, arm=THRUST, smooth=20)


def build(F, q):
    cloth = WOOL if q == 0 else FIG
    leather = LEATHER if q == 0 else FIG
    # ---- Kopf, Haar (unter dem Helm), Bart
    human.head(F, q)
    if q < 2:
        human.hair(F, q, styles=(0, 1))
    human.beard(F, q)
    # ---- Gambeson (Hauptstoff): gesteppt, etwas staerker gepolstert
    human.torso(F, q, cloth, CA, bulk=0.008, fn=quilt(n=6, depth=0.06), n0=12)
    human.skirt(F, q, cloth, CA, top=0.5, hem=0.35, r_top=(0.11, 0.074, 0.07), flare=(0.135, 0.098, 0.095), fn=quilt(n=7, depth=0.05),
                roll=False)
    if q == 0:
        collar = loft('collar', [Sec((0, 0.01, 0.775), 0.052, 0.048, 0.05), Sec((0, 0.012, 0.802), 0.042, 0.04, 0.042)], segs=10)
        F.add(collar, cloth, CA, smooth=50)
    surcoat(F, q, cloth)
    # ---- Gurt mit Schnalle, Messer
    if q < 2:
        human.belt(F, q, leather, TONE('leatherDark'), z=0.526, h=0.03, grow=0.028, name='belt')
    if q == 0:
        bk = blob('buckle', (0.0, -0.09, 0.526), (0.016, 0.006, 0.017), segs=6, rings=1)
        F.add(bk, IRON, TONE('steel'), smooth=30, wear=2)
        sh = tube('sheath', [(0.098, 0.035, 0.51), (0.112, 0.05, 0.4)], [0.013, 0.007], segs=3, rf=0.45, cap1=None)
        F.add(sh, LEATHER, TONE('leatherDark'), smooth=50)
        hd = tube('knife_grip', [(0.097, 0.033, 0.512), (0.093, 0.028, 0.552)], [0.0075, 0.007], segs=5, cap1=0.003)
        F.add(hd, FIG, TONE('brown'), smooth=50)
    # ---- Beine: Beinlinge (Nebenstoff), Lederstiefel bis zur Wade
    human.legs(F, q, cloth, CB, leather, TONE('leatherDark'), boots=True)
    # ---- Arme: gesteppte Aermel, Lederhandschuhe; Armstil Stoss
    human.arm(F, q, 1, cloth, CA, THRUST, sleeve='long', hand_mat=leather, hand_cls=TONE('leather'), sleeve_fn=quilt(n=4, depth=0.07), glove=True)
    human.arm(F, q, -1, cloth, CA, THRUST, sleeve='long', hand_mat=leather, hand_cls=TONE('leather'), sleeve_fn=quilt(n=4, depth=0.07), glove=True)
    spear(F, q)
    shield(F, q, cloth)
    # ---- Kopf: Eisenhut (immer), darunter Steppkappe (Hat0) oder Kettenhaube (Hat1); Hat2 nur Haar
    gear.kettle_hat(F, q)
    if q < 2:
        coif(F, q, VIS['Hat0'], cloth, CA, rows_grow=0.0, fn=lambda th, k, t: 1.0 + 0.04 * math.cos(5 * th), name='coif_padded')
        coif(F, q, VIS['Hat1'], IRON if q == 0 else FIG, TONE('steel'), rows_grow=0.002, fn=mail_fn, name='coif_mail')
    else:
        # fern: eine Haube fuer alle Varianten (unter dem Hut kaum sichtbar)
        coif(F, q, 0, FIG, TONE('darkSteel'), name='coif')


for L in range(3):
    build(Fig(A, L), L)

asset.finish(A, preview_on=False)

if '--no-preview' not in sys.argv:
    T = lambda skin, hair, a, b, team: dict(skin=skin, hair=hair, a=a, b=b, team=team)
    t1 = T(0xe6b98e, 0x4a3222, 0x7a5a3c, 0x6b4a2e, 0x2f5fb0)
    t2 = T(0xd9a679, 0x8f6a3a, 0xc79a3e, 0x4a3322, 0xb03a2e)
    t3 = T(0xf0cfa8, 0x2b2118, 0x5b4330, 0x6b4a2e, 0x2f5fb0)
    H = VIS
    lineup = [
        dict(lod=0, bits=H['Hair0'] | H['Hat0'], tints=t1),
        dict(lod=0, bits=H['Hair1'] | H['Hat1'] | H['Beard'], tints=t2),
        dict(lod=0, bits=H['Hair1'] | H['Hat2'] | H['Beard'], tints=t3),
        dict(lod=1, bits=H['Hair0'] | H['Hat1'], tints=t2),
        dict(lod=2, bits=H['Hair0'] | H['Hat1'], tints=t2),
    ]
    src = [o for o in A.objects if o.type == 'MESH']
    figpreview.render(src, lineup, 'spearman', cams=('front', 'rts', 'close'), samples=12 if '--fast' in sys.argv else 32, spacing=0.55)
