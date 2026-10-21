# Phase 5A – Architekturprüfung und Asset-Strategie

Stand: Branch der Phase 5A, Ausgang `e64750f` (Phase 4 abgeschlossen). Grundlage: Code unter `packages/client/src/render`,
Messungen in dieser Umgebung (Chromium 141 mit **Software-GL/SwiftShader**, 4 Kerne, mehrere Agenten parallel – alle Zeiten
sind **keine GPU-Werte**; ein Safari-/M3-Lauf fehlt). Konventionen und Befehle: `assets/PIPELINE.md`.

## 1. Kurzfassung der Entscheidungen

| Thema | Entscheidung | Begründung (Kurz) |
| --- | --- | --- |
| Engine | **three.js 0.170 bleibt** | Engpass ist der Inhalt (Modelle/Materialien), nicht die Engine; alles Nötige ist in three vorhanden; erste GLB-Integration kostet +5 Draw-Calls und +1 Shaderprogramm (Messung §5) |
| Authoring | Blender 5.2.2 als Python-Modul, Skript je Asset + `.blend` | reproduzierbar, headless, Cycles für Bake/Vorschau (EEVEE headless nicht verfügbar: libEGL fehlt) |
| Modellformat | **GLB je Asset**, Knoten `LOD0/LOD1/LOD2` + `ANCHOR_*` in einer Datei, Y oben, keine Kameras/Lichter/Bilder | ein Request je Asset, LOD-Wechsel ohne Nachladen |
| Materialmodell | glTF metallic-roughness; **Bibliothek `M_*`**: im GLB nur der Name, Texturen extern je Material (`albedo`, `normal`, `orm`), **ein Material/Programm je M_*** zur Laufzeit | kleine GLBs, geteilte Texturen, wenige Shaderprogramme (Safari-Kompilierzeit), Materialänderung ohne Re-Export |
| Variation | Datenfarbe `COLOR_0` (R AO, G Schmutz, B Kantenabnutzung, A Teamfarbe) + Instanzvariation im Shader | Gebrauchsspuren ohne eindeutige Texturen je Gebäude; Spielerfarbe ohne Extra-Material |
| Animation | Vertex-Animation wie bisher: `_PART/_PIVOT` (→ `aPivot`), Figuren `_STYLE/_SLOT/_ARM` (→ `aStyle`, `aMeta.z`) | kompatibel zu `materials.ts`/`unit_shader.ts`, keine Skelette, CPU-frei für 2.000 Einheiten |
| Bauanimation | `_BUILD/_BUILDH` je Teil (→ `aBuild`), gleiche Höhenmaske wie `construction.ts`/`building_materials.ts` | Sofortbau bleibt, Gerüst/Staub/Material aus `build_sites.ts` unverändert nutzbar |
| LOD | 3 Stufen je Asset, Wahl nach Kameraabstand mit Hysterese, Grenzen je Qualitätsstufe × Größenfaktor; Niedrig nie LOD0 | Dreiecke/Draw-Calls in der Ferne begrenzen, kein Flackern |
| Instancing | je (Asset, LOD, Material) ein `InstancedMesh` (`TypeMesh`) | Draw-Calls unabhängig von der Instanzzahl |
| Texturformat | **jetzt WebP** (+ `_512`/`_1024`-Fassungen je Stufe), **KTX2 vorbereitet** (Laufzeit lädt `.ktx2`, sobald vorhanden) | WebP: kleinste Dateien, einfache Werkzeugkette; KTX2 spart GPU-Speicher ×4–8, nötig ab vielen Materialien (5B) – Messung §6.5 |
| Geometriekompression | **vorerst keine** (rohe GLB), Laufzeit kann `EXT_meshopt_compression` (Decoder lazy, 6 KB gzip); Draco abgelehnt | die pip-Fassung von Blender enthält weder Draco- noch Meshopt-Bibliothek; `gltfpack` verwirft eigene Attribute (gemessen) |
| Rückfall | fehlt/scheitert ein Asset oder Stil `classic` → prozedurales Modell | Spiel bleibt unverändert; getestet |
| Schalter | `?style=classic|medieval` bzw. Einstellung „Grafikstil“, Standard **classic** | Spiel bleibt bis zur Freigabe unverändert |

