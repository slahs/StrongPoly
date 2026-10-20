# StrongPoly

Browser-Echtzeitstrategie im Low-Poly-Stil: Burgenbau, Wirtschaftsketten, Beliebtheit, Belagerung, KI-Lords und Online-Mehrspieler.
Alle Namen, Texte, Modelle, Sounds und die Oberfläche sind Eigenentwürfe – es werden keine Original-Assets verwendet.
Sämtliche Modelle entstehen prozedural im Code aus Primitiven (Flat Shading, feste 24-Farben-Palette), Effekte, Musik und Umgebungsklänge per WebAudio-Synthese; gesprochene Zeilen sind lokal mit freien Modellen erzeugte Clips (Herkunft und Lizenzen: `packages/client/public/voice/README.md`).

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
| `quality.ts` | zentrale Tabelle der Grafikstufen Niedrig/Mittel/Hoch (Schatten und Shadow-Map-Größe, Schattenfilter, Partikelgrenzen, Gras, AO-Stärke, Wasser-Shader, Pixel-Ratio, Dekor-Sichtweite, Blob-Schatten …); angewandt über `GameScene.applyGfx` |
| `scene.ts` | Renderer, Hemisphären- und Sonnenlicht, Schattenkamera folgt dem Blickpunkt (mit Texel-Snapping gegen Flimmern), Dunst |
| `terrain.ts` | Chunk-Terrain: Eckenfarben aus den vier angrenzenden Tiles (weiche Übergänge), Dünenmuster, Felsklippen mit facettierten Flächen und Gesteinsbändern, Gewässerbett plus Wasserfläche mit Uferschaum, Kriegsnebel |
| `decor.ts` | Bäume, Felsen, Steinbrocken-Haufen, Eisenadern, Pechquellen und wiegende Grasbüschel als Instanzen, nur im Sichtbereich |
| `materials.ts` | gemeinsame Materialien: Vertex-Animation (Beine, Arme, Bogen, Räder, Hebel, Mühlenflügel, Fahnen, Tore), Teamfarbe und Ambient Occlusion aus Vertex-Attributen, Gras-Wind, Wasser-Wellen |
| `builder.ts`, `models_buildings.ts`, `models_misc.ts` | prozedurale Gebäude- und Hilfsmodelle; jedes Teil trägt Animationskennung und Drehpunkt (`aPivot`), Bodenverdunklung (`aMeta.y`) ist eingebacken |
| `models_units.ts`, `unit_builder.ts`, `unit_humans.ts`, `unit_types.ts`, `unit_jobs_models.ts`, `unit_beasts.ts`, `unit_siege.ts`, `unit_items.ts` | Figuren, Berufe, Reittiere, Belagerungsgerät, Waffen/Werkzeuge/Kopfbedeckungen (siehe „Figuren“) |
| `unit_shader.ts`, `units_style.ts`, `unit_jobs.ts` | Figuren-Material mit Vertex-Animation, Farb-/Variationstabellen, Berufserkennung |
| `entities.ts`, `instanced.ts` | Einheiten, Gebäude, Mauern (Pfosten + Arme je Nachbar), Baustufen (Fundament → Gerüst → fertig, abgeleitet aus `BuildingRec.n`, dem Platzierungs-Tick im Snapshot; rein visuell), Trümmer, Leichen, Projektile, Auswahlkreise, Lebensbalken, Hover-Umriss |
| `fx.ts`, `work_fx.ts` | Partikel (Rauch, Staub, Feuer, Trümmer, Blut) und Dauereffekte an Gebäuden (Schornsteine, Dampf, Brände) |
| `builder.ts`, `models_units.ts`, `models_misc.ts` | prozedurale Modelle; jedes Teil trägt Animationskennung und Drehpunkt (`aPivot`), Bodenverdunklung (`aMeta.y`) ist eingebacken; der Builder kennt zusätzlich Detailstufen, Oberflächenarten und Bauzeitfenster (Gebäude) |
| `models_buildings.ts`, `models_castle.ts`, `models_economy.ts`, `models_town.ts`, `building_parts.ts`, `building_house.ts`, `building_palette.ts` | Gebäudemodelle aller 57 Typen (siehe „Gebäude“ unten) |
| `building_materials.ts`, `build_config.ts`, `construction.ts`, `build_sites.ts`, `models_construction.ts`, `building_fx.ts` | Gebäudematerial (Oberflächenmuster, Instanzvariation, Höhenmaske) und Bauinszenierung (siehe „Bauablauf“ unten) |
| `entities.ts`, `instanced.ts` | Einheiten, Gebäude, Mauern (Pfosten + Arme je Nachbar), Baustellen (abgeleitet aus `BuildingRec.n`, dem Platzierungs-Tick im Snapshot; rein visuell; Darstellung in `build_sites.ts`), Geschütze auf Großen Türmen, Trümmer, Leichen, Projektile, Auswahlkreise, Lebensbalken, Hover-Umriss |
| `fx.ts`, `work_fx.ts` | Partikel (Rauch, Staub, Feuer, Trümmer, Blut) und Dauereffekte an Gebäuden (Schornsteine, Dampf, Funken am Amboss, Staub im Steinbruch, Mehlstaub, Späne, Brände) |

Die Einheiten-Animation kostet keine CPU-Zeit pro Knochen: pro Instanz werden nur Phase, Zustandsflags (Gehen/Nahkampf/Schießen/Arbeiten/Tod), Schrittfrequenz und Zyklusdauer geschrieben; der Vertex-Shader dreht daraus Beine, Waffenarm, Bogen, Räder oder Wurfarm. Gefallene Einheiten bleiben kurz als Leiche liegen (Umkippen im Shader). Blut ist abschaltbar (`Settings.blood`, URL `?blood=0`).

### Figuren (`models_units.ts` und `unit_*.ts`)

Alle 26 Einheitentypen sind neu modelliert (≈ 5,5 Kopfhöhen, Hals, Rumpf, Arme mit Händen, Beine mit Knie und Stiefeln, Nase, Haare, Bärte, Kopfbedeckungen) und bleiben EIN Mesh je Typ (ein Draw-Call). Alles in einer Geometrie wird per Instanzattribut ein- und ausgeblendet; Unsichtbares klappt der Vertex-Shader zu Punkten zusammen:

