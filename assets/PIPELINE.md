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

---

## Präzisierung durch den Pipeline-Agenten (ergänzt)

Begründungen und Messwerte: `docs/phase5a/ARCHITECTURE.md`. Abweichungen vom Entwurf oben sind hier ausdrücklich markiert.

### Werkzeuge (ergänzt)
- Blender als Python-Modul: **Cycles CPU** für AO-Bake und Vorschau; **EEVEE ist headless nicht verfügbar** (libEGL fehlt, der Prozess bricht ab). Die PyPI-Fassung enthält **keine Draco-/Meshopt-Bibliothek** (Exporter meldet das, Export funktioniert trotzdem unkomprimiert).
- Gemeinsame Bibliothek `assets/blender/lib/sp/` (Python-Paket `sp`): `scene` (Zurücksetzen, Einheiten), `materials` (Platzhalter M_* aus `assets/materials.json`), `mesh` (gefaste Quader, Balken zwischen Punkten, Zylinder/Ringe, Prismen, Bruchsteine, Rauschen, Durchhang, Glätten mit harten Kanten), `uv` (Box-/Zylinderprojektion im Weltmaß), `attrs` (Vertexattribute), `bake` (AO in die Vertexfarbe), `anchors`, `checks`, `preview`, `asset` (Ablauf). Werkzeug Texturen: `assets/blender/tools/textures.py`.

### Verzeichnisse (ergänzt)
- `assets/registry/<id>.json` – Registereintrag je exportiertem Asset (schreibt `sp.asset.finish`), Quelle des Manifests
- `assets/previews/<id>_{front,rts}.jpg` – Cycles-Vorschau je Asset
- `assets/src/textures/<M_Name>/{albedo,normal,orm}.png` – verlustfreie Texturquellen (nicht ausgeliefert)
- `packages/client/public/assets/manifest.json` – **erzeugt** von `node scripts/asset-manifest.mjs` (nie von Hand; Test prüft Aktualität)

### Maßstab und Achsen (festgelegt)
- **Vorderseite (Eingang) zeigt nach Blender −Y** (Blender-Vorderansicht, Numpad 1) = three **+Z** = Front der prozeduralen Modelle (`building_parts.ts`) bei Drehung `b.r = 0`; `b.r = 1` dreht im Spiel um +90° (Front → +X). *(Entwurf oben: „+Y“ – geändert.)*
- Breite `def.w` entlang Blender X, Tiefe `def.h` entlang Blender Y, Ursprung Footprint-Mitte auf z = 0. Alles unter z = 0 verdeckt das Gelände (Schächte, Fundamente nur andeuten).
- Eigene Vektorattribute rechnet der glTF-Exporter NICHT um: `sp.config.to_gltf()` benutzen (passiert in `sp.attrs` automatisch).
- Mauerstücke wie `wallParts` (`models_castle.ts`): Pfosten um den Ursprung, Arm von x = 0 bis x = 0,5 (Richtung +X), Laufhöhe = `BUILDINGS[t].height`.

### Vertexattribute (Schnittstelle Blender → Laufzeit)
| GLB | Inhalt | Laufzeit (`render/assets/model.ts`) |
| --- | --- | --- |
| `COLOR_0` (Farbattribut `Data`, FLOAT_COLOR, Ecken) | R Ambient Occlusion (gebacken, 1 = frei), G Schmutz 0..1, B Kantenabnutzung 0..1, A Teamfarbe (1 = Spielerfarbe) | `aData` |
| `_BUILD` (vec3) + `_BUILDH` (float) | Bauzeitfenster s0, s1 (0..1) und Unterkante y0 / Höhe h des Teils (= Blender-Objekt) | `aBuild` = (s0, s1, y0, h) wie `builder.ts` |
| `_PART` (float) + `_PIVOT` (vec3, glTF-Raum) | Teil-Kennung (`sp.config.PART` = `materials.ts PART`/`unit_shader.ts UPART`) und Drehpunkt | `aPivot` = (Drehpunkt, Teil) – nur exportiert, wenn das Asset bewegte Teile hat |
| `_STYLE` (vec3) + `_SLOT` (float), `_ARM` (float) | nur Figuren: Farbklasse, Sichtbarkeitsmaske, Hüft-/Oberkörperhöhe, Slot; Armstil | `aStyle`, `aMeta.z` |
- Keine weiteren FLOAT_COLOR-Attribute für Daten verwenden: der Exporter schreibt sie zusätzlich als `COLOR_n`.

