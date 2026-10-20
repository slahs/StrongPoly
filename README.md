# StrongPoly

Browser-Echtzeitstrategie im Low-Poly-Stil: Burgenbau, Wirtschaftsketten, Beliebtheit, Belagerung, KI-Lords und Online-Mehrspieler.
Alle Namen, Texte, Modelle, Sounds und die Oberfläche sind Eigenentwürfe – es werden keine Original-Assets verwendet.
Sämtliche Modelle entstehen prozedural im Code aus Primitiven (Flat Shading, feste 24-Farben-Palette), Klänge per WebAudio-Synthese.

## Inhalt

- **Wirtschaft:** Holz, Stein (Steinbruch + Ochsengespann), Eisen, Pech, Nahrung (Äpfel, Käse, Fleisch, Brot über Weizen → Mühle → Bäcker), Hopfen → Brauerei → Schenke, fünf Waffenschmieden, Markt mit dynamischen Preisen. Jeder Arbeiter läuft physisch zwischen Arbeitsplatz und Lager; Lager, Kornspeicher und Waffenkammer wachsen nur durch angrenzende Module.
- **Beliebtheit (0–100):** Rationen, Nahrungsvielfalt, Steuern/Bestechung, Bier, Religion, Angstfaktor (gute/schlechte Dinge), Überfüllung, Ereignisse – mit Aufschlüsselung im UI. Unter 50 wandern Bauern ab.
- **Burgenbau:** Mauern per Drag-Linie (Palisade, niedrige/hohe Steinmauer), Türme, Torhäuser, Zugbrücke, Treppen, Wassergräben (von Bauern gegraben), Fallgruben, Killing Pits, Pechgräben, Ölkessel, Ballista-/Mangonel-Geschütze, Brände und Löschbrunnen.
- **Militär:** europäische Truppen (Kaserne) und arabische Söldner (nur Gold), Belagerung (Katapult, Trebuchet, Rammbock, Belagerungsturm, Mantlet, Feuerballista), Tunnelgräber, Leiterträger, unsichtbare kletternde Assassinen, Lord als Held. Schaden = Angriffstyp × Rüstungsklasse (`shared/src/data/units.ts`).
- **Extreme-Modus:** Machtleiste, fünf Fähigkeiten (Pfeilhagel, Verstärkung, Heilung, Felsschlag, Goldspende), zufällig erscheinende Fahnenstangen.
- **KI-Lords:** 9 Persönlichkeiten (`shared/src/data/ai.ts`), echte Wirtschaft (kein Cheat außer optionalem Schwierigkeitsbonus), Burgbau aus parametrischen Templates, Angriffswellen mit Belagerung, reaktive Verteidigung, Diplomatie (Verbündete schicken Truppen/Gold auf Anfrage).
- **Modi:** Gefecht gegen KI (Simulation im Web Worker, kein Server nötig), Online-Lobby mit Räumen/Teams/KI-Slots/Chat/Reconnect, 5 Tutorial-Missionen, Karteneditor (JSON-Export/Import), Speichern/Laden (IndexedDB).

## Schnellstart

Voraussetzungen: Node ≥ 20, pnpm ≥ 9.

```bash
pnpm i
pnpm dev          # Server (Port 3000) + Vite-Client (http://localhost:5173)
```

Nur Singleplayer testen: `pnpm dev:client` genügt (Simulation läuft im Worker). Für Online-Spiele wird `pnpm dev` benötigt (Vite leitet `/ws` an den Server weiter).

Weitere Skripte:

```bash
pnpm test         # Vitest (shared: Wirtschaft, Kampf, Wegfindung, Beliebtheit, KI, Save/Load; server: Lobby/Netzwerk)
pnpm typecheck    # TypeScript in allen Paketen
pnpm bench        # Lasttest: 2.000 Einheiten je Seite (Sim-/Snapshot-Zeiten)
pnpm build        # Client (Vite) + Server (esbuild-Bundle)
pnpm start        # gebauten Server starten (liefert den Client statisch aus)
```