- **Nah/Fern (LOD)**: nahes Modell (Infanterie ≤ 400 Dreiecke, Reiter ≤ 800, Belagerung ≤ 1500) und vereinfachtes fernes Modell (≈ 100–230) im selben Mesh; Umschalten nach Kameraabstand mit Hysterese (`LOD_NEAR_DIST`: Mittel 32, Hoch 46 Tiles, Niedrig immer fern). Grafikstufe Niedrig baut die nahen Teile gar nicht erst, Mittel lässt die Hoch-Details (Augen, Ohren, Schnallen) weg.
- **Variation je Einheit** (`unitVariant`, deterministisch aus der Einheiten-ID, keine Zufallszahlen): 8 Hauttöne, 8 Haarfarben, 32 gedeckte Stofffarben (je Typ nur passende Listen, Soldaten behalten ihre Typfarben), 3 Haarformen, Bart, 3 Hüte, Größe ±5 %, Helligkeit ±7 %. Farbklassen im Eckpunkt (`aStyle.x`) + Tonetabelle (`UNIT_TINTS`) im Shader; Instanzattribut `iVar` (Palette, Helligkeit, Sichtbarkeits-Bits, Berufs-Bit).
- **Berufe der Bauern**: die Sim kennt nur „Bauer“; der Beruf ergibt sich nur für die Darstellung aus Arbeitsplatz-Gebäude neben dem Arbeiter, Arbeitsphase (`aux >> 4`) und getragener Ware (`unit_jobs.ts`, 23 Berufe von Holzfäller über Steinmetz, Schmied, Müller, Bäcker, Brauer bis Händler und Geistlicher). Der Renderer merkt sich den zuletzt sicher erkannten Beruf je Einheit; Hüte, Schürzen und Werkzeuge hängen an Berufs-Bits, der Armstil (Hacken, Klopfen, Rühren, Graben …) folgt im Shader dem Beruf.
- **Animation (Vertex-Shader, kein Skelett)**: Arm- und Beinschwung in Gegenphase, Knie (Oberschenkel + Schienbein), Oberkörper neigt/dreht sich um die Hüfte, Wippen, Kopf (Umsehen im Stand, Blick nach unten bei der Arbeit), Umhang, Mähne/Schweif/Flammen flattern, Arbeits-/Hieb-/Stoß-/Schussstile, Räder drehen sich radiusrichtig, Wurfarm/Ramme. Tragelasten (alle 10 Formen in einem Mesh) hängen am Oberkörper des Trägers. Gefallene bleiben liegen (Umkippen unverändert).
- Prüfszenen: `?bench&showcase=units` (alle Typen in vier Zuständen; `&prof=1` zusätzlich alle Berufe, `&labels=1` Beschriftung, `&still=1` feste Kamera, `&face=0.75` Seitenansicht), `?bench&showcase=single&type=8&state=attack|walk|work|stand|dead&job=1&carry=1` (eine Einheit, Bildserien mit `__bench.setTime(t)`).

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

### Gebäude (4B)

Art Direction „Refined Stylized Medieval“: warme, leicht entsättigte Erdpalette (`building_palette.ts`: Stein in drei Stufen mit Fugen, Putz cremig, Holz in drei Brauntönen, Terrakotta/Schiefer/Stroh), kräftige Silhouetten, Details auf drei Ebenen. Spielerfarbe nur an Fahnen, Bannern, Wimpeln, Dachfirsten und Kegeldächern der Burgtürme.

- **Großform / Mittelform / Feindetail:** Großform und Mittelform (Fenster, Türen, Balken, Fachwerk, Schornsteine) sind echte Geometrie mit Detailstufe `det(0|1|2)`; das Feindetail (Quaderfugen, Bretter, Hohlziegel, Stroh, Schindeln, Pflaster, Rundholz) zeichnet der Fragment-Shader aus dem Vertexattribut `aSurf` (`building_materials.ts`) – dadurch bleiben die Modelle bei wenigen hundert bis ~2.500 Dreiecken (Bergfried ~4,3k, Budgets im Test). Eingebackene Ambient Occlusion (Bodenverlauf plus Fußverdunklung je Teil), Farbabweichung je Teil (Jitter) und je Instanz (kleine Abweichung aus der Instanzphase).
- **Baukasten (`builder.ts`, additiv):** Quader, Balken zwischen zwei Punkten, Zylinder/Kegel, Prisma aus Polygon (Bögen, Giebel), Walm-, Pult- und Satteldach, Kegelstumpf (Sockel mit Anlauf), Kugel; Bauteile in `building_parts.ts` (Tür, Fenster, Schießscharte, Zinnenkranz, Rundturm, Dächer, Fahnen, Requisiten) und `building_house.ts` (Haus mit Sockel, Fachwerk, Fenster, Dach, Schornstein).
- **Gebäudetypen:** Bergfried (Sockel mit Anlauf, Quaderkörper, Wehrgang mit Konsolen und Zinnen, vier Eckrundtürme mit Spielerdach, Aufsatz mit Walmdach und großer Flagge, Torbogen mit Fallgitter, Banner, Strebepfeiler), Wirtschaftsgebäude mit eigenen Produktionsdetails (Mühle mit Flügelkreuz, Bäckerei mit Backofenkuppel, Brauerei mit Kupferkessel, Schmiede mit Esse und Amboss, Gerberei mit Trockenrahmen, Steinbruch mit Kran, Holzfäller mit Stapeln, Farmen mit Zäunen, Lager mit Schuppen …), Militär (Kaserne mit Flankentürmen und Übungsplatz, Söldnerzelt, Stall, Ingenieurzunft mit Kran, Verlies), Türme (Wachturm, Wehrturm mit Erkern, Großer Turm), Tore (Holz mit Palisadenkranz, Stein mit Zwillingstürmen und Fallgitter), Zugbrücke, nahtlose Mauern (Holz/niedrig/hoch) mit Wehrgang, Zinnen und Mauerband, Ölkessel, Ballista und Mangonel auf dem Großen Turm (`BuildingRec.u`; zielen auf den nächsten gegnerischen Bergfried), Kirchen (Kapelle, Kirche, Kathedrale), Hütte, Brunnen, Garten, Statue, Maibaum, Galgen, Pranger, Fallen.
- **Grafikstufen:** Niedrig nutzt Detailstufe 1 und schaltet die Oberflächenmuster ab (`buildingLevelOf` in `building_materials.ts`), Mittel/Hoch zeigen alles. Hover-Kanten nutzen die Grundform (Stufe 0).
- **Lebendige Welt (Gebäudeanteil):** Rauch aus Schornsteinen und Essen, Dampf über Brauerei, Funken am Amboss, Staub im Steinbruch und an der Mine, Mehlstaub an der Mühle, Späne am Hackklotz (`work_fx.ts`, über `particleScale`/`workSmoke` der Grafikstufe begrenzt); Mühlenflügel, Fahnen, Banner und Tore bewegen sich im Vertex-Shader.

