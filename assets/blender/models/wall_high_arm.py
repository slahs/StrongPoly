"""Mauerstueck 'arm' der Hohen Steinmauer (BT.WallHigh): Kachelmitte (x = 0) bis Kante (x = 0,5), Richtung +X.
Geometrie und Nahtregeln: wall_high_parts.py.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/wall_high_arm.py [--fast] [--no-preview]
"""
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from sp import asset  # noqa: E402
import castle_kit as K  # noqa: E402
import wall_high_parts as W  # noqa: E402

# Mauern stehen zu Hunderten: LOD0 bis 1,5 x Grundabstand (Mittel ~45 Einheiten), dann LOD1
A = asset.begin('wall_high_arm', target={'wall': 'WallHigh', 'piece': 'arm'}, footprint=(1, 1), klass='wall', lod_dist=(1.5,),
                desc='Hohe Steinmauer, Arm: Bruchstein mit Anlauf, Sockel mit Wasserschlag, Gesims, Wehrgang mit Bruestungen, Ruest-/Balkenloecher')
A.noise_mirror_y = True
W.add_all(A, W.arm_pieces(0.0, 0.5, random.Random(31)), lambda o: K.wall_uv(o, W.TILE))
asset.finish(A)