Entwicklungs-URL-Parameter: `?bench` (Benchmark-Szene, siehe „Grafik“), `?quality=low|medium|high`, `?blood=0`, `?icons` (Icon-Galerie), `?tooltips` (alle Tooltips im Raster), `?enc=building/quarry` (Enzyklopädie-Seite direkt öffnen), `?lang=en`, `?quick=1` (sofort ein Gefecht), `&dev=1` (Dev-Befehle, z. B. Einheiten spawnen über `session().conn.dev(...)`), `&fog=1`, `&extreme=1`, `&size=`, `&seed=`, `?shots=<szene>` (feste Vergleichsszenen für Grafikprüfungen, siehe „Vergleichsszenen“).

## Architektur

```
packages/
  shared/   Spiellogik, Datentabellen, Typen, Netzwerkprotokoll (keine DOM-/Three-Abhängigkeit)
  client/   Vite + TypeScript + Three.js, UI in schlankem HTML/CSS (ohne Framework)
  server/   Node.js + ws: Lobby, Räume, autoritative Simulation, statische Auslieferung
```

**Datenfluss – Eingabe → Befehl → Simulation → Snapshot → Renderer**

1. Maus/Tastatur (und die KI) erzeugen ausschließlich `Command`-Objekte (`shared/src/sim/types.ts`). Der einzige Weg, Spielzustand zu ändern, ist `applyCommand` in der Simulation – für Mensch, KI und Netzwerk identisch; alle Befehle werden dabei validiert (Besitzer, Grenzen, Kosten).
2. `Sim.step()` läuft mit fester Tickrate (10 Ticks/s) und ist headless/deterministisch (eigener PRNG).
3. `GameHost` treibt die Sim (Geschwindigkeit/Pause) und erzeugt pro Tick einen **binären Delta-Snapshot** (`SnapshotEncoder`): geänderte Einheiten als 16-Byte-Records, geänderte Gebäude/Tiles, Projektile; Verpackung per msgpack. Der Client interpoliert zwischen Snapshots.
4. Der Client hält nur einen Spiegel (`ClientWorld`) und rendert ihn; der Renderer **liest nur Zustand**. Singleplayer nutzt exakt denselben Pfad: die Sim läuft in einem Web Worker (`client/src/game/sim.worker.ts`) und schickt dieselben msgpack-Snapshots.

**Simulation (`shared/src/sim`)** – ECS-ähnlich: Einheiten als Struct-of-Arrays (`unitstore.ts`, typisierte Arrays, Handle = Generation + Slot, bis 8.192 Einheiten), Gebäude als Objekte mit Tile-Belegungsgitter.

| Datei | Aufgabe |
| --- | --- |
| `sim.ts` | Zustand, Platzierung, Lager, Gebäudeverwaltung, Schleife |
| `nav.ts` | Zwei-Ebenen-Navigation (Boden/Mauerkrone), gecachte **Flowfields** (Dijkstra), Durchbruchskosten, Regionen |
| `movement.ts` | Flowfield-Steuerung, Treppen/Leitern, Separation per Raster-Hash |
| `economy.ts` | Arbeiter-Automaten (gehen, ernten, produzieren, liefern), Ochsen, Graben, Reparatur |
| `popularity.ts` | Rationen, Steuern, Bier, Religion, Angstfaktor, Zu-/Abwanderung |
| `combat.ts`, `fire.ts` | Auto-Targeting, Haltungen, Fernkampf mit Projektilen und Höhenbonus, Belagerung, Tunnel, Leitern, Fallen, Kessel, Feuer |
| `ai/` | KI-Controller (Wirtschaft, Burg, Rekrutierung, Wellen, Verteidigung, Diplomatie, Extreme-Fähigkeiten) |
| `extreme.ts`, `mission.ts`, `serialize.ts` | Extreme-Modus, Missionsziele, Speicherstände |

