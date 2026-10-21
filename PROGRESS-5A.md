# PROGRESS-5A – Medieval Realism (Referenzsiedlung)

Spezifikation `PROMPT-5A.md`, Konventionen `assets/PIPELINE.md`. Branch `claude/strongpoly-phase5a-medieval-realism`, Ausgang `e64750f`.

## Teilschritte
- [x] 1 Architekturprüfung + Asset-Strategie (`docs/phase5a/ARCHITECTURE.md`)
- [ ] 2 Import- und Materialpipeline (Blender-Skripte, Materialbibliothek, GLB-Export, Loader, Fallback) – Pipeline-Teil erledigt (Blender-Bibliothek `assets/blender/lib/sp`, GLB-Export, Laufzeit `render/assets`, Rückfall, Beispiel-Asset Brunnen; siehe „Pipeline“); offen: Materialbibliothek-Texturen (Material-Agent)
- [ ] 3 Erstes hochwertiges Referenzgebäude (Bergfried)
- [ ] 4 Weitere Referenzobjekte (Fachwerkhaus, Bäckerei/Schmiede, Mauer + Tor) und Figuren (Bauer, Soldat)
- [ ] 5 Referenzumgebung (Terrain mit Weg/Gras/Steinen/Bäumen, Licht, Atmosphäre)
- [ ] 6 Vergleich (`?lookdev=medieval`, alt/neu, 3 Kameras) + Performance – Werkzeug erledigt (`?lookdev`, `scripts/lookdev.mjs`, Statistik; siehe „Pipeline“); offen: Vergleich mit den fertigen Referenz-Assets
- [ ] 7 Dokumentation + Mac-Testanleitung

## Befunde

## Pipeline (Teilschritte 1, 2-Laufzeit, 6-Werkzeug)

- **Architektur:** `docs/phase5a/ARCHITECTURE.md` (Bestandsaufnahme, was bleibt, three.js bleibt mit Begründung, Asset-Strategie, Messungen Texturformate/Geometrie, Risiken Safari/M3).
- **Blender-Bibliothek** `assets/blender/lib/sp` (Szene, Material-Platzhalter aus `assets/materials.json`, Modellierhilfen, UV im Weltmaß, Attribute `_BUILD/_BUILDH/_PART/_PIVOT/_STYLE/_SLOT/_ARM`, Datenfarbe COLOR_0 mit Cycles-AO-Bake/Schmutz/Abnutzung/Team, LOD-Regeln + Ersatzformen, Anker, Prüfungen, Vorschau, GLB-Export, Registereintrag). Werkzeug Texturen `assets/blender/tools/textures.py` (WebP + `_512/_1024`). Beispiel-Asset **Brunnen** `assets/blender/models/well.py` → `public/assets/models/well.glb` (LOD 2.920/584/156 Dreiecke, 425 KB), Quelle `assets/src/well.blend`, Vorschau `assets/previews/well_*.jpg`.
- **Manifest** `public/assets/manifest.json` aus `scripts/asset-manifest.mjs` (Materialien, Texturen, Register, Inhalts-Hash, KTX2 nur mit Transcoder).
- **Laufzeit** `client/src/render/assets/` (`manifest`, `model`, `materials`, `registry`, `lod`, `asset_mesh`): Override-Register Gebäude/Mauerstück/Einheit → Asset, Stil `classic` (Standard) | `medieval` (`?style=`, Einstellung „Grafikstil“), Rückfall auf prozedural; Integration in `EntityRenderer` (Gebäude, Mauern, Figuren, Leichen, Einsturz), `BuildSites` (Baustelle mit Höhenmaske), `GhostRenderer` (Bauvorschau), Hover-Kanten, Emitter aus Ankern; LOD mit Hysterese, Grenzen je Stufe (`quality.ts`: `assetLod0/assetLod1/assetLods/assetTexMax`). `?bench&style=medieval` und `?shots=…&style=medieval` laden die Assets vor dem Messen.
- **LookDev** `?lookdev=medieval|classic` (`lookdev.ts`, Datentabelle `lookdev_scene.ts`): Referenzsiedlung (Bergfried, 4 Häuser, Bäckerei, Schmiede, Lager, Brunnen, Mauer + Steintor, Bauern, Speer-/Schwertträger, Bogenschützen, Weg, Gras, Wald, Felsen), Kameras `1-rts`, `2-mid`, `3a-building`, `3b-figures`, `3c-material`, Stufe, Sonnenstand, Statistik (Draw-Calls, Dreiecke, Programme, Texturspeicher geschätzt, Geometriespeicher, Ladezeiten). `scripts/lookdev.mjs` → `docs/phase5a/lookdev/<stil>/<stufe>/<kamera>.jpg` + `stats.json` (Software-GL!).
- **Browserprüfung** `scripts/qa/s17_style_medieval.mjs` (Spiel mit `?style=medieval`: Platzierungsgeist, Bau über Befehl, Bauanimation, Auswahl, Hover, Stilwechsel) → `docs/phase5a/qa/`.
- **Tests** `client/test/assets_pipeline.test.ts` (17): Manifest aktuell/gültig/Fehlererkennung, GLB → Modell (echte Datei), Anker aus extras, Attribut-Zuordnung, LOD-Hysterese, Materialbibliothek/Texturwahl, Register/Rückfall, AssetTypeMesh, EntityRenderer mit Asset + Baustelle + Rückfall + classic.
- **Messwerte LookDev** (Software-GL, 1280×720, Kamera RTS; `docs/phase5a/lookdev/stats.json`): classic Niedrig/Mittel/Hoch 38/53/55 Draw-Calls, 128k/301k/474k Dreiecke, 14/21/23 Programme, Texturspeicher ≈ 8,7/32,7/128,7 MB (überwiegend Schattenkarte); medieval mit Brunnen-GLB +3…+5 Draw-Calls, +1 Programm, +0,2 MB (PMREM). Klassischer Stil in allen 12 `?shots`-Szenen mit identischen Draw-Calls/Dreiecken/Programmen, Pixelabweichung im Rahmen des Laufzeitrauschens (`docs/phase5a/measurements/README.md`).
- **Offen:** echte Materialtexturen und Referenz-Assets (andere Agenten); KTX2/Meshopt erst in 5B; Safari/M3-Messung; Server liefert ohne gzip aus.