### Materialien (ergänzt)
- Einzige Quelle der Namen und Rückfallwerte: `assets/materials.json` (`base` sRGB, `rough`, `metal`, `tile` = Weltmaß einer Texturwiederholung, `dirt` = Schmutzfarbe, optional `alphaTest`, `doubleSided`, `normalScale`). Im GLB zählt nur der Materialname; die Laufzeit ersetzt jedes glTF-Material durch ihr gemeinsames Material gleichen Namens.
- UVs: `sp.uv.box/cylindrical` erzeugen Weltmaß ÷ `tile` (eine UV-Einheit = eine Wiederholung). Ändert sich `tile`, Asset neu exportieren.
- Laufzeittexturen: `public/assets/textures/<M_Name>/{albedo,normal,orm}.webp` (+ `_512`, `_1024` Fassungen, erzeugt von `assets/blender/tools/textures.py` aus `assets/src/textures`). Albedo sRGB, Normal **OpenGL-Konvention (Y+, Blender-Standard)**, ORM linear: R AO, G Rauheit, B Metall. Gefundene Formate in der Reihenfolge `ktx2 > webp > jpg > png` (KTX2 nur mit Transcoder unter `public/assets/basis/`, Phase 5B).

### LOD (ergänzt)
- Ein GLB mit Knoten `LOD0`, `LOD1`, `LOD2` (jeweils ein Mesh, ein Primitive je Material). Regeln je Objekt in `A.add(..., lod1=, lod2=, only=)`: `'keep'`, `'drop'`, Verhältnis 0..1 (Decimate, nie unter 12 Dreiecke), `('planar', Grad)`, oder Ersatzform mit `only=1|2`. Ohne Angabe: Teile < 6 cm (LOD1) bzw. < 18 cm (LOD2) entfallen, ≤ 16 Dreiecke bleiben, sonst Decimate 35 % / 10 %.
- Budgets: `sp.config.BUDGETS` (keep, house, production, wall, gate, small, figure, prop); Überschreitung bricht den Export ab.
- Laufzeit: Grenzen `assetLod0`/`assetLod1` in `quality.ts` (Mittel 30/72, Hoch 44/105, Niedrig nur LOD1/LOD2 mit Grenze 34) × Größenfaktor 0,7–2,2 (Bounding-Box-Diagonale / 3,2, überschreibbar mit `lod_dist` im Register), Hysterese ±3 Einheiten.

### Ankerpunkte (ergänzt)
- `sp.anchors.anchor(art, (x, y, z), **extras)` → glTF-Knoten `ANCHOR_<art>_<n>` mit `extras`. Emitter-Arten wie `work_fx.ts`: `smoke`, `smokeDark`, `steam`, `flame`, `sparks`, `anvil`, `dust`, `flour`, `chips` (extras `rate` = Partikel/s, `staffed` = nur mit Arbeiter); Merkpunkte `flag`, `banner`, `door`, `work`, `fx`. Hat ein Gebäude-Asset Emitter-Anker, ersetzen sie die Tabelle `EMITTERS` für diesen Typ.

### Prüfungen beim Export (`sp.checks`)
- Quellobjekte: Skalierung angewandt, nur Bibliotheksmaterialien, UVs vorhanden. Bounding-Box gegen Footprint (± 0,35), Ursprung mittig, nicht schwebend.
- Je LOD: Dreiecke ≤ Budget, Normalen (geschlossene Teile nach außen), entartete Flächen, Attribute vorhanden; danach im GLB jedes Primitive mit `POSITION, NORMAL, TEXCOORD_0, COLOR_0, _BUILD, _BUILDH` (+ `_PART/_PIVOT`).
- Manifest: `validateManifest` (Laufzeit und Test) prüft Dateien, LOD-Folge, Footprint gegen `BUILDINGS`, Materialien, doppelte Ziele.

### Befehle
```bash
/home/user/bpyenv/bin/python assets/blender/models/<id>.py            # Asset bauen: .blend, GLB, Register, Manifest, Vorschau
/home/user/bpyenv/bin/python assets/blender/models/<id>.py --fast --no-preview   # schneller Durchlauf beim Modellieren
/home/user/bpyenv/bin/python assets/blender/tools/textures.py          # Texturquellen → WebP (+ _512/_1024), Manifest
node scripts/asset-manifest.mjs [--check]                              # Manifest neu schreiben / prüfen
pnpm build && node scripts/lookdev.mjs --styles=classic,medieval --qualities=medium --check   # LookDev-Aufnahmen
```

