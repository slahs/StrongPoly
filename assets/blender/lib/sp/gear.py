"""Ausruestung der GLB-Figuren: Werkzeuge (Hand-Teil, Griff durch die Faust), Kopfbedeckungen, Guertelzeug, Speer, Schild.
Werkzeuge liegen in der Ruhepose in der rechten Faust, Stiel schraeg nach vorn oben (wie die prozeduralen Figuren); sie
gehoeren zum Arm-Teil und folgen dessen Arbeits-/Hiebbewegung (Armstil im Shader)."""
import math

from mathutils import Vector

from . import mesh
from .figure import CB, SK, TONE, Sec, blob, cut, folds, loft, split_z, tube
from .human import HEAD_PIVOT, P, SHO_X, SHO_Z

IRON = 'M_Iron_Wrought'
FIG = 'M_Figure'
LEATHER = 'M_Leather'
WOOD = TONE('sandDark')
WOOD_D = TONE('brown')
STEEL = TONE('steel')
STEEL_D = TONE('darkSteel')

# Stielrichtung (vorn oben), Blattrichtung (vorn unten, senkrecht zum Stiel)
D_UP = Vector((0.0, -0.42, 0.5)).normalized()
D_DN = Vector((0.0, -0.5, -0.42)).normalized()


def _iron(q):
    return (IRON, 0) if q == 0 else (FIG, STEEL_D)


def _wood_mat(q):
    return FIG


class Tool:
    """Hilfsklasse: Teile eines Werkzeugs im rechten Arm registrieren"""

    def __init__(self, F, q, fist, side=1, style=9, slot=0, part=None):
        self.F, self.q, self.fist, self.slot, self.style = F, q, Vector(fist), slot, style
        self.part = part or (P['arm_r'] if side > 0 else P['arm_l'])
        self.piv = (side * SHO_X, 0.0, SHO_Z)

    def add(self, o, mat, cls, smooth=40):
        self.F.add(o, mat, cls, part=self.part, pivot=self.piv, arm=self.style, slot=self.slot, smooth=smooth, dirt=0.4)

    def at(self, t, d=D_UP):
        return self.fist + d * t

    def handle(self, t0, t1, r=0.011, d=D_UP, cls=WOOD):
        n = 5 if self.q == 0 else 3
        o = tube('handle', [self.at(t0, d), self.at(t1, d)], [r, r * 0.92], segs=n, cap0=0.002 if self.q == 0 else None, cap1=0.002 if self.q == 0 else None)
        self.add(o, FIG, cls)
        return o

    def iron(self, o, smooth=30):
        m, c = _iron(self.q)
        self.add(o, m, c, smooth)


def hoe(F, q, fist, slot, handle=True):
    T = Tool(F, q, fist, slot=slot)
    if handle:
        T.handle(-0.2, 0.44)
    top = T.at(0.44)
    b = mesh.beam('hoe_blade', top + D_UP * 0.01, top + D_DN * 0.085, 0.07, 0.006, up=(1, 0, 0))
    # Blatt spreizt sich zur Schneide (Seiten etwas aufbiegen)
    T.iron(b)


def axe(F, q, fist, slot, handle=True):
    T = Tool(F, q, fist, slot=slot, style=9)
    if handle:
        T.handle(-0.12, 0.38, r=0.012)
    top = T.at(0.34)
    # Axtkopf: Haus (dick) und Blatt (duenn, breiter zur Schneide)
    if q == 0:
        secs = [Sec(top - D_DN * 0.03, 0.012, 0.016, 0.016), Sec(top + D_DN * 0.01, 0.011, 0.02, 0.02),
                Sec(top + D_DN * 0.05, 0.004, 0.032, 0.032), Sec(top + D_DN * 0.075, 0.0015, 0.045, 0.045)]
        o = loft('axe_head', secs, segs=5, fwd=D_UP, cap0=0.0, cap1=0.0)
    else:
        o = mesh.beam('axe_head', top - D_DN * 0.02, top + D_DN * 0.075, 0.06, 0.012, up=(1, 0, 0))
    T.iron(o)


def hammer(F, q, fist, slot, big=False, handle=True, L=None):
    T = Tool(F, q, fist, slot=slot)
    L = L or (0.36 if big else 0.27)
    if handle:
        T.handle(-0.06, L, r=0.011)
    top = T.at(L)
    s = 0.032 if big else 0.024
    o = mesh.beam('hammer_head', top - D_DN * (0.035 if big else 0.03), top + D_DN * (0.04 if big else 0.032), s, s, up=(1, 0, 0))
    T.iron(o)


