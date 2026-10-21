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

## Materialbibliothek (Material-Agent, ergänzt)

Alle 19 Bibliotheksmaterialien sind vollständig prozedural in Blender erzeugt (keine Fotos/Scans/Fremdtexturen).
Skripte: `assets/blender/materials/M_*.py` + gemeinsame Hilfen `_common.py`; Bau: `scripts/assets/build-materials.sh [M_Name …]`.

### Verfahren
1. **Echte Quellgeometrie je Material** (deterministisch, feste Seeds): Quader mit gerundeten, verwitterten Kanten und
   muscheligen Abplatzungen (Kugel-Ausschnitte) im Fugenbett; Bruch-/Pflastersteine als dicht gepackte, gerundete Körper
   (gewichtete periodische Voronoi-Packung); Biberschwanzziegel und Holzschindeln als geschlossene, geneigte, überlappende
   Einzelkörper; Stroh (~29 000 Halme), Leinen/Wolle (Fäden in Leinwand-/Köperbindung, Flaum) und Zweige als
   Cycles-3D-Kurven; Gras (~105 000 Halmstreifen, ~2 600 Kleepflanzen, Wegerich-Rosetten) und Laub (einzeln modellierte, gefaltete Blätter an
   Zweigen) als Netze; Holz, Putz, Eisen, Leder, Erde, Weg, Fels, Rinde als Höhenfeld-Ebene mit ~1 Mio. Vertices aus
   periodischen Feldern (Maserung, Kellenzüge, Hammerschläge, Narben, Schollen, Fahrspuren, Bruchfacetten, Furchen).
   Feinstruktur (Korn, Poren, Fasern, Riefen) per Shader-Bump in Metern.
2. **Kachelbarkeit:** Inhalt der Kachel liegt in der Sammlung `TILE`, die 8-mal um ±T versetzt instanziert wird
   (Überhänge, Schatten/AO über die Ränder); Shader-Rauschen über Torus-Abbildung (4D-Rauschen), numpy-Felder per
   Spektralsynthese/periodischem Worley. Nahtprüfung: 2×2-Kachelung + Kennzahl Randsprung/Nachbarsprung (Arbeitsordner
   `seam_2x2.jpg`, Kennzahl > 1 nur dort, wo eine Fuge exakt auf dem Rand liegt – sichtgeprüft ohne Naht).
3. **„Bake“ per Draufsicht:** orthografische Kamera exakt über einer Kachel, Cycles CPU (2 Threads, 2048², 8–16 spp – bei stark ausgelastetem
   Rechner; Eisen, Leder, Wolle, Laub direkt 1024² –, ohne Lichtsprünge): Normal-Pass (Weltraum = Tangentenraum der Draufsicht, inkl. Bump), AO-Pass (Reichweite je
   Material 0,1–6 cm), AOVs `albedo` (ohne Licht), `rough`, `metal`, `height`. Laub-Atlas mit Alpha (Film transparent,
   Farbränder per nächstem Nachbarn aufgefüllt gegen dunkle Säume).
4. **Nachbearbeitung (numpy):** Albedo linear → sRGB; Normal OpenGL (+Y oben), normiert; ORM = R AO (leicht geglättet),
   G Rauheit, B Metall; Höhe 0..1 über `info.heightMm`. Für sehr tiefe Strukturen (Dach-, Stroh-, Gras-, Laub-, Rinden- und
   Stoffmaterialien) ist ein Teil der AO in die Albedo eingerechnet (`albedo_ao` 0,3–0,7), weil three die `aoMap` nur auf
   indirektes Licht anwendet. Downscale mit Normalen-Renormierung und Toksvig-Anpassung der Rauheit.
5. **Ausgabe nach Pipeline-Konvention:** verlustfreie Quellen `assets/src/textures/<M>/{albedo,normal,orm}.png`
   (+ `height.png` 16 bit, derzeit nicht ausgeliefert), Eintrag in `assets/materials.json`, dann
   `assets/blender/tools/textures.py --only=<M>` (WebP + `_1024`/`_512`, Manifest), Cycles-Vorschau aus den
   ausgelieferten 1024er WebP: `docs/phase5a/materials/<M>.jpg`, Übersicht `docs/phase5a/materials/library.jpg`.

Die PNG-Quellen (je Material 3–15 MB) und die Render-EXR werden **nicht eingecheckt** (`assets/src/textures/.gitignore`),
sie entstehen deterministisch neu. `.blend`-Quellen liegen nur vor, wo sie ≤ 5 MB sind (Stroh, Leinen, Wolle, Laub);
bei den Höhenfeld-/Steinmaterialien (20–30 MB) ist das Skript die bearbeitbare Quelle.

### Einträge in `assets/materials.json`
- `tile` = Spiel-Einheiten je Texturwiederholung = physikalisches Maß / 1,85 m (Ausnahme: Leinen 0,25, Wolle 0,3,
  Leder 0,25 – bewusst 1,3–4× vergrößert, sonst liegt die Webstruktur selbst in der Nahansicht unter einem Pixel).