### Bauablauf (4C, rein visuell)

Ein Gebäude ist unmittelbar nach der Platzierung funktional; die Bauanimation verursacht keine Wartezeit, keine Kosten und keinen Einfluss auf Sim, KI, Multiplayer oder Snapshots. Der Renderer leitet den Fortschritt aus `world.tick − BuildingRec.n` ab (`n` = Platzierungs-Tick, bereits Teil des Snapshots) – Pause und Spielgeschwindigkeit wirken dadurch automatisch mit. Ist die Platzierung länger her als die Bauzeit (Reconnect, Laden, Voll-Snapshot, Zuschauer), ist das Gebäude fertig und wird **nicht** neu aufgebaut; bei jungen Platzierungen zeigt der Voll-Snapshot den passenden Zwischenstand.

- **Konfiguration:** `render/build_config.ts` – Klasse und Dauer je Gebäudetyp (`BUILD_CLASS_OF`, `BUILD_CLASS_SECONDS`, Einzelwerte in `BUILD_SECONDS_OVERRIDE`, Typen ohne Gerüst in `NO_SCAFFOLD`, Mauerstaffelung in `WALL_SWEEP`). Richtwerte: kleine Wirtschaftsgebäude 1,4–3 s, größere 3–5 s, Türme und Tore 4–7 s, Mauern ~1 s je Stück (der Zug läuft als zusammenhängende Welle, höchstens ~2,4 s Gesamtverzögerung).
- **Stadien (`construction.ts`, reine Funktionen):** Bodenstaub und Fundament → Baumaterial am Boden und wachsendes Gerüst → Teile erscheinen von unten nach oben (Wände schichtweise, Dach und Aufbauten folgen) → Gerüst wird abgebaut → Abschlusseffekt (Staubring, Funken, Splitter). Fortschritt, Gerüsthöhe, Materialmenge und Staub sind stetig (Test gegen Sprünge).
- **Aufbau ohne Skalierung:** Jedes Modellteil trägt ein Zeitfenster und seinen Höhenbereich (`aBuild`); der Shader blendet per Höhenmaske nur den bereits „gebauten“ Teil ein (`constructionMaterial`, frische Kante etwas heller). Fenster folgen der Höhe, ein Teil beginnt erst, wenn das darunterliegende fertig ist – schwebende oder versinkende Dächer sind ausgeschlossen. Der Schatten nutzt dieselbe Maske. Baustellen laufen über die eigene Klasse `BuildSites` (`build_sites.ts`), `entities.ts` ruft sie nur auf.
- **Abbruch, Rückgängig, Zerstörung, Reparatur:** Abbruch/Rückgängig während des Baus räumt die Baustelle mit einer Staubwolke auf; Zerstörung löst wie sonst Einsturz und Trümmer aus; Auswahlrahmen, Lebensbalken und Arbeiteranzeige sind unabhängig vom Bauzustand.

Prüfszenen: `/?bench&showcase=buildings&still=1` (alle Gebäudetypen im festen Raster, Kamera ohne Schwenk; `__bench.setCamera(x, y, dist)`), `/?bench&showcase=build&still=1` (Baustellen aller Größen und drei Mauerlinien; `__bench.setTick(1000 + Alter)` stellt das Alter in Ticks ein), `/?quick=1&dev=1` mit `session().conn.dev('build', { owner: 0, type, x, y, rot })` für Bau im laufenden Spiel (und `dev('turret', { x, y, kind })` für Geschütze).

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

`/?bench&quality=medium&units=2000&secs=20` öffnet eine eigene Szene ohne Netz und ohne Sim-Worker: zwei Heere aus gemischten Typen (Nah- und Fernkampf, Reiter, Belagerungsgerät, Bauern bei der Arbeit) laufen aufeinander zu und kämpfen vor zwei Burgen mit Mauern, Türmen, rauchenden Werkstätten und einem brennenden Gebäude. Die Welt ist ein synthetischer `ClientWorld`-Spiegel, der in 10-Hz-Ticks fortgeschrieben wird (Marsch, Kampf, Pfeil-/Steinflug, Tod mit Nachschub, damit die Einheitenzahl konstant bleibt); der Renderer wird wie im Spiel belastet. Ein Overlay zeigt FPS, Bildzeiten, JS-Zeit, Draw-Calls und Dreiecke; `window.__bench.result()` liefert `{ fps, avgMs, p95Ms, p99Ms, units, quality, cpuAvgMs, calls, triangles, … }`. Weitere Parameter: `warm` (Warmlauf, s), `seed`, `shadows=0`, `pr` (Pixel-Ratio), `dist` (Kameraabstand), `nodraw=1` (Draw-Calls als No-ops: misst die reine JS-Zeit unabhängig vom Rasterizer), `showcase=units|buildings|build` (Prüfszenen mit allen Einheiten, allen Gebäuden bzw. Baustellen), `still=1` (Kamera ohne Schwenk, reproduzierbare Aufnahmen).

```bash
pnpm build
node scripts/bench-fps.mjs                       # misst alle drei Stufen und druckt eine Markdown-Tabelle
node scripts/bench-fps.mjs --viewport=640x360 --secs=12 --out=bench.md
node scripts/bench-fps.mjs --hw                  # echte GPU statt Software-GL
```

Das Skript braucht `playwright-core` (normal installiert, per `NODE_PATH` oder `PLAYWRIGHT_CORE=<Verzeichnis>`) und ein Chromium (`CHROMIUM=<Pfad>` oder Autodetektion unter `/opt/pw-browsers`). Ohne `--hw` wird Software-GL (SwiftShader) erzwungen; deren FPS sind nur ein pessimistischer Richtwert.

### Lokaler Test auf dem MacBook (Safari) – Anleitung

Ziel: messen, wie flüssig das Spiel auf einem MacBook Air M3 in Safari läuft. Die Zahlen aus dieser Entwicklungsumgebung stammen von **Software-Rendering (SwiftShader) ohne GPU** und sind nur Richtwerte; „60 FPS bei 2.000 Einheiten“ gilt erst als erreicht, wenn es auf echter Hardware gemessen und zurückgemeldet wurde.

**1. Einrichten (einmalig)**

