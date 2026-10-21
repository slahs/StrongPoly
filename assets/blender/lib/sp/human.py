"""Menschlicher Koerper fuer GLB-Figuren (gemeinsam fuer Bauer, Speerkaempfer, ...): Kopf mit Gesicht, Ohren, Haar- und
Bartvarianten, Hals, Rumpf mit Kleidung, geteilte Schoesse (folgen den Oberschenkeln), Beine mit Knie, Schuhe, Arme mit
Faeusten. Jede Funktion nimmt `F` (figure.Fig einer LOD-Stufe) und die Stufe `q` (0 nah .. 2 fern) und registriert ihre Teile
mit Material, Farbklasse, Teil und Drehpunkt.

Detailstufen (Dreiecke je Figur ohne Varianten, grob): q0 ~1.500, q1 ~450, q2 ~150.
"""
import math

from mathutils import Vector

from .figure import (CA, CB, HAIR, HAIR_BITS, SK, SKIN, UPPER, VIS, Sec, TONE, blob, chain, cut, folds, loft, quilt,
                     translate, tube)

SKIN_MAT = 'M_Figure'
P = {'leg_l': 1, 'leg_r': 2, 'arm_r': 3, 'arm_l': 4, 'head': 14, 'shin_l': 15, 'shin_r': 16}

HIP_Z, HIP_X, KNEE_Z = SK['hip_z'], SK['hip_x'], SK['knee_z']
SHO_Z, SHO_X = SK['sho_z'], SK['sho_x']
CHIN = SK['chin_z']
HEAD_PIVOT = (0.0, 0.008, SK['neck_z'])

# Rechte Hand (Faust) und Ellbogen; links gespiegelt. Arm haengt leicht gebeugt, Faust etwas vor dem Oberschenkel.
ELBOW = Vector((0.118, 0.014, 0.585))
WRIST = Vector((0.125, -0.010, 0.458))
FIST = Vector((0.128, -0.020, 0.414))


def fist_of(side):
    return Vector((FIST.x * side, FIST.y, FIST.z))


def segs(q, a, b, c):
    return (a, b, c)[q]


# ---------------------------------------------------------------------------------------------------------------- Kopf
# Querschnitte des Kopfes relativ zur Kinnunterkante: (z, rx, rf, rb, Mittelpunkt y)
HEAD_SECS = [
    (0.000, 0.026, 0.040, 0.010, 0.016),   # unter dem Kinn
    (0.015, 0.034, 0.051, 0.026, 0.010),   # Kinn / Kiefer
    (0.030, 0.039, 0.053, 0.042, 0.006),   # Mund
    (0.045, 0.042, 0.052, 0.052, 0.005),   # Nasenspitze, Wangen
    (0.060, 0.044, 0.050, 0.057, 0.005),   # Augen, Nasenruecken
    (0.073, 0.045, 0.051, 0.059, 0.005),   # Brauen
    (0.090, 0.045, 0.048, 0.060, 0.006),   # Stirn
    (0.107, 0.040, 0.040, 0.054, 0.008),   # Schaedel oben
    (0.121, 0.026, 0.024, 0.037, 0.010),   # Scheitel
]


def _gauss(x, w):
    return math.exp(-(x / w) ** 2)


def _wrap(th):
    return (th + math.pi) % (2 * math.pi) - math.pi


def face_fn(th, k, t):
    """Gesicht: Nase, Augenhoehlen, Brauenbogen, Wangen, Kinn, Lippen (Faktoren auf den Radius)"""
    a = abs(_wrap(th))
    f = 1.0
    if k == 1:
        f += 0.07 * _gauss(a, 0.35)                      # Kinn
    if k == 2:
        f += 0.035 * _gauss(a, 0.2)                      # Lippen
    if k == 3:
        f += 0.24 * _gauss(a, 0.2) + 0.03 * _gauss(a - 0.95, 0.3)   # Nasenspitze, Wangenknochen
    if k == 4:
        f += 0.14 * _gauss(a, 0.2) - 0.075 * _gauss(a - 0.52, 0.22)  # Nasenruecken, Augenhoehlen
    if k == 5:
        f += 0.05 * _gauss(a, 0.25) + 0.03 * _gauss(a - 0.5, 0.25)   # Brauenbogen
    return f


