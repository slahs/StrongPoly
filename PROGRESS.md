# PROGRESS – PROMPT-3 (Bugs + Meilensteine B–F)

Nach einem Neustart: zuerst diese Datei lesen und beim ersten offenen Punkt weitermachen.
Gate nach jedem Meilenstein: `pnpm test`, `pnpm -r typecheck`, `pnpm build`.
Lange Läufe (Turnier) immer mit festem `OUT` starten (fortsetzbar).

## 1. Bugs
- [x] 1.1 KI hortet Gold, rekrutiert nicht: 2v3 s14 (Sieg nach 7,9 Min) und 2v7 s29 (Sieg nach 70 Min) enden, 6v7 s6 bleibt Patt (Ursache: Holzfäller 45 Felder vom Lager entfernt + Bogner verbrauchen das Holz, Mathilde hat weder Eisen noch Markt – siehe „Gefundene Bugs“)
- [x] 1.2 Restliche Patts: Endlauf auf Stand `feccce3` (= HEAD-KI): **98/108 = 90,7 % Keep-Fall**, Median 43,8 min, längste Partie 83,6 min; je Profil mindestens 20/24 (83 %)
- [x] 1.3 Unbrauchbare Waffen (Werkstätten nur für erreichbare Einheitenkosten)
- [x] 1.4 Bevölkerungsschaukel (Steuer/Rationen-Hysterese; Rest = Raubzüge)
- [x] 1.5 Burg mauert sich nicht ein / zerstörte Tore werden neu gebaut (Test)
- [x] 1.6 bench/dmg.ts entfernt
- [x] 1.7 Geschützreichweiten nach `shared/data/` (`TURRETS`, `CAULDRON` in data/balance.ts; durch F)
- [x] 1.8 Docker-Image neu gebaut (Stand b76a3f0-Vorgänger; Build nur mit temporärem Dockerfile + Proxy-CA, Repo-Dockerfile unverändert), Container gestartet: `/healthz` ok, Client wird ausgeliefert, Missionen 1–5 im Browser gegen den Container gestartet ohne Konsolenfehler
- [x] 1.9 Tutorial-Missionen 1–5 per Skript bis zum Sieg (fertig: test/missions_play.test.ts; Mission 5: Tutorial-KI nutzt keine Angriffsfähigkeiten); Browser: Missionen 1–5 starten und laufen ohne Konsolenfehler (walk.mjs gegen Docker-Container)
- [x] 1.10 Smoke 3 Seeds (Seed 2 meldete nur kurzzeitig überbaute Einheit, jetzt 30-s-Schwelle) + test/determinism.test.ts
- [x] 1.11 Laufend: Bugs aus B–F (siehe unten „Gefundene Bugs“)

## 2. Meilenstein B – Menüs und Bedienung
- [x] Unteres Hauptpanel (Reiter, Unterkategorien, Kontextfeld, Minikarte)
- [x] Kontextpanels (Bergfried, Kornspeicher, Lager, Waffenkammer, Kaserne, Söldner, Ingenieurgilde, Markt, Werkstätten, Schenke, Kirche)
- [x] Beliebtheitsanzeige mit Aufschlüsselung + Prognose
- [x] Werkzeuge (Abreißen, Reparieren, Rückgängig, Bau abbrechen, Rechtsklick)
- [x] Platzieren (Geist grün/rot + Grund, Kosten am Cursor, Linien-Vorschau)
- [x] Truppenpanel (Typen, Haltung, Formation, Patrouille, Bodenangriff, Stopp, Graben, Öl)
- [x] Hotkeys frei belegbar + F1-Übersicht
- [x] Berater + Meldungsliste + Kamerasprung
- [x] Hauptmenü / Pausenmenü / Endbildschirm mit Statistik
- [x] Optionen
- [x] Gate + Browser-Check (`uitest.mjs`: 17 Interaktionsprüfungen, 0 Konsolenfehler; Tooltips aus F an Bau-/Truppenleiste angebunden)

## 3. Meilenstein C – Icons
- [x] SVG-Icons für alles (Gebäude, Einheiten, Ressourcen, Fähigkeiten, Werkzeuge, Beliebtheit) – `packages/client/src/ui/icons/` (API in `index.ts`)
- [x] Galerie `?icons` (32/48/64/96 px, Spielerfarbe, Filter)
- [x] Test: `packages/client/test/icons.test.ts` (Client hat jetzt vitest)
- [x] Gate + Browser-Check