```bash
# Node ≥ 20 (z. B. brew install node), dann im Repository-Ordner:
corepack enable                          # falls pnpm fehlt; das Repository legt pnpm 10.28 fest
corepack pnpm i
corepack pnpm --filter @strongpoly/client dev      # Vite-Dev-Server, http://localhost:5173
```

Der Client-Dev-Server genügt für alles außer Online-Spielen (`corepack pnpm dev` startet zusätzlich den Server auf Port 3000). Für Messungen ist der gebaute Client genauer als der Dev-Server (keine Dev-Hilfen, minimierter Code): `corepack pnpm build && corepack pnpm --filter @strongpoly/client preview` (Standard `http://localhost:4173`); die URLs unten gelten dort gleich.

**2. Safari vorbereiten**

- Safari → Einstellungen → Erweitert → „Funktionen für Webentwickler anzeigen“; danach Entwickler → „JavaScript-Konsole einblenden“ (⌥⌘C). WebGL 2 ist in Safari ab Version 15 standardmäßig an; ob es läuft, zeigt das Spiel selbst (sonst erscheint die Meldung „StrongPoly braucht WebGL 2 …“).
- **Energiesparmodus aus** (Systemeinstellungen → Batterie), am besten am Netzteil: im Energiesparmodus begrenzt macOS Safari auf 30 Bilder/s, das verfälscht jede FPS-Messung.
- Fenster/Vollbild in der Größe, in der du normalerweise spielst, und nur einen Tab offen lassen (Hintergrund-Tabs werden gedrosselt). Auf dem Retina-Display rechnet das Spiel je Stufe mit höchstens Pixel-Ratio 1 (Niedrig), 1,5 (Mittel) oder 2 (Hoch) – die tatsächliche Zeichenauflösung steht im Overlay/Ergebnis (`viewport`); der Benchmark selbst startet mit Pixel-Ratio 1, `&pr=2` simuliert die volle Retina-Auflösung.
- Ton: Safari erlaubt Audio erst nach der ersten Maus-/Tastaturbedienung; danach laufen Musik, Umgebung und Stimmen. Die Browser-Stimme (Ersatz, wenn ein Clip fehlt) nutzt die in macOS installierten deutschen Stimmen (Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme verwalten).

**3. Was wo ausprobiert wird** (alle Adressen mit `http://localhost:5173/`)

| Adresse | Zweck |
| --- | --- |
| `?quick=1` | sofort ein Gefecht gegen die KI (normales Spiel, FPS unten rechts im Bild) |
| `?quick=1&dev=1` | wie oben mit Dev-Befehlen (`session().conn.dev('spawn', {...})`, siehe „Entwicklungs-URL-Parameter“) |
| `?bench&quality=medium&units=2000&secs=20` | **Hauptmessung:** 2.000 kämpfende Einheiten, 20 s Messfenster nach 3 s Warmlauf |
| `?bench&quality=medium&units=2000&secs=20&nodraw=1` | dieselbe Szene ohne Zeichnen (Draw-Calls als No-ops): reine **JS-Zeit** pro Bild |
| `?bench&quality=low` / `…=high` | die anderen Stufen; `&pr=2` Retina-Auflösung, `&dist=36` Kameraabstand wie in unseren Tabellen |
| `?bench&showcase=units` / `showcase=buildings` / `showcase=build` | Prüfszenen: alle Figuren, alle Gebäude, Baustellen |
| `?shots=castle&quality=medium` (auch `early`, `town`, `siege`, `figures`, `map` …) | feste Vergleichsszenen zum Ansehen |
| `?quick=1&motiondebug` (oder **F10**) | Bewegungs-Debug: Overlay mit Puffer, Snapshot-Abstand, Kennzahlen; `&motionlegacy=1` zeigt das alte Verhalten zum Vergleich |

**4. Ergebnis ablesen und zurückmelden**

- Während des Laufs zeigt das Overlay oben links FPS, Bildzeit, JS-Zeit (Aktualisierung/Rendern), Draw-Calls, Dreiecke. Nach „Messung beendet“ steht das Ergebnis in der Konsole als Zeile `BENCH_DONE {…}`; mit `window.__bench.result()` (in die Konsole tippen) bekommt man dasselbe Objekt: `fps`, `avgMs`, `p95Ms`, `p99Ms`, `cpuAvgMs` (JS-Zeit), `updateMs`/`renderMs`, `calls`, `triangles`, `unitsDrawn`, `quality`, `viewport`, `gl` (Name der GPU).
- Bitte je Stufe (Niedrig, Mittel, Hoch) einmal mit und einmal mit `&nodraw=1` laufen lassen und zurückmelden: Mac-Modell und macOS-/Safari-Version, Fenstergröße/Skalierung, Stufe, **`BENCH_DONE`-Zeile** (kopieren), eventuelle Konsolenfehler (rote/gelbe Zeilen) und den subjektiven Eindruck (ruckelt es beim Scrollen/Zoomen, beim Kampf, beim Start?).
- **Gesamt-FPS gegen JS-Zeit:** `fps`/`avgMs` ist die ganze Bildzeit (JS + GPU + Anzeige). `cpuAvgMs` ist nur die JS-Arbeit je Bild; im `nodraw=1`-Lauf ist sie vom Rasterisieren unabhängig. Ziel Mittel: JS-Zeit ≤ 8 ms, Draw-Calls < 150. Liegt die JS-Zeit weit unter der Bildzeit (z. B. 5 ms gegen 25 ms), ist die GPU/Auflösung der Engpass (Pixel-Ratio senken oder Stufe wechseln); liegen beide dicht beieinander, ist es die CPU (Sim/Snapshots/Animation).
- Ein normaler Spieltest (`?quick=1`, eigene Burg bauen, Truppen schicken, Schlacht mit `&dev=1` und mehreren Hundert gespawnter Einheiten) ist mindestens so wichtig wie die Zahl: Zittern von Figuren, Hänger beim ersten Auftauchen eines Gebäude-/Einheitentyps, Ton (Stimmen, Berater, Umgebung) und Schärfe der Darstellung.

**5. Bekannte Safari-/macOS-Eigenheiten, die das Spiel abfängt**

