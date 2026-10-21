# PROGRESS-5A – Medieval Realism (Referenzsiedlung)

Spezifikation `PROMPT-5A.md`, Konventionen `assets/PIPELINE.md`. Branch `claude/strongpoly-phase5a-medieval-realism`, Ausgang `e64750f`.

## Status: EINGEFRORENER REVIEW-KANDIDAT (Freigabe durch den Projektinhaber auf dem Mac ausstehend; keine Phase 5B ohne Freigabe)

## Teilschritte
- [x] 1 Architekturprüfung + Asset-Strategie (`docs/phase5a/ARCHITECTURE.md`)
- [x] 2 Import- und Materialpipeline: Blender-Bibliothek `assets/blender/lib/sp`, GLB-Export mit LOD0/1/2 und gebackener Datenfarbe, Laufzeit `render/assets` mit Rückfall auf die prozeduralen Modelle, Materialbibliothek (19 + 3 ergänzte PBR-Materialien, WebP)
- [x] 3 Erstes Referenzgebäude: Bergfried
- [x] 4 Fachwerkhaus (2 Varianten), Bäckerei, Schmiede, hohe Mauer (arm/post/stub), Steintor, Figuren Bauer + Speerkämpfer
- [x] 5 Referenzumgebung (Terrain, Wege, 24 Vegetations-/Stein-/Requisiten-Assets, Licht/Atmosphäre im Stil medieval)
- [~] 6 Vergleich + Performance: LookDev `?lookdev=medieval` (alt/neu, feste Kameras) und Bilder je Teilbereich vorhanden (`docs/phase5a/assets/{castle,town,figures,environment}/`); ein gemeinsamer Gesamt-Vergleichslauf aller fertigen Assets wurde auf Wunsch des Auftraggebers abgebrochen (Kosten-Stopp) – **offen**
- [~] 7 Dokumentation: PIPELINE.md, ARCHITECTURE.md, ENVIRONMENT.md, LICENSES.md, diese Datei; Mac-Testanleitung unten. README nicht ergänzt – **offen**

## Mac-Test (Safari, MacBook Air M3)
```
corepack pnpm i
corepack pnpm --filter @strongpoly/client dev
```
- LookDev neu: `http://localhost:5173/?lookdev=medieval` – Kameras über `&cam=1-rts|2-mid|2b-town|3a-building|3b-figures|3c-material|3d-keep|3e-gate|3f-wall|3g-corner|3h-landscape|4a-house|4b-bakery|4c-smithy`, Stufe `&quality=low|medium|high`; Vergleich alt: `?lookdev=classic` (gleiche Kameras).
- Im Spiel: `http://localhost:5173/?quick=1&style=medieval` (Standard ohne Parameter bleibt `classic`; Grafikstil auch in den Optionen umschaltbar).
- Leistung: `http://localhost:5173/?bench&style=medieval&quality=medium&units=2000&secs=20` (Overlay bzw. `window.__bench.result()`); Statistik-Overlay der LookDev zeigt Draw-Calls, Dreiecke, Programme, Texturspeicher.
- Beim ersten Aufruf werden ca. 15–25 MB Texturen/Modelle geladen (Stufe Mittel); bitte Ladezeit, FPS, Hänger und Bildeindruck zurückmelden.