## 2. Bestandsaufnahme (Phase 4)

Renderer-Code: ~14.000 Zeilen in `client/src/render` (prozedurale Modelle, Shader-Patches, Instancing, Terrain, Dekor,
Effekte). Der Renderer liest nur den `ClientWorld`-Spiegel (Sim/Netz sind sauber getrennt).

### 2.1 Modellbaukasten (Gebäude)
- `builder.ts` (`ModelBuilder`): additive Primitive (Quader, Balken, Zylinder/Kegel, Prismen, Dächer, Kugel), alles wird zu
  **einer** Geometrie mit Vertexfarben gemergt; Attribute `aPivot` (Drehpunkt + Teil-ID für Vertex-Animation), `aMeta`
  (Teamfarbe, eingebackene AO, Armstil), bei Gebäuden `aBuild` (Bauzeitfenster + Höhenbereich je Teil) und `aSurf`
  (Oberflächenart für prozedurale Muster). Detailstufen `det(0|1|2)`.
- `models_castle/economy/town.ts`, `building_parts.ts`, `building_house.ts`: alle 57 Gebäudetypen. Dreiecke: Bergfried 4.312,
  Kathedrale 2.504, übrige 100–2.200, Mauerstücke 120–170 je Teil.
- Feindetail (Quaderfugen, Bretter, Ziegel, Stroh) zeichnet der Fragment-Shader aus `aSurf` (`building_materials.ts`).
- **Grenze:** Formen bestehen aus Quadern/Prismen/Zylindern mit Flachschattierung und Einzelfarben; Materialien sind
  Farbe + Muster ohne Textur, Normalen, Rauheit oder Lichtreflexe. Das ist der „Low-Poly-Look“ – mit Polish allein nicht
  auf Manor-Lords-Niveau zu bringen (Silhouetten unregelmäßiger Steine/Hölzer, Dachdeckung, Putzschäden brauchen echte
  Geometrie und Texturen).

### 2.2 Einheiten und Animation
- 26 Typen, **ein Mesh je Typ** (Nah- und Fernmodell in derselben Geometrie, Umschalten per Sichtbarkeits-Bits mit
  Hysterese, `units_style.ts`), Infanterie ≤ 400 Dreiecke nah, ~100–230 fern.
- Animation ohne Skelett im Vertex-Shader (`unit_shader.ts`): Teile mit Drehpunkt (Beine, Schienbeine, Arme, Kopf, Umhang …),
  Zustände aus Instanzattributen (`iAnim`: Phase, Flags, Schrittfrequenz, Zyklus; `iVar`: Palette, Helligkeit,
  Sichtbarkeit, Beruf). CPU-Kosten je Einheit: nur Instanzdaten – trägt die 2.000-Einheiten-Schlachten.
- Variation (Haut, Haar, Stoffe, Größe) über Farbklassen und Tonetabelle; Berufe der Bauern nur darstellungsseitig.

### 2.3 Shader, Materialien, Licht
- Alle Modelle: `MeshLambertMaterial` (flach schattiert) mit `onBeforeCompile`-Patches; gemeinsame Uniforms `GFX`
  (Zeit, AO-Stärke, Wolkenschatten, Randlicht, Instanzvariation, Wind …). Grading global im `colorspace_fragment`.
- Licht: Hemisphäre + eine Sonne mit PCF-Soft-Schatten (Schattenkamera folgt dem Blickpunkt, Texel-Snapping),
  Tonemapping Neutral, Dunst nach Kameraabstand. **Kein** PBR, keine Normal-/Rauheitskarten, keine Umgebungsreflexe.

### 2.4 LOD und Instancing
- `instanced.ts` (`TypeMesh`): ein `InstancedMesh` je Typ (Matrix, Teamfarbe, `iAnim`, optional `iVar`), Puffer wachsen,
  Teil-Uploads per Update-Range. Gebäude haben **keine** Distanz-LOD (nur Detailstufe je Grafikstufe), Figuren Nah/Fern,
  Bäume Fernformen, Dekor nur im Sichtradius.