- `base`/`rough`/`metal` = Mittelwerte der Karten (Rückfall ohne Textur), `dirt` unverändert.
- `info`: Beschreibung, Orientierung (U/V), Kachelmaß in m, Quellauflösung, Texel je Einheit, Relieftiefe (mm),
  empfohlener Tönungsbereich für Instanzvariation (`tint`: hue ±, saturation, value), Skript + Seed; Laub zusätzlich
  `atlas` (2×2-Zellen, UV-Ursprung unten links) und `translucency` (Durchlicht-Hinweis). Die Laufzeit liest `info` nicht.

### Orientierung
Wände: U horizontal, V nach oben (Quader-Lagerfugen, Bruchstein flach gelagert, Putz-Schmutzläufe nach unten).
Holz: `M_Timber_Oak` Faser entlang U (Balkenachse), `M_Wood_Planks` Bretter senkrecht entlang V. Dächer: V = Gefälle
aufwärts (Ziegel-/Schindelunterkanten zeigen nach −V, Halme entlang V). Weg: V = Wegrichtung, Spuren bei U = 0,32/0,68.
Rinde: V = Stammachse. Böden, Fels, Leder: isotrop.

### Materialliste, Auflösungen, Dateigrößen (WebP, ausgeliefert)
| Material | tile Einh. (m) | Quelle px | px/Einh. | 2048 KB | 1024 KB | 512 KB | KTX2-1024 KB (Messung) | Relief mm |
|---|---|---|---|---|---|---|---|---|
| `M_Stone_Ashlar` | 1.351 (2.5 m) | 2048 | 1515.5 | 2083 | 379 | 90 | 1119 | 50.6 |
| `M_Stone_Rubble` | 1.081 (2.0 m) | 1024 | 947.2 | – | 1338 | 328 | 1853 | 92.1 |
| `M_Stone_Cobble` | 1.081 (2.0 m) | 1024 | 947.2 | – | 1095 | 268 | 1818 | 56.1 |
| `M_Plaster_Lime` | 1.081 (2.0 m) | 1024 | 947.2 | – | 981 | 230 | 1677 | 25.0 |
| `M_Timber_Oak` | 0.541 (1.0 m) | 2048 | 3788.8 | 3405 | 953 | 233 | 1704 | 19.8 |
| `M_Wood_Planks` | 0.811 (1.5 m) | 2048 | 2525.9 | 1538 | 455 | 110 | 1128 | 19.3 |
| `M_Roof_ClayTile` | 0.649 (1.2 m) | 2048 | 3157.3 | 1947 | 372 | 102 | 997 | 33.4 |
| `M_Roof_Thatch` | 0.541 (1.0 m) | 1024 | 1894.4 | – | 1240 | 373 | 1751 | 86.5 |
| `M_Roof_Shingle` | 0.649 (1.2 m) | 1024 | 1578.7 | – | 285 | 95 | 937 | 29.4 |
| `M_Iron_Wrought` | 0.27 (0.5 m) | 1024 | 3788.8 | – | 713 | 202 | 1546 | 3.2 |
| `M_Cloth_Linen` | 0.25 (0.12 m) | 1024 | 4096.0 | – | 1276 | 427 | 1584 | 1.7 |
| `M_Cloth_Wool` | 0.3 (0.16 m) | 1024 | 3413.3 | – | 958 | 345 | 1553 | 3.4 |
| `M_Leather` | 0.25 (0.35 m) | 1024 | 4096.0 | – | 958 | 256 | 1716 | 4.4 |
| `M_Ground_Grass` | 1.351 (2.5 m) | 1024 | 757.8 | – | 1746 | 414 | 1888 | 138.6 |
| `M_Ground_Dirt` | 2.162 (4.0 m) | 1024 | 473.6 | – | 1430 | 338 | 1836 | 113.6 |
| `M_Ground_Path` | 2.162 (4.0 m) | 1024 | 473.6 | – | 1254 | 303 | 1808 | 89.9 |
| `M_Rock` | 1.622 (3.0 m) | 1024 | 631.5 | – | 1409 | 347 | 1862 | 519.6 |
| `M_Bark` | 0.541 (1.0 m) | 1024 | 1894.4 | – | 1454 | 358 | 1860 | 44.5 |
| `M_Foliage` | 0.541 (1.0 m) | 1024 | 1894.4 | – | 478 | 169 | 947 | 89.7 |
| **Summe** | | | | 9.0 MB | 18.8 MB | 5.0 MB | 29.6 MB | |

Gesamt aller Stufen: **32,7 MB** (Budget ≤ 40 MB). „px/Einh.“ = Texel je Spiel-Einheit der größten Fassung (Richtwert 256).

### Formatentscheidung (Messung an den echten Karten)
- **Ausgeliefert: WebP** (Entscheidung der Pipeline, bestätigt). Anteil an der Gesamtgröße: Normal 64 %, ORM 22 %,
  Albedo 14 %. Normal-WebP q95 (Ashlar 1024): mittlerer Winkelfehler 2,5°, 99-%-Quantil 15° (Kanten;
  4:2:0-Farbunterabtastung) bei 0,3 MB gegenüber verlustfrei 1,4 MB – in Cycles-Vorschau und LookDev unauffällig.
