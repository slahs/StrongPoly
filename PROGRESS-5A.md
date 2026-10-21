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

## Stadt (Fachwerkhaus, Bäckerei, Schmiede) – Teilschritt 4

- **Assets** (Skripte `assets/blender/models/{hovel,bakery,blacksmith}.py`, Baukasten `assets/blender/lib/sp/town.py`,
  Quellen `assets/src/*.blend`, Vorschauen `assets/previews/*`, Register `assets/registry/*`):

  | Asset | Ziel | LOD0/LOD1/LOD2 Dreiecke | Materialien | GLB | Anker |
  | --- | --- | --- | --- | --- | --- |
  | `hovel` | Hütte (Grundmodell) | 7.277 / 1.680 / 626 | 7 (Rubble, Oak, Plaster, Thatch, Planks, Iron, Grass) | 1,0 MB | Kaminrauch (immer), Tür |
  | `hovel_b` | Hütte, Variante 1 | 7.369 / 1.534 / 498 | 6 (… Shingle statt Thatch/Grass) | 1,0 MB | Kaminrauch, Tür |
  | `bakery` | Bäckerei | 7.943 / 2.682 / 589 | 7 (Rubble, Oak, Plaster, ClayTile, Planks, Iron, Linen) | 1,2 MB | Rauch am Ofenschlot (mit Arbeiter), 2× Arbeitsplatz, Tür |
  | `blacksmith` | Schmiede | 7.156 / 1.867 / 668 | 7 (Rubble, Oak, Plaster, Shingle, Planks, Iron, Leather) | 1,1 MB | Dunkelrauch am Schlot + Amboss-Funken (mit Arbeiter), Arbeitsplatz, Tür |

  - **Fachwerkhaus** (2×2): Bruchsteinsockel aus Einzelsteinen, Eichenfachwerk (Schwelle mit Vorköpfen, leicht schiefe
    Ständer, Riegel in wechselnden Höhen, Fuß-/Kopfstreben, durchhängendes Rähm, Holznägel, Balkenköpfe), Gefache mit
    leicht ausgebeultem Kalkputz, Lehmflecken (Datenfarbe), Bohlentür 1,1 hoch mit Langbändern und Ring auf Trittstein,
    Fenster mit Brüstung 0,5 über dem Stubenboden, Laden in Spielerfarbe, Bank, Brennholzstapel mit Abdeckbrettern,
    Hackklotz mit Axt, Fass, Heugabel. **A:** Strohdach mit Krüppelwalm als dickes Höhenfeld (Lagen, unruhige Traufe,
    Grassodenfirst, Verwitterung/Moos-Dunkelung auf der Wetterseite per Datenfarbe), verbretterte Giebel, Windbretter,
    Sparrenköpfe. **B:** Schindeldach in Lagen mit Untersicht, Fachwerkgiebel mit Putz, gespiegelte Anordnung.
  - **Bäckerei** (3×3): giebelständig; Erdgeschoss Bruchstein mit Eckquadern und Eichenstürzen, Obergeschoss Fachwerk
    mit Auskragung und Balkenköpfen, Fachwerkgiebel, Ziegeldach in Lagen mit Firstziegeln; Verkaufsladen (Unterladen als
    Theke mit Broten, Oberladen aufgestellt), Vordach auf Kopfbändern, Zunftschild (Spielerfarbe) am Eisenausleger;
    angebauter Backofen: Bruchsteinsockel mit Holznische, Kuppel (Ziegel-/Lehmton, Ruß zur Front), Stirnmauer mit Ofenloch
    und Rußfahne, Schutzdach, Rauchabzug; Mehlsäcke, Reisigbündel, Teigtrog, Brotschieber, Pflaster.
  - **Schmiede** (3×3): Fachwerk-Werkstatt auf Bruchsteinsockel, Schindeldach; offener Arbeitsplatz unter Pultdach auf
    Ständern mit Kopfbändern: gemauerte Esse mit Glutbett, Rauchfang, Bruchsteinschlot, Blasebalg (Leder), Amboss auf
    Klotz, Löschtrog, Werkzeugwand (Zangen, Hämmer), Kohlehaufen im Verschlag, Schleifstein, Eisenstangen, Fass, Schild
    (Spielerfarbe), Ruß an Putz und Dach über der Esse.
  - Bauanimation (Bauzeitfenster je Teil): Sockel/Mauern → Fachwerk → Gefache → Fenster/Türen → Dach → Kleinteile.
- **Pipeline-Erweiterungen** (rückwärtskompatibel, siehe `assets/PIPELINE.md` „Ergänzt (Stadt-Assets)“):
  Modellvarianten je Gebäude-ID (`target.variant`, `AssetRegistry.forBuilding(bt, id)`, `variantOf`; EntityRenderer,
  Baustellen, Hover, Emitter; Tests), Mindest-Schmutz `sp_grime` je Objekt/Vertex in `sp.attrs`, Baukasten `sp.town`.
- **LookDev:** neue Kameras `3d-house`, `3e-bakery`, `3f-smithy`, `2b-town` (`lookdev_scene.ts`).
- **Browserprüfung:** `scripts/qa/s18_town_medieval.mjs` (Platzierungsgeist, Bauanimation in Stufen 20/45/70/90 %,
  fertiges GLB, Auswahl/Hover, Varianten, Emitter) → `docs/phase5a/assets/town/qa/`.
- **Bilder:** `docs/phase5a/assets/town/` (classic vs. medieval je Kamera, Cycles-Vorschauen, Bauphasen).