### 2.5 Terrain und Vegetation
- Chunk-Terrain mit Vertexfarben + Detailschicht im Shader (prozedurale Rauschtexturen, Bodenkarte mit Pfaden/Feldern/
  Kontaktschatten), Wasser-Shader. Vegetation: 7 Baumarten (Kegel/Kugel-Formen), Büsche, Gras, Blumen, Felsen als Instanzen.

### 2.6 Bauanimation (4C)
- Rein visuell aus `world.tick − BuildingRec.n`; Stadien in `construction.ts` (reine Funktionen), Höhenmaske je Teil im
  Shader (`constructionMaterial`, Schatten mit gleicher Maske), Gerüst/Material/Staub in `build_sites.ts`.

### 2.7 Qualitätsstufen
- `quality.ts`: eine Tabelle (Schatten, Partikel, Gras, Wasser, Oberflächendetail, Wolken, Randlicht, Bäume, Umgebungsleben,
  Pixel-Ratio …), angewandt über `GameScene.applyGfx` → `onGfx` → Renderer.

### 2.8 Performance (Phase-4-Abnahme, Software-GL)
- Vergleichsszenen (Mittel, 1280×720): 40–85 Draw-Calls, 120–500k Dreiecke (Haupt- + Schattenpass), ~21 Programme.
- Bench 2.000 Einheiten: JS ohne Raster ≈ 5–6 ms/Frame (Ziel ≤ 8 ms erreicht), Draw-Calls ≤ 82. GPU-Zeit auf dem M3
  **nicht gemessen**.

## 3. Was erhalten bleibt
- Datenfluss `ClientWorld → EntityRenderer` (nur lesend), Sim/Netz/KI/Wirtschaft/Audio unberührt.
- `TypeMesh`-Instancing und die Instanzattribute `iAnim`/`iVar` – GLB-Assets werden in genau dieses System überführt.
- Vertex-Animation (Teile + Drehpunkte) für Figuren, Tore, Fahnen, Flügel – GLB-Assets tragen dieselben Teil-IDs.
- Bauanimation per Höhenmaske, Baustellen (Gerüst, Material, Staub), Abschluss-/Abbrucheffekte.
- Qualitätstabelle, GFX-Uniforms (Wolkenschatten, Randlicht, Grading), Schattenkamera, Dunst.
- Prüf-/Messwerkzeuge (`?shots`, `?bench`, `scripts/qa`) und **alle prozeduralen Modelle als Rückfall** (Stil `classic`,
  fehlende Assets, ggf. Grafikstufe Niedrig in 5B).

## 4. Wo eigene 3D-Assets den Qualitätssprung bringen (Priorität)
1. **Gebäude** (größter Bildanteil in jeder Kamera): echte Steine, Balken, Dachdeckung, Fenster/Türen mit Tiefe,
   unregelmäßige Kanten, AO und Schmutz → Silhouette und Materialwirkung. Ersetzt die Muster-Shader (`aSurf`).
2. **Materialbibliothek** (Stein/Holz/Putz/Dach mit Albedo/Normal/ORM): wirkt auf alle Assets zugleich; prozedural nicht in
   dieser Güte erreichbar.
3. **Figuren** (Proportionen, Kleidung, Gesichter über Textur-Atlas; Animation bleibt Vertex-Shader).
4. **Vegetation** (Bäume mit Blattkarten statt Kegeln, Gras-/Blumen-Karten) und **Terrain** (Textur-Splatting statt
   Vertexfarben) – Teilschritt 5 der Phase.
5. **Licht**: PBR + Umgebungslicht (kleine PMREM) für Glanz/Metall; Sonnenstand/Farbe im LookDev prüfbar.

