# StrongPoly – Asset-Pipeline (Phase 5A) – verbindliche Konventionen

Entwurf des Koordinators; der Pipeline-Agent präzisiert und ergänzt (Abschnitte als „ergänzt“ markieren), Konventionen nur in Absprache ändern.

## Werkzeuge
- Authoring: **Blender 5.2.2 LTS als Python-Modul** (`bpy` von PyPI, kein GUI nötig). Einrichtung: `python3 -m venv ~/bpyenv && ~/bpyenv/bin/pip install bpy==5.2.2` (in dieser Umgebung bereits unter `/home/user/bpyenv`). Alle Assets entstehen aus **Python-Skripten** (reproduzierbar) und werden zusätzlich als `.blend` gespeichert (bearbeitbare Quelle).
- Laufzeit: three.js 0.170 (`GLTFLoader`, optional `KTX2Loader`/`meshopt`), keine Engine-Änderung.

## Verzeichnisse
- `assets/blender/lib/` – gemeinsame Python-Bibliothek (Szenen-Setup, Materialien, Bake, Export, LOD, Prüfungen)
- `assets/blender/materials/` – Skripte der Materialbibliothek (prozedural → gebackene PBR-Texturen)
- `assets/blender/models/<asset>.py` – je Asset ein Skript (Geometrie + Materialzuweisung + LOD + Export)
- `assets/src/<asset>.blend`, `assets/src/materials/<mat>.blend` – gespeicherte bearbeitbare Quellen (Git LFS nicht verfügbar → Größe beachten, ggf. nur Skripte + kleine .blend)
- `packages/client/public/assets/models/<asset>.glb` – exportierte Modelle (LOD0/LOD1/LOD2 als Knoten im selben GLB oder getrennte Dateien, siehe Pipeline-Agent)
- `packages/client/public/assets/textures/<mat>/` – Laufzeit-Texturen (`albedo`, `normal`, `orm` = R: AO, G: Roughness, B: Metallic nach glTF-Konvention)
- `packages/client/public/assets/manifest.json` – Register (Asset-ID → Datei, LODs, Footprint, Ankerpunkte, Materialien, Dreiecke, Lizenz)
- `assets/LICENSES.md` – Herkunft/Lizenz jeder Datei (alles Eigenerstellung; Fremdquellen nur CC0 mit Nachweis)

## Maßstab und Achsen
- 1 Blender-Einheit = 1 Spiel-Einheit = 1 Kachel (Tile). Eine Figur ist ca. 0,95 Einheiten hoch (≈ 1,75 m) → 1 Einheit ≈ 1,85 m. Gebäude sind RTS-typisch leicht gestaucht, aber Türen/Fenster/Stufen müssen zur Figur passen (Tür ≈ 1,1–1,2 Einheiten hoch).
- Blender Z-oben, Export glTF Y-oben (Standard des Exporters). Ursprung: Mitte des Footprints auf Bodenhöhe 0. Vorderseite (Eingang) zeigt nach +Y in Blender (= −Z in three nach Export? → Pipeline-Agent legt fest und dokumentiert, Abgleich mit den bestehenden Modellen: Rotation `b.r`).
- Footprint = `BUILDINGS[type].w × h` Tiles; das Modell darf den Footprint nur mit Dachüberständen geringfügig überschreiten.

## Materialien
- glTF-PBR metallic-roughness. Gemeinsame Bibliothek (Namen fix): `M_Stone_Ashlar` (Quader), `M_Stone_Rubble` (Bruchstein), `M_Stone_Cobble` (Pflaster), `M_Plaster_Lime` (Kalkputz, leicht verschmutzt), `M_Timber_Oak` (Balken, gealtert), `M_Wood_Planks` (Bretter/Türen), `M_Roof_ClayTile`, `M_Roof_Thatch`, `M_Roof_Shingle`, `M_Iron_Wrought`, `M_Cloth_Linen`, `M_Cloth_Wool`, `M_Leather`, `M_Ground_Grass`, `M_Ground_Dirt`, `M_Ground_Path`, `M_Rock`, `M_Bark`, `M_Foliage` (Alpha-Karten). Weitere nur bei Bedarf.
- Texeldichte Richtwert: 256 px je Spiel-Einheit für Gebäude (LOD0, Mittel), Kacheltexturen 1024² (Hoch: 2048² optional), Figuren eigener Atlas 512²–1024².
- Kachelbare Texturen + Vertexfarben/zweiter UV-Kanal für Variation (Schmutz am Sockel, Kantenabnutzung, AO-Bake) – „Gebrauchsspuren“ ohne eindeutige Texturen pro Gebäude.

## LOD und Budgets (Richtwerte, Pipeline-Agent präzisiert)
- Gebäude: LOD0 (nah) Bergfried ≤ 25k Dreiecke, Fachwerkhaus/Produktion ≤ 8k, Mauerstück ≤ 1,5k, Tor ≤ 6k; LOD1 ≈ 35 %, LOD2 ≈ 10 % bzw. Silhouette.
- Figuren: LOD0 ≤ 2,5k, LOD1 ≤ 800, LOD2 ≤ 250. Animation kompatibel zur bestehenden Pivot-/Vertex-Shader-Architektur (Teile-ID als Vertex-Attribut) ODER begründete Alternative.
- Draw-Calls: Instancing je (Asset, LOD, Material); Materialanzahl je Asset klein halten (Atlas/Trim-Sheets bevorzugt).

## Lizenz
Alle Modelle/Texturen/Skripte sind Eigenerstellung dieses Projekts. Keine Übernahme fremder Modelle, Texturen, Scans oder Marken (Manor Lords ist nur Qualitätsreferenz).