**Balancing** liegt vollständig in Datentabellen unter `packages/shared/src/data/`: `buildings.ts` (Kosten, HP, Produktionszeiten, Rezepte), `units.ts` (HP, Schaden, Reichweiten, Geschwindigkeiten, Schadenstabelle), `balance.ts` (Beliebtheit, Steuern, Feuer, Markt …), `ai.ts`, `extreme.ts`, `missions.ts`, `resources.ts`, `terrain.ts`.

**Rendering (`client/src/render`)**: Terrain als Chunks aus Terrassen-Quads mit weich verlaufenden Vertexfarben und einer Detailschicht im Shader (Fleckung, Gras, Sand, Fels, Klippenschichten, Pfade, Felder), getrennte Wasserfläche mit eigenem Shader, alle Einheiten-/Gebäudetypen und die gesamte Vegetation als `InstancedMesh` (Animation und Baumschwanken im Vertex-Shader, siehe Abschnitt „Grafik“), instanziertes Partikelsystem, ein Directional Light mit weichen, der Kamera folgenden Schatten, Tonemapping/Grading und kameraabhängiger Dunst.

**Netzwerk (`server/src`)**: serverautoritativ; Clients senden nur Befehle. Frames: `0` Kontrollnachricht, `1` Snapshot, `2` Spieleransicht (Ressourcen, Beliebtheit …, nur an den Besitzer). Jeder Client bekommt ein Token (localStorage); bei Verbindungsabbruch bleibt der Slot erhalten, und beim Wiederverbinden wird der Voll-Zustand erneut gesendet. Hinweis: Der Kriegsnebel ist ein reines Darstellungsmerkmal im Client (der Server sendet allen Spielern den Gesamtzustand).

## Deployment (Railway / Docker)

Ein einziges `Dockerfile` baut Client und Server; der Server liefert den gebauten Client statisch aus und liest `PORT` aus der Umgebung.

```bash
docker build -t strongpoly .
docker run -p 3000:3000 strongpoly      # http://localhost:3000
```

Railway: Repository verbinden – `railway.json` verweist auf das Dockerfile und den Healthcheck `/healthz`. Es sind keine weiteren Variablen nötig (`PORT` setzt Railway selbst; optional `STATIC_DIR`). Der Client verbindet sich automatisch mit `ws(s)://<host>/ws`.

**Reconnect:** Bricht die Verbindung während einer Partie ab, verbindet sich der Client alle 2 s neu (Token in `localStorage`); auch nach einem Neuladen der Seite kehrt er automatisch in die laufende Partie zurück (Marke `strongpoly.resume`, 6 h gültig). Der Server hält den Slot und schickt einen neuen Voll-Snapshot.

*Hinweis zum Docker-Build hinter TLS-abfangenden Proxys:* `corepack`/`pnpm` brauchen dort die Proxy-CA (`NODE_EXTRA_CA_CERTS`); im normalen Railway-Build ist nichts nötig.

## Grafik (`client/src/render`)

Alles prozedural: Low-Poly mit flacher Schattierung, kleine Palette (`shared/src/data/palette.ts`), keine Bilddateien und keine externen Modelle (die wenigen kleinen Rauschtexturen für Gelände und Wasser werden beim Start berechnet). Der Renderer liest nur den `ClientWorld`-Spiegel.