def head(F, q, mat=SKIN_MAT, scale=1.0, ears=True):
    """Kopf (Teil head) mit Gesicht; q0: 12 Segmente x 9 Querschnitte"""
    piv = HEAD_PIVOT
    if q == 0:
        rows = HEAD_SECS
        n = 12
    elif q == 1:
        rows = [HEAD_SECS[i] for i in (0, 1, 3, 4, 6, 8)]
        n = 6
    else:
        rows = [HEAD_SECS[i] for i in (0, 3, 8)]
        n = 6
    secs = [Sec((0, cy, CHIN + z * scale), rx * scale, rf * scale, rb * scale, fn=None) for (z, rx, rf, rb, cy) in rows]
    if q == 0:
        for k, s in enumerate(secs):
            kk = k
            s.fn = (lambda kk: (lambda th, k, t: face_fn(th, kk, t)))(kk)
    elif q == 1:
        idx = [0, 1, 3, 4, 6, 8]
        for k, s in enumerate(secs):
            kk = idx[k]
            s.fn = (lambda kk: (lambda th, k, t: 1.0 + (0.18 if kk == 3 else 0.08 if kk == 4 else 0.0) * _gauss(abs(_wrap(th)), 0.3)))(kk)
    h = loft('head', secs, segs=n, cap0=0.004, cap1=0.006 if q < 2 else 0.008)
    F.add(h, mat, SKIN, part=P['head'], pivot=piv, smooth=80)
    if q == 0:
        # Augen (dunkle Lidspalte in der Augenhoehle) und Brauen (Haarfarbe): geben dem Gesicht aus der Naehe Ausdruck
        for sd in (-1, 1):
            th = sd * 0.5
            zr = 0.0605
            rx, rf, rb, cy = _head_r(zr, 0)
            r = 1.0 / math.sqrt((math.sin(th) / rx) ** 2 + (math.cos(th) / rf) ** 2) * (1 - 0.075 * 0.95) * scale
            p = Vector((math.sin(th) * r, cy - math.cos(th) * r, CHIN + zr * scale))
            e = blob(f'eye_{sd}', p, (0.0085, 0.004, 0.0034), segs=5, rings=1)
            F.add(e, mat, TONE('black'), part=P['head'], pivot=piv, smooth=0, dirt=0.0)
            pts = []
            for a in (0.18, 0.5, 0.8):
                zb = 0.0715 + 0.0025 * math.sin(a * 3.6)
                rx, rf, rb, cy = _head_r(zb, 0)
                rr = 1.0 / math.sqrt((math.sin(a) / rx) ** 2 + (math.cos(a) / rf) ** 2) * (1 + 0.03 * _gauss(a - 0.5, 0.25) + 0.02)
                pts.append(Vector((sd * math.sin(a) * rr, cy - math.cos(a) * rr, CHIN + zb * scale)))
            b = tube(f'brow_{sd}', pts, [0.0028, 0.0034, 0.0022], segs=3, rf=0.6, cap0=None, cap1=None)
            F.add(b, mat, HAIR, part=P['head'], pivot=piv, smooth=40)
    if ears and q == 0:
        for s in (-1, 1):
            e = blob(f'ear_{s}', (s * 0.0455 * scale, 0.014, CHIN + 0.058 * scale), (0.007, 0.012, 0.02), segs=5, rings=2)
            F.add(e, mat, SKIN, part=P['head'], pivot=piv, smooth=70)
    # Hals (gehoert zum Kopf: dreht mit, unten im Kragen verborgen)
    if q == 2:
        return
    nk = tube('neck', [(0, 0.014, SHO_Z - 0.01), (0, 0.012, CHIN + 0.02)], [0.03, 0.028], segs=segs(q, 8, 6, 4), cap0=None, cap1=None, rf=1.08)
    F.add(nk, mat, SKIN, part=P['head'], pivot=piv, smooth=80)