Rechtsklick: Zwei-Finger-Tipp oder **Strg+Klick**; Trackpad-Pinch zoomt die Kamera (nicht die Seite); `⌥`-Kombinationen (`Alt+H` Berater wiederholen, `Alt+K/G/B/M/S/W` Gebäude anwählen) schwenken die Kamera nicht mit; bei gehaltener `⌘`-Taste sendet Safari kein `keyup` – gehaltene Tasten werden beim Loslassen von `⌘` verworfen, die Kamera bleibt nicht hängen. Das Mac-Tastenfeld hat keine Entf- und keine Pause-Taste: **Backspace (⌫) reißt ab** wie Entf (Standardbelegung), die Pause liegt auf der Schaltfläche neben der Geschwindigkeit (oder per Optionen auf eine andere Taste legen); die Funktionstasten (`F1` Hotkeys, `F2` Enzyklopädie, `F3`–`F8` Baumenüs, `F9` Schatten, `F10` Bewegungs-Debug) brauchen `Fn` bzw. die Einstellung „F1, F2 usw. als Standardfunktionstasten“. Fehlt WebGL 2 oder ist `IndexedDB` gesperrt (privates Fenster), erscheint eine Meldung statt einer leeren Seite bzw. eines stillen Fehlers beim Speichern. Alle Shader nutzen nur WebGL-2-Kernfunktionen (keine Erweiterungen); die statische Prüfung steht in `PROGRESS-4.md` („Safari-Risiken“).

### Abnahme-Skripte im echten Browser (`scripts/qa`, Meilenstein 4H)

Die Skripte spielen die verbindlichen Szenarien 1–12 mit Playwright und Chromium (Software-GL) durch; sie prüfen Zustände über `window.session()`, `window.__audio`, `window.__motion` und `window.__place` (Platzierungsregeln der Sim) und legen Ergebnisse (`<szenario>.json`) und Bilder unter `docs/phase4/qa/` ab.

```bash
pnpm build                                   # die Skripte laden packages/client/dist (und für s11 packages/server/dist)
export PLAYWRIGHT_CORE=<Ordner von playwright-core>   # oder NODE_PATH; Chromium unter /opt/pw-browsers oder CHROMIUM=<Pfad>
node scripts/qa/run.mjs s01_start s02_economy        # Szenarien nacheinander (ohne Namen: alle s*.mjs), Protokolle in $TMP/strongpoly-qa
node scripts/qa/s04_castle.mjs --fast [--legacy]     # einzeln; --fast = Niedrig/640x360 für aussagekräftige Bewegungskennzahlen
```

| Skript | Szenario |
| --- | --- |
| `s01_start.mjs` | 1 Gefecht gegen KI (Hauptmenü und `?quick=1`) |
| `s02_economy.mjs` | 2 Wirtschaftsgebäude, Bauanimation (Zeitpunkte), Sofortbau, Einzug/Produktion |
| `s03_motion.mjs` | 3 Bauern bei der Arbeit, `__motion`-Kennzahlen neu gegen `&motionlegacy=1` |
| `s04_castle.mjs` | 4 Burg mit Mauerwelle, Tor, Türmen, Treppen, Geschütz; Truppen über Tor/Treppe/Mauer |
| `s05_units.mjs` | 5 Auswahl, Rahmen, Formationen, Angriffsmarsch, Patrouille, Stopp/Haltung, Hotkey-Kollisionen |
| `s06_voices.mjs` | 6 Stimmen: Autoplay, alle Clips dekodieren, Auswahl/Befehle, Untertitel, Regler, Aufnahme je Rolle + Rücktranskription (Whisper, Python-Umgebung aus `scripts/check_voices.py`) |
| `s07_advisor.mjs` | 7 Ressourcenmangel → Berater (einmal, Text, Stimme, Alt+H, Sprung), Hunger |
| `s08_popularity.mjs` | 8 Steuern/Rationen → Hover, Detailansicht, Bergfried-Panel, Berater |
| `s09_battle.mjs` | 9 Schlacht mit mehreren Hundert Soldaten: Lesbarkeit, Pegel am Bus, Gleichzeitigkeit der Klänge, Leichen |
| `s10_saveload.mjs` | 10 Speichern/Laden: keine Neubau-Animation, gleiche Welt, Musik/Atmosphäre, ruhige Bewegung |
| `s11_online.mjs` | 11 Server + zwei Clients + KI, Trennen/Wiederverbinden/Offline/Neuladen |
| `s12_quality.mjs` | 12 Grafikstufen zur Laufzeit wechseln, Nah/Fern; `--shots` ruft `scripts/shots.mjs --check` für alle Stufen auf |
| `s13_leaks.mjs` | Spielstart/-ende dreimal: Geometrien, Texturen, Programme, Szenenobjekte, Listener, JS-Heap |
| `s14_missions.mjs` | Tutorial-Missionen 1–5 starten, Zufallsbedienung, Konsole sauber, Berater nicht zugespammt |
| `s15_nowebgl.mjs` | ohne WebGL 2: verständliche Meldung |
| `perf_profile.mjs` | CPU-Profil (Spielstart bzw. `?bench&nodraw=1`) mit Hotspot-Tabelle |
| `compare_shots.mjs` | „Nachher“-Aufnahmen mit den Kameras der Vorher-Bilder (`docs/phase4/final/`) |

## Sound, Musik, Stimmen und Umgebung (`client/src/audio`)

Effekte, Musik und Umgebungsklänge entstehen zur Laufzeit per WebAudio-Synthese (keine fremden Melodien). Gesprochene Zeilen
(Einheiten, Bewohner, Hofberater) sind **vorab erzeugte Sprachclips** (`client/public/voice/<lang>/`, lokal mit freien neuronalen
Modellen synthetisiert, siehe „Stimmen“); fehlt ein Clip, springt die Browser-Sprachausgabe ein oder die Zeile erscheint nur als Untertitel.

