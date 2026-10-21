# Assets – Herkunft und Lizenz

Alle Modelle, Texturen und Skripte sind Eigenerstellung des Projekts StrongPoly (Blender-Python-Skripte, prozedurale
Texturen); es werden keine fremden Modelle, Texturen, Scans, HDRIs oder Marken verwendet. Manor Lords dient nur als
Qualitätsreferenz.

## Umgebung (Teilschritt 5: Terrain, Vegetation, Licht)

| Datei(en) | Quelle | Herkunft / Lizenz |
| --- | --- | --- |
| `public/assets/models/veg_oak_{a,b,c}.glb`, `veg_birch_{a,b,c}.glb`, `veg_spruce_{a,b,c}.glb` | `assets/blender/models/veg_trees.py` | Eigenerstellung (prozedurales Skelett, Blattkarten) |
| `public/assets/models/veg_grass_{a,b}.glb`, `veg_flowers_{a,b}.glb`, `veg_fern_a.glb`, `veg_bush_{a,b}.glb` | `assets/blender/models/veg_ground.py` | Eigenerstellung |
| `public/assets/models/veg_rock_{a,b,c,d}.glb` | `assets/blender/models/veg_rocks.py` | Eigenerstellung (verformte Ikosaeder, Cycles-AO) |
| `public/assets/models/veg_fence_rail.glb`, `veg_fence_wattle.glb`, `veg_garden_bed.glb`, `veg_log.glb` | `assets/blender/models/veg_props.py` | Eigenerstellung |
| `public/assets/textures/M_Foliage_Conifer/*`, `M_Flora/*` (Quellen `assets/src/textures/…`) | `assets/blender/tools/veg_textures.py` | Eigenerstellung (numpy/Pillow, feste Seeds) |
| Himmel/Umgebungslicht (zur Laufzeit) | `packages/client/src/render/env/atmosphere.ts` | prozedural, kein HDRI |
| Ersatz-Laubatlas bei fehlender Textur (zur Laufzeit, Canvas) | `packages/client/src/render/env/veg_material.ts` | prozedural |

Genutzte Bibliotheksmaterialien des Material-Agenten (`M_Bark`, `M_Foliage`, `M_Ground_*`, `M_Rock`, `M_Timber_Oak`,
`M_Wood_Planks`) sind dort aufgeführt.
