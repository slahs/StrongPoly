# StrongPoly – Herkunft und Lizenz der Assets

Alle Modelle, Texturen und Skripte sind Eigenerstellung dieses Projekts (prozedural in Blender per Skript erzeugt). Keine
Übernahme fremder Modelle, Texturen, Scans oder Marken; Manor Lords dient nur als Qualitätsreferenz. Fremdquellen nur CC0
mit Nachweis (derzeit keine).

## Burg (Bergfried, Hohe Steinmauer, Steintor)

| Datei(en) | Herkunft | Lizenz |
| --- | --- | --- |
| `assets/blender/models/castle_kit.py`, `wall_high_parts.py` | Eigenerstellung (gemeinsame Bausteine: Öffnungen, Werksteine, Bögen, Schindeldeckung, Mauerprofile) | Projektlizenz StrongPoly |
| `assets/blender/models/keep.py` → `assets/src/keep.blend`, `packages/client/public/assets/models/keep.glb`, `assets/registry/keep.json`, `assets/previews/keep_*.jpg` | Eigenerstellung (Skript + Blender 5.2.2, Cycles-AO-Bake) | Projektlizenz StrongPoly |
| `assets/blender/models/gate_stone.py` → `gate_stone.blend/.glb/.json`, `assets/previews/gate_stone_*.jpg` | Eigenerstellung | Projektlizenz StrongPoly |
| `assets/blender/models/wall_high_{arm,post,stub}.py` → `wall_high_*.blend/.glb/.json`, `assets/previews/wall_high_*.jpg` | Eigenerstellung | Projektlizenz StrongPoly |
| Materialien (`M_Stone_Rubble`, `M_Stone_Ashlar`, `M_Timber_Oak`, `M_Wood_Planks`, `M_Roof_Shingle`, `M_Iron_Wrought`, `M_Cloth_Linen`) | nur Namen im GLB; Texturen aus der gemeinsamen Materialbibliothek (siehe dort) | – |

## Gebäude (Stadt)

| Asset | Ziel | Quelle (Skript) | Bearbeitbare Quelle | Ausgabe | Lizenz |
| --- | --- | --- | --- | --- | --- |
| `hovel` | `BT.Hovel` (Grundmodell) | `assets/blender/models/hovel.py` | `assets/src/hovel.blend` | `public/assets/models/hovel.glb`, `assets/previews/hovel_*.jpg` | Eigenerstellung |
| `hovel_b` | `BT.Hovel`, Variante 1 | `assets/blender/models/hovel.py --variant=b` | `assets/src/hovel_b.blend` | `public/assets/models/hovel_b.glb`, `assets/previews/hovel_b_*.jpg` | Eigenerstellung |
| `bakery` | `BT.Bakery` | `assets/blender/models/bakery.py` | `assets/src/bakery.blend` | `public/assets/models/bakery.glb`, `assets/previews/bakery_*.jpg` | Eigenerstellung |
| `blacksmith` | `BT.Blacksmith` | `assets/blender/models/blacksmith.py` | `assets/src/blacksmith.blend` | `public/assets/models/blacksmith.glb`, `assets/previews/blacksmith_*.jpg` | Eigenerstellung |

Gemeinsamer Baukasten: `assets/blender/lib/sp/town.py` (Eigenerstellung). Die Materialien sind nur als Namen der
Bibliothek (`assets/materials.json`) referenziert; Texturen stammen aus der Materialbibliothek.

## Materialbibliothek (`packages/client/public/assets/textures/M_*/`)