## 4. Meilenstein D – Grafik
- [x] Grafikstufen Niedrig/Mittel/Hoch: zentrale Tabelle `render/quality.ts` (Schatten + Shadow-Map-Größe, PCF-Weichheit, Partikelgrenzen, Gras, AO, Wasser-Shader, Pixel-Ratio-Deckel, Dekor-Sichtweite, Blob-Schatten), angewandt in `GameScene.applyGfx`; Test `client/test/render.test.ts`
- [x] Beleuchtung/Schatten: warmes Hemisphären- + Sonnenlicht, PCF-soft-Schatten, Schattenkamera folgt dem Blickpunkt (Texel-Snapping), eingebackene AO (Vertexattribut, per Stufe skalierbar), Kontaktschatten unter großen Gebäuden, warmer Dunst
- [x] Terrain: weiche Farbverläufe an Tile-Grenzen, facettierte Felsklippen mit Gesteinsbändern, Dünenmuster, wiegendes Instanced-Gras (Vertex-Shader-Wind), Steinbrocken-Haufen und Eisenadern
- [x] Wasser und Gräben: Gewässerbett + animierte Wasserfläche (Wellen, Farbspiel, Uferschaum über Vertexattribut `aFoam`), Gräben sitzen tiefer mit eigenem Farbton, Pechgraben mit Rauch
- [x] Gebäude: Baustufen (Fundament → Gerüst → wachsendes Gebäude → Staubwolke), Arbeitsanimationen (Mühlenflügel, Hammer/Axt/Hacke, Fahnen, Torflügel, Rauch/Dampf aus Schmiede, Bäcker, Pechgrube, Brauerei …), Einsturz + Trümmerhaufen + Staub, nahtlose Mauern (Pfosten + Arme je Nachbar, Zinnen, Mauerfugen, Treppen schauen zur Mauer)
- [x] Einheiten: Vertex-Shader-Animation ohne Skelett (Gehen, Nahkampfhieb, Spannen/Schießen, Arbeiten, Sterben/Umkippen und liegen bleiben), Teile per `aPivot`; getragene Waren in 10 Formen; Lord, Ritter, Belagerungsgerät klar unterscheidbar; Räder drehen sich, Wurfarme schwingen beim Schuss
- [x] Effekte: Pfeile/Bolzen/Feuerpfeile mit Bogenflug, drehende Steine mit Rauchspur und Staubwolke beim Einschlag, Feuer/Rauch/Funken instanziert, brennende Gebäude (Flammen + Rauchsäule), Ölkessel-Dampf, Pechgraben, Blut sparsam und abschaltbar (`Settings.blood`, `?blood=0`)
- [x] Auswahl: Kreise in aufgehellter Spielerfarbe, Lebensbalken (verletzte/ausgewählte Einheiten, beschädigte Gebäude), Hover-Umriss (Kantenlinien + Rahmen) und Auswahlrahmen für Gebäude
- [x] `?bench` (synthetische ClientWorld mit 2.000 kämpfenden Einheiten, 10-Hz-Ticks, Projektile, Partikel, Burgen) + `scripts/bench-fps.mjs` (alle Stufen, Markdown-Tabelle, `--hw`)
- [x] Gate (typecheck, build, test) + Browser-Check (Konsole sauber, Screenshots gesichtet)

Messung `?bench` (2.000 Einheiten, `node scripts/bench-fps.mjs --secs=12 --warm=4`, 1280x720; Testumgebung: Chromium 141 mit **Software-GL (SwiftShader)**, 4 Kerne Xeon 2,8 GHz, Rechner zeitgleich mit anderen Läufen ausgelastet, Load ≈ 9). Die FPS sind deshalb nur ein pessimistischer Richtwert, **60 FPS auf echter GPU sind nicht verifiziert**:

| Stufe | FPS (SwiftShader) | JS ohne Raster Ø / p95 | Draw-Calls | Dreiecke | gezeichnete Einheiten |
| --- | ---: | ---: | ---: | ---: | ---: |
| Niedrig | 0,9 | 3,2 / 5,2 ms | 67 | 287k | 1677 |
| Mittel | 0,6 | 3,2 / 6,0 ms | 70 | 370k | 1729 |
| Hoch | 0,5 | 4,2 / 7,1 ms | 70 | 423k | 1719 |

Ziele: Draw-Calls < 150 erreicht (70 inkl. Schattenpass), JS-Zeit ≤ 8 ms auf Mittel erreicht (3,2 ms; gemessen mit `&nodraw=1`, d. h. Draw-Calls als No-ops, damit der langsame Software-Rasterizer die JS-Zeit nicht verfälscht). Im echten Spiel liegen die Draw-Calls bei 45–50.