## Figuren (Bauer, Speerkämpfer) – Teil von Teilschritt 4

- **Assets** (Skripte `assets/blender/models/peasant.py`, `spearman.py`, Baukasten `assets/blender/lib/sp/figure.py`, `human.py`,
  `gear.py`, Vorschau `figpreview.py`; Quellen `assets/src/peasant.blend`, `spearman.blend`; Ziele `{'unit': 'Peasant'}`,
  `{'unit': 'Spearman'}`):
  | Figur | LOD0 / LOD1 / LOD2 Dreiecke (alle Varianten) | sichtbar je Instanz | Materialien | GLB |
  | --- | --- | --- | --- | --- |
  | Bauer | 2.484 / 778 / 230 | 1.564–1.892 / 464–568 / 162–205 | LOD0: M_Cloth_Linen, M_Leather, M_Iron_Wrought, M_Figure; LOD1/2: M_Figure | 446 KB |
  | Speerkämpfer | 2.492 / 735 / 240 | 2.090–2.285 / 632–677 / 232–240 | LOD0: M_Cloth_Wool, M_Leather, M_Iron_Wrought, M_Figure; LOD1/2: M_Figure | 436 KB |
- **Gestaltung:** realistische Proportionen (~0,93 Einheiten ≈ 1,72 m, ≈ 7,3 Kopfhöhen), Kopf mit Nase, Augenhöhlen, Kinn,
  Ohren, Augen/Brauen, Bartvariante, drei Haarformen; modellierte Fäuste mit Daumen. Bauer: Leinentunika mit Bausch über dem
  Gürtel und geschlitzten, gefältelten Schößen, hochgekrempelte Ärmel, Wollbeinlinge mit Wickelbändern, Bundschuhe,
  Schärpe + Halstuch in Spielerfarbe, Beutel, Messer; Kopf: Strohhut | Gugel mit Schulterkragen | barhäuptig; Werkzeug je
  Beruf über die bestehende Berufslogik (Slots: Hacke, Axt, Hammer, Schmiedehammer, Spitzhacke, Spaten, Sichel,
  Rührholz, Messer; Leder-/Leinenschürzen). Speerkämpfer: Gambeson mit senkrechten Steppkammern (Geometrie), Stehkragen,
  Waffenrock in Spielerfarbe (Passe, Brust-/Rückenbahn, Seiten offen, geschlitzte Schöße mit Falten), Ledergurt mit Schnalle
  und Messer, Lederstiefel, Lederhandschuhe, Eisenhut mit Grat und Krempe, darunter Steppkappe | Kettenhaube | Haar; Speer
  (~2,3 m, Blattspitze mit Tülle), Rundschild (gewölbt, bemalt in Spielerfarbe, Lederrand, Eisenbuckel).
- **Animation** (unverändertes `unit_shader.ts`): Oberschenkel `leg_l/r` um die Hüfte, Unterschenkel+Schuh `shin_l/r` um Knie und
  Hüfte, Schöße/Schürzen hängen an den Oberschenkeln (kein Durchstoßen beim Gehen), Arme+Werkzeuge um die Schulter (Armstil
  9/10 = Beruf, 1 = Stoß), Kopf+Haar+Hut um den Hals; Kragen von Gugel/Haube statisch. Geprüft im echten Renderer: Gehen
  (Knie, Armschwung), Arbeit je Beruf, Stoß, Umkippen (Leiche), getragene Ware (`08_anim_gehen.jpg`, `09_…`, `10_…`) und im
  Spiel `?quick=1&style=medieval` (QA `scripts/qa/s18_figures_medieval.mjs`: Overrides aktiv, Bauern arbeiten im Steinbruch,
  Speerkämpfer marschieren/kämpfen, Leichen, Konsole sauber; 8/8 OK). Schritt/Weg: die längeren Beine (Hüfte 0,478 statt
  0,40) machen bei gleicher Schrittfrequenz größere Schritte – Gleitverhältnis ≈ 0,85 statt ≈ 1,0 (leichtes Vorauseilen der
  Füße, im Rahmen 0,8–1,45 des Gang-Tests); Bewegungsglättung unverändert.
