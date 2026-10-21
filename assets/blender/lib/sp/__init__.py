"""StrongPoly-Assetbibliothek fuer Blender (bpy als Python-Modul, headless).

Einstieg fuer Asset-Skripte (assets/blender/models/<asset>.py):

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lib'))
    from sp import asset, mesh, uv, anchors

    A = asset.begin('well', target={'building': 'Well'}, footprint=(1, 1), budget=(3000, 1200, 300))
    ring = mesh.cylinder(...); A.add(ring, mat='M_Stone_Rubble', uv='box')
    ...
    asset.finish(A)      # Pruefungen, LODs, Attribute, AO-Bake, Vorschau, .blend, GLB, Registereintrag

Konventionen (Massstab, Achsen, Attribute, Namen) stehen in assets/PIPELINE.md; die Konstanten in config.py.
"""