| Dateien | Herkunft | Lizenz |
|---|---|---|
| `M_*/{albedo,normal,orm}[_1024,_512].webp` | vollständig prozedural erzeugt durch `assets/blender/materials/M_*.py` (Geometrie + Shader in Blender, Cycles-Render der Draufsicht, numpy-Nachbearbeitung), WebP-Kodierung mit `assets/blender/tools/textures.py` (Pillow/libwebp) | Eigenerstellung StrongPoly; keine Fremdinhalte |
| Einträge `M_*` in `assets/materials.json` (tile, Rückfallwerte, `info`) | aus denselben Skripten | Eigenerstellung |
| `assets/src/textures/M_*/*.png` (nicht eingecheckt, reproduzierbar) | verlustfreie Quellen derselben Skripte | Eigenerstellung |
| `assets/blender/materials/*.py`, `scripts/assets/build-materials.sh` | Eigenerstellung | Projektlizenz |
| `assets/src/materials/*.blend` (falls vorhanden, < 5 MB) | vom Skript gespeicherte Quellszene | Eigenerstellung |
| `docs/phase5a/materials/*.jpg` | Cycles-Vorschaurenderings der eigenen Texturen | Eigenerstellung |

Es gibt keine Bildvorlagen: Muster, Farben und Formen entstehen ausschließlich aus Zufallszahlen mit
festem Seed (numpy, Blender-Rauschknoten) und modellierter Geometrie.

## Werkzeuge (nur zur Erzeugung, nicht im Spiel ausgeliefert)

| Werkzeug | Version | Lizenz | Hinweis |
|---|---|---|---|
| Blender (`bpy` von PyPI) | 5.2.2 LTS | GPL-2.0-or-later | Mit Blender erzeugte Inhalte (Renderings, Texturen, .blend-Daten) unterliegen nicht der GPL und gehören dem Ersteller. |
| numpy / scipy | 2.x / 1.x | BSD-3-Clause | Rauschen, Voronoi, Filter |
| Pillow | 13 | MIT-CMU (HPND) | PNG/JPEG/WebP |
| OpenEXR (Python) | 3.5 | BSD-3-Clause | Lesen der Render-Passes |
| basisu (npm `basis_universal@1.16.4-1`, Binomial Basis Universal 1.16.4) | 1.16.4 | Apache-2.0 | nur optionale KTX2-Messung (nicht ausgeliefert) |

Laufzeit-Dekodierung (Sache der Pipeline): three.js `KTX2Loader` mit Basis-Transcoder aus dem
three-Paket (MIT / Apache-2.0).

## Figuren (Bauer, Speerkämpfer)

| Datei | Herkunft | Lizenz |
| --- | --- | --- |
| `assets/blender/lib/sp/figure.py`, `human.py`, `gear.py`, `figpreview.py` | Eigenerstellung (Figuren-Baukasten: Loft aus Querschnitten, Kopf/Gesicht, Kleidung, Werkzeuge, Waffen, Vorschau) | Projektlizenz StrongPoly |
| `assets/blender/models/peasant.py` → `packages/client/public/assets/models/peasant.glb`, `assets/src/peasant.blend`, `assets/registry/peasant.json`, `assets/previews/peasant_*.jpg` | Eigenerstellung (Skript, Blender 5.2.2 headless) | Projektlizenz StrongPoly |
| `assets/blender/models/spearman.py` → `packages/client/public/assets/models/spearman.glb`, `assets/src/spearman.blend`, `assets/registry/spearman.json`, `assets/previews/spearman_*.jpg` | Eigenerstellung (Skript, Blender 5.2.2 headless) | Projektlizenz StrongPoly |
| Material `M_Figure` (`assets/materials.json`, ohne Textur: Haut, Haar, Holz, Stroh, ferne LOD-Stufen) | Eigenerstellung | Projektlizenz StrongPoly |
| `docs/phase5a/assets/figures/*.jpg` | Aufnahmen aus dem eigenen Renderer bzw. Cycles-Vorschau | Projektlizenz StrongPoly |

Die Figuren nutzen außerdem die Bibliotheksmaterialien `M_Cloth_Linen`, `M_Cloth_Wool`, `M_Leather`, `M_Iron_Wrought`
(Herkunft siehe Abschnitt Materialbibliothek).
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
