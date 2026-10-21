"""Figur Bauer/Arbeiter (U.Peasant): Leinentunika mit geschlitzten Schoessen und hochgekrempelten Aermeln, Wollbeinlinge mit
Wickelbaendern, Bundschuhe, Guertelschaerpe und Halstuch in Spielerfarbe, Beutel und Messer am Guertel.
Varianten (Sichtbarkeitsbits wie units_style.ts): Kopfbedeckung Hat0 Strohhut, Hat1 Gugel mit Schulterkragen, Hat2 barhaeuptig;
Haar kurz/Topfschnitt/lang, Bart; Haut/Haar/Stoffe je Instanz (Farbklassen). Werkzeug und Schuerze je Beruf (Slot = Berufsbits,
Armstil folgt dem Beruf ueber unit_jobs.ts JOB_ARM_R/L).

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/peasant.py [--no-preview] [--no-bake] [--fast]
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import asset, figpreview, gear, human  # noqa: E402
from sp.figure import CA, CB, VIS, Fig, Sec, TONE, blob, chain, folds, loft, tube  # noqa: E402

A = asset.begin('peasant', target={'unit': 'Peasant'}, klass='figure',
                # LOD-Grenzen x0,45 (Mittel: LOD0 bis ~13, LOD1 bis ~32 Einheiten): grosse Heere fast nur in LOD2
                lod_dist=(0.45,),
                desc='Bauer/Arbeiter: Leinentunika, Wollbeinlinge, Bundschuhe, Schaerpe+Halstuch in Spielerfarbe, Strohhut/Gugel, Werkzeug je Beruf')

# Berufe (unit_jobs.ts JOB) -> Bits
J = dict(None_=0, Woodcutter=1, Stonemason=2, Miner=3, PitchWorker=4, Orchard=5, Dairy=6, Hunter=7, Farmer=8, HopPicker=9, Miller=10,
         Baker=11, Brewer=12, Bowyer=13, Turner=14, Smith=15, Tanner=16, Armorer=17, Digger=18, Carpenter=19, Innkeeper=20, Trader=21,
         Cleric=22)


def bits(*names):
    m = 0
    for n in names:
        m |= 1 << J[n]
    return m


SLOT_HOE = bits('None_', 'HopPicker')
SLOT_AXE = bits('Woodcutter')
SLOT_HAMMER = bits('Stonemason', 'Bowyer', 'Turner', 'Tanner', 'Armorer', 'Carpenter')
SLOT_SMITH = bits('Smith')
SLOT_PICK = bits('Miner')
SLOT_SHOVEL = bits('Digger')
SLOT_SICKLE = bits('Farmer', 'Orchard')
SLOT_PADDLE = bits('PitchWorker', 'Dairy', 'Baker', 'Brewer')
SLOT_KNIFE = bits('Hunter')
SLOT_APRON_LEATHER = bits('Stonemason', 'Smith', 'Tanner', 'Armorer', 'Carpenter')
SLOT_APRON_LINEN = bits('Baker', 'Miller', 'Dairy', 'Innkeeper', 'Brewer')

LINEN = 'M_Cloth_Linen'
LEATHER = 'M_Leather'
FIG = 'M_Figure'


def build(F, q):
    cloth = LINEN if q == 0 else FIG
    leather = LEATHER if q == 0 else FIG
    # ---- Kopf, Haar, Bart
    human.head(F, q)
    human.hair(F, q)
    human.beard(F, q)
    # ---- Tunika (Hauptstoff): Rumpf mit Bausch ueber dem Guertel, geschlitzte Schoesse mit Faltenwurf
    wr = lambda th, k, t: 1.0 + (0.018 * __import__('math').sin(9 * th + k) if 4 <= k <= 6 else 0.0)
    human.torso(F, q, cloth, CA, bulk=0.003, fn=wr, n0=12)
    human.skirt(F, q, cloth, CA, top=0.5, hem=0.322, r_top=(0.104, 0.066, 0.064), flare=(0.14, 0.097, 0.1),
                fn=folds(n=7, amp=0.07, power=1.3, phase=0.4))
    # ---- Beine: Wollbeinlinge (Nebenstoff) mit Wickelbaendern, Bundschuhe
    human.legs(F, q, cloth, CB, leather, TONE('leatherDark'), wraps=True)
    # ---- Arme: Aermel hochgekrempelt, nackte Unterarme, Faeuste; Armstil 9/10 = Beruf
    fr = human.arm(F, q, 1, cloth, CA, 9, sleeve='rolled')
    human.arm(F, q, -1, cloth, CA, 10, sleeve='rolled')
    # ---- Spielerfarbe: Guertelschaerpe mit Knoten und Enden, Halstuch
    human.belt(F, q, cloth, 0, z=0.518, h=0.032, grow=0.008, team=True, name='sash')
    if q < 2:
        k = blob('sash_knot', (0.052, -0.06, 0.514), (0.014, 0.01, 0.014), segs=6 if q == 0 else 4, rings=1)
        F.add(k, cloth, 0, team=True, smooth=60)
        for i, (dx, L) in enumerate(((0.008, 0.085),)):
            e = tube(f'sash_end{i}', [(0.052 + dx, -0.066, 0.508), (0.06 + dx * 2, -0.078, 0.508 - L)], [0.011, 0.013], segs=4, rf=0.3, cap1=0.0)
            F.add(e, cloth, 0, team=True, smooth=50)
    sc = [Sec((0, 0.008, 0.758), 0.095, 0.064, 0.064), Sec((0, 0.008, 0.772), 0.08, 0.058, 0.06), Sec((0, 0.01, 0.787), 0.045, 0.044, 0.044)]
    if q == 1:
        sc = [sc[0], sc[2]]
    if q < 2:
        o = loft('scarf', sc, segs=(10, 6, 6)[q])
        F.add(o, cloth, 0, team=True, smooth=60)
    if q == 0:
        kn = blob('scarf_knot', (0.0, -0.06, 0.758), (0.016, 0.012, 0.014), segs=6, rings=1)
        F.add(kn, cloth, 0, team=True, smooth=60)
    # ---- Guertelzeug: Beutel links, Messer in der Scheide rechts hinten
    if q == 0:
        p = blob('pouch', (-0.094, -0.035, 0.468), (0.016, 0.026, 0.032), segs=7 if q == 0 else 4, rings=3 if q == 0 else 2)
        F.add(p, leather, TONE('leather'), smooth=60)
    if q == 0:
        sh = tube('sheath', [(0.085, 0.045, 0.505), (0.09, 0.055, 0.44)], [0.011, 0.006], segs=5, rf=0.45, cap1=0.003)
        F.add(sh, leather, TONE('leatherDark'), smooth=50)
        hd = tube('knife_grip', [(0.084, 0.043, 0.505), (0.082, 0.04, 0.54)], [0.007, 0.0065], segs=5, cap1=0.002)
        F.add(hd, FIG, TONE('brown'), smooth=50)
    # ---- Schuerzen je Beruf (geteilt, folgen den Oberschenkeln)
    for slot, mat, cls in ((SLOT_APRON_LEATHER, leather, TONE('leather')), (SLOT_APRON_LINEN, cloth, TONE('linenLight'))):
        if q == 2:
            continue
        for side in (1, -1):
            secs = [Sec((0, 0.004, 0.51), 0.108, 0.078, 0.07), Sec((0, 0.004, 0.42), 0.124, 0.094, 0.08), Sec((0, 0.004, 0.3), 0.15, 0.118, 0.09)]
            a = (0, 58) if side > 0 else (-58, 0)
            o = loft('apron', secs, segs=3 if q == 0 else 2, arc=a)
            part = human.P['leg_r'] if side > 0 else human.P['leg_l']
            F.add(o, mat, cls, part=part, pivot=(side * human.HIP_X, 0, human.HIP_Z), slot=slot, smooth=50)
    # ---- Kopfbedeckungen: Hat0 Strohhut, Hat1 Gugel (Nebenstoff), Hat2 barhaeuptig
    gear.straw_hat(F, q, VIS['Hat0'], mat=LINEN)
    gear.hood(F, q, VIS['Hat1'], cls=CB, mat=LINEN)
    # ---- Werkzeuge (rechte Faust, Slot = Berufe)
    if q < 2:
        # gemeinsame Stiele (ein Stiel fuer mehrere Berufe spart Dreiecke): lang, mittel, kurz
        gear.Tool(F, q, fr, slot=SLOT_HOE | SLOT_SHOVEL | SLOT_PADDLE).handle(-0.2, 0.43)
        gear.Tool(F, q, fr, slot=SLOT_AXE | SLOT_PICK).handle(-0.12, 0.37, r=0.012)
        gear.Tool(F, q, fr, slot=SLOT_HAMMER | SLOT_SMITH).handle(-0.06, 0.3, r=0.011)
        gear.hoe(F, q, fr, SLOT_HOE, handle=False)
        gear.shovel(F, q, fr, SLOT_SHOVEL, handle=False)
        gear.paddle(F, q, fr, SLOT_PADDLE, handle=False)
        gear.axe(F, q, fr, SLOT_AXE, handle=False)
        gear.pick(F, q, fr, SLOT_PICK, handle=False)
        gear.hammer(F, q, fr, SLOT_HAMMER, handle=False, L=0.29)
        gear.hammer(F, q, fr, SLOT_SMITH, big=True, handle=False, L=0.3)
        gear.sickle(F, q, fr, SLOT_SICKLE)
        gear.knife(F, q, fr, SLOT_KNIFE)


for L in range(3):
    build(Fig(A, L), L)

asset.finish(A, preview_on=False)

if '--no-preview' not in sys.argv:
    T = lambda skin, hair, a, b, team: dict(skin=skin, hair=hair, a=a, b=b, team=team)
    t1 = T(0xe6b98e, 0x4a3222, 0xd8ccb0, 0x7a5a3c, 0x2f5fb0)
    t2 = T(0xd9a679, 0x8f6a3a, 0x6b7a3c, 0x5b4330, 0xb03a2e)
    t3 = T(0xf0cfa8, 0x2b2118, 0xc79a3e, 0x4a5d78, 0x2f5fb0)
    t4 = T(0xc68e60, 0x6b4a2b, 0xa2552f, 0x45603a, 0xd0b030)
    H = VIS
    lineup = [
        dict(lod=0, bits=H['Hair0'] | H['Hat0'], job=0, tints=t1),
        dict(lod=0, bits=H['Hair1'] | H['Hat2'] | H['Beard'], job=J['Woodcutter'], tints=t2),
        dict(lod=0, bits=H['Hair2'] | H['Hat1'], job=J['Smith'], tints=t3),
        dict(lod=0, bits=H['Hair1'] | H['Hat2'], job=J['Baker'], tints=t4),
        dict(lod=1, bits=H['Hair0'] | H['Hat0'], job=0, tints=t1),
        dict(lod=2, bits=H['Hair0'] | H['Hat0'], job=0, tints=t1),
    ]
    src = [o for o in A.objects if o.type == 'MESH']
    figpreview.render(src, lineup, 'peasant', cams=('front', 'rts', 'close'), samples=12 if '--fast' in sys.argv else 32)
