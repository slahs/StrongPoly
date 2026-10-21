"""Beispiel-Asset der Pipeline: Brunnen (BT.Well, Footprint 1x1).

Echt modelliert: gemauerter Brunnenkranz aus einzelnen Bruchsteinen in drei Lagen mit Abdecksteinen, Schacht, zwei
Eichenpfosten mit Riegel, Haspel (Welle mit Seilwicklung und eiserner Kurbel), Satteldach aus Schindellagen auf Sparren,
Eimer mit Eisenreifen am Seil. LOD1/LOD2 ersetzen die Einzelsteine durch einen verformten Ring (Ersatzform).

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/well.py [--no-preview] [--no-bake] [--fast]
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))

from sp import anchors, asset, mesh  # noqa: E402

A = asset.begin('well', target={'building': 'Well'}, footprint=(1, 1), klass='small',
                desc='Brunnen: Bruchsteinkranz, Eichenpfosten, Haspel mit Kurbel, Schindeldach, Eimer')
rnd = random.Random(29)

R_OUT = 0.40
R_IN = 0.27
COURSE_H = 0.135
COURSES = 3

# ---------------------------------------------------------------- Brunnenkranz: Bruchsteine in Lagen, versetzt
stones = []
for k in range(COURSES):
    n = 10
    z = k * COURSE_H
    for i in range(n):
        a = (i + (0.5 if k % 2 else 0.0) + rnd.uniform(-0.12, 0.12)) / n * 2 * math.pi
        r = (R_OUT + R_IN) / 2 + rnd.uniform(-0.01, 0.01)
        L = 2 * math.pi * r / n * rnd.uniform(0.98, 1.08)
        s = mesh.stone(f'stone_{k}_{i}', (L, R_OUT - R_IN + rnd.uniform(-0.01, 0.02), COURSE_H * rnd.uniform(0.92, 1.04)),
                       loc=(math.cos(a) * r, math.sin(a) * r, z + COURSE_H / 2), seed=k * 31 + i, rough=0.07, subdiv=0,
                       rot_z=a + math.pi / 2 + rnd.uniform(-0.05, 0.05), bevel=0.22)
        stones.append(s)
# Abdecksteine (flacher, etwas breiter, leicht ueberstehend)
n = 9
for i in range(n):
    a = (i + rnd.uniform(-0.1, 0.1)) / n * 2 * math.pi
    r = (R_OUT + R_IN) / 2 + 0.01
    L = 2 * math.pi * r / n * 1.04
    s = mesh.stone(f'cap_{i}', (L, R_OUT - R_IN + 0.06, 0.07), loc=(math.cos(a) * r, math.sin(a) * r, COURSES * COURSE_H + 0.035),
                   seed=200 + i, rough=0.05, subdiv=0, rot_z=a + math.pi / 2, bevel=0.3)
    stones.append(s)
ring = mesh.join(stones, 'ring_stones')
A.add(ring, mat='M_Stone_Rubble', uv_mode='box', lod1='drop', lod2='drop', smooth=40)

# Schacht: innere Wand nach unten (dunkel durch AO), Boden
# (das Gelaende deckt alles unter Bodenhoehe ab: der Schacht endet knapp ueber dem Boden, die AO macht ihn dunkel)
shaft = mesh.cylinder('shaft', R_IN + 0.005, COURSES * COURSE_H, segs=14, loc=(0, 0, 0.0), cap=False)
for p in shaft.data.polygons:  # offene Roehre, Normalen nach innen: man blickt von oben hinein
    p.flip()
floor = mesh.cylinder('shaft_floor', R_IN + 0.01, 0.02, segs=14, loc=(0, 0, 0.0))
A.add(mesh.join([shaft, floor], 'shaft'), mat='M_Stone_Rubble', uv_mode='cyl', lod2='drop', smooth=60, dirt=1.5)

# Ersatzformen fuer LOD1/LOD2: verformter Ring statt Einzelsteinen
for L, segs in ((1, 14), (2, 9)):
    pr = mesh.ring(f'ring_proxy_L{L}', R_IN, R_OUT, COURSES * COURSE_H + 0.07, segs=segs)
    mesh.displace(pr, amount=0.012, scale=7.0, seed=L)
    A.add(pr, mat='M_Stone_Rubble', uv_mode='cyl', only=L, smooth=50 if L == 1 else 0)

# ---------------------------------------------------------------- Pfosten, Riegel, Dachstuhl (Eiche)
TOP = COURSES * COURSE_H + 0.07
PX = 0.37
POST_H = 1.02
for sx in (-1, 1):
    p = mesh.box(f'post_{sx}', (0.075, 0.08, POST_H + 0.05), loc=(sx * PX, 0, TOP - 0.05), bevel=0.012)
    mesh.displace(p, amount=0.006, scale=9.0, seed=3 + sx)
    A.add(p, mat='M_Timber_Oak', uv_space='object', along='z', smooth=30, wear=1.4)
    # Kopfband (Strebe) unter dem Riegel
    b = mesh.beam(f'brace_{sx}', (sx * PX, 0, TOP + POST_H - 0.32), (sx * (PX - 0.2), 0, TOP + POST_H - 0.07), 0.045, 0.05, bevel=0.008)
    A.add(b, mat='M_Timber_Oak', uv_space='object', smooth=30, lod2='drop')
# Riegel (Firstpfette) auf den Pfosten
ridge_z = TOP + POST_H
ridge = mesh.beam('ridge', (-0.48, 0, ridge_z + 0.02), (0.48, 0, ridge_z + 0.02), 0.07, 0.07, bevel=0.01)
mesh.sag(ridge, 0.008, 'X')
A.add(ridge, mat='M_Timber_Oak', uv_space='object', smooth=30, wear=1.3)

# Sparren und Dachlagen: Satteldach, Traufe vorn/hinten (Y), First entlang X
EAVE_Y = 0.46
EAVE_Z = ridge_z - 0.28
pitch = math.atan2(ridge_z + 0.06 - EAVE_Z, EAVE_Y)
for sy in (-1, 1):
    for x in (-0.44, 0.0, 0.44):
        r = mesh.beam(f'rafter_{sy}_{x:+.2f}', (x, 0, ridge_z + 0.06), (x, sy * EAVE_Y, EAVE_Z), 0.035, 0.045)
        A.add(r, mat='M_Timber_Oak', uv_space='object', smooth=30, lod2='drop')
    # Schindellagen: von der Traufe zum First ueberlappende Bretter, jede Lage leicht verkippt und verschoben
    rows = 5
    seg = math.hypot(EAVE_Y, ridge_z + 0.06 - EAVE_Z) / rows
    rows_objs = []
    for k in range(rows):
        t0 = k / rows
        y0 = sy * EAVE_Y * (1 - t0)
        z0 = EAVE_Z + (ridge_z + 0.06 - EAVE_Z) * t0
        y1 = sy * EAVE_Y * (1 - t0 - 1.35 / rows)
        z1 = EAVE_Z + (ridge_z + 0.06 - EAVE_Z) * min(1.0, t0 + 1.35 / rows)
        dz = 0.032 + 0.006 * k
        sh = mesh.beam(f'shingles_{sy}_{k}', (0, y0, z0 + dz), (0, y1, z1 + dz), 1.08 + rnd.uniform(-0.02, 0.02), 0.022, bevel=0.004, up=(0, -sy, 1))
        # Lage entlang X aufteilen wirkt wie einzelne Schindeln: kleine Hoehenstufen per Rauschen
        mesh.displace(sh, amount=0.006, scale=14.0, seed=k * 7 + (sy > 0))
        rows_objs.append(sh)
    roof = mesh.join(rows_objs, f'roof_{sy}')
    A.add(roof, mat='M_Roof_Shingle', uv_mode='box', smooth=25, lod1=0.5, lod2='drop', dirt=1.2)
    # LOD2: eine Dachflaeche je Seite
    rp = mesh.beam(f'roof_proxy_{sy}', (0, 0, ridge_z + 0.1), (0, sy * EAVE_Y, EAVE_Z + 0.03), 1.08, 0.05, up=(0, -sy, 1))
    A.add(rp, mat='M_Roof_Shingle', uv_mode='box', smooth=0, only=2, dirt=1.2)
# Firstbrett
cap = mesh.beam('ridge_cap', (-0.55, 0, ridge_z + 0.105), (0.55, 0, ridge_z + 0.105), 0.11, 0.02, bevel=0.004)
A.add(cap, mat='M_Wood_Planks', uv_space='object', smooth=30)

# ---------------------------------------------------------------- Haspel: Welle, Seilwicklung, Kurbel
AX_Z = TOP + 0.36
axle = mesh.cylinder('axle', 0.04, 0.86, segs=10, loc=(0, 0, AX_Z), axis='X')
A.add(axle, mat='M_Timber_Oak', uv_mode='box', uv_space='object', smooth=50)
coil = mesh.cylinder('rope_coil', 0.058, 0.26, segs=12, loc=(-0.04, 0, AX_Z), axis='X')
mesh.displace(coil, amount=0.004, scale=40.0, seed=5)
A.add(coil, mat='M_Cloth_Linen', uv_mode='box', uv_space='object', smooth=60, dirt=1.3, lod2='drop')
crank = [
    mesh.beam('crank_a', (PX + 0.04, 0, AX_Z), (PX + 0.1, 0, AX_Z), 0.022, 0.022),
    mesh.beam('crank_b', (PX + 0.1, 0, AX_Z), (PX + 0.1, 0, AX_Z - 0.16), 0.02, 0.02),
    mesh.beam('crank_c', (PX + 0.1, 0, AX_Z - 0.16), (PX + 0.2, 0, AX_Z - 0.16), 0.024, 0.024),
]
A.add(mesh.join(crank, 'crank'), mat='M_Iron_Wrought', uv_mode='box', uv_space='object', smooth=20, dirt=0.6, lod2='drop')

# Seil und Eimer (haengt ueber der Schachtmitte)
BUCKET_Z = TOP + 0.02
rope = mesh.cylinder('rope', 0.007, AX_Z - 0.05 - (BUCKET_Z + 0.16), segs=5, loc=(-0.04, 0, BUCKET_Z + 0.16))
A.add(rope, mat='M_Cloth_Linen', uv_mode='box', uv_space='object', smooth=60, lod1='keep', lod2='drop')
bucket = mesh.cylinder('bucket', 0.068, 0.13, segs=12, loc=(-0.04, 0, BUCKET_Z), r_top=0.082)
A.add(bucket, mat='M_Wood_Planks', uv_mode='cyl', smooth=50, lod2='drop')
bands = [mesh.ring(f'band_{k}', 0.07 + 0.012 * k, 0.078 + 0.012 * k, 0.014, segs=10, loc=(-0.04, 0, BUCKET_Z + 0.015 + k * 0.085)) for k in range(2)]
A.add(mesh.join(bands, 'bucket_bands'), mat='M_Iron_Wrought', uv_mode='box', smooth=50, dirt=0.5, lod1='drop', lod2='drop')
handle = mesh.beam('bucket_handle', (-0.04 - 0.08, 0, BUCKET_Z + 0.13), (-0.04 + 0.08, 0, BUCKET_Z + 0.13), 0.008, 0.008)
A.add(handle, mat='M_Iron_Wrought', uv_mode='box', uv_space='object', smooth=20, lod1='drop', lod2='drop')

# ---------------------------------------------------------------- Ankerpunkte
anchors.anchor('work', (0, -0.62, 0), note='Platz fuer Wasserholer (vorn)')

asset.finish(A)