## Bekannte Einschränkungen / offen
- Alle Messwerte stammen aus Software-GL (SwiftShader) – **keine GPU-/Safari-Messung**; 60 FPS nicht belegt.
- `?bench` 2.000 Einheiten im Stil medieval: JS-Zeit ohne Raster 7,6/8,5/9,4 ms (Niedrig/Mittel/Hoch) – Ziel ≤ 8 ms auf Mittel knapp verfehlt; classic unverändert.
- Draw-Calls im RTS-Bild classic ~53 → medieval ~100 (6–7 Materialien je Asset-Typ × LOD, plus Schattenpass); Texturspeicher geschätzt 56/224/368 MB je Stufe (ohne KTX2) – für 5B: KTX2/Basis, Material-Atlas/weniger Materialien je Asset.
- GLB unkomprimiert (Bergfried 4 MB, Hütte ~1 MB; kein Meshopt, da der PyPI-Blender es nicht exportiert und gltfpack Attribute verwirft).
- Ladezeit der Umgebung unter Software-GL hoch; Gelände-Shader ist der teuerste Teil.
- Qualitätsschwächen: Bruchstein an Mauer/Tor wirkt gleichförmig; Materialien Timber_Oak, Leather, Rock, Ground_Path schwach; Laubkronen nah „kartig“; Figuren ohne Ellbogen, Gesichter nur angedeutet; Strohdach etwas glatt; Mauer bleibt Kachelsystem; Torflügel nur fest geöffnet; Schmiede-Effekte nur in der LookDev belegt.
- Assets können nach Spielstart nachgeladen werden (sichtbarer Wechsel prozedural → GLB); Vorladen fehlt.
- Wasser im Stil medieval nur farblich angepasst.

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

## Figuren (Bauer, Speerkämpfer) – Teil von Teilschritt 4

- **Assets** (Skripte `assets/blender/models/peasant.py`, `spearman.py`, Baukasten `assets/blender/lib/sp/figure.py`, `human.py`,
  `gear.py`, Vorschau `figpreview.py`; Quellen `assets/src/peasant.blend`, `spearman.blend`; Ziele `{'unit': 'Peasant'}`,
  `{'unit': 'Spearman'}`):
  | Figur | LOD0 / LOD1 / LOD2 Dreiecke (alle Varianten) | sichtbar je Instanz | Materialien | GLB |
  | --- | --- | --- | --- | --- |
  | Bauer | 2.484 / 778 / 246 | 1.564–1.892 / 464–568 / 178–221 | LOD0: M_Cloth_Linen, M_Leather, M_Iron_Wrought, M_Figure; LOD1/2: M_Figure | 479 KB |
  | Speerkämpfer | 2.492 / 735 / 240 | 2.090–2.285 / 632–677 / 232–240 | LOD0: M_Cloth_Wool, M_Leather, M_Iron_Wrought, M_Figure; LOD1/2: M_Figure | 454 KB |
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
  `08_anim_gehen.jpg`, `09_anim_berufe_ware_stoss.jpg`, `10_anim_umkippen.jpg`, `11_spiel_s18.jpg`,
  `12_nah_mit_bibliothekstexturen.jpg` (Echtzeit-Aufnahmen nach dem Merge der Materialbibliothek, mit deren Texturen).
- **Nach Merge der Materialbibliothek:** mit den neuen `tile`-Werten neu exportiert; auf Figuren ist die Stoffbindung feiner
  gekachelt (Leinen 0,16, Wolle 0,2 statt 0,25/0,3 – sonst wirkte das Leinen wie ein grobes Gitter), in der Variante `unit`
  sind die Normalen halb so stark und der Strukturkontrast getönter Teile auf 60 % gedämpft; Spielerfarbe/Stofftöne bleiben
  durch die Normierung unverändert (Leinen-, Wollalbedo ist heller Naturton, wird nicht multiplikativ verfälscht). LOD2 des
  Bauern: breitere Schärpe, Halstuch und Werkzeugstiel (Lesbarkeit aus RTS-Höhe).
- **Tests:** `packages/client/test/assets_figures.test.ts` (Manifest/Budget/Materialien, Attribute je Vertex, Gelenkkette passt
  zum Shader, Maße, Spielerfarbe je LOD, Varianten, sichtbare Dreiecke je Instanz, Werkzeug je Beruf, Shader-Patch).
- **Kritische Einschätzung:** deutlicher Sprung gegenüber den prozeduralen Klötzchenfiguren (Proportionen, Kleidung, Silhouette,
  Spielerfarbe aus RTS-Höhe klar, Bauer/Soldat sofort unterscheidbar). Noch nicht auf Manor-Lords-Niveau: Flächen sind glatt
  (Struktur kommt erst mit den Stoff-/Leder-/Eisentexturen der Materialbibliothek), Gesichter nur angedeutet, Arme ohne
  Ellbogengelenk (starre Arme wie bisher), Speer bleibt beim Stoß schräg nach oben (Armstil Stoß verschiebt nur).
