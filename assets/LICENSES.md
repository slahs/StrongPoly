# Assets – Herkunft und Lizenz

Alle Modelle, Texturen und Skripte sind Eigenerstellung des Projekts StrongPoly (Blender-Python-Skripte, prozedural);
keine fremden Modelle, Texturen, Scans oder Marken. Manor Lords dient nur als Qualitätsreferenz.

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