def _head_r(z_rel, th, grow=0.0):
    """Radius der Kopfform (ohne Gesicht) in Richtung th auf Hoehe z_rel (lineare Interpolation der Querschnitte)"""
    rows = HEAD_SECS
    if z_rel <= rows[0][0]:
        a = b = rows[0]
        u = 0.0
    elif z_rel >= rows[-1][0]:
        a = b = rows[-1]
        u = 0.0
    else:
        for i in range(len(rows) - 1):
            if rows[i][0] <= z_rel <= rows[i + 1][0]:
                a, b = rows[i], rows[i + 1]
                u = (z_rel - a[0]) / (b[0] - a[0])
                break
    lerp = lambda i: a[i] + (b[i] - a[i]) * u
    return lerp(1) + grow, lerp(2) + grow, lerp(3) + grow, lerp(4)


def _shell_secs(zs, grow, fn=None, below=None):
    """Querschnitte einer Huelle um den Kopf (Haar, Kapuze): zs relativ zur Kinnunterkante; below(z) liefert unterhalb des
    Kinns eigene Masse (rx, rf, rb, cy)"""
    secs = []
    for z in zs:
        if below is not None and z < 0.0:
            rx, rf, rb, cy = below(z)
        else:
            rx, rf, rb, cy = _head_r(max(0.0, z), 0, grow if not callable(grow) else grow(z))
        secs.append(Sec((0, cy, CHIN + z), rx, rf, rb, fn=fn))
    return secs


def _theta_of(p, cy=0.006):
    return math.atan2(p.x, -(p.y - cy))


def _hairline_cut(front, temple, ear, nape):
    """Praedikat: Flaeche liegt unterhalb des Haaransatzes (Hoehen relativ zur Kinnunterkante, je Richtung)"""
    def line(a):
        a = abs(a)
        if a < 0.6:
            return front
        if a < 1.35:
            return front + (temple - front) * (a - 0.6) / 0.75
        if a < 1.9:
            return temple + (ear - temple) * (a - 1.35) / 0.55
        return ear + (nape - ear) * (a - 1.9) / (math.pi - 1.9)

    def pred(c):
        return (c.z - CHIN) < line(_theta_of(c))
    return pred