- **Offen:** eigener kleiner Figurenatlas (Gesicht,
  Haar) wäre der nächste Qualitätsschritt; Ellbogen/Speer-Senken als neue Armstile (Shader) in 5B; LOD1 bei sehr naher
  Kamera teurer als das alte Nahmodell.

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
- **LookDev:** neue Kameras `4a-house`, `4b-bakery`, `4c-smithy`, `2b-town` (vor dem Merge `3d-house`/`3e-bakery`/`3f-smithy`) (`lookdev_scene.ts`).
- **Browserprüfung:** `scripts/qa/s18_town_medieval.mjs` (Platzierungsgeist, Bauanimation in Stufen 20/45/70/90 %,
  fertiges GLB, Auswahl/Hover, Varianten, Emitter) → `docs/phase5a/assets/town/qa/`.
- **Nach dem Merge der Materialbibliothek** (neue `tile`-Werte, Bretter-Maserung entlang V): alle vier Assets neu
  exportiert; der Baukasten erzeugt Weltmaß-UVs und skaliert sie in `town.add` auf das `tile` des Materials, daher war
  kein Modellumbau nötig. Mit echten Texturen geprüft (LookDev `4a-house`, `4b-bakery`, `4c-smithy`, `2b-town`, `1-rts`,
  `2-mid`; Cycles-Vorschauen mit Texturen).
- **Bilder:** `docs/phase5a/assets/town/` – `vergleich_<kamera>_classic-medieval.jpg` (1-rts, 2-mid, 2b-town, 4a-house,
  4b-bakery, 4c-smithy; mit Texturen), `cycles_vorschau_{front,rts}.jpg`, `bauphasen_{hovel,bakery,blacksmith}.jpg`
  (20/45/70/90 % + fertig, im Spiel), `qa/` (Browserprüfung), LookDev-Statistik `lookdev_stats_*_medium.json`.
- **Prüfungen:** `s18_town_medieval` 22/22 OK, Konsole sauber (Geist, Bauanimation in Stufen, fertiges GLB,
  Auswahl/Hover für Hütte, Bäckerei, Schmiede; Varianten stabil je ID; Emitter aus Ankern: Hütten-Kaminrauch,
  Bäckerei-Ofenrauch). Arbeiter erreichten die Schmiede im Testlauf nicht (Wohnraum voll) – Schmiede-Dunkelrauch und
  Amboss-Funken nur im LookDev (besetzt) belegt. `pnpm test`, `pnpm -r typecheck`, `pnpm build` grün.
- **Messung** (LookDev, Mittel, Software-GL – keine GPU-Werte, 1280×720, Kamera RTS, nach Merge inkl. Burg-Assets):
  classic 53 Draw-Calls/305k Dreiecke/21 Programme → medieval 101 Draw-Calls/407k/22 Programme; je sichtbarem
  Asset-Typ und LOD-Stufe ≈ 6–7 Draw-Calls (Materialien), im Schattenpass erneut. Texturspeicher (Bibliothek) ≈ 225 MB.
- **Offen:** Variantenwahl per ID-Hash kann in kleinen Gruppen gleiche Nachbarn ergeben (dritte Variante oder
  positionsabhängige Wahl); Draw-Calls je Asset-Typ für große Städte in 5B senken (gemeinsame Materialien/Atlas über
  Assets, weniger Materialien je Asset); GLB 1,0–1,25 MB je Asset unkomprimiert (Meshopt/gzip in 5B); Mehlsäcke und
  Brote sind nah noch grob; Einzelsteine (Sockel, Trittstein) nutzen `M_Stone_Rubble` (Hinweis Material-Agentin:
  `M_Rock` evtl. besser – nicht umgestellt, um keine weitere Materialzahl/Draw-Calls zu erzeugen).
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
