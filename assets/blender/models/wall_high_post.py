"""Mauerstueck 'post' der Hohen Steinmauer (BT.WallHigh): Kachelmitte, fuellt Ecken/T-Stoesse, vier Zinnen (zwei mit Scharte).
Geometrie und Nahtregeln: wall_high_parts.py.

Aufruf:  /home/user/bpyenv/bin/python assets/blender/models/wall_high_post.py [--fast] [--no-preview]
"""
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from sp import asset  # noqa: E402
import castle_kit as K  # noqa: E402
import wall_high_parts as W  # noqa: E402

A = asset.begin('wall_high_post', target={'wall': 'WallHigh', 'piece': 'post'}, footprint=(1, 1), klass='wall', lod_dist=(1.5,),
                desc='Hohe Steinmauer, Pfosten: Kern fuer Ecken/T-Stoesse (im geraden Lauf verdeckt), vier Zinnen mit Abdeckplatten, zwei mit Scharte')
A.noise_mirror_y = True
W.add_all(A, W.post_pieces(random.Random(37)), lambda o: K.finish_uv(o, tile=W.TILE))
asset.finish(A)