Entscheidungen und offene Punkte (D):
- **SSAO nicht umgesetzt:** EffectComposer verliert das Canvas-MSAA, die Normal-/Tiefenpasses passen nicht zur Vertex-Animation der Instanzen, das Bundle würde wachsen. Ersatz: eingebackene AO, Kontaktschatten, weiche Schatten. Das Feld `ssao` in `quality.ts` bleibt `false`.
- **Baufortschritt:** Die Sim setzt Gebäude sofort. Minimal erweitert: `Building.born` (Tick der Platzierung, reine Ausgabe, wird mitgespeichert) → `BuildingRec.n` im Snapshot. Der Client leitet daraus die Baustufe ab (Dauer nur visuell, `buildTicks` in `render/entities.ts`); Pause und Spielgeschwindigkeit wirken mit, Reconnect zeigt den richtigen Stand.
- Blut-Schalter: Kontrollkästchen in den Optionen (Grafik) ergänzt.
- **Bench mit synthetischer Welt statt Sim-Worker:** isoliert den Renderer und ist deterministisch (eigener Zufallsgenerator, Test in `render.test.ts`). Die echte Sim ist für 2.000 Einheiten nicht nötig, um den Renderer zu belasten.
- Die Bench-FPS stammen aus Software-GL (SwiftShader, 4 Kerne); 60 FPS auf echter GPU sind **nicht verifiziert**. Belegt sind Draw-Calls, Dreiecke und die JS-Zeit (`&nodraw=1`).
- Dig-Planung (`digMask`) wird weiterhin nur über die Geister-Rechtecke angezeigt, nicht im Terrain.
- Terrain empfing vorher keine Schatten: Chunk-Geometrie hatte keine `normal`-Attribute (Schattenversatz → keine Schatten). Behoben durch `computeVertexNormals` je Chunk.

## 5. Meilenstein E – Sound und Musik
- [x] Effekte (räumlich, Voice-Limit)
- [x] Einheiten-Rückmeldungen
- [x] Generative Musik (3 Stimmungen + Themen)
- [x] Lautstärkeregler, M = Stumm, Autoplay-Regeln
- [x] Gate + Browser-Check (Offline-Rendering aller 52 Synthesen ohne NaN/Übersteuerung, Autoplay ohne Konsolenwarnung)

## 6. Meilenstein F – Erklärungen
- [x] Tooltips Gebäude/Einheiten/Waren/Fähigkeiten/Werkzeuge: `client/src/ui/tooltip.ts` (Manager `attachTooltip`, Builder `buildingTooltip`, `unitTooltip`, `resourceTooltip`, `abilityTooltip`, `toolTooltip`, `explainPlacementError`); Inhalte als neutrale Datenstruktur in `ui/tooltips/model.ts` (ohne DOM testbar), Positionierung in `ui/tooltips/place.ts`; Testseite `?tooltips`
- [x] Stark/Schwach gegen aus `DMG_TABLE`: reine Funktion `matchups(unitId)` in `shared/src/data/matchups.ts` (Test `shared/test/matchups.test.ts`)
- [x] Enzyklopädie (Menüpunkt + F2): `ui/encyclopedia.ts` (Overlay, Navigation, Suche, `openEncyclopedia(page?)`), Seiten in `ui/encyclopedia/pages.ts`, Flussdiagramme in `ui/encyclopedia/chains.ts` (SVG automatisch aus `BUILDINGS[].prod`); Deep-Link `?enc=building/quarry`
- [x] Seiten: alle Gebäude, Einheiten, Waren (+Gold), 6 Wirtschaftsketten, Beliebtheit, Kampfsystem mit Schadensmatrix, Belagerung, Extreme-Fähigkeiten, Regeländerungen, Steuerung, KI-Lords
- [x] `shared/src/data/descriptions.ts` + `descriptions.de.ts`/`descriptions.de.enc.ts` (Deutsch fertig) + `descriptions.en.ts` (Englisch vorbereitet, Rückfall auf Deutsch); `t()`, `tf()`, `setLang()`; `?lang=en`
- [x] Regeländerungen erklärt: Bauverbot (8 Felder, aus `ENEMY_BUILD_RADIUS`) in jedem Gebäude-Tooltip und `placefail.enemy`; Katapult/Trebuchet/Feuerballista zielen von selbst nur auf Gerät; Geschützreichweiten
- [x] Geschütz-/Ölkessel-Werte aus `sim/fire.ts` nach `data/balance.ts` (`TURRETS`, `CAULDRON`), ebenso Beliebtheits-Obergrenzen (`POP_GOOD_CAP`, `POP_BAD_CAP`, `RELIGION_POP_CAP`, `POP_THRESHOLD`, `LEAVE_INTERVAL_TICKS`), Pferdezucht und Ochsen (`HORSE_BREED_SECONDS`, `OXEN_PER_TETHER`, `OX_RESPAWN_SECONDS`); Verhalten unverändert (shared-Tests grün)
- [x] Tests: `shared/test/descriptions.test.ts`, `shared/test/matchups.test.ts`, `client/test/tooltips.test.ts`, `client/test/encyclopedia.test.ts`, `client/test/chains.test.ts` (Text + Icon für jedes Gebäude/jede Einheit, keine Zahlen in Texten, keine verwaisten/toten Schlüssel, Englisch ⊆ Deutsch, Tooltip-Zahlen exakt aus den Daten, Seitenliste vollständig, Links lösen auf, Suche, Kettengraph/Layout/SVG, Positionierung)
- [x] Hotkey `encyclopedia` (Standard F2) in `game/hotkeys.ts`; die Kategorie-Hotkeys cat2..cat6 rutschen von F2..F6 auf F3..F7 (F2 war belegt); im Einzelspieler pausiert die Partie, solange die Enzyklopädie offen ist
- [x] Gate (typecheck, build, test) + Browser-Check (Hauptmenü, F2 im Spiel, Pausenmenü, alle Seitentypen, `?tooltips`, 820/1024/1280 px, de/en, keine Konsolenfehler)
- Angebunden (B): Tooltips an Bau-/Truppenleiste/Kontextpanels über `Hud.tipHook`, Platzierungsfehler über `explainPlacementError`