| Datei | Aufgabe |
| --- | --- |
| `quality.ts` | zentrale Tabelle der Grafikstufen Niedrig/Mittel/Hoch (Schatten und Shadow-Map-Größe, Schattenfilter, Partikelgrenzen, Gras, AO-Stärke, Wasserdetail, Oberflächendetail, Wolkenschatten, Randlicht, Baumschwanken, Baum-LOD, Unterholz, Blumen, Umgebungsleben, Pixel-Ratio, Dekor-Sichtweite, Blob-Schatten …); angewandt über `GameScene.applyGfx` |
| `scene.ts` | Renderer (Tonemapping Neutral), Lichtstimmung (warme Sonne, leicht kühler Himmel), Schattenkamera folgt dem Blickpunkt (mit Texel-Snapping gegen Flimmern), Dunst folgt dem Kameraabstand, Bodenkarte, Umgebungsleben |
| `terrain.ts` | Chunk-Terrain: Eckenfarben und Oberflächengewichte (Gras/Sand/Fels/nass) aus den vier angrenzenden Tiles (weiche Übergänge), Biom und großflächige Feuchte, Höhenlage, Felsklippen in drei Gesteinsschichten ohne Nahtstellen, Gewässerbett nach Tiefe plus Wasserfläche (Tiefe, Schaum, Graben-Kennung), Kriegsnebel |
| `decor.ts` | Vegetation und Felsen als Instanzen, nur im Sichtbereich: sieben Baumarten (Fichte x2, Eiche, Birke, Akazie, Zypresse, Palme) mit Größe/Neigung/Farbe je Instanz, Fernformen (LOD nach Kameraabstand), Büsche, Gras, Blumen, Kiesel, Felsen mit Moos und Schichten, Stein-/Eisen-/Pechvorkommen |
| `biome.ts`, `noise.ts`, `groundmap.ts` | rein berechnete Grundlagen: Biom je Karte, Baumart/-gestalt, Oberflächengewichte; kachelbare Rauschtexturen (prozedural, keine Bilddateien); Bodenkarte (getretene Erde, Pfade, Felder, Kontaktschatten) aus den Gebäuden |
| `ambient.ts` | Umgebungsleben im Vertex-Shader: Vogelschwärme (Mittel), Schmetterlinge und treibende Blätter/Staub (Hoch), drei Draw-Calls, keine CPU-Arbeit pro Frame |
| `materials.ts` | gemeinsame Materialien: Vertex-Animation (Beine, Arme, Bogen, Räder, Hebel, Mühlenflügel, Fahnen, Tore), Teamfarbe und Ambient Occlusion aus Vertex-Attributen, Instanzvariation, Wolkenschatten und Randlicht, Gelände-Shader (Detailschicht, Bump, Pfade/Felder), Laub mit Wind-Schwanken, Gras, Wasser-Shader (Normalen, Fresnel, Schaum, Glitzern), Farbkorrektur |
| `builder.ts`, `models_units.ts`, `models_buildings.ts`, `models_misc.ts` | prozedurale Modelle; jedes Teil trägt Animationskennung und Drehpunkt (`aPivot`), Bodenverdunklung (`aMeta.y`) ist eingebacken |
| `entities.ts`, `instanced.ts` | Einheiten, Gebäude, Mauern (Pfosten + Arme je Nachbar), Baustufen (Fundament → Gerüst → fertig, abgeleitet aus `BuildingRec.n`, dem Platzierungs-Tick im Snapshot; rein visuell), Trümmer, Leichen, Projektile, Auswahlkreise, Lebensbalken, Hover-Umriss |
| `fx.ts`, `work_fx.ts` | Partikel (Rauch, Staub, Feuer, Trümmer, Blut) und Dauereffekte an Gebäuden (Schornsteine, Dampf, Brände) |

Die Einheiten-Animation kostet keine CPU-Zeit pro Knochen: pro Instanz werden nur Phase, Zustandsflags (Gehen/Nahkampf/Schießen/Arbeiten/Tod), Schrittfrequenz und Zyklusdauer geschrieben; der Vertex-Shader dreht daraus Beine, Waffenarm, Bogen, Räder oder Wurfarm. Gefallene Einheiten bleiben kurz als Leiche liegen (Umkippen im Shader). Blut ist abschaltbar (`Settings.blood`, URL `?blood=0`).