## 5. Warum three.js bleibt (Nachweis statt Vermutung)
- **Funktionsumfang vorhanden:** PBR (`MeshStandardMaterial`), `GLTFLoader` mit Meshopt/Draco, `KTX2Loader` (Basis), PMREM,
  Instancing, Schattenkarten, `onBeforeCompile` für unsere Shader-Erweiterungen. Ein Wechsel (Babylon, PlayCanvas, eigene
  WebGPU-Engine) brächte **keinen** sichtbaren Gewinn ohne neue Assets, aber den Verlust von ~14.000 Zeilen erprobter
  Darstellung (Bauanimation, Vertex-Animation, Terrain, Werkzeuge).
- **Gemessen** (LookDev, Mittel, Kamera RTS, Software-GL): klassisch 53 Draw-Calls/249k Dreiecke/21 Programme; mit dem
  ersten GLB-Asset (Brunnen, 6 Materialien) 58 Draw-Calls/249k/22 Programme. Das Asset-Material teilt EIN Programm für alle
  M_* (plus je eine Variante für Baustelle/Figuren).
- **Safari/M3:** WebGL 2 ist dort ausgereift; three r170 läuft (Phase 4). WebGPU bleibt als spätere Option (three hat einen
  WebGPU-Renderer), ist aber für 5A nicht nötig.
- **Gegenbeweis nicht gefunden.** Verbleibende Grenzen (eine Schattenkaskade, kein SSAO) sind in three lösbar
  (CSM-Addon, AO-Pass) und keine Engine-Frage.

## 6. Asset-Strategie

### 6.1 Formate und Struktur
- Je Asset ein Skript `assets/blender/models/<id>.py` (Bibliothek `assets/blender/lib/sp`), Ergebnis
  `packages/client/public/assets/models/<id>.glb` mit Knoten `<id>/LOD0|LOD1|LOD2/<id>_LODn` (ein Mesh je LOD, ein
  Primitive je Material) und `ANCHOR_<art>_<n>` (Emitter/Merkpunkte, `extras`).
- Registereintrag `assets/registry/<id>.json` → Manifest `public/assets/manifest.json` (Generator `scripts/asset-manifest.mjs`,
  Test prüft Aktualität): Datei, Ziel (Gebäude-/Mauer-/Einheitentyp), Footprint, Höhe, Bounding-Box, LOD-Dreiecke, Materialien,
  Anker, Inhalts-Hash (Cache-Busting: der Server liefert `/assets/*` als unveränderlich aus).
- Achsen: Blender Z oben → three Y oben; **Front = Blender −Y = three +Z** (= Front der prozeduralen Modelle bei `b.r = 0`;
  `b.r = 1` dreht um +90°). Ursprung = Footprint-Mitte am Boden; Breite `def.w` entlang X, Tiefe `def.h` entlang Y.

### 6.2 Materialmodell
- glTF metallic-roughness; ORM-Textur = R AO, G Rauheit, B Metall (wie glTF) → in three ist dieselbe Textur `aoMap`,
  `roughnessMap` und `metalnessMap`. Texturen `flipY = false` (UVs aus glTF wie im GLTFLoader).
- UVs im Weltmaß durch die Kachelgröße `tile` des Materials (eine UV-Einheit = eine Wiederholung; 1024 px bei tile 4 =
  256 px/Einheit). Box-/Zylinderprojektion mit Versatz je Objekt.
- Laufzeit-Shader (`render/assets/materials.ts`): MeshStandard + Vertex-Animation, Datenfarbe (AO auf indirektes Licht voll,
  auf direktes 45 %; Schmutz Richtung Materialschmutzfarbe und rauer; Kanten heller/glatter), Teamfarbe, Instanzvariation,
  Wolkenschatten, Randlicht, globales Grading, kleine PMREM-Umgebung (64×32-Verlauf → 336×64, ≈0,2 MB).

### 6.3 LOD und Budgets
- Budgets (LOD0/LOD1/LOD2 Dreiecke): Bergfried 25k/8,75k/2,5k; Haus/Produktion 8k/2,8k/800; Mauerstück 1,5k/600/200;
  Tor 6k/2,1k/600; Kleinbau 3k/1,1k/350; Figur 2,5k/800/250. Prüfung beim Export (Fehler bei Überschreitung).