def pick(F, q, fist, slot, handle=True):
    T = Tool(F, q, fist, slot=slot)
    if handle:
        T.handle(-0.12, 0.38, r=0.012)
    top = T.at(0.36)
    if q == 0:
        pts = [top - D_DN * 0.1 + D_UP * 0.02, top - D_DN * 0.04, top + D_DN * 0.04, top + D_DN * 0.11 + D_UP * 0.025]
        o = tube('pick_head', pts, [0.004, 0.012, 0.012, 0.003], segs=5, cap0=0.0, cap1=0.0)
    else:
        o = mesh.beam('pick_head', top - D_DN * 0.1, top + D_DN * 0.1, 0.014, 0.014, up=(1, 0, 0))
    T.iron(o)


def shovel(F, q, fist, slot, handle=True):
    T = Tool(F, q, fist, slot=slot)
    if handle:
        T.handle(-0.22, 0.4, r=0.011)
    top = T.at(0.4)
    # Spatenblatt aus Holz mit Eisenschuh, in Verlaengerung des Stiels
    o = mesh.beam('spade', top - D_UP * 0.01, top + D_UP * 0.1, 0.075, 0.01, up=(0, 0, 1))
    T.add(o, FIG, WOOD)
    if q == 0:
        s = mesh.beam('spade_shoe', top + D_UP * 0.085, top + D_UP * 0.11, 0.078, 0.013, up=(0, 0, 1))
        T.iron(s)


def sickle(F, q, fist, slot):
    T = Tool(F, q, fist, slot=slot)
    T.handle(-0.04, 0.09, r=0.012)
    base = T.at(0.09)
    # Sichelblatt: Bogen nach vorn und unten
    pts = []
    n = 4 if q == 0 else 2
    for i in range(n + 1):
        a = i / n * math.pi * 0.95
        pts.append(base + D_UP * (math.sin(a) * 0.08) + D_DN * ((1 - math.cos(a)) * 0.06))
    o = tube('sickle_blade', pts, [0.008] * n + [0.002], segs=4 if q == 0 else 3, cap0=0.0 if q == 0 else None, cap1=None, rf=0.3)
    T.iron(o)


def paddle(F, q, fist, slot, handle=True):
    T = Tool(F, q, fist, slot=slot)
    if handle:
        T.handle(-0.16, 0.42, r=0.01, cls=TONE('sand'))
    top = T.at(0.42)
    o = mesh.beam('paddle_blade', top - D_UP * 0.01, top + D_UP * 0.11, 0.055, 0.01, up=(0, 0, 1))
    T.add(o, FIG, TONE('sand'))


def knife(F, q, fist, slot, side=1):
    T = Tool(F, q, fist, slot=slot, side=side)
    d = Vector((0.0, -0.75, 0.66)).normalized()
    T.handle(-0.055, 0.012, r=0.009, d=d, cls=WOOD_D)
    o = tube('knife_blade', [T.at(0.012, d), T.at(0.075, d), T.at(0.13, d)] if q == 0 else [T.at(0.012, d), T.at(0.13, d)], [0.009, 0.008, 0.001] if q == 0 else [0.009, 0.001], segs=4 if q == 0 else 3, cap0=None, cap1=None, rf=0.35)
    T.iron(o)


# ---------------------------------------------------------------------------------------------------------------- Kopfbedeckungen
def straw_hat(F, q, mask, band_cls=CB, mat='M_Cloth_Linen'):
    """Strohhut: flache Krone, breite, leicht haengende Krempe, Hutband (Nebenstoff)"""
    n = (12, 6, 5)[q]
    m = mat if q == 0 else FIG
    straw = TONE('sand')
    cy = 0.008
    crown = [Sec((0, cy, 0.9), 0.058, 0.059, 0.071), Sec((0, cy, 0.935), 0.056, 0.056, 0.067), Sec((0, cy, 0.958), 0.046, 0.046, 0.054)]
    if q >= 1:
        crown = [crown[0], crown[2]]
    o = loft('hat_crown', crown, segs=n, cap1=0.007)
    F.add(o, m, straw, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=50)
    wav = (lambda th, k, t: 1.0 + 0.025 * math.sin(5 * th + 0.7)) if q == 0 else None
    brim = [Sec((0, cy, 0.906), 0.06, 0.061, 0.073), Sec((0, cy, 0.894), 0.122, 0.124, 0.132, fn=wav),
            Sec((0, cy, 0.887), 0.12, 0.122, 0.13, fn=wav), Sec((0, cy, 0.899), 0.059, 0.06, 0.072)]
    if q >= 1:
        brim = [brim[0], brim[1], brim[3]]
    o = loft('hat_brim', brim, segs=n, axis=(0, 0, 1), orient='auto')
    F.add(o, m, straw, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=50)
    if q == 0:
        b = loft('hat_band', [Sec((0, cy, 0.903), 0.0595, 0.0605, 0.0725), Sec((0, cy, 0.917), 0.0585, 0.0595, 0.0712)], segs=n)
        F.add(b, m, band_cls, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=40)