def hair(F, q, mat=SKIN_MAT, styles=(0, 1, 2), slot=0):
    """Haarformen 0 kurz, 1 Topfschnitt mit Pony, 2 lang (schulterlang). Maske Hair0..2"""
    n = segs(q, 10, 5, 5)
    if q == 2:
        # fern: eine Haarkappe fuer alle Varianten
        secs = _shell_secs([0.07, 0.115], 0.006)
        o = loft('hair', secs, segs=n, cap1=0.01)
        F.add(o, mat, HAIR, part=P['head'], pivot=HEAD_PIVOT, slot=slot, smooth=0)
        return
    for st in styles:
        bit = HAIR_BITS[st]
        strands = (lambda th, k, t: 1.0 + 0.03 * math.cos(5 * th) * (1 - t)) if q == 0 else None
        if st == 0:
            zs = [0.05, 0.07, 0.09, 0.107, 0.121] if q == 0 else [0.06, 0.09, 0.115]
            secs = _shell_secs(zs, 0.0045, fn=strands)
            o = loft('hair_short', secs, segs=n, cap1=0.009)
            cut(o, _hairline_cut(0.098, 0.082, 0.062, 0.035))
        elif st == 1:
            zs = [0.045, 0.065, 0.09, 0.107, 0.121] if q == 0 else [0.05, 0.08, 0.115]
            flare = lambda th, k, t: (1.0 + 0.05 * (1 - t) ** 2) * (strands(th, k, t) if strands else 1.0)
            secs = _shell_secs(zs, 0.008, fn=flare)
            o = loft('hair_bowl', secs, segs=n, cap1=0.011)
            cut(o, _hairline_cut(0.082, 0.07, 0.048, 0.04))
        else:
            zs = [-0.045, -0.015, 0.02, 0.06, 0.095, 0.121] if q == 0 else [-0.04, 0.03, 0.11]
            below = lambda z: (0.052 + 0.1 * -z, 0.03, 0.06 + 0.25 * -z, 0.03 - 0.25 * z)
            wav = lambda th, k, t: 1.0 + 0.04 * math.cos(5 * th) * (1 - t)
            secs = _shell_secs(zs, 0.0075, fn=wav, below=below)
            o = loft('hair_long', secs, segs=n, cap1=0.011)

            def pred(c, base=_hairline_cut(0.1, 0.09, -0.06, -0.08)):
                a = abs(_theta_of(c))
                if (c.z - CHIN) < 0.0 and a < 1.75:
                    return True
                return base(c)
            cut(o, pred)
        F.add(o, mat, HAIR, part=P['head'], pivot=HEAD_PIVOT, mask=bit, slot=slot, smooth=60)


def beard(F, q, mat=SKIN_MAT):
    """Vollbart (Maske Beard): Kiefer, Kinn, Oberlippe"""
    if q == 2:
        zs = [-0.004, 0.03]
        n = 4
    else:
        zs = [-0.008, 0.006, 0.02, 0.034, 0.046] if q == 0 else [-0.006, 0.044]
        n = segs(q, 7, 4, 4)

    def gr(th, k, t):
        a = abs(_wrap(th))
        top = k == len(zs) - 1
        f = 1.0 + 0.1 * _gauss(a, 0.5) * (1.0 if not top else 0.4)
        if top:  # Oberlippenbart nur vorn, seitlich zurueck zur Wange
            f *= 1.0 - 0.06 * (1 - _gauss(a, 0.6))
        return f
    secs = []
    for z in zs:
        rx, rf, rb, cy = _head_r(max(0.0, z), 0, 0.006)
        if z < 0:
            rx, rf = rx * 0.9, rf * 0.92
        secs.append(Sec((0, cy, CHIN + z), rx, rf, rb, fn=gr))
    o = loft('beard', secs, segs=n, arc=(-112, 112))
    if q == 0:
        # Mundpartie freilassen
        cut(o, lambda c: abs(c.x) < 0.012 and 0.024 < (c.z - CHIN) < 0.038)
    F.add(o, mat, HAIR, part=P['head'], pivot=HEAD_PIVOT, mask=VIS['Beard'], smooth=50)


# ---------------------------------------------------------------------------------------------------------------- Rumpf
def torso_secs(bulk=0.0):
    """Rumpf von Halsausschnitt bis Gesaess (z, rx, rf, rb, cy): abfallende Schultern, Brust, Bausch ueber dem Guertel"""
    b = bulk
    return [
        (0.781, 0.036 + b * 0.3, 0.034 + b * 0.3, 0.034, 0.010),   # Halsausschnitt
        (0.772, 0.062 + b * 0.6, 0.044 + b * 0.6, 0.047 + b, 0.010),
        (0.760, 0.086 + b, 0.054 + b, 0.056 + b, 0.009),          # Schulterlinie
        (0.744, 0.099 + b, 0.062 + b, 0.062 + b, 0.008),          # Schulterhoehe
        (0.712, 0.103 + b, 0.069 + b, 0.064 + b, 0.007),          # Brust oben (Achsel)
        (0.660, 0.101 + b, 0.072 + b, 0.063 + b, 0.005),          # Brust
        (0.600, 0.096 + b, 0.067 + b, 0.058 + b, 0.004),          # unter der Brust
        (0.548, 0.098 + b, 0.067 + b, 0.059 + b, 0.004),          # Bausch ueber dem Guertel
        (0.518, 0.089 + b, 0.058 + b, 0.054 + b, 0.004),          # Taille (Guertel)
        (0.490, 0.097 + b, 0.062 + b, 0.060 + b, 0.004),          # Huefte
        (0.465, 0.100 + b, 0.062 + b, 0.062 + b, 0.004),          # Gesaess (unter den Schoessen)
    ]


