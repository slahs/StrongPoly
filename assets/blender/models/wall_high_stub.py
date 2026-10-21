"""Mauerstueck 'stub' der Hohen Steinmauer (BT.WallHigh): Einzelpfeiler ohne Nachbarn, umlaufende Bruestung, vier Zinnen.
Geometrie: wall_high_parts.py.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/wall_high_stub.py [--fast] [--no-preview]
"""
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from sp import asset  # noqa: E402
import castle_kit as K  # noqa: E402
import wall_high_parts as W  # noqa: E402

A = asset.begin('wall_high_stub', target={'wall': 'WallHigh', 'piece': 'stub'}, footprint=(1, 1), klass='wall', lod_dist=(1.5,),
                desc='Hohe Steinmauer, Einzelpfeiler: Sockel, Bruchsteinkern mit umlaufender Bruestung, vier Zinnen, Abdeckplatten')
A.noise_mirror_y = True
W.add_all(A, W.post_pieces(random.Random(41), stub=True), lambda o: K.finish_uv(o, tile=W.TILE))
asset.finish(A)