- **Pipeline-Erweiterungen (rückwärtskompatibel):** Farbklasse ≥ 16 = fester Ton aus `UNIT_TINTS` (Holz/Stroh/Leder/Eisen
  ohne eigenes Material); Normierung getönter/spielerfarbener Figurenteile auf die mittlere Albedo des Materials (kleinste
  Mipmap bzw. Grundfarbe) – die Bibliothekstexturen liefern Struktur, die Instanz die Farbe (mit Testtexturen geprüft);
  Material `M_Figure` (ohne Textur); AO-Bake je Variante (unsichtbare Hüte verschatten das Gesicht nicht); Figuren ohne
  `_BUILD/_BUILDH`, dafür `_STYLE/_SLOT/_ARM` Pflicht; LOD-Grenzen der Figuren × 0,45; getragene Ware bei GLB-Figuren × 1,18;
  `VAR_SPEC` Speerkämpfer `hats: 3, hairStyles: 2` (prozedurales Modell unverändert); Bench stellt `window.__assets` bereit.
  Doku: `assets/PIPELINE.md` Abschnitt „Figuren“.
- **Leistung** (Software-GL/SwiftShader, 1280×720, `?bench&units=2000`, Mittel; Draw-Calls/Dreiecke/JS ohne Raster – KEINE
  GPU-Werte): Kamera 36: classic 75–81 Draw-Calls, 0,69–0,73 M Dreiecke, JS 10,3–11,0 ms; medieval (normales Heer, ~150
  GLB-Speerkämpfer im Bild, LOD1 18 / LOD2 136) 83 / 0,80 M / 11,6 ms; Belastungsprobe „alle Fußtruppen als GLB-Figur“
  (1.123 GLB-Figuren im Bild, fast alle LOD2) 90 / 0,59 M / 12,3 ms. Hoch: classic 82 / 0,87 M, medieval 84 / 0,91 M,
  alle GLB 84 / 0,97 M. Nahe Kamera 18 (alle GLB, 741 Figuren meist LOD1): 77 Draw-Calls / 0,68 M Dreiecke gegen classic
  69 / 0,30 M (LOD1 ≈ 2× das prozedurale Nahmodell). Draw-Calls je GLB-Figurentyp: LOD0 4 + LOD1 1 + LOD2 1 (+ Schatten).
  JS-Schwankung ±2 ms durch parallel laufende Agenten.
- **Bilder** `docs/phase5a/assets/figures/`: `01_cycles_bauer.jpg`, `02_cycles_speerkaempfer.jpg`, `03_cycles_nah.jpg` (Cycles,
  Varianten + LOD0/1/2), `04_lookdev_3b_classic_medieval.jpg`, `05_lookdev_2mid_…`, `06_lookdev_1rts_…`, `07_nah_medieval_oben_classic_unten.jpg`,
  `08_anim_gehen.jpg`, `09_anim_berufe_ware_stoss.jpg`, `10_anim_umkippen.jpg`, `11_spiel_s18.jpg`.
- **Tests:** `packages/client/test/assets_figures.test.ts` (Manifest/Budget/Materialien, Attribute je Vertex, Gelenkkette passt
  zum Shader, Maße, Spielerfarbe je LOD, Varianten, sichtbare Dreiecke je Instanz, Werkzeug je Beruf, Shader-Patch).
- **Kritische Einschätzung:** deutlicher Sprung gegenüber den prozeduralen Klötzchenfiguren (Proportionen, Kleidung, Silhouette,
  Spielerfarbe aus RTS-Höhe klar, Bauer/Soldat sofort unterscheidbar). Noch nicht auf Manor-Lords-Niveau: Flächen sind glatt
  (Struktur kommt erst mit den Stoff-/Leder-/Eisentexturen der Materialbibliothek), Gesichter nur angedeutet, Arme ohne
  Ellbogengelenk (starre Arme wie bisher), Speer bleibt beim Stoß schräg nach oben (Armstil Stoß verschiebt nur).
- **Offen:** Bibliothekstexturen einbinden, sobald gemergt (Normierung vorbereitet); eigener kleiner Figurenatlas (Gesicht,
  Haar) wäre der nächste Qualitätsschritt; Ellbogen/Speer-Senken als neue Armstile (Shader) in 5B; LOD1 bei sehr naher
  Kamera teurer als das alte Nahmodell.