- LOD-Regeln je Objekt: automatisch (winzige Teile entfallen, kleine bleiben, große per Decimate), `keep`/`drop`/Verhältnis/
  `planar:Grad` oder **Ersatzformen** (`only=1|2`, z. B. Brunnenkranz als verformter Ring statt 39 Einzelsteinen).
- Distanzen (Spiel-Einheiten × Größenfaktor 0,7–2,2 aus der Bounding-Box-Diagonale, Hysterese ±3): Niedrig LOD1 bis 34,
  dann LOD2 (nie LOD0); Mittel LOD0 bis 30, LOD1 bis 72; Hoch 44/105.

### 6.4 Instancing und Draw-Calls
- `AssetTypeMesh`: je (LOD × Material) ein `TypeMesh`; Instanzen werden zwischengespeichert und bei Kamerabewegung nur bei
  LOD-Wechsel neu verteilt (`relod`). Draw-Calls je Assettyp = Σ Materialien der sichtbaren LOD-Stufen (+ Schattenpass).
  Richtwert: ≤ 6 Materialien je Asset, Bibliothek statt Unikate.

### 6.5 Texturkompression (gemessen)
Testtexturen 1024² (kachelbarer Quaderstein, Albedo/Normal/ORM), Kodierung mit Basis Universal (ktx2-encoder 0.6,
außerhalb des Repos), Laden in Chromium/SwiftShader mit three `TextureLoader` bzw. `KTX2Loader` (2. Durchgang, lokal):

| Karte | PNG | JPEG q88 | WebP q88 | KTX2 ETC1S | KTX2 UASTC (+Zstd) |
| --- | --- | --- | --- | --- | --- |
| Albedo | 273 KB | 36 KB | **12 KB** | 58 KB | 652 KB |
| Normal | 380 KB | 126 KB | **28 KB** | – | 752 KB |
| ORM | 244 KB | 35 KB | **9 KB** | 36 KB | 495 KB |
| Laden/Dekodieren | 19 ms | (129 ms 1. Lauf) | **~16 ms** | 28–127 ms (Worker) | 67–187 ms (Worker) |
| Hochladen (GPU) | 24 ms | 17 ms | ~20 ms (+ Mipmaps) | **2 ms** | **1 ms** |
| GPU-Speicher je Karte inkl. Mipmaps | 5,6 MB | 5,6 MB | 5,6 MB | **1,4 MB** (BC7/ASTC) bzw. 0,7 MB (BC1/ETC2) | **1,4 MB** (ASTC 4×4/BC7) |

- SwiftShader bietet ASTC, BPTC, S3TC, ETC; der Transcoder wählte BC7 (ETC1S) bzw. ASTC 4×4 (UASTC). Auf dem M3 (Safari)
  stehen ASTC und ETC2 zur Verfügung.
- **Entscheidung 5A:** WebP (Safari ≥ 14) als Laufzeitformat, verkleinerte Fassungen `_512`/`_1024` je Grafikstufe
  (`assetTexMax` 512/1024/2048), Werkzeug `assets/blender/tools/textures.py`. Begründung: kleinste Downloads, keine
  zusätzliche Werkzeugkette, für die Referenzsiedlung (~12 Materialien × 3 Karten ≈ 200 MB GPU-Speicher bei 1024²) tragbar.
- **5B:** KTX2 (ETC1S für Albedo/ORM, UASTC für Normalen) einführen, sobald die Materialzahl steigt: GPU-Speicher ÷4–8,
  Hochladen ohne Hänger (Transcodieren im Worker). Laufzeit ist vorbereitet (`MapEntry.alt.ktx2` bzw. `<karte>.ktx2`, Transcoder
  `public/assets/basis/` aus `three/examples/jsm/libs/basis`, Auswahl nur mit Renderer-Unterstützung).

### 6.6 Geometriekompression
- Brunnen (2.920/584/156 Dreiecke, eigene Attribute): GLB roh 425 KB, gzip -9 113 KB. `gltfpack -cc` ergab 54 KB, **verwarf
  aber `_BUILD/_BUILDH/_PART/_PIVOT` und die UVs** (Material ohne Textur im GLB) – so nicht nutzbar.