Grafikstufen (Auszug aus `quality.ts`):

| | Niedrig | Mittel | Hoch |
| --- | --- | --- | --- |
| Schatten | 1024², hart, nur Gebäude; Blob-Schatten unter Einheiten | 2048², weich (PCF soft), alles | 4096², weich, alles |
| Partikel (max.) | 500 | 1.800 | 4.000 |
| Gras je Oasen-Tile | aus | 3 | 7 |
| Wasser | flach | animierte Normalen, Fresnel-Himmelsreflex, Uferschaum | + zweite Wellenlage, Glitzern |
| Geländedetail (Shader) | nur Bodenkarte und Grobfleckung | + Farbvariation, Gras-/Sand-/Felsstruktur, Bump | + Gesteinsschichten, Kies |
| Wolkenschatten / Randlicht | aus | 0,6 / 0,6 | 0,9 / 0,9 |
| Bäume | Fernformen ab 26 Feldern, kein Schwanken | volle Form bis 46, Schwanken, Unterholz | volle Form bis 72, mehr Unterholz und Blumen |
| Umgebungsleben | aus | Vogelschwärme (≈20) | + Schmetterlinge, Blätter/Staub (≈220 Instanzen) |
| Pixel-Ratio-Deckel | 1 | 1,5 | 2 |
| Dekor-Sichtweite | 48 | 72 | 110 |

Nicht umgesetzt: SSAO. Der Nachbearbeitungspfad (EffectComposer) würde das MSAA des Canvas verlieren, die Normalen-/Tiefenpasses der animierten Instanzen wären nicht deckungsgleich mit der Vertex-Animation, und das Bundle würde größer; stattdessen sorgen eingebackene Bodenverdunklung, Kontaktschatten unter großen Gebäuden und weiche Schatten für die Tiefenwirkung.

### Vergleichsszenen und Screenshot-Werkzeug (`?shots=`)

Zum Prüfen und Vergleichen der Grafik gibt es feste Szenen mit festen Kameras und festem Spielzustand (Karten-Seed, Gebäude, Einheiten): `/?shots=<szene>&quality=medium`. Die Szenen entstehen rein aus Daten (`client/src/showcase_scenes.ts`) und werden über dieselben Modell- und Entity-Pfade gezeichnet wie das Spiel (`EntityRenderer`), es wird nichts dupliziert; spätere Gebäude-/Figurenmodelle erscheinen daher automatisch. Die Zeit läuft synthetisch (feste Schrittweite je Frame) und `Math.random` ist gesetzt, dieselbe URL liefert Frame für Frame dasselbe Bild (Test `render_world.test.ts`).

| Szene | Inhalt |
| --- | --- |
| `early` | früher Wirtschaftsaufbau: Bergfried, Lager, Holzfäller, Hütten, wenige Bauern |
| `town` | dicht bebaute Siedlung (Markt, Kirche, Werkstätten, Felder, Mühle) mit ~100 Figuren |
| `castle` | große Steinburg: Außen- und Ringmauer, Ecktürme, Torhaus, Graben, Hofgebäude |
| `siege` | Belagerung mit mehreren hundert Soldaten, Rammböcken, Belagerungstürmen, Katapulten, Pfeilen im Flug |
| `figures`, `engines` | Detailansicht der Figuren (Ruhe, Gehen, Kampf, Arbeit) bzw. des Belagerungsgeräts |
| `map` | vollständige Spielkarte (160x160, 4 Spieler) aus großer Höhe |
| `ground`, `forest`, `water`, `coast`, `deposits` | Nahansichten: Boden mit Pfaden und Feld, dichter Wald, Gewässer, Küste und Klippen, Rohstoffvorkommen |

Weitere Parameter: `&seed=N` (andere Karte), `&frames=N` (Einschwingphase), `&cam=x,y,dist,yawGrad,neigung`, `&shadows=0`, `&hud=1`, `&live=1` (weiterlaufen statt Standbild). Das Skript `scripts/shots.mjs` rendert alle Szenen für eine Stufe in ein Verzeichnis:

```bash
pnpm build
node scripts/shots.mjs --out=docs/phase4/after/world --quality=medium            # alle Szenen
node scripts/shots.mjs --out=/tmp/shots --scenes=castle,siege --format=jpg --info # Auswahl, JPEG, Kennzahlen (info.json)
node scripts/shots.mjs --out=/tmp/shots --quality=high --check                    # Konsole prüfen (Shader-Warnungen/-Fehler => Exit-Code 2)
node scripts/shots.mjs --dist=<anderer Build> --out=docs/phase4/before/world      # Vorher-Stand aus einem älteren Build
```

Voraussetzungen wie bei `bench-fps.mjs` (`playwright-core`, Chromium, gebauter Client; ohne `--hw` Software-GL). Die Bilder des Umbaus (Vorher/Nachher, gleiche Kameras) liegen unter `docs/phase4/before/world/` und `docs/phase4/after/world/`.

### Benchmark-Szene `?bench`

`/?bench&quality=medium&units=2000&secs=20` öffnet eine eigene Szene ohne Netz und ohne Sim-Worker: zwei Heere aus gemischten Typen (Nah- und Fernkampf, Reiter, Belagerungsgerät, Bauern bei der Arbeit) laufen aufeinander zu und kämpfen vor zwei Burgen mit Mauern, Türmen, rauchenden Werkstätten und einem brennenden Gebäude. Die Welt ist ein synthetischer `ClientWorld`-Spiegel, der in 10-Hz-Ticks fortgeschrieben wird (Marsch, Kampf, Pfeil-/Steinflug, Tod mit Nachschub, damit die Einheitenzahl konstant bleibt); der Renderer wird wie im Spiel belastet. Ein Overlay zeigt FPS, Bildzeiten, JS-Zeit, Draw-Calls und Dreiecke; `window.__bench.result()` liefert `{ fps, avgMs, p95Ms, p99Ms, units, quality, cpuAvgMs, calls, triangles, … }`. Weitere Parameter: `warm` (Warmlauf, s), `seed`, `shadows=0`, `pr` (Pixel-Ratio), `dist` (Kameraabstand), `nodraw=1` (Draw-Calls als No-ops: misst die reine JS-Zeit unabhängig vom Rasterizer), `showcase=units|buildings` (Prüfszenen mit allen Einheiten bzw. Gebäuden).

```bash
pnpm build
node scripts/bench-fps.mjs                       # misst alle drei Stufen und druckt eine Markdown-Tabelle
node scripts/bench-fps.mjs --viewport=640x360 --secs=12 --out=bench.md
node scripts/bench-fps.mjs --hw                  # echte GPU statt Software-GL
```

Das Skript braucht `playwright-core` (normal installiert, per `NODE_PATH` oder `PLAYWRIGHT_CORE=<Verzeichnis>`) und ein Chromium (`CHROMIUM=<Pfad>` oder Autodetektion unter `/opt/pw-browsers`). Ohne `--hw` wird Software-GL (SwiftShader) erzwungen; deren FPS sind nur ein pessimistischer Richtwert.

## Sound und Musik (`client/src/audio`)

Alles entsteht zur Laufzeit per WebAudio-Synthese; es gibt keine Audiodateien und keine fremden Melodien.

