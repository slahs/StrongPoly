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

## Burg (Bergfried, Mauer, Tor) – Teilschritt 3 + Teil von 4

**Assets** (Skripte `assets/blender/models/`, gemeinsame Bausteine `castle_kit.py`, Mauerprofil `wall_high_parts.py`; Quellen `assets/src/*.blend`, Vorschauen `assets/previews/`):

| Asset | Ziel | LOD0 / LOD1 / LOD2 Dreiecke | Materialien | GLB |
| --- | --- | --- | --- | --- |
| `keep` | Bergfried (5×5, Plattform 4,2) | 24.912 / 7.147 / 962 | Rubble, Ashlar, Timber_Oak, Wood_Planks, Roof_Shingle, Iron_Wrought, Cloth_Linen (7) | 4,0 MB |
| `gate_stone` | Steintor (4×3, Plattform 3,6) | 5.994 / 2.044 / 592 | wie Bergfried (7) | 1,1 MB |
| `wall_high_arm` | Hohe Steinmauer, Arm | 390 / 232 / 36 | Rubble, Ashlar | 66 KB |
| `wall_high_post` | Hohe Steinmauer, Pfosten | 1.162 / 412 / 72 | Rubble, Ashlar | 160 KB |
| `wall_high_stub` | Hohe Steinmauer, Einzelpfeiler | 1.300 / 502 / 96 | Rubble, Ashlar | 178 KB |