- **KTX2/Basis gemessen** (basisu 1.16.4, Albedo/ORM ETC1S q255, Normal UASTC Stufe 2 + RDO λ=2 + Zstd 19, jeweils
  mit Mipmaps; Spalte „KTX2-1024“): Summe der 1024er Stufe ≈ 29,6 MB gegenüber ≈ 18,8 MB WebP, d. h. **Dateien ~1,6×
  größer** (UASTC-Normalen 0,8–1,4 MB je Karte), dafür **GPU-Speicher ÷4** (BC7/ASTC 1 Byte/Pixel statt RGBA8 4 Byte)
  und Transkodieren im Worker statt Dekodieren im Hauptthread. Einzeltest (Testrender Ashlar 1024): ETC1S-Albedo
  41,5 dB PSNR / 146 KB, UASTC-Normal 1,7° (λ=1) bis 3,5° (λ=6) Fehler / 1,16–0,88 MB, ETC1S-Normal 5,2° (blockig,
  unbrauchbar).
- **GPU-Speicher (geschätzt, RGBA8 + Mipmaps, 3 Karten je Material):** 512 → 4,2 MB, 1024 → 16,8 MB,
  2048 → 67 MB je Material. Alle 19 Materialien gleichzeitig: Niedrig ≈ 80 MB, Mittel ≈ 319 MB, Hoch ≈ 520 MB
  (4 Materialien mit 2048). **Gemessen** im LookDev (`?lookdev=medieval`, Kamera `3c-material`, Software-GL; nur der
  Brunnen nutzt bisher 6 Bibliotheksmaterialien): Texturspeicher Niedrig/Mittel/Hoch 32,9 / 128,9 / 320,9 MB gegenüber
  8,7 / 32,7 / 128,7 MB ohne Bibliothekstexturen (Pipeline-Messung, „classic“) → **+24 / +96 / +192 MB für 6 Materialien**
  (Hoch: Eiche und Bretter in 2048). Bilder: `docs/phase5a/materials/lookdev_3c-material_{medium,high}.jpg`. **Mit KTX2 (5B) ÷4** – für Hoch auf dem M3 der wichtigste
  Grund für KTX2; die Laufzeit ist vorbereitet (`<karte>.ktx2` + Transcoder), `STRONGPOLY_MAT_KTX2=1` erzeugt die Messung.
- **Download/Ladezeit (Schätzung, alle 19 Materialien):** Niedrig 5,0 MB, Mittel 18,8 MB, Hoch 25,6 MB → bei 50 Mbit/s
  ≈ 0,8 / 3,0 / 4,1 s; Dekodieren ~16 ms je 1024²-WebP (Pipeline-Messung, Software-GL) → ≈ 0,9 s Hauptthread für 57 Karten
  (einmalig beim ersten Laden des Stils `medieval`, danach Browser-Cache). Eine Szene lädt nur die genutzten Materialien.

### Qualitätsstufen
Niedrig `_512`, Mittel `_1024`, Hoch = größte vorhandene Fassung. 2048 nur für `M_Stone_Ashlar`, `M_Timber_Oak`,
`M_Wood_Planks`, `M_Roof_ClayTile` (Stein/Holz/Dach mit Nahansicht-Nutzen; Budget). Weitere 2048er Sätze entstehen durch
`"2k"` in `tiers` des Skripts + `STAGE=post` (der 2048er Render liegt immer vor). Texeldichte bereits bei 1024 meist 400–2000 px je Einheit (Richtwert 256),
die 2048er Fassung lohnt nur für Nahaufnahmen/LookDev.

### Hinweise für Asset-Autoren
- Gebrauchsspuren gebäudebezogen über `COLOR_0` (Schmutz/Kantenabnutzung), nicht in den Kacheltexturen.
- Putzschäden: `M_Plaster_Lime` enthält nur eine kleine Abplatzung; größere Schäden per Hoehen-Blend mit
  `M_Stone_Rubble` (Höhe in `assets/src/textures/M_Plaster_Lime/height.png`; ein Laufzeit-Blend ist noch nicht gebaut).
- Laub: Karten je Atlas-Zelle (`info.atlas.cells`), Alpha-Test 0,5, doppelseitig; Durchlicht als Wrap-/Rückseitenlicht.
- Stoffe: heller Naturton, Leder mittelbraun; Einfärben über Material-/Instanzfarbe (Teamfarbe über die bestehende Teamfarben-Logik, Bereich in `info.tint`).

### Werkzeuge der Materialbibliothek
`~/bpyenv` zusätzlich: `pip install Pillow OpenEXR scipy`. Optional `STRONGPOLY_MAT_KTX2=1` (installiert basisu über npm
`basis_universal@1.16.4-1` in den Arbeitsordner, misst KTX2 nur im Arbeitsordner).
