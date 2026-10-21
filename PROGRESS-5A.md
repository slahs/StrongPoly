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

## Materialbibliothek (Teilschritt 2, Material-Agent)

- **19/19 Materialien** aus `assets/PIPELINE.md` vollständig prozedural in Blender erzeugt (Skripte
  `assets/blender/materials/M_*.py`, gemeinsame Hilfen `_common.py`, Bau `scripts/assets/build-materials.sh`): echte
  Quellgeometrie (Quader mit Abplatzungen, gepackte Bruch-/Pflastersteine, Einzelziegel/-schindeln, ~29 000 Strohhalme,
  gewebte Fäden, ~105 000 Grashalme + Klee/Wegerich, modellierte Blätter, Höhenfelder für Holz/Putz/Eisen/Leder/Böden/
  Fels/Rinde) → Cycles-Draufsicht-Bake (Normal, AO, Albedo, Rauheit, Metall, Höhe) → kachelbar per Nachbar-Instanzen
  und Torus-Rauschen (2×2 sichtgeprüft).
- **Ausgabe nach Pipeline-Konvention:** Quellen `assets/src/textures/<M>/` (nicht eingecheckt, reproduzierbar), Werte in
  `assets/materials.json` (`tile` physikalisch, Rückfallfarbe/-rauheit aus den Karten, `info` mit Orientierung, Tönungsbereich,
  Atlas/Durchlicht), WebP + `_1024`/`_512` über `assets/blender/tools/textures.py`, Manifest aktualisiert.
- **Größen:** alle Stufen 32,7 MB (Budget 40): Niedrig 5,0 MB, Mittel 18,8 MB, 2048er Sätze (Quader, Eiche, Bretter, Biberschwanz) 9,0 MB.
  Texturspeicher (LookDev, Software-GL) mit den 6 Brunnen-Materialien: +24 / +96 / +192 MB (Niedrig/Mittel/Hoch).
- **Format:** WebP bestätigt; KTX2 gemessen (UASTC-Normalen größer als WebP, aber GPU-Speicher ÷4) → Empfehlung 5B wegen
  GPU-Speicher der Stufe Hoch. Details `assets/PIPELINE.md` → „Materialbibliothek“.
- **Nachweise:** Cycles-Vorschauen `docs/phase5a/materials/<M>.jpg`, Übersicht `docs/phase5a/materials/library.jpg`;
  Browser: `node scripts/lookdev.mjs --styles=medieval --cams=3c-material --check` (alle Stufen, Konsole sauber), Bilder
  `docs/phase5a/materials/lookdev_3c-material_{medium,high}.jpg` (Brunnen mit Bruchstein, Eiche, Brettern, Schindeln, Eisen, Leinen).
- **Test:** `packages/client/test/asset_materials.test.ts` (Namensliste = PIPELINE.md = materials.json, Werte, vollständige
  Kartensätze + Stufen, Alpha der Laubkarte, Budget ≤ 40 MB).
- **Brunnen neu exportiert** (`assets/blender/models/well.py`), weil sich `tile` seiner Materialien geändert hat.
- **Qualität (eigene Einschätzung):** stark: Biberschwanz, Stroh, Bretter, Bruchstein, Pflaster, Gras, Laub-Atlas;
  mittel: Quader, Putz, Schindeln, Eisen, Erde, Rinde, Leinen, Wolle (wirkt fischgratartig); schwach: Eiche (Verwitterung
  fleckig, Beilspuren als Netz), Leder (eher Wildleder/Stein), Fels (Facetten wie Polygonplatten), Weg (Spuren lesen sich
  als dunkle Rillen).
- **Offen:** KTX2 (5B, GPU-Speicher Stufe Hoch); Höhenkarte (`height.png`) und Putz/Bruchstein-Blend in der Laufzeit nicht
  genutzt; Gelände/Bäume nutzen die Boden-/Rinden-/Laubmaterialien noch nicht (Umgebungs-Agent); schwache Materialien
  nachschärfen; Safari/M3-Prüfung der Texturen.