| Datei | Aufgabe |
| --- | --- |
| `engine.ts` | Bus-Graph: Kanäle `effects`/`music`/`advisor`/`ui`/`voice`/`ambient` mit eigenem Gain und Kompressor, danach Master, Limiter und Sichtbarkeits-Gain |
| `sfx.ts`, `voices.ts`, `synth.ts` | Effekt-Synthese (Hammer, Axt, Pickel, Amboss, Mühle, Pfeile, Schwerter, Katapult, Einsturz, Feuer, Tore, Horn, Gong, Fanfaren …), Karplus-Strong-Laute, Flöte, Rahmentrommel; `voices.ts` ist nur noch der letzte Ausweg (kurze synthetische Rückmeldung), wenn weder Clip noch Browser-Stimme sprechen können; alles läuft auch auf einem `OfflineAudioContext` |
| `music.ts`, `theory.ts` | Generativer Soundtrack: Hijaz-/Dorisch-/Phrygisch-/Hijaz-Kar-/Nahawand-/Ajam-Skalen, Rhythmuszyklen, Phrasen-Erzeugung aus einem Seed (`generatePhrase`), Schichten (Drone, Laute, Flöte, Trommel, Herzschlag, Tremolo-Pad) mit weichem Gain-Crossfade; Stimmungen `build`/`tension`/`battle`, Themen `menu`/`victory`/`defeat` |
| `mix.ts`, `mood.ts`, `classes.ts` | reine Logik ohne WebAudio (getestet): Voice-Limiter je Soundtyp + global + Drosselung, Distanz/Zoom/Pan-Berechnung, Stimmungs-Hysterese, Einheitenklassen |
| `voice.ts`, `voice_logic.ts`, `voice_groups.ts`, `voice_api.ts` | Sprachsystem (`AudioEngine.voice`, Vertrag `VoiceApi`): Tor mit Prioritäten/Mindestabständen/Wiederholungssperre, Zeilenauswahl, Zuordnung Einheit/Gebäude → Sprecher, Clip- oder Ersatzwiedergabe, räumliche Mischung |
| `clips.ts`, `clips_check.ts`, `subtitles.ts` | Clip-Register (Manifest, träges Laden, Vorladen, LRU), Browserprüfung aller Clips, Untertitel-Overlay |
| `ambience.ts`, `ambience_logic.ts` | Umgebungsgeräusche: Klangbetten und Einzelereignisse (synthetisiert), reine Dichte-/Auswahlregeln |
| `index.ts` | `AudioEngine`: Autoplay-konforme Initialisierung (Kontext erst nach erster Geste), `play(id, x, y)`, `selectionSelect/selectionCommand/buildingSelect/speakEvent`, `voice`, `updateAmbience`, `setMood`, `playTheme`, Mute, Debug-Zustand |
| `../game/soundscape.ts` | leitet aus dem Client-Spiegel Klänge ab, die die Sim nicht meldet (Bauen, Abreißen, Arbeit, Geschosse, Tore, Rekrutierung), die Musikstimmung (feindliche Soldaten nahe eigener Gebäude → Spannung, viele Kampfereignisse → Schlacht, mit Hysterese), die Umgebungsbeobachtung (Wasser/Bäume um den Blickpunkt, Siedlungsdichte, Feuer, Kampf nah/fern) und die ereignisbezogenen Stimmen (Arbeit, Abschluss, verwundet, Lagewechsel) |

Regler (Optionen, `audio/ui.ts`, `Settings.vol*`): Gesamt, Effekte, Musik, Berater, **Einheitenstimmen**, **Umgebung**; Schalter Musik, **Untertitel bei Sprache**, **Browser-Stimme als Ersatz**, Stumm. **M** schaltet den Ton stumm.
Prüfung ohne Lautsprecher: `window.__audio.state()` (Kontext, Stimmung, Stimmen, Zähler, Sprachsystem, Umgebung), `window.__audio.renderAll()` (rendert jede Synthese – auch die der Umgebung – offline und meldet Spitzenpegel, RMS und NaN) und `window.__audio.checkClips()` (lädt und dekodiert alle Sprachclips, meldet Länge, Pegel, NaN).

### Stimmen (Meilenstein 4D)

- **Daten:** `shared/src/data/voices.de.ts` / `voices.en.ts` (originelle Sätze je Gruppe und Ereignis, Schlüssel `<gruppe>.<ereignis>.<nr>`), `voices.ts` (Ereignisse, Stimmprofile, Zeilenregister). 20 Gruppen: Schwertkämpfer, Speer/Pike, Bogenschütze, Armbrust, Ritter, Söldner (arabische Einheiten), Assassine, Belagerungsmannschaft, Ingenieur, Mönch, Lord, Bauer, Holzfäller, Steinmetz/Steinbruch, Landwirt, Bäckerin, Müller, Brauer, Schmied, Händler – dazu der Hofberater (`advisor`, ruhige und dringende Zeilen). Ereignisse: Auswahl, Bewegungsbefehl, Angriff, Halten/Verteidigung, Arbeiten, Abschluss, verwundet, Besonderes; mindestens drei Varianten je Ereignis (Test).
- **Auslöser:** neue Auswahl (dieselbe Auswahl in kurzer Folge bleibt stumm), Befehle (Bewegen, Angriff/Angriffsmarsch, Stopp/Haltung), Anwählen eines Gebäudes (Bewohner: Schmied, Bäckerin, Händler …), Soundscape: Arbeit/Abschluss der Arbeiter und Werkstatt-Bewohner (selten, ein Kandidat je 16–36 s), verwundete Soldaten, Lagewechsel (erster Feind → Halten-Ruf, Schlachtbeginn → Angriffsruf), Mannschaft eigener Belagerungsgeräte beim Schuss.
- **Verhalten (`voice_logic.ts`):** Mindestabstände global und je Stimme je Ereignisart (Auswahl 0,3/0,7 s, Arbeit 7/26 s …), gleiche Zeile nie zweimal hintereinander (Mischbeutel + Tor), höchstens eine Einheitenstimme zugleich (Spielerrückmeldung unterbricht Hintergrundgerede), Berater zusätzlich (eine Zeile, höhere Priorität verdrängt, wichtige Zeilen warten kurz in einer Schlange), Einheiten räumlich (Entfernung, Tiefpass, Pan; Spielerrückmeldung bleibt hörbar), Berater nicht räumlich. Stumm (M) und Lautstärke 0 werden respektiert; mit Lautstärke 0 bleiben die Untertitel.
- **Untertitel:** Overlay unten mittig (`#voice-subtitles`), Option „Untertitel bei Sprache“, `voice.onSubtitle(text, voice)` für andere Oberflächenteile.
- **Wiedergabe:** Clip aus dem Register (Vorrang) → sonst Browser-Sprachausgabe (`speechSynthesis`, `de-DE`/`en-US`, Tonhöhe/Tempo je Profil, abschaltbar) → sonst nur Untertitel. Ein Clip wird nur benutzt, wenn sein Text zur angefragten Zeile passt (sonst würde eine umformulierte Beraterzeile den falschen Satz sprechen).
- **Clips erzeugen:** `scripts/gen-voices.sh` (exportiert die Zeilen, erzeugt alle Clips + `manifest.json`; `VOICE_LANG=en` für Englisch), Prüfung `scripts/check-voices.sh` (Signal + Rücktranskription). Quellen und Lizenzen der Stimmen: `client/public/voice/README.md`; eigene Aufnahmen einsetzen: ebenda („Eigene Aufnahmen oder ein anderes Paket“), oder `?voicepack=<URL-Präfix>`.
- **Stand:** siehe `PROGRESS-4.md` Abschnitt 4D (Stimmen, Clipzahl, Qualitätseinschätzung, was Ersatz ist).