### Neues Asset – Schritt für Schritt
1. `assets/blender/models/<id>.py` anlegen (Vorlage `well.py`): `A = asset.begin('<id>', target={'building': '<BT-Name>'}, footprint=(w, h), klass='house')`; Teile modellieren (`sp.mesh`), je Teil `A.add(obj, mat='M_…', uv_mode='box'|'cyl', part=…, team=…, lod1=…, lod2=…)`; Anker setzen; `asset.finish(A)`.
2. Ausführen (s. o.). Ergebnis prüfen: Tabelle „Teil / LOD0 / LOD1 / LOD2“ in der Ausgabe, `assets/previews/<id>_*.jpg`.
3. Ziel im Register: `target` = `{'building': 'Keep'}` | `{'wall': 'WallHigh', 'piece': 'arm'|'post'|'stub'}` | `{'unit': 'Peasant'}` | `{'prop': '<name>'}` (kein Spielobjekt, nur LookDev/Dekor). Ein Ziel darf nur EIN Asset haben.
4. Im Spiel/LookDev erscheint es automatisch im Stil `medieval`: `/?lookdev=medieval&cam=3a-building`, `/?quick=1&style=medieval`. Fehlt es in der Referenzsiedlung, Zeile in `LOOKDEV_LAYOUT` (`packages/client/src/lookdev_scene.ts`) ergänzen.
5. `pnpm test` (prüft Manifest/GLB), committen: Skript, `.blend`, GLB, Registereintrag, Manifest, Vorschau.

---

## Vegetation und Umgebung (Teilschritt 5, ergänzt)

Begründungen, Messwerte und Bilder: `docs/phase5a/ENVIRONMENT.md`.

### Exportweg `sp.veg` (neben `sp.asset`)
- Vegetation und Umgebungs-Requisiten entstehen als **Daten** (`sp.veg.VMesh`: Ecken, Flächen, je Ecke UV/Normale/Datenfarbe) –
  Hunderte Blattkarten je Baum wären als Blender-Objekte zu langsam. `veg.tube` (Äste/Stämme/Ruten mit Rinden-UV),
  `veg.card` (Blattkarte, optional geknickt), `veg.export(id, [LOD0, LOD1, LOD2], klasse, …)` schreibt GLB, Registereintrag
  (gleiches Schema, Ziel `{'prop': id}`, zusätzlich `veg` = Klasse/Art/Rolle und `uvTile` = Kachelgröße je Material beim
  Export) und auf Wunsch die `.blend` (`assets/src/veg/`). Kein `_BUILD/_PART` (Vegetation ist kein Gebäude).
- Skripte: `assets/blender/models/veg_trees.py` (Eiche, Birke, Fichte je 3 Varianten), `veg_ground.py` (Gras, Blumen,
  Farn, Büsche), `veg_rocks.py` (Findling, Fels, Platte, Lesesteine), `veg_props.py` (Holzzaun, Flechtzaun, Gemüsebeet,
  liegender Stamm); Texturen der Vegetation, die nicht in der Materialbibliothek liegen: `assets/blender/tools/veg_textures.py`
  (`M_Foliage_Conifer` Nadelzweig, `M_Flora` Farbpalette) → `tools/textures.py`.
- Budgets (`sp.veg.BUDGETS`, Export bricht ab): Baum 6000/1500/300 (Karten zählen), Busch 2400/700/160, Flora 420/140/40,
  Fels 1500/500/150, Requisit 1500/600/150.

### Datenfarbe der Vegetation (COLOR_0 → `aData`)
| Kanal | Bedeutung |
| --- | --- |
| R | AO (Bäume analytisch aus der Lage in der Krone, Felsen/Zäune per Cycles-Bake) |
| G | Biegsamkeit für den Wind (0 starr … 1 Zweig-/Halmspitze); Felsen: Moosanteil |
| B | Zufallswert je Zweig/Karte/Halm (Flatterphase, Farbvariation) |
| A | Laub/Flora: Durchlicht; `M_Bark`: Birkenrinde (1 = weiß, 0 = Borke) |

### Konventionen
- Blattkarten: Atlas `M_Foliage` 2×2 (Eiche/Buche/Strauch/Birke, Blender-UV unten links), Kartenbasis = Zweigansatz unten Mitte;
  Normalen der Karten zeigen von der Kronenmitte nach außen (weiche Kronenbeleuchtung), Rückseiten werden zur Laufzeit NICHT
  umgedreht.
- `M_Flora`: Palette, U = Spalte (16 Farben, siehe `veg_textures.py PALETTE`), V = Basis (0) → Spitze (1). Gras/Blumen/Farn
  sind Geometrie ohne Alpha (kein Overdraw durch Alpha-Test in dichtem Gras).
- Holz-Röhren: Maserung entlang U (`tube(..., swap_uv=True)`), Rinde: V entlang der Achse.
- Zaunstücke: 1 Einheit lang entlang +X (−0,5 … +0,5), Pfosten am Anfang; im LookDev als `propLine` aneinandergereiht.
- Laufzeit (`render/env/`): ein Material je Bibliotheksname für alle Vegetations-Assets (`veg_material.ts`), Instancing je
  (Asset × LOD × Material) (`veg_layer.ts`), Verteilung rein/deterministisch (`veg_place.ts`), LOD-Grenzen `VEG_LOD` × Stufe.