| Datei | Aufgabe |
| --- | --- |
| `engine.ts` | Bus-Graph: Kanäle `effects`/`music`/`advisor`/`ui` mit eigenem Gain und Kompressor, danach Master, Limiter und Sichtbarkeits-Gain |
| `sfx.ts`, `voices.ts`, `synth.ts` | Effekt-Synthese (Hammer, Axt, Pickel, Amboss, Mühle, Pfeile, Schwerter, Katapult, Einsturz, Feuer, Tore, Horn, Gong, Fanfaren …), Einheitentöne je Klasse (synthetische Formantsilben, Hufe, Sehne), Karplus-Strong-Laute, Flöte, Rahmentrommel; alles läuft auch auf einem `OfflineAudioContext` |
| `music.ts`, `theory.ts` | Generativer Soundtrack: Hijaz-/Dorisch-/Phrygisch-/Hijaz-Kar-/Nahawand-/Ajam-Skalen, Rhythmuszyklen, Phrasen-Erzeugung aus einem Seed (`generatePhrase`), Schichten (Drone, Laute, Flöte, Trommel, Herzschlag, Tremolo-Pad) mit weichem Gain-Crossfade; Stimmungen `build`/`tension`/`battle`, Themen `menu`/`victory`/`defeat` |
| `mix.ts`, `mood.ts`, `classes.ts` | reine Logik ohne WebAudio (getestet): Voice-Limiter je Soundtyp + global + Drosselung, Distanz/Zoom/Pan-Berechnung, Stimmungs-Hysterese, Einheitenklassen |
| `index.ts` | `AudioEngine`: Autoplay-konforme Initialisierung (Kontext erst nach erster Geste), `play(id, x, y)`, `unitSelect/unitCommand`, `setMood`, `playTheme`, Mute, Debug-Zustand |
| `../game/soundscape.ts` | leitet aus dem Client-Spiegel Klänge ab, die die Sim nicht meldet (Bauen, Abreißen, Arbeit, Geschosse, Tore, Rekrutierung), und die Musikstimmung (feindliche Soldaten nahe eigener Gebäude → Spannung, viele Kampfereignisse → Schlacht, mit Hysterese) |

Lautstärkeregler (Master, Effekte, Musik, Berater), Musik-Schalter und Stumm stehen in den Optionen (`audio/ui.ts`, `Settings.vol*`), **M** schaltet den Ton stumm. Prüfung ohne Lautsprecher: `window.__audio.state()` (Kontextstatus, Stimmung, Stimmen, Zähler gespielter Effekte) und `window.__audio.renderAll()` (rendert jede Synthese offline und meldet Spitzenpegel, RMS und NaN).

## Bedienung (Stronghold-Stil)

Unten sitzt das Hauptpanel: links Baumenü (Reiter Burg/Industrie/Landwirtschaft/Stadt/Waffen/Nahrung, bei „Burg“ Unterkategorien Mauern/Türme/Tore/Truppen/Belagerung, Icon-Raster mit Kosten, ausgegraut wenn nicht bezahlbar, Werkzeuge Abreißen/Reparieren/Rückgängig/Abbrechen), in der Mitte das Kontextpanel (Bergfried mit Beliebtheits-Aufschlüsselung und Prognose, Kornspeicher/Lager/Waffenkammer mit Beständen und Rationen, Kaserne und Söldner mit Rekrutierung, Markt mit Preisen, Werkstätten mit Rezeptwahl und Fortschritt, Schenke/Kirche mit Abdeckung, Arbeiter an/aus, Truppenpanel mit Typ-Icons, Haltung, Formation, Patrouille, Bodenangriff, Graben, Öl), rechts die Minikarte. Platzierungs-Geist grün/rot mit Grund und Kosten am Cursor, Linien-Vorschau bei Mauern, Berater mit Meldungsliste und Kamerasprung (`Leertaste`), Endbildschirm mit Podium und Statistik. Tooltips (Hover) und Enzyklopädie (`F2`, auch im Menü) erklären alle Gebäude, Einheiten, Waren, Wirtschaftsketten und Regeln; Deutsch und Englisch (`?lang=en`).