### Umgebungsgeräusche (Meilenstein 4G)

Klangbetten (Wind, Blätterrauschen, Wasser, Siedlungsgemurmel, Feuer, ferner Gefechtslärm) und seltene Einzelereignisse (Vogelrufe, Feuerknacken, ferne Waffenschläge) laufen auf dem Kanal `ambient` (Regler **Umgebung**). Pegel und Raten kommen aus `ambience_logic.ts`: abhängig vom Kamerazoom (nah = Details, fern = Wind), von der Umgebung des Blickpunkts (Wasseranteil und -richtung, Baumdichte, offenes Land), von Siedlungsdichte (Bauern, Gebäude, Märkte), brennenden Gebäuden, Kampf im Bild/außerhalb und der Spiellage (Frieden › Spannung › Schlacht dämpft Natur und Siedlung, in der Schlacht keine Vögel). Keine Hammerwand: Werkstattgeräusche je Typ nur von den 2–3 nächsten Gebäuden (Dichte-Dämpfung, Phasenversatz), Arbeitsgeräusche der Bauern mit begrenzter Gesamtrate, Einzelereignisse über das Voice-Limit (Vögel höchstens 2 zugleich). Alle Klänge sind synthetisiert (keine Dateien).

## Bewegung und Interpolation (`client/src/render/motion*.ts`, `shared/src/net/interp.ts`)

Die Sim tickt mit 10 Hz, gezeichnet wird mit der Bildrate des Geräts. Damit Einheiten gleichmäßig laufen, entkoppelt der Client beides:

- **Positionshistorie** (`ClientWorld`): je Einheit die letzten vier Stützstellen mit Sim-Tick. Einheiten ohne Delta-Eintrag stehen (sie behalten ihre letzte Stützstelle, nichts pendelt zurück); übersprungene Ticks werden über die Zwischenstelle am vorigen Snapshot sauber abgebildet; Sprünge (Teleport) werden nicht interpoliert.
- **Darstellungsuhr** (`RenderClock`): eigene, gleichmäßige Uhr in Sim-Ticks (Frame-Zeit × Spielgeschwindigkeit, Pause friert sie ein). Snapshots korrigieren sie nur sanft (höchstens ±6 % Zeitraffer), gezeichnet wird mit mindestens einem Tick Verzögerung plus gemessenem Jitter (Puffer wächst langsam, sinkt langsam). Extrapolation höchstens 0,3 Tick; bei großem Fehler (Aussetzer, Reconnect) harte Neusynchronisation.
- **Pose** (`UnitMotion`): Position leicht geglättet (nimmt die 1/16-Tile-Rasterung der Snapshots heraus), Blickrichtung bei Bewegung aus der tatsächlichen Bahn, sonst aus der Sim-Ausrichtung, zeitbasiert über den kürzesten Weg mit begrenzter Drehrate; die **Gehphase** wächst mit der zurückgelegten Strecke (gleiche Schrittweite bei jedem Tempo, kein Marschieren auf der Stelle, beim Anhalten Auslaufen bis zum Nulldurchgang).

Prüfwerkzeuge:

| Aufruf | Zweck |
| --- | --- |
| `?motiondebug` oder **F10** | Overlay: Darstellungszeit, Uhr, Puffer, Snapshot-Abstand, Korrekturereignisse (Resync, Teleport, Posensprung, leerer Puffer, mehrere Snapshots je Frame), Kennzahlen der gezeichneten Bewegung, Daten der gewählten Einheit; Zeichnung über dem Spiel: Sim-Position (rot), gezeichnete Position (grün), Blickrichtung (cyan), Spur |
| `?quick=1&dev=1&motion=pawns\|gate\|formation\|haul\|stairs\|crowd` | reproduzierbare Prüfszenen (Bauern vor dem Bergfried, enges Tor, Formation, Warentransport, Treppen/Mauern, große Ansammlung); Gegner untätig, Overlay und Messung an; `window.__motion.report()` liefert die Kennzahlen |
| `&motionlegacy=1` | altes Verhalten (Echtzeit-Alpha, Sim-Richtung, Sim-Gehflag) zum Vergleich |
| `cd packages/client && npx tsx bench/motion.ts <scene\|all> <local60\|local60j\|local30\|net60\|all> <legacy\|new\|all> [speed]` | headless Messlabor: Sim → Host → Snapshot → ClientWorld → Pose mit simulierten Worker-Timern, Übertragungs- und Frame-Jitter; Sprünge, Rückwärtsschritte, Umkehrungen, Drehraten, Drift Stehender, Schrittsynchronität |
| `npx tsx bench/simjitter.ts <scene>` / `bench/simjitter_game.ts [min] [seed]` | Bewegungsqualität auf Sim-Ebene (Szene bzw. echte KI-Partie) |

## Bedienung (Stronghold-Stil)

Unten sitzt das Hauptpanel: links Baumenü (Reiter Burg/Industrie/Landwirtschaft/Stadt/Waffen/Nahrung, bei „Burg“ Unterkategorien Mauern/Türme/Tore/Truppen/Belagerung, Icon-Raster mit Kosten, ausgegraut wenn nicht bezahlbar, Werkzeuge Abreißen/Reparieren/Rückgängig/Abbrechen), in der Mitte das Kontextpanel (Bergfried mit Beliebtheits-Aufschlüsselung und Prognose, Kornspeicher/Lager/Waffenkammer mit Beständen und Rationen, Kaserne und Söldner mit Rekrutierung, Markt mit Preisen, Werkstätten mit Rezeptwahl und Fortschritt, Schenke/Kirche mit Abdeckung, Arbeiter an/aus, Truppenpanel mit Typ-Icons, Haltung, Formation, Patrouille, Bodenangriff, Graben, Öl), rechts die Minikarte. Platzierungs-Geist grün/rot mit Grund und Kosten am Cursor, Linien-Vorschau bei Mauern, Berater mit Meldungsliste und Kamerasprung (`Leertaste`), Endbildschirm mit Podium und Statistik. Tooltips (Hover) und Enzyklopädie (`F2`, auch im Menü) erklären alle Gebäude, Einheiten, Waren, Wirtschaftsketten und Regeln; Deutsch und Englisch (`?lang=en`).