## Abschluss
- [x] Turnier-Endlauf: 9 Profile paarweise × 3 Seeds × 90 min = 108 Partien, 98 mit Keep-Fall (90,7 %), Median 43,8 min (Datei `OUT=/home/user/tour/t5.json`, Commit feccce3). Frühere Läufe: Milestone A 72–79 %; nach den Wirtschaftsfixes 91 % (3d5ed3c). Zwei spätere KI-Experimente (Markt bei Goldhortung zuerst; Welle erst bei Überlegenheit) brachten 86 % bzw. 84 % und wurden zurückgenommen (Reverts im Verlauf)
- [x] FPS-Messung dokumentiert (Abschnitt 4: SwiftShader-Software-GL, 60 FPS auf echter GPU NICHT verifiziert; Draw-Calls 70, JS 3,2 ms)
- [x] README aktualisiert
- [x] Abschlussbericht (im Chat)

## Gefundene Bugs / Erkenntnisse
(laufend ergänzen)
- **Patt 6v7 Seed 6 (offen):** Kaiserin Mathilde hortet 1.300 Gold bei Holz ≈ 0: ihre Holzfäller stehen 42–49 Felder vom Lager entfernt (Umgebung baumfrei), die Bogner verbrauchen jedes Stück Holz, Eisen gibt es nicht und der Markt (20 Holz) wird nie bezahlbar. Ein Fix (Markt zuerst, Holzwerkstätten pausieren) löste diesen Fall, senkte das Turnier aber auf 86 % und wurde zurückgenommen.
- **Restliche 10 Timeouts des Endlaufs:** ebenbürtige Heere, beide Seiten bei ~0 Gold; Angriffe auf intakte Verteidiger verlieren etwa 3:1 (Verteidiger auf Mauern/Türmen), die Wellen lösen sich nacheinander auf. Der Versuch, erst bei Überlegenheit anzugreifen, half nicht (84 %).
- Browser-Tests (uitest.mjs) hatten bei hoher Rechnerlast Zeitüberschreitungen (500 ms Wartezeit) – Wartezeit auf 1,5 s erhöht.
- **E (Sound):** `ClientWorld.apply` bekam `proj` (Float32Array) und `tiles` (Int32Array) nach dem msgpack-Weg als `Uint8Array` (Rohbytes) – Geschosse und Tile-Änderungen im Client-Spiegel waren Datenmüll. Fix in `shared/src/net/world.ts` (`asFloat32`/`asInt32`), Regressionstest in `shared/test/snapshot.test.ts`.
- **E (Sound):** Hotkey `M` war mit Extreme-Fähigkeit 4 belegt; Fähigkeit 4 liegt jetzt standardmäßig auf `J`, `M` = Ton stumm (`toggleMute`).
