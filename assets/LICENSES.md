# Assets – Herkunft und Lizenz

Alle Modelle, Texturen und Skripte unter `assets/` und `packages/client/public/assets/` sind Eigenerstellung des Projekts
StrongPoly (Blender-Python-Skripte, prozedural erzeugt). Keine fremden Modelle, Texturen, Scans oder Marken; Manor Lords
dient nur als Qualitätsreferenz. Fremdquellen wären nur mit CC0-Nachweis zulässig (bisher keine).

## Gebäude (Stadt)

| Asset | Ziel | Quelle (Skript) | Bearbeitbare Quelle | Ausgabe | Lizenz |
| --- | --- | --- | --- | --- | --- |
| `hovel` | `BT.Hovel` (Grundmodell) | `assets/blender/models/hovel.py` | `assets/src/hovel.blend` | `public/assets/models/hovel.glb`, `assets/previews/hovel_*.jpg` | Eigenerstellung |
| `hovel_b` | `BT.Hovel`, Variante 1 | `assets/blender/models/hovel.py --variant=b` | `assets/src/hovel_b.blend` | `public/assets/models/hovel_b.glb`, `assets/previews/hovel_b_*.jpg` | Eigenerstellung |
| `bakery` | `BT.Bakery` | `assets/blender/models/bakery.py` | `assets/src/bakery.blend` | `public/assets/models/bakery.glb`, `assets/previews/bakery_*.jpg` | Eigenerstellung |
| `blacksmith` | `BT.Blacksmith` | `assets/blender/models/blacksmith.py` | `assets/src/blacksmith.blend` | `public/assets/models/blacksmith.glb`, `assets/previews/blacksmith_*.jpg` | Eigenerstellung |

Gemeinsamer Baukasten: `assets/blender/lib/sp/town.py` (Eigenerstellung). Die Materialien sind nur als Namen der
Bibliothek (`assets/materials.json`) referenziert; Texturen stammen aus der Materialbibliothek.