- **Bergfried/Wohnturm** (eigener Entwurf, 12.–14. Jh.): Bruchsteinschaft mit Eckquadern (Läufer/Binder), Sockel mit Anlauf und Wasserschlag, Geschossgesims mit Rücksprung, Hocheingang im 1. OG (Rundbogenportal mit Keilsteinen, Bohlentür mit Eisenbändern, Holztreppe mit Wangen/Podest/Geländer, Schindel-Vordach auf Kopfbändern), Schießscharten (auch Kreuzscharten), kleine Rundbogenfenster mit Gewänden/Sohlbank (teils mit Läden), Rüstlöcher in Reihen, Ausbesserungen in Werkstein, Abtritterker auf Kragsteinen, Wasserspeier, Konsolfries mit offenem Pechnasen-Schlitz, vorkragende Brüstung mit unregelmäßigen Zinnen und Abdeckplatten, zwei Scharwachttürmchen auf gestuften Konsolen mit Kegeldach, aus der Mitte nach hinten versetzter Turmaufsatz (Wohngeschoss) mit Tür zur Plattform, Zwillingsfenstern unter Entlastungsbogen, Sparrenköpfen, Zeltdach aus 13 Schindellagen mit Gratbrettern, Kamin (Rauch-Anker), Knauf, hölzerne Hurde (Wehrgang vor der Brüstung, Ostseite) mit Kragbalken, Kopfbändern und Pultdach, Fahnenmast mit Fahne (Teil `cloth`) und Fassadenbanner in Spielerfarbe. Plattform auf Laufhöhe 4,2 (Wehrgang um den Aufsatz).
- **Hohe Steinmauer**: Bruchstein mit Anlauf, Sockel mit Wasserschlag, Gesims unter dem Wehrgang, Brüstungen mit Abdeckplatten, Plattenbelag auf Laufhöhe 2,4; Pfosten mit vier Zinnen (Rhythmus 0,5 wie `wallParts`, zwei mit Scharte). **Stöße**: symmetrisches Profil, 3 mm Überlappung, eingerückte Stirnflächen als eigene Teile (keine Abnutzungs-/Schattenlinien am Stoß), UVs stetig über beide Stöße (Kachelgröße 1: u = ±(x − 0,5)), Schmutzrauschen in y gespiegelt (Pipeline-Option), gemeinsame Bauzeitfenster für Arm/Pfosten. **Ecken/T-Stöße**: Pfosten-Kern/Sockel/Gesims als Quadrat 6 mm innerhalb der Armflächen (im geraden Lauf verdeckt, an Ecken sichtbar), die Eckzinne schließt die Brüstung; an der Außenecke bleibt neben der Eckzinne eine schmale Zinnenlücke (der Pfosten kennt seine Nachbarn nicht – wie bei den prozeduralen Mauern).
- **Steintor/Torhaus**: zwei vorspringende Flankentürme (Eckquader, Sockel/Gesims auf den Höhenlinien der Mauer, Anschluss der Mauerarme bei x = ±2), zurückgesetzte Durchfahrt mit Keilsteinbogen, Gewölbe und Fallgitterschlitz, **Fallgitter** aus Eiche mit Eisenspitzen als Teil `door` (hebt sich wie bisher um 1,7 in den Mauerkörper; die Laufzeit kennt für Tore nur das Heben, die Bohlenflügel mit Eisenbändern stehen deshalb offen an den Laibungen), Pechnase auf drei Kragsteinen über dem Tor, Türen vom Wehrgang in die Türme, Zinnen, Windenhaus mit Satteldach über dem Fallgitter, Banner/Wimpel in Spielerfarbe.
- **Pipeline-Änderung** (minimal, rückwärtskompatibel): `sp.attrs.fill_dirt_wear(..., mirror_y=False)` + `Asset.noise_mirror_y` (Standard aus) – Schmutz-/Abnutzungsrauschen spiegelsymmetrisch für gedreht aneinanderstoßende Mauerstücke. Sonst keine Änderung an `assets/blender/lib` oder `render/assets`.
- **Werkzeuge**: LookDev-Kameras `3d-keep`, `3e-gate`, `3f-wall`, `3g-corner`; Referenzsiedlung um Mauer-Eckstoß (L) und T-Stoß ergänzt; `scripts/shots.mjs --style=`; `scripts/qa/s04_castle.mjs --style=medieval`; neues Szenario `scripts/qa/s18_castle_medieval.mjs` (Overrides, Geist, Bauanimation Tor/Mauer, fertige GLB-Instanzen, Fallgitter, Durchmarsch, Auswahl/Hover).
- **Nachweis** (`docs/phase5a/assets/castle/`, 960 px, LookDev Mittel, Software-GL): `1-rts`, `2-mid`, `3d-keep`, `3e-gate`, `3g-corner` je `_classic`/`_medieval`; Spiel (`s18`): `spiel_1_geist_tor`, `spiel_2_bau_35`, `spiel_2_bau_70`, `spiel_4_tor_nah`, `spiel_6_auswahl` (Tor offen, Fallgitter oben). Vorschauen Cycles: `assets/previews/{keep,gate_stone,wall_high_*}_{front,rts}.jpg`.
- **Prüfungen**: `s18_castle_medieval` 12/12 (Overrides, Geist aus GLB, Bauanimation Tor 35/70 % und Mauerwelle im Clip-Material, fertig 48 Arme/26 Pfosten/2 Einzelpfeiler/Tor als GLB ohne prozedurales Tor, Fallgitter hebt sich 0,98, 8/8 Soldaten durchs Tor, Auswahl/Hover-Kontur aus GLB, Konsole sauber). `s04_castle --style=medieval --fast`: Mauerzug 25/25, Tor hinaus 19/24 und herein 24/24, 22/24 auf der Mauerkrone (Sim unverändert); die beiden FPS-abhängigen Prüfungen (Mauerwelle-Zwischenstände, Bewegungssprünge < 3 %) scheitern unter der aktuellen Last von ~20 auf 4 Kernen (0,5 Bilder/s) – auch kein Asset-Befund. Schaukasten `?shots=castle|siege&style=medieval`: GLB-Bergfried/-Mauern/-Tor zusammen mit prozeduralen Türmen und Pechkesseln, Mauerstöße an Türme/Tor sauber.
- **Messwerte** (Software-GL, keine GPU-Werte): LookDev Mittel `1-rts` classic 53 Draw-Calls/305k Dreiecke → medieval 72/375k (mit Brunnen-GLB); Schaukasten `castle` 77/444k → 95/518k, `siege` 89/462k → 107/557k. Programme +1. Mehr Draw-Calls durch 7 Materialien je Bergfried/Tor und 2 je Mauerstück (je LOD × Material ein Instanz-Mesh, plus Schattenpass).
- **Selbstkritik**: Großform/Mittelform tragen (Silhouette liest aus der RTS-Kamera klar „Burg“, Hocheingang/Hurde/Scharwachttürme/Pechnase/Fallgitter aus der Nähe glaubwürdig), aber ohne die Bibliothekstexturen wirken die großen Bruchsteinflächen noch glatt und einfarbig – die Steinstruktur muss aus `M_Stone_Rubble`/`M_Stone_Ashlar` kommen. Die Mauer ist zwangsläufig ein Kachelsystem (identische Pfosten → regelmäßiger Zinnenrhythmus; Variation nur über Instanzfarbe/Gelände). Am Außeneck bleibt neben der Eckzinne eine schmale Lücke in der Brüstung. Bergfried-GLB 4 MB (rohe Attribute; Meshopt/Quantisierung 5B). Torflügel stehen offen (Laufzeit animiert Tore nur durch Heben).

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
  Halbkugel-Gewicht), `assets/manifest.ts` (`veg`, `uvTile`), `lookdev.ts`/`lookdev_scene.ts` (Wege, Requisiten, Kamera `3h-landscape`,
  `&tone=`), `bench.ts` (wartet auf die Umgebung), `scripts/lookdev.mjs` (neue Kamera, `--tone`, `--timeout`), `scripts/bench-fps.mjs` (`--style=`),
  `scripts/qa/s17_style_medieval.mjs` (Bauanimation im 640×360-Fenster beobachtet, s. u.).