Standard-Tasten (alle im Optionsmenü frei belegbar, `F1` zeigt die Übersicht): Linksklick wählen / Rahmen ziehen · Doppelklick: alle gleichen Einheiten · Rechtsklick: Bewegen/Angreifen/Bau abbrechen (Umschalt: Wegpunkt) · `F` Angriffsmarsch · `P` Patrouille · `G` Bodenangriff · `X` Stopp · `H`/`V`/`B` Halten/Defensiv/Aggressiv · Strg+`1..9` Kontrollgruppe setzen, `1..9` wählen · `WASD` scrollen · `Q`/`E` Kamera drehen · Mausrad/`+`/`-` Zoom · `R` Gebäude drehen · `Entf` abreißen · `U` reparieren · Strg+`Z` Platzierung zurücknehmen · `F3..F8` Baukategorien · Alt+`K/G/B/M/S/W` Bergfried/Kornspeicher/Kaserne/Markt/Lager/Waffenkammer wählen · `Pos1` Bergfried · `Y` gesamte Armee · `Leertaste` letzte Meldung · `Pause` Pause (Singleplayer) · `I`/`O`/`L`/`T` Lager/Markt/Beliebtheit/Verwaltung · `Z C N J K` Extreme-Fähigkeiten · `M` Ton stumm/an · `F9` Schatten.

## Tests

`pnpm test` führt Vitest in `shared`, `client` (Audio-Logik, Icons, Tooltips, Enzyklopädie, Wirtschaftsketten-Diagramme, HUD-Logik, Render-Tabellen) und `server` aus: Kartengenerator (inkl. Erreichbarkeit der Ressourcen), Wirtschaftsketten, Markt, Beliebtheit, Kampf/Rüstung/Tore/Treppen/Fallen/Feuer, Belagerung (Ramme, Katapult, Belagerungsturm, Leitern, Assassinen, Tunnel), alle 9 KI-Profile, Extreme-Modus, Missionen (per Skript bis zum Sieg gespielt: `missions_play.test.ts`), Determinismus (zwei identische Läufe → gleicher Hash, Save/Load-Fortsetzung), Regressionstests zu den KI-/Wirtschaftsfehlern, Rückgängig/Arbeiter an-aus, Snapshot-Roundtrip, Speichern/Laden sowie ein Netzwerktest mit zwei Clients, KI-Slot, Befehlen und Reconnect.

## Bench- und Prüfwerkzeuge (`packages/shared/bench`)

| Skript | Zweck |
| --- | --- |
| `duel.ts <A> <B> [seed] [min]` | KI gegen KI, headless, läuft bis zum Keep-Fall |
| `tournament.ts [seeds] [min] [parallel]` | alle KI-Profile paarweise (Ziel: ≥ 90 %; Endlauf 9 Profile × 3 Seeds: 98/108 = 90,7 %, Median 43,8 Min); `RERUN=<json>` wiederholt nur Timeouts; ein abgebrochenes Turnier setzt beim nächsten Start mit gleichem `OUT` dort an (`<OUT>.partial.jsonl`) |
| `aistate.ts`, `diag.ts`, `econ.ts`, `gates.ts`, `iron.ts` | Zustands- und Wirtschaftsdiagnose einzelner KI-Lords |
| `missions.ts` | Bot spielt die Tutorial-Missionen 1–5 bis zum Sieg (Grundlage von `missions_play.test.ts`) |
| `pop.ts`, `wood.ts`, `trees.ts`, `recruitwhy.ts`, `deaths.ts`, `exit.ts` | Diagnose: Bevölkerung, Holzversorgung, Rekrutierungsstau, Verluste, Spielende |
| `smoke.ts [seed] [min]` | feuert jeden Befehlstyp (auch Unsinnsparameter) gegen eine laufende Sim und prüft Invarianten (keine NaN, Bestände ≥ 0, keine Bodeneinheit in festen Gebäuden, HP ≤ Max); läuft auch als Test |
| `units.bench.ts` | Leistung bei 2.000 Einheiten |

Aufruf z. B.: `cd packages/shared && npx tsx bench/tournament.ts 3 90 4`.
