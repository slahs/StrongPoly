# PROGRESS-5A – Medieval Realism (Referenzsiedlung)

Spezifikation `PROMPT-5A.md`, Konventionen `assets/PIPELINE.md`. Branch `claude/strongpoly-phase5a-medieval-realism`, Ausgang `e64750f`.

## Teilschritte
- [x] 1 Architekturprüfung + Asset-Strategie (`docs/phase5a/ARCHITECTURE.md`)
- [ ] 2 Import- und Materialpipeline (Blender-Skripte, Materialbibliothek, GLB-Export, Loader, Fallback) – Pipeline-Teil erledigt (Blender-Bibliothek `assets/blender/lib/sp`, GLB-Export, Laufzeit `render/assets`, Rückfall, Beispiel-Asset Brunnen; siehe „Pipeline“); offen: Materialbibliothek-Texturen (Material-Agent)
- [ ] 3 Erstes hochwertiges Referenzgebäude (Bergfried)
- [ ] 4 Weitere Referenzobjekte (Fachwerkhaus, Bäckerei/Schmiede, Mauer + Tor) und Figuren (Bauer, Soldat)
- [x] 5 Referenzumgebung (Terrain mit Weg/Gras/Steinen/Bäumen, Licht, Atmosphäre) – Stil medieval, siehe „Umgebung (Terrain, Vegetation, Licht)“
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

## Umgebung (Terrain, Vegetation, Licht) – Teilschritt 5

Ausführlich mit Bildern und Messwerten: `docs/phase5a/ENVIRONMENT.md`. Konventionen: `assets/PIPELINE.md` (Abschnitt „Vegetation und Umgebung“).

- **Vegetation (24 GLB-Assets, Blender-Skripte `assets/blender/models/veg_*.py`, Bibliothek `sp/veg.py`):** Stieleiche, Hängebirke,
  Fichte je 3 Varianten (inkl. Jungbaum) aus Skelett + Blattkarten (M_Foliage-Atlas bzw. eigene Nadeltextur M_Foliage_Conifer),
  Kronennormalen, analytische AO, LOD0/1/2 ≤ 6000/1500/300; Hasel/Weißdorn; Gras (2), Wiesenblumen (2), Farn als Geometrie mit
  Palette M_Flora (kein Alpha-Overdraw); Findling/Fels/Platte/Lesesteine (≤ 1280 Dreiecke, Cycles-AO, Moosanteil); Holzzaun,
  Flechtzaun, Gemüsebeet, liegender Stamm.
- **Laufzeit `render/env/`:** `veg_layer.ts` (MedievalDecor: Instancing je Asset × LOD × Material, prozeduraler Rückfall),
  `veg_place.ts` (Verteilung rein/deterministisch, LOD je Instanz, Sichtkegel-Auslese), `veg_material.ts` (Wind, Alpha-Test auch im
  Schattenpass, Durchlicht, Birkenrinde/Moos), `terrain_medieval.ts` (Textur-Arrays Gras/Erde/Weg/Fels, höhenbasierte Übergänge,
  Anti-Kachelung), `envmap.ts` (Wege mit Richtung/Fahrspuren, Kronendach), `atmosphere.ts` (Sonne, Himmel/PMREM, Nebel, AgX).
- **Renderer-Erweiterungen (rückwärtskompatibel, classic unverändert):** `scene.ts` (Stilumschaltung, Licht/Himmel/Nebel/
  Tonemapping medieval, eingepasste Schattenkamera, `whenEnvReady`, `setEnvExtras`), `terrain.ts` (Option `medieval`: Tönung, `aMed`,
  Wasserfarben), `groundmap.ts` (`trailSegments`), `quality.ts` (Felder `env*`), `assets/materials.ts` (`texture()`, `sceneEnv`,
  Halbkugel-Gewicht), `assets/manifest.ts` (`veg`, `uvTile`), `lookdev.ts`/`lookdev_scene.ts` (Wege, Requisiten, Kamera `3d-landscape`,
  `&tone=`), `bench.ts` (wartet auf die Umgebung), `scripts/lookdev.mjs` (neue Kamera, `--tone`).
- **Tests:** `client/test/env_medieval.test.ts` (Atmosphäre, Umgebungskarte, Trampelpfade, Gelände-Attribute, Budgets/GLB der
  Vegetation, Verteilung deterministisch/monoton/frei von Gebäuden-Wegen-Wasser, LookDev-Daten).
<!-- ENV-ZAHLEN -->