Standard-Tasten (alle im Optionsmenü frei belegbar, `F1` zeigt die Übersicht): Linksklick wählen / Rahmen ziehen · Doppelklick: alle gleichen Einheiten · Rechtsklick: Bewegen/Angreifen/Bau abbrechen (Umschalt: Wegpunkt) · `F` Angriffsmarsch · `P` Patrouille · `G` Bodenangriff · `X` Stopp · `H`/`V`/`B` Halten/Defensiv/Aggressiv · Strg+`1..9` Kontrollgruppe setzen, `1..9` wählen · `WASD` scrollen · `Q`/`E` Kamera drehen · Mausrad/`+`/`-` Zoom · `R` Gebäude drehen · `Entf` abreißen · `U` reparieren · Strg+`Z` Platzierung zurücknehmen · `F3..F8` Baukategorien · Alt+`K/G/B/M/S/W` Bergfried/Kornspeicher/Kaserne/Markt/Lager/Waffenkammer wählen · `Pos1` Bergfried · `Y` gesamte Armee · `Leertaste` letzte Meldung · `Alt+H` letzten Berater-Hinweis wiederholen · `Pause` Pause (Singleplayer) · `I`/`O`/`L`/`T` Lager/Markt/Beliebtheit/Verwaltung · `Z C N J K` Extreme-Fähigkeiten · `M` Ton stumm/an · `F9` Schatten.

## Berater und Beliebtheits-Ansicht (Phase 4: 4E/4F)

**Beliebtheit erklärt.** Die Beliebtheit steigt oder fällt nicht auf einen Zielwert zu, sondern ändert sich stetig: Alle 10 s (`POP_INTERVAL` Ticks) werden die Faktoren neu bewertet, ihre Summe ist die Änderung **pro Monat** (60 s bei 1×); pro Bewertung kommt ein Sechstel davon dazu, begrenzt auf 0–100. Gute/schlechte Dinge (je 8) und Religion (12) haben Obergrenzen; unter 50 wandert alle 4 s ein Bauer ab. Die Zerlegung steht in **einer** Funktion (`popularityFactors` in `shared/src/sim/popularity.ts`, von der Sim je Bewertung benutzt, bitgleich zum früheren Code); `explainPopularity(view)` (`shared/src/sim/popularity_explain.ts`) wertet daraus die Anzeige aus: Beliebtheit, Summe pro Monat/Minute, Prognose (1 und 3 Monate), Zeit bis zur Schwelle 50, Abwanderungs-/Zuzugsrate, positive/negative Faktoren nach Betrag mit Kategorie und Obergrenzen-Kennzeichnung, Hauptursache, Warnungen und Stellschrauben (mit Gewinn in Punkten pro Monat aus denselben Konstanten). Textbausteine de/en in `shared/src/data/popularity_text.ts` (Wahl aus der Hauptursache). Hover über die Beliebtheit in der Kopfleiste zeigt die Kurzfassung, Klick (oder `L`) die Detailansicht (schließbar mit `Esc`/✕, das Spiel läuft weiter); die Bergfried-Ansicht nutzt dieselbe Funktion.

**Berater.** Der Hofkämmerer (`ui/advisor.ts`) meldet nur Ereignisse aus echten Spieldaten; die Zeilen liegen als Daten in `shared/src/data/advisor_lines.ts` (Schlüssel `advisor.<ereignis>.<nr>`, Deutsch vollständig, Englisch ergänzend, Priorität/Thema/Abklingzeit je Ereignis). Prioritäten: kritisch (2) > wichtig (1) > normal (0). Entprellung und Warteschlange (`ui/advisor_queue.ts`, ohne DOM getestet): Abklingzeit je Art (normal 6 min, wichtig 3 min, kritisch 90 s), ein Zeitfenster pro Meldung (Lesezeit), Kritisches bricht das Zeitfenster, veraltete Meldungen verfallen, gleichartige Meldungen werden gebündelt, Normales schweigt in den ersten 2 Minuten (in Missionen dauerhaft), Wichtiges in der ersten Minute. Ereignisse und Schwellen:

| Thema | Ereignis | Schwelle |
| --- | --- | --- |
| Wirtschaft | Holz/Stein knapp, leer, wieder da | war ≥ 40 vorhanden; knapp < 20, leer 0, behoben ≥ 45 (Eisen/Pech 20/8/25); mit/ohne produzierendes Gebäude |
| Wirtschaft | Lager/Kornspeicher/Waffenkammer voll | ≥ 97 % (wieder frei < 85 %) |
| Wirtschaft | zu wenig Arbeitskräfte, Wohnraum voll | Stellen − Bauern ≥ 3 und ≥ 20 % der Stellen, 60 s anhaltend; Bauern ≥ Wohnraum |
| Wirtschaft | Betrieb steht still | Eingangsware fehlt ≥ 45 s, kein Arbeiter ≥ 120 s, Abholung stockt ≥ 60 s; Entwarnung, wenn alles läuft |
| Nahrung | Kornspeicher fast leer, Hunger | Vorrat < 1,5 Monate (Entwarnung ≥ 3), Sim meldet Hunger (kritisch) |
| Beliebtheit | sinkt gefährlich, Abwanderung | Summe ≤ −1,5 und Schwelle 50 in ≤ 3 min; Beliebtheit < 50 (kritisch); Ursache aus `explainPopularity` |
| Militär | Feinde nähern sich, Angriff, Verstärkung | ≥ 4 Soldaten in ≤ 60 Feldern (nicht nahe der eigenen Burg); ≥ 2 vor der Burg (kritisch); +60 % |
| Militär | Belagerungsgerät, Bergfried beschädigt, Tor/Turm/Mauer gefallen, Lord in Gefahr, Hilferuf | Gerät ≤ 90 Felder; Bergfried < 75 % / 40 % bei Beschuss; Feinde ≤ 14 Felder |
| Militär/Entwicklung | Heer bereit, Truppenlimit, Bevölkerung wächst | 10/25/50/100/200/400 Mann, Limit erreicht, 10/20/30/50/75/100/150 Bauern |

Bedienung: Beraterstimme regelbar (Optionen → Ton, Regler „Berater“), Sprache abschaltbar (Optionen „Berater spricht“ oder Lautsprecher-Knopf im Beraterpanel; der Text bleibt in der Meldungsliste), `Alt+H` bzw. ↻-Knopf spielt den letzten Hinweis erneut ab (ohne Sprachsystem erscheint er als Text), Klick auf eine Meldung springt zum Ort (und wählt das betroffene Gebäude). Die Sprachausgabe läuft über `audio/voice_api.ts` (`audio.voice.say(...)`); ohne Sprachsystem arbeitet der Berater nur mit Text.

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