def torso(F, q, mat, cls, bulk=0.0, fn=None, team=False, rows=None, name='torso', n0=16):
    """Rumpf (statisch, neigt sich mit dem Oberkoerper). fn = Formfunktion (Steppnaehte)"""
    all_rows = rows or torso_secs(bulk)
    if q == 0 and rows is None:
        all_rows = [r for i, r in enumerate(all_rows) if i != 6]
    if q == 1:
        all_rows = [all_rows[i] for i in (0, 3, 5, 7, 8, 10)]
    elif q == 2:
        all_rows = [all_rows[i] for i in (0, 3, 6, 8, 10)]
    secs = [Sec((0, cy, z), rx, rf, rb, fn=fn if q == 0 else None) for (z, rx, rf, rb, cy) in all_rows]
    o = loft(name, secs, segs=segs(q, n0, 7, 5), cap0=0.0, cap1=None)
    F.add(o, mat, cls, team=team, smooth=65)
    return all_rows


def skirt(F, q, mat, cls, top=0.497, hem=0.33, r_top=(0.103, 0.066, 0.064), flare=(0.135, 0.095, 0.095), fn=None,
          team=False, arc=(0, 180), name='skirt', n0=7, roll=True, split=True):
    """Geteilte Schoesse (vorn und hinten geschlitzt): rechte Haelfte folgt dem rechten, linke dem linken Oberschenkel.
    arc: Bogen der rechten Haelfte (0 vorn .. 180 hinten); die linke ist gespiegelt."""
    n = segs(q, n0, max(3, n0 // 2), 2)
    zs = [top, top - (top - hem) * 0.35, top - (top - hem) * 0.7, hem] if q == 0 else [top, hem]
    out = []
    for side in (1, -1):
        secs = []
        for i, z in enumerate(zs):
            u = (top - z) / max(1e-4, top - hem)
            rx = r_top[0] + (flare[0] - r_top[0]) * u
            rf = r_top[1] + (flare[1] - r_top[1]) * u
            rb = r_top[2] + (flare[2] - r_top[2]) * u
            secs.append(Sec((0, 0.004, z), rx, rf, rb, fn=fn if q == 0 else None))
        if roll and q == 0:
            # umgeschlagener Saum: die Kante biegt nach innen, wirkt wie Stoffdicke
            last = secs[-1]
            secs.append(Sec((0, 0.004, hem + 0.008), last.rx * 0.955, last.rf * 0.955, last.rb * 0.955, fn=fn))
        a0, a1 = arc
        if split:
            # Haelften ueberlappen vorn/hinten um 10 Grad (geschlossen in Ruhe); die linke liegt minimal innen (kein Z-Kampf)
            a0, a1 = a0 - 10, a1 + 10
            if side < 0:
                for sc in secs:
                    sc.rx *= 0.985
                    sc.rf *= 0.985
                    sc.rb *= 0.985
        o = loft(f'{name}_{"r" if side > 0 else "l"}', secs, segs=n, arc=(a0, a1) if side > 0 else (-a1, -a0))
        if split:
            part = P['leg_r'] if side > 0 else P['leg_l']
            F.add(o, mat, cls, part=part, pivot=(side * HIP_X, 0, HIP_Z), team=team, smooth=60)
        else:
            F.add(o, mat, cls, team=team, smooth=60)
        out.append(o)
    return out


def belt(F, q, mat, cls, z=0.518, h=0.026, grow=0.006, team=False, name='belt', rows=None):
    """Guertel um die Taille (folgt dem Rumpfquerschnitt bei z)"""
    rx, rf, rb = 0.089 + grow, 0.058 + grow, 0.054 + grow
    n = segs(q, 16, 6, 5)
    secs = [Sec((0, 0.004, z - h / 2), rx, rf, rb), Sec((0, 0.004, z + h / 2), rx * 1.01, rf * 1.01, rb * 1.01)]
    o = loft(name, secs, segs=n)
    F.add(o, mat, cls, team=team, smooth=40)
    return o


# ---------------------------------------------------------------------------------------------------------------- Beine
def legs(F, q, hose_mat, hose_cls, shoe_mat, shoe_cls, boots=False, wraps=False, thigh_top=0.5):
    """Oberschenkel (Teil leg_l/leg_r um die Huefte) und Unterschenkel mit Schuh (shin_l/shin_r um das Knie)"""
    n = segs(q, 7, 5, 4)
    for side in (-1, 1):
        x = side * HIP_X
        lp = P['leg_r'] if side > 0 else P['leg_l']
        sp = P['shin_r'] if side > 0 else P['shin_l']
        kx = side * (HIP_X + 0.002)
        if q < 2:
            th_rows = [(thigh_top, 0.050, 0.052, 0.052), (0.39, 0.044, 0.047, 0.048), (KNEE_Z + 0.004, 0.033, 0.035, 0.033)]
            if q == 1:
                th_rows = [th_rows[0], th_rows[2]]
            secs = [Sec((x + (kx - x) * (thigh_top - z) / (thigh_top - KNEE_Z), 0.0, z), rx, rf, rb) for (z, rx, rf, rb) in th_rows]
            o = loft('thigh', secs, segs=segs(q, 7, 5, 4), cap0=None, cap1=None)
            F.add(o, hose_mat, hose_cls, part=lp, pivot=(x, 0, HIP_Z), smooth=60)
            # Unterschenkel (Knie bis Knoechel); Wadenwoelbung nach hinten
            wrap_fn = None
            if wraps and q == 0:
                wrap_fn = lambda th, k, t: 1.0 + 0.05 * math.sin(th * 1.0 + k * 2.2) * (0.6 if k > 0 else 0.0)
            if boots:
                sh_rows = [(KNEE_Z + 0.006, 0.034, 0.035, 0.034), (0.22, 0.034, 0.033, 0.042), (0.16, 0.031, 0.031, 0.037),
                           (0.105, 0.026, 0.027, 0.028), (0.075, 0.024, 0.025, 0.025)]
            else:
                sh_rows = [(KNEE_Z + 0.006, 0.033, 0.034, 0.033), (0.225, 0.033, 0.032, 0.041), (0.17, 0.03, 0.03, 0.036),
                           (0.12, 0.024, 0.026, 0.027), (0.075, 0.021, 0.023, 0.022)]
            if q == 1:
                sh_rows = [sh_rows[0], sh_rows[2], sh_rows[4]]
            secs = [Sec((kx, 0.0, z), rx, rf, rb, fn=wrap_fn) for (z, rx, rf, rb) in sh_rows]
            if boots and q == 0:
                # Stiefelschaft mit Umschlag: Hose oben, Leder ab Wadenmitte
                hose = loft('shin', secs[:2] + [Sec((kx, 0.0, 0.2), 0.033, 0.033, 0.040)], segs=n)
                F.add(hose, hose_mat, hose_cls, part=sp, pivot=(kx, 0, KNEE_Z), up=HIP_Z, smooth=60)
                bs = [Sec((kx, 0.0, 0.205), 0.037, 0.037, 0.044), Sec((kx, 0.0, 0.192), 0.036, 0.036, 0.043),
                      Sec((kx, 0.0, 0.14), 0.032, 0.032, 0.037), Sec((kx, -0.002, 0.07), 0.028, 0.029, 0.029)]
                boot = loft('bootleg', bs, segs=n)
                F.add(boot, shoe_mat, shoe_cls, part=sp, pivot=(kx, 0, KNEE_Z), up=HIP_Z, smooth=55)
            else:
                o = loft('shin', secs, segs=n)
                F.add(o, hose_mat, hose_cls, part=sp, pivot=(kx, 0, KNEE_Z), up=HIP_Z, smooth=60)
            # Schuh: vom Absatz zur Spitze (Laufrichtung -Y), Sohle bei z = 0
            sz = 0.03
            rows = [(0.034, 0.022, 0.024, 0.026), (0.012, 0.027, 0.046 if not boots else 0.05, 0.03), (-0.04, 0.03, 0.026, 0.03),
                    (-0.098, 0.022, 0.014, 0.028)]
            if q == 1:
                rows = [rows[0], rows[1], rows[3]]
            secs = [Sec((kx, y, sz), rx, rf, rb) for (y, rx, rf, rb) in rows]
            shoe = loft('shoe', secs, segs=n if q == 0 else 4, fwd=(0, 0, 1), cap0=0.008, cap1=0.012)
            F.add(shoe, shoe_mat, shoe_cls, part=sp, pivot=(kx, 0, KNEE_Z), up=HIP_Z, smooth=50)
        else:
            # fern: ein Bein je Seite (Huefte bis Fuss), Fuss als kleiner Keil
            secs = [Sec((x, 0.0, thigh_top), 0.05, 0.05, 0.05), Sec((kx, 0.0, KNEE_Z), 0.034), Sec((kx, -0.01, 0.03), 0.026, 0.05, 0.03)]
            o = loft('leg', secs, segs=4)
            F.add(o, hose_mat, hose_cls, part=lp, pivot=(x, 0, HIP_Z), smooth=0)


# ---------------------------------------------------------------------------------------------------------------- Arme
def arm(F, q, side, mat, cls, style, sleeve='long', cuff_z=None, hand_mat=SKIN_MAT, hand_cls=SKIN, sleeve_fn=None,
        cuff_mat=None, cuff_cls=None, glove=False):
    """Arm (Teil arm_r/arm_l um die Schulter): Aermel, ggf. nackter Unterarm, Faust. sleeve: 'long' | 'rolled' (bis zur
    Unterarmmitte hochgekrempelt). Rueckgabe: Faustmitte (fuer Werkzeuge im selben Teil)."""
    s = side
    part = P['arm_r'] if s > 0 else P['arm_l']
    piv = (s * SHO_X, 0.0, SHO_Z)
    n = segs(q, 7, 5, 4)
    sho = Vector((s * (SHO_X - 0.006), 0.004, SHO_Z + 0.008))
    delt = Vector((s * (SHO_X + 0.004), 0.004, SHO_Z - 0.014))
    el = Vector((s * ELBOW.x, ELBOW.y, ELBOW.z))
    wr = Vector((s * WRIST.x, WRIST.y, WRIST.z))
    fi = fist_of(s)
    add = lambda o, m, c, sm=60: F.add(o, m, c, part=part, pivot=piv, arm=style, smooth=sm)
    if q == 2:
        o = tube('arm', [sho, fi + Vector((0, 0, 0.01))], [0.034, 0.024], segs=4, cap0=None, cap1=None)
        add(o, mat, cls, 0)
        return fi
    lerp = lambda a, b, u: a + (b - a) * u
    if sleeve == 'rolled':
        roll = lerp(el, wr, 0.42)
        # hochgekrempelt: Wulst am Ende (Stoffrolle) statt eigenem Teil
        pts = [sho, delt, lerp(delt, el, 0.5), el, lerp(el, wr, 0.3), roll, lerp(el, wr, 0.47)]
        rad = [0.024, 0.03, 0.03, 0.028, 0.0275, 0.03, 0.025]
        if q == 1:
            pts, rad = [sho, delt, el, roll], [0.024, 0.03, 0.028, 0.027]
        secs = [Sec(p, r, r * 1.05, r * 1.05, fn=sleeve_fn if q == 0 else None) for p, r in zip(pts, rad)]
        o = loft('sleeve', secs, segs=n, cap0=0.004)
        add(o, mat, cls)
        fa = tube('forearm', [lerp(el, wr, 0.38), lerp(el, wr, 0.75), wr] if q == 0 else [lerp(el, wr, 0.38), wr], [0.025, 0.022, 0.0175] if q == 0 else [0.025, 0.0175], segs=segs(q, 6, 4, 4), rf=0.88, cap0=None, cap1=None)
        add(fa, hand_mat, hand_cls, 75)
    else:
        pts = [sho, delt, el, lerp(el, wr, 0.5), wr + (wr - el).normalized() * 0.006]
        rad = [0.025, 0.032, 0.029, 0.026, 0.023]
        if q == 1:
            pts, rad = [sho, delt, el, wr], [0.025, 0.032, 0.029, 0.024]
        secs = [Sec(p, r, r * 1.05, r * 1.05, fn=sleeve_fn if q == 0 else None) for p, r in zip(pts, rad)]
        o = loft('sleeve', secs, segs=n, cap0=0.004)
        add(o, mat, cls)
        if cuff_mat and q == 0:
            c = tube('cuff', [wr - (wr - el).normalized() * 0.012, wr + (wr - el).normalized() * 0.008], [0.026, 0.024], segs=n)
            add(c, cuff_mat, cuff_cls)
    hand(F, q, s, part, piv, style, hand_mat, hand_cls, glove=glove)
    return fi


def hand(F, q, s, part, piv, style, mat, cls, glove=False):
    """Faust (Daumen um den Griff): Griffachse verlaeuft vorn-hinten durch die Faustmitte"""
    wr = Vector((s * WRIST.x, WRIST.y, WRIST.z))
    fi = fist_of(s)
    d = (fi - wr).normalized()
    g = 1.12 if glove else 1.0
    if q == 0:
        secs = [Sec(wr, 0.0145 * g, 0.018 * g, 0.018 * g),
                Sec(wr + d * 0.018, 0.0165 * g, 0.025 * g, 0.022 * g),
                Sec(wr + d * 0.04 + Vector((s * 0.002, 0, 0)), 0.018 * g, 0.026 * g, 0.022 * g),
                Sec(wr + d * 0.058 + Vector((-s * 0.004, -0.004, 0)), 0.017 * g, 0.021 * g, 0.018 * g)]
        o = loft('fist', secs, segs=7, cap1=0.008)
        F.add(o, mat, cls, part=part, pivot=piv, arm=style, smooth=70)
        th = tube('thumb', [wr + d * 0.014 + Vector((-s * 0.012, -0.016, 0)), wr + d * 0.03 + Vector((-s * 0.012, -0.026, 0)),
                            wr + d * 0.044 + Vector((-s * 0.004, -0.026, 0))], [0.008 * g, 0.0075 * g, 0.0065 * g], segs=3, cap1=0.004)
        F.add(th, mat, cls, part=part, pivot=piv, arm=style, smooth=70)
        if glove:
            c = tube('gauntlet', [wr - d * 0.018, wr + d * 0.006], [0.027, 0.022], segs=6)
            F.add(c, mat, cls, part=part, pivot=piv, arm=style, smooth=50)
    else:
        o = blob('fist', fi + Vector((0, 0, 0.012)), (0.017 * g, 0.023 * g, 0.03), segs=4, rings=2)
        F.add(o, mat, cls, part=part, pivot=piv, arm=style, smooth=60)