- **Tests:** `client/test/env_medieval.test.ts` (Atmosphäre, Umgebungskarte, Trampelpfade, Gelände-Attribute, Budgets/GLB der
  Vegetation, Verteilung deterministisch/monoton/frei von Gebäuden-Wegen-Wasser, LookDev-Daten).
- **Zahlen (Software-GL/SwiftShader, keine GPU-Werte; Details `docs/phase5a/ENVIRONMENT.md` §7):** LookDev 1280×720
  medieval Niedrig/Mittel/Hoch 82–100 / 86–112 / 100–117 Draw-Calls, 103–182k / 240–581k / 349k–1,11 Mio. Dreiecke,
  20–22 / 26–27 / 29 Programme (classic 35–42 / 41–53 / 43–55 Calls, 14 / 21 / 23 Programme). Texturen der GLB-Bibliothek
  56 / 224 / 368 MB + Gelände-Arrays 17 / 67 / 67 MB (unkomprimiert geschätzt). `?bench&style=medieval` (2000 Einheiten):
  JS je Bild ohne Raster 7,6 / 8,5 / 9,4 ms (classic 5,3 / 5,3 / 6,3 ms), 83–91 Draw-Calls – Ziel ≤ 8 ms auf Mittel knapp verfehlt.
- **Bilder:** `docs/phase5a/assets/environment/{medieval,classic}/{low,medium,high}/*.jpg` (Kameras 1-rts, 2-mid, 3a, 3b, 3c,
  3e-gate, 3h-landscape, je `stats.json`), AgX/ACES-Vergleich `docs/phase5a/assets/environment/tonemapping_agx_aces_*.jpg`.
- **Prüfungen:** `pnpm test`, `pnpm -r typecheck`, `pnpm build` grün; `?quick=1&style=medieval` und LookDev ohne
  Konsolenmeldungen; QA s17 10/10, s18 12/12; classic: alle 12 `?shots`-Szenen mit identischen Draw-Calls/Dreiecken/Programmen.
  s17 beobachtet die Bauanimation jetzt in 640×360: in 1280×720 braucht ein Bild im Stil medieval unter SwiftShader ≈ 2,5 s
  (Gelände-Shader ≈ 60 % davon), der Brunnen ist schneller fertig – kein Fehler im Spiel, aber ein Hinweis auf die Füllratenkosten.
- **Offen:** Messung auf echter GPU/Safari (M3), `M_Ground_Path`/`M_Rock` nicht neu gebacken (im Shader ausgeglichen), keine
  ausgelieferten Höhenkarten (Höhen-Ersatz aus AO/Helligkeit), KTX2-Kompression der Bibliothek, JS-Zeit Mittel 8,5 ms.
