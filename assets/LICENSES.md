# StrongPoly – Herkunft und Lizenzen der Assets (Phase 5A)

Grundsatz: Alle Modelle, Texturen und Skripte sind Eigenerstellung dieses Projekts. Es werden keine
fremden Modelle, Texturen, Fotos, Scans oder Marken übernommen (Manor Lords dient ausschließlich als
Qualitätsreferenz). Fremdquellen wären nur als CC0 mit Nachweis zulässig – derzeit gibt es keine.

## Materialbibliothek (`packages/client/public/assets/textures/M_*/`)

| Dateien | Herkunft | Lizenz |
|---|---|---|
| `M_*/albedo_*.ktx2`, `normal_*.ktx2`, `orm_*.ktx2`, `material.json`, `library.json` | vollständig prozedural erzeugt durch `assets/blender/materials/M_*.py` (Geometrie + Shader in Blender, Cycles-Render der Draufsicht, numpy-Nachbearbeitung, Kodierung mit basisu) | Eigenerstellung StrongPoly; keine Fremdinhalte |
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
| basisu (npm `basis_universal@1.16.4-1`, Binomial Basis Universal 1.16.4) | 1.16.4 | Apache-2.0 | KTX2-Kodierung (ETC1S/UASTC) |

Laufzeit-Dekodierung (Sache der Pipeline): three.js `KTX2Loader` mit Basis-Transcoder aus dem
three-Paket (MIT / Apache-2.0).