def hood(F, q, mask, cls=CB, mat='M_Cloth_Linen'):
    """Gugel: Kapuze mit Schulterkragen (Zipfel nach hinten), Gesichtsoeffnung"""
    n = (10, 6, 5)[q]
    m = mat if q == 0 else FIG
    cy = 0.012
    fo = folds(n=7, amp=0.06, power=1.0) if q == 0 else None
    cape = [(0.632, 0.162, 0.11, 0.12), (0.684, 0.152, 0.096, 0.1), (0.726, 0.14, 0.088, 0.09), (0.758, 0.115, 0.082, 0.08),
            (0.786, 0.068, 0.07, 0.07), (0.83, 0.065, 0.07, 0.077), (0.87, 0.067, 0.068, 0.08), (0.905, 0.064, 0.063, 0.078),
            (0.935, 0.054, 0.05, 0.069), (0.955, 0.034, 0.03, 0.05)]
    if q == 1:
        cape = [cape[i] for i in (0, 3, 5, 7, 9)]
    elif q == 2:
        cape = [cape[i] for i in (0, 4, 9)]
    secs = []
    for i, (z, rx, rf, rb) in enumerate(cape):
        fn = fo if z < 0.77 else None
        secs.append(Sec((0, cy, z), rx, rf, rb, fn=(lambda th, k, t, z=z: 1.0 + 0.05 * math.sin(6 * th + 0.5) * max(0.0, (0.77 - z) / 0.14)) if fn else None))
    o = loft('hood', secs, segs=n, cap1=0.006)
    if q < 2:
        cut(o, lambda c: 0.8 < c.z < 0.912 and abs(math.atan2(c.x, -(c.y - cy))) < 0.95)
    # Schulterkragen bleibt am Rumpf (dreht nicht mit dem Kopf), die Kapuze folgt dem Kopf
    cape_o, hood_o = split_z(o, 0.787, 'hood_cape', 'hood')
    F.add(cape_o, m, cls, mask=mask, smooth=55)
    F.add(hood_o, m, cls, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=55)
    if q < 2:
        tail = tube('hood_tail', [(0, 0.05, 0.945), (0, 0.085, 0.915), (0, 0.1, 0.86), (0, 0.105, 0.8)], [0.024, 0.017, 0.011, 0.006],
                    segs=4, cap1=0.004) if q == 0 else tube('hood_tail', [(0, 0.05, 0.945), (0, 0.1, 0.84)], [0.02, 0.008], segs=4, cap0=None, cap1=None)
        F.add(tail, m, cls, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=55)


def kettle_hat(F, q, mask=0, tone=TONE('steel')):
    """Eisenhut: Glocke mit Grat und breiter, abfallender Krempe"""
    n = (11, 6, 5)[q]
    m, c = (IRON, tone) if q == 0 else (FIG, tone)
    cy = 0.008
    crown = [Sec((0, cy, 0.885), 0.063, 0.064, 0.074), Sec((0, cy, 0.918), 0.064, 0.064, 0.074), Sec((0, cy, 0.95), 0.056, 0.056, 0.064),
             Sec((0, cy, 0.975), 0.032, 0.032, 0.037)]
    if q == 1:
        crown = [crown[0], crown[2], crown[3]]
    elif q == 2:
        crown = [crown[0], crown[3]]
    if q == 0:
        # Grat (Mittelrippe) vorn-hinten
        for s in crown[1:]:
            s.fn = (lambda th, k, t: 1.0 + 0.06 * math.exp(-((abs(math.sin(th)) / 0.12) ** 2)) * t)
    o = loft('kettle_crown', crown, segs=n, cap1=0.004)
    F.add(o, m, c, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=45, wear=1.5)
    brim = [Sec((0, cy, 0.893), 0.064, 0.065, 0.075), Sec((0, cy, 0.862), 0.118, 0.12, 0.128), Sec((0, cy, 0.856), 0.117, 0.119, 0.127),
            Sec((0, cy, 0.886), 0.063, 0.064, 0.074)]
    if q == 1:
        brim = [brim[0], brim[1], brim[3]]
    elif q == 2:
        brim = [brim[0], brim[1]]
    o = loft('kettle_brim', brim, segs=n, axis=(0, 0, 1), orient='auto')
    F.add(o, m, c, part=P['head'], pivot=HEAD_PIVOT, mask=mask, smooth=35, wear=1.8)