- Blender aus PyPI enthält keine Draco/Meshopt-Bibliotheken (Exporter meldet beide als fehlend).
- Laufzeit registriert den Meshopt-Decoder (lazy Chunk 6 KB gzip). Draco abgelehnt: Decoder-WASM + Worker (~300 KB),
  langsamer beim Dekodieren, für unsere kleinen Meshes ohne Vorteil.
- **Empfehlung 5B:** Nachbearbeitung mit glTF-Transform (`meshopt` + Quantisierung, behält eigene Attribute) als Dev-Werkzeug,
  und/oder gzip/brotli im Server (`packages/server` komprimiert heute nicht).

### 6.7 Rückfall
- Stil `classic` → keinerlei Laden. Stil `medieval`: Manifest fehlt/kaputt, Asset fehlt, GLB-/Texturfehler, Prüfung des
  Manifests schlägt für ein Asset fehl → dieses Ziel bleibt prozedural (`console.info`, keine Ausnahme). Tests:
  `client/test/assets_pipeline.test.ts`.

### 6.8 Migration (Phase 5B, nach Freigabe)
1. Je Gebäudetyp ein Asset-Skript (Bibliothek `sp`), Budget nach Klasse, Ziel `{'building': '<BT-Name>'}`; Mauern als drei
   Stücke `{'wall': 'WallHigh', 'piece': 'arm'|'post'|'stub'}` (Arm entlang +x von 0 bis 0,5 wie `wallParts`).
2. LookDev-Zeile ergänzen, Vergleich alt/neu, Budgets/Draw-Calls prüfen; Mac-Abnahme.
3. Figuren: gleiche Teil-IDs/Drehpunkte wie `unit_shader.ts`, Ziel `{'unit': '<U-Name>'}`.
4. KTX2 + Meshopt einführen, sobald > ~20 Materialien bzw. > ~10 MB GLB.
5. Standardstil erst nach vollständiger Abnahme auf `medieval` stellen; prozedurale Modelle bleiben Rückfall (ggf. für Niedrig).

## 7. Risiken (Safari / MacBook Air M3)
| Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- |
| Texturspeicher | unkomprimiert 5,6 MB je 1024²-Karte (mit Mipmaps); 36 Karten ≈ 200 MB, Hoch (2048²) ≈ 800 MB | Stufen-Höchstgröße (512/1024/2048), wenige Bibliotheksmaterialien, KTX2 ab 5B (÷4–8); Statistik im LookDev |
| Shader-Varianten / Kompilierzeit | Safari kompiliert langsam; jede Map-Kombination = eigenes Programm | ein Programm je Variante für alle M_* (gemessen +1 Programm), Material-Sets einheitlich halten (immer Albedo+Normal+ORM); 5B: `renderer.compileAsync` beim Laden |
| Fragment-Kosten PBR | MeshStandard rechnet mehr je Pixel als Lambert | LOD/Distanz, Niedrig ohne LOD0; Pixel-Ratio-Deckel bleibt; auf dem M3 zu messen (`?lookdev`, `?bench&style=medieval`) |
| Ladezeit | GLB roh (Brunnen 425 KB), Texturdekodierung im Hauptthread (~16 ms je 1024²) | Laden erst im Stil `medieval`, Rückfall während des Ladens, Hash-Cache, 5B Meshopt/gzip, KTX2 im Worker |
| Bildwechsel beim Nachladen | prozedural → GLB springt um | im Spiel akzeptiert (Vorschau); 5B: Vorladen vor Spielstart |
| WebP/KTX2-Unterstützung | WebP ab Safari 14, KTX2 braucht WASM | beides in Safari 15+ vorhanden; Laufzeit fällt bei fehlender Unterstützung auf WebP/PNG zurück |
| Kontextverlust/Speicherdruck | viele große Texturen | Budgets oben, `dispose` bei Stilwechsel (Materialbibliothek) |
