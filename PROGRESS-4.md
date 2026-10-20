# PROGRESS-4 – Visual Evolution, Natural Movement & Living World

Branch `claude/strongpoly-phase4-visual-evolution`, Ausgangs-Commit `aec8165b`. Spezifikation: `PROMPT-4.md`.
Nach einem Neustart: diese Datei lesen und beim ersten offenen Punkt weitermachen.
Gate nach jedem Meilenstein: `pnpm test`, `pnpm -r typecheck`, `pnpm build` + Browser-Check. Keine KI-Turniere nach reinen Grafik-/UI-/Audio-Änderungen.

## 4A Bewegung
- [x] Diagnose (Snapshot → ClientWorld → Interpolation → Rendering), Ursachen mit Zahlen unter „Befunde 4A“
- [x] Fix + Tests (`shared/test/interp.test.ts`, `client/test/motion.test.ts`; Messlabor `client/bench/motion*.ts`)
- [x] Debug-Modus (`?motiondebug`, F10; Beschreibung im README, Abschnitt „Bewegung und Interpolation“)
- [x] Testszenen (`?quick=1&dev=1&motion=pawns|gate|formation|haul|stairs|crowd`) + Browseraufnahmen unter `docs/phase4/movement/`
- Offen: Sim-Separation in dichten, sich kreuzenden Heeren (siehe Befund B7) bewusst nicht angefasst; Echt-GPU/Safari-Eindruck nicht gemessen (nur Software-GL).

### Befunde 4A (Messung statt Vermutung)

Messaufbau: `packages/client/bench/motion_lab.ts` simuliert die ganze Kette Sim → `GameHost` (Worker-Timer 40 ms wie `sim.worker.ts`) → Snapshot → `ClientWorld` → Darstellungsmodell → Pose je Frame, mit Zeitprofilen (`local60`: ruhiger Rechner; `local60j`: Frame-Jitter ±3 ms und Hänger; `local30`; `net60`: Übertragungsjitter 30–65 ms) und wertet je Einheit und Frame aus: Schritt = gezeichnete Geschwindigkeit / Sollgeschwindigkeit (Perzentile), Sprung (> 2×), Halt (< 0,25×) und Rückwärtsschritt gegen die Sim-Richtung (jeweils in % der Bewegungsframes), Richtungsumkehrungen der gezeichneten Bahn je Minute, Drehrate, Drift stehender Einheiten (gezeichnete Wegstrecke je s, Sim steht), Schrittlängen-Streuung der Gehphase (CV) und Anteil „Gehanimation ohne Weg“. Das alte Verhalten ist als `LegacyPose` nachgebildet (und im Spiel mit `?motionlegacy=1` zuschaltbar); die identischen Kennzahlen misst `MotionMeter` im laufenden Spiel (`window.__motion.report()`).

**Ursachen** (Zahlen: Messlabor `local60`, alt; im echten Browser reproduziert, Tabelle unten):

- **B1 Stehende Einheiten pendeln dauerhaft (Hauptursache des „Zitterns“ vor dem Bergfried).** `ClientWorld` hielt je Einheit nur `prev`/`cur`. Ein Delta-Snapshot enthält nur geänderte Einheiten, `lastSnapMs` wurde aber bei *jedem* Snapshot gesetzt: für jede Einheit, deren letzter Eintrag einen Schritt enthielt (Halt, Warten am Lagerfeuer, Arbeiter bei der Arbeit), lief der Interpolationsfaktor jeden Tick erneut von 0 bis 1,15 über diesen letzten Schritt – sie pendelte mit 10 Hz zwischen zwei Positionen weiter. Drift Stehender 0,46–0,92 Tiles/s im Messlabor und 0,13–0,37 im Browser (ein Bauer geht 1,7 Tiles/s), in allen Szenen (Spurbild `idle-bauern.png`: stehende Bauern, alt 0,072 Tiles Ausdehnung im 10-Hz-Takt, neu 0).
- **B2 Echtzeit-Alpha statt snapshot-synchroner Zeit.** Der Worker tickt über `setInterval(40 ms)` mit Akkumulator, die Ticks treffen daher im Wechsel nach 80/100/120 ms ein (online zusätzlich 30–65 ms Jitter); `alpha = (Frame-Zeit − Zeit der Verarbeitung)/100 ms`, bei jedem Snapshot zurück auf 0, auf 1,15 begrenzt. Folge im Messlabor (`local60`): Schritt p95 1,7–2,1× Sollgeschwindigkeit, 2,5–5,7 % der Bewegungsframes Sprung, 7–8 % Halt, 2,3–3,3 % Rückwärtsschritt, 100–190 Richtungsumkehrungen/min; online (`net60`) Halt 15–18 %. Der Browser zeigt dieselbe Größenordnung (Tabelle unten).
- **B3 Mehrere Snapshots pro Frame** (30 FPS, Hänger, Tab im Hintergrund) überschrieben `prev`: Teilschritte gingen verloren (Spitzen bis 20× Sollschritt).
- **B4 Gehanimation hing am Sim-Flag, nicht an der Bewegung:** feste Frequenz, Flag = Zustand „Move“. Festgefahrene Einheiten im Gedränge (Sim, echte KI-Partie, 12 min: 60 Bauern-/100 Ochsen-Ereignisse „> 1 s kein Fortschritt“), Pause und Halt ließen die Beine auf der Stelle weiterlaufen (5–6 % der Bewegungsframes, online 14–17 %); Schrittlänge schwankte mit dem Tempo (CV 0,46); Beine sprangen bei Start/Stopp.
- **B5 Blickrichtung:** Die Sim setzt `face` bei jedem Schritt aus dem Zieltile (45°-Wechsel an Tilemitten, Gleiten an Kanten, 1,4°-Raster). Der Client glättete exponentiell mit `dt·12` zur Sim-Richtung: Drehrate p99 340–830 °/s, Spitzen 900–4.300 °/s.
- **B6 Positionsraster:** Snapshot-Positionen sind auf 1/16 Tile gerundet (±15 % Tempo-Rauschen je Tick bei Bauern) – nach der Glättung im Client unsichtbar, daher Format unverändert.
- **B7 Sim-Ebene (headless, `bench/simjitter*.ts`):** Bauern in einer echten KI-Partie (12 min, 158 Einheiten): Richtungsumkehr 0,06 % der Bewegungs-Ticks, Schritt/Soll p5–p95 ≈ 1,00 – die Sim läuft dort sauber, die Ursachen liegen im Client. Szenen `pawns`/`haul`/`gate`/`stairs`: 0,04–0,8 %. Nur in dichten, sich kreuzenden Heeren (`crowd`, `formation`) kehren ≈ 9,7 % der Bewegungs-Ticks um (Separation schiebt bis 0,15 Tile/Tick = Schrittweite, Schritt/Soll p5 0,34): nach der neuen Darstellung bleiben davon 1–4 Umkehrungen/min sichtbar. Die Sim wurde nicht verändert (würde Kampf/KI beeinflussen; kein Turnier gestartet; Determinismus-Test unberührt).
- **B8 Pause/Geschwindigkeit/Reconnect:** Bei Pause bleiben die Positionen stehen (Faktor klemmt bei 1,15; gemessen), das Sim-Gehflag bleibt aber gesetzt und der Shader läuft mit `uTime` weiter – die Beine laufen also weiter (aus dem Code abgeleitet, nicht gemessen). Spielgeschwindigkeit skaliert nur den Nenner von `alpha`; ein Voll-Snapshot setzt `prev = cur` (kein Sprung, aber keine Neuausrichtung der Zeit). Die Tickrate wurde bewusst nicht erhöht.

**Behebung** (Dateien; Sim, Snapshot-Format und Netzpfad unverändert):

- `shared/src/net/interp.ts` (neu) + `shared/src/net/world.ts`: `ClientWorld` führt je Einheit eine Ring-Historie der letzten 4 Stützstellen (Sim-Tick, Position); Einheiten ohne Delta-Eintrag behalten ihre letzte Stützstelle (stehen), übersprungene Ticks werden über eine Zwischenstelle am vorigen Snapshot abgebildet, Teleports (> 1 + 0,5·Tickabstand Tiles) werden nicht interpoliert (`cuts`). `RenderClock`: gleichmäßige Uhr in Sim-Ticks (Frame-Zeit × Geschwindigkeit, Pause friert ein), sanfte Korrektur durch Snapshots (≤ ±6 % Zeitraffer), Puffer = 1 Tick + gemessener Verspätungs-Spitzenwert (langsam wachsend/sinkend), Extrapolation ≤ 0,3 Tick, harte Neusynchronisation bei Fehler > max(4 Ticks, 0,4 s).
- `client/src/render/motion.ts` (neu): `UnitMotion` – Position (Historie zur Darstellungszeit, 45-ms-Glättung gegen die 1/16-Rasterung), Blickrichtung (bei Bewegung aus der Bahn, sonst Sim-Ausrichtung; kürzester Weg, zeitbasiert, Drehrate ≤ 7 rad/s Fußvolk, 4,5 Reiter, 1,6 Belagerung), Gehphase aus der Strecke (Schrittweite wie bisher, gleich bei jedem Tempo; Hysterese; beim Anhalten Auslaufen bis zum Nulldurchgang; keine Phase in der Pause).
- `client/src/render/entities.ts` (klein, lokal): `RenderOpts` um `tickF`, `paused`, `motionDt`, `legacyMotion`; `updateUnits` liest Position/Richtung/Gehflag/Phase aus `UnitMotion` (der Shader bleibt unverändert: die Gehphase wird als `phase = (Phase − uTime·Frequenz)/2π` eingespeist); Leichen fallen an der zuletzt gezeichneten Stelle.
- `client/src/game/session.ts`: Ankunftszeit je Snapshot, `RenderClock` vor/nach dem Einlesen, echte Frame-Zeit statt der auf 0,1 s begrenzten, Reset bei Voll-Snapshot; Debug/Prüfszenen verdrahtet. `client/src/main.ts`: nur der Gegner der Prüfszenen bleibt untätig.
- Neu: `client/src/render/motion_debug.ts` (Overlay, `MotionMeter`), `client/src/game/motion_scenes.ts` + `motion_runner.ts` (Prüfszenen), `client/bench/*` (Messlabor, `simjitter*.ts`).

**Messwerte vorher/nachher**

Echter Browser (Chromium, Software-GL, Zeichnen abgeschaltet, damit der langsame Rasterizer nicht bremst: Worker + Snapshots + `Session` + Pose laufen wie im Spiel bei 30–58 FPS; 30 s je Lauf, Rechner zeitgleich mit anderen Läufen stark ausgelastet (Load 10–25 auf 4 Kernen): Hänger bis 850 ms und deshalb Puffer bis 2,9 Ticks; „Halt“ und „Marsch ohne Weg“ der neuen Darstellung enthalten die Anlauf-/Bremszeit der Darstellung; Schritt-CV der alten Darstellung im Browser nicht gemessen). `docs/phase4/movement/<szene>-<legacy|new>-nodraw.json`:

| Szene | Modus | FPS | Schritt p95 | Schritt max | Sprung % | Halt % | rückw. % | Umkehr/min | Stehende t/s | Marsch ohne Weg % | Schritt-CV |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| crowd | alt | 38 | 2.07 | 37.7 | 5.7 | 6.9 | 1.2 | 42 | 0.341 | 6.2 | – |
| crowd | neu | 33 | 1.18 | 3.4 | 0.2 | 5.9 | 0.4 | 4 | 0.000 | 1.5 | 0.28 |
| formation | alt | 31 | 2.21 | 7.4 | 5.7 | 2.1 | 2.6 | 106 | 0.131 | 1.7 | – |
| formation | neu | 35 | 1.20 | 3.6 | 0.3 | 2.7 | 0.2 | 1 | 0.000 | 1.0 | 0.27 |
| gate | alt | 42 | 2.08 | 13.9 | 5.3 | 8.9 | 2.3 | 108 | 0.334 | 7.4 | – |
| gate | neu | 39 | 1.25 | 6.5 | 0.3 | 1.7 | 0.1 | 1 | 0.000 | 0.7 | 0.28 |
| haul | alt | 46 | 2.21 | 13.2 | 6.3 | 7.5 | 2.9 | 130 | 0.259 | 5.7 | – |
| haul | neu | 37 | 1.21 | 2.9 | 0.9 | 2.3 | 0.0 | 0 | 0.000 | 1.7 | 0.25 |
| pawns | alt | 39 | 3.32 | 6.6 | 11.4 | 15.7 | 1.7 | 33 | 0.257 | 8.7 | – |
| pawns | neu | 39 | 1.15 | 1.7 | 0.0 | 0.2 | 0.0 | 0 | 0.000 | 0.0 | 0.21 |
| stairs | alt | 36 | 1.88 | 5.2 | 4.6 | 6.5 | 0.6 | 21 | 0.369 | 5.4 | – |
| stairs | neu | 37 | 1.29 | 1.7 | 0.0 | 0.4 | 0.0 | 1 | 0.000 | 0.1 | 0.17 |

Messlabor (headless, virtuelle Zeit, daher unabhängig von der Rechnerlast; Profil `local60` = ruhiges 60-Hz-Gerät; weitere Profile `local60j`, `local30`, `net60` in `bench/motion.ts`):

| Szene | Profil | Modell | Schritt p95 | Schritt max | Sprung % | Halt % | rückw. % | Umkehr/min | Dreh p99/max °/s | Stehende t/s | Marsch o. Weg % | Schritt-CV |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pawns | local60 | alt | 2.09 | 4.2 | 5.6 | 8.2 | 2.5 | 137 | 448/3459 | 0.458 | 6.3 | 0.46 |
| pawns | local60 | neu | 1.15 | 2.0 | 0.0 | 0.3 | 0.0 | 0 | 401/401 | 0.000 | 0.0 | 0.13 |
| gate | local60 | alt | 1.82 | 4.4 | 3.8 | 7.6 | 2.6 | 157 | 344/1179 | 0.667 | 5.4 | 0.47 |
| gate | local60 | neu | 1.18 | 1.8 | 0.0 | 0.2 | 0.0 | 0 | 401/401 | 0.000 | 0.0 | 0.14 |
| formation | local60 | alt | 1.75 | 5.8 | 3.0 | 8.0 | 2.9 | 127 | 831/4204 | 0.653 | 6.3 | 0.51 |
| formation | local60 | neu | 1.18 | 2.0 | 0.0 | 0.5 | 0.3 | 1 | 401/401 | 0.002 | 0.1 | 0.18 |
| haul | local60 | alt | 2.10 | 4.1 | 5.7 | 7.8 | 2.3 | 137 | 373/898 | 0.552 | 6.2 | 0.47 |
| haul | local60 | neu | 1.13 | 1.6 | 0.0 | 0.2 | 0.0 | 0 | 401/401 | 0.000 | 0.0 | 0.11 |
| stairs | local60 | alt | 1.82 | 4.2 | 3.5 | 6.9 | 3.3 | 186 | 344/2033 | 0.639 | 5.3 | 0.48 |
| stairs | local60 | neu | 1.15 | 1.5 | 0.0 | 0.2 | 0.0 | 0 | 401/401 | 0.000 | 0.0 | 0.15 |
| crowd | local60 | alt | 1.73 | 20.5 | 2.5 | 7.9 | 2.5 | 100 | 810/4303 | 0.924 | 6.5 | 0.52 |
| crowd | local60 | neu | 1.17 | 3.1 | 0.0 | 0.4 | 0.4 | 1 | 401/401 | 0.010 | 0.1 | 0.16 |

Online-Profil `net60` (Übertragungsjitter 30–65 ms), Auszug:

| Szene | Profil | Modell | Schritt p95 | Schritt max | Sprung % | Halt % | rückw. % | Umkehr/min | Dreh p99/max °/s | Stehende t/s | Marsch o. Weg % | Schritt-CV |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pawns | net60 | alt | 2.31 | 10.1 | 5.8 | 17.3 | 3.6 | 150 | 559/3459 | 0.384 | 16.2 | 1.09 |
| pawns | net60 | neu | 1.17 | 1.5 | 0.0 | 0.4 | 0.2 | 1 | 401/401 | 0.000 | 0.0 | 0.13 |
| gate | net60 | alt | 2.04 | 11.5 | 5.1 | 17.4 | 2.9 | 100 | 349/593 | 0.449 | 16.2 | 1.08 |
| gate | net60 | neu | 1.16 | 1.5 | 0.0 | 0.0 | 0.0 | 0 | 127/337 | 0.000 | 0.0 | 0.12 |
| formation | net60 | alt | 2.15 | 12.6 | 5.2 | 18.1 | 3.8 | 129 | 857/4188 | 0.553 | 17.0 | 1.14 |
| formation | net60 | neu | 1.19 | 2.1 | 0.0 | 1.3 | 0.6 | 1 | 401/401 | 0.002 | 0.1 | 0.19 |

Pause/Geschwindigkeit im Browser (`pause-speed-*.json`): Pause 3 s – alte wie neue Darstellung stehen still (Positionen unverändert, Sim-Tick +0), die neue hat zusätzlich die Gehphase eingefroren; 3× Spielgeschwindigkeit: alt Sprung 9,3 % / Halt 15,2 % / Schritt p95 2,32, neu 1,0 % / 0,5 % / 1,20; 0,5×: alt Sprung 2,4 % / Halt 3,5 % / Umkehr 52 min⁻¹, neu 0,3 % / 0,2 % / 0.

Bilder (`docs/phase4/movement/`): `idle-bauern.png` (stehende Bauern, Draufsicht stark vergrößert, alt pendelt, neu ruht), `tempo-haul.png`, `tempo-gate.png` (gezeichnete Geschwindigkeit je Frame über 4 s: alt Sägezahn 0–4 Tiles/s, neu gleichmäßig), `<szene>-<legacy|new>-NN.jpg` (echte Software-GL-Aufnahmen der Szenen `pawns`, `gate`, `formation`, `crowd` mit Debug-Overlay: Sim-Position rot, gezeichnete grün, Blick cyan, Spur der gezeichneten Bahn; Software-GL liefert hier nur 2–4 FPS, die Aufnahmen belegen daher Szenen, Overlay und glatte Bahnen, nicht das Tempo-Verhalten).

Einschränkungen: Ein Safari-/GPU-Lauf fehlt; der Puffer wird im Betrieb adaptiv (Messlabor `local60`: ≈ 1,3 Ticks = 130 ms, in den stark ausgelasteten Browser-Messläufen bis 3 Ticks). Die Bahn-/Tempo-Verbesserung ist gemessen, der subjektive Eindruck auf dem MacBook ist es nicht.

## 4B Grafik
- [ ] Materialsystem/Licht
- [ ] Gebäude
- [x] Menschen/Einheiten (siehe „4B-Menschen“ unten)
- [x] Gebäude (alle 57 Typen neu; siehe README „Gebäude (4B)“, Details unten)
- [ ] Menschen/Einheiten
- [ ] Gelände/Vegetation/Wasser
- [ ] Lebendige Welt (Gebäudeanteil erledigt: Rauch/Dampf/Funken/Staub/Mehl/Späne, Mühlenflügel, Fahnen – Rest bei den anderen Teilen)
- [ ] Vergleichsszenen, Vorher/Nachher

### 4B-Welt (Gelände, Vegetation, Wasser, Licht/Materialsystem, Atmosphäre, Vergleichsszenen)

Agent „Welt“. Berührte Dateien: `client/src/render/{terrain,decor,materials,scene,quality,camera}.ts` (bestehende Exporte abwärtskompatibel), neu `render/{biome,noise,groundmap,ambient}.ts`, `showcase.ts`, `showcase_scenes.ts`, `scripts/shots.mjs`, `scripts/lib/browser.mjs`, Tests `client/test/render_{world,shaders,ambient}.test.ts`; je eine Zeile in `game/session.ts` und `bench.ts` (`decor.setOccupancy(…, buildings)`), `main.ts` (Einstieg `?shots=`).

- [x] 4B.7 Vergleichsszenen + Werkzeug: `?shots=early|town|castle|siege|figures|engines|map|ground|forest|water|coast|deposits`, `scripts/shots.mjs` (Qualitätsstufe, `--check` für Konsole, `--info` für Kennzahlen, `--dist` für älteren Build); Vorher-Bilder `docs/phase4/before/world/` (Stand vor dem Umbau, Seed 1), Nachher-Bilder `docs/phase4/after/world/`, Gegenüberstellung `docs/phase4/compare-world.html`
- [x] Materialsystem/Licht: Tonemapping `NeutralToneMapping` + Grading (`colorspace_fragment`), Wolkenschatten, Randlicht (Himmelsreflex), Materialvariation je Instanz, kühle Schatten/warme Sonne, Dunst nach Kameraabstand, zentrale Uniforms `GFX`
- [x] Gelände: Gelände-Shader (Rauschtexturen, Bump), Oberflächengewichte, Biom je Karte, Feuchte-Fleckung, Höhenlage, Klippen in drei Schichten, Uferstreifen, Bodenkarte (getretene Erde um Gebäude, Pfade zu Lager/Bergfried, Äcker, Kontaktschatten; folgt dem Kriegsnebel)
- [x] Vegetation: 7 Baumarten + Büsche/Gras/Blumen/Kiesel/Felsen mit Moos, Vorkommen (Stein/Eisen/Pech), Wind-Schwanken, LOD, Dichtevariation
- [x] Wasser: eigener Shader (Tiefenfärbung, Wellennormalen, Fresnel-Himmelsreflex, Glitzern, Uferschaum), Graben trüb
- [x] Umgebungsleben ab Mittel (Vögel; Hoch: Schmetterlinge, Blätter/Staub)
- [x] Tests (siehe unten), Konsole in allen drei Stufen sauber
- [ ] offen: siehe „Offene Punkte (Welt)“ unten

#### Qualitätsstufen (Unterschiede)

| | Niedrig | Mittel | Hoch |
| --- | --- | --- | --- |
| Geländedetail im Shader | nur Bodenkarte + Grobfleckung (2 Texturzugriffe) | + Farbvariation, Gras-/Sand-/Felsstruktur, Bump | + Gesteinsschichten, Kies |
| Wasser | flache Lambert-Fläche | Normalen, Fresnel, Schaum | + zweite Wellenlage, Glitzern |
| Wolkenschatten / Randlicht | aus | 0,6 / 0,6 | 0,9 / 0,9 |
| Bäume | nur Fernformen bis 26 Einheiten Kameraabstand, kein Schwanken | volle Form bis 46, Schwanken 0,8, Unterholz 0,6 | volle Form bis 72, Schwanken 1, Unterholz 1 |
| Blumen/Kiesel (max.) | – | 2.500 | 6.000 |
| Umgebungsleben | – | Vögel (≈20) | + Schmetterlinge, Blätter/Staub (≈220 Instanzen) |
| Anisotropie der Rauschtexturen | 1 | 4 | 8 |

#### Zahlen

Szenen (`--info`, Mittel, 1280x720; Dreiecke zählen Hauptpass **und** Schattenpass):

| Szene | Draw-Calls vorher → nachher | Dreiecke vorher → nachher | Programme |
| --- | ---: | ---: | ---: |
| `early` | 38 → 49 | 144k → 151k | 14 → 19 |
| `town` | 76 → 90 | 200k → 288k | 14 → 19 |
| `castle` | 64 → 78 | 272k → 364k | 14 → 19 |
| `siege` | 75 → 89 | 277k → 326k | 18 → 20 |
| `figures` | 47 → 59 | 174k → 121k | 13 → 18 |
| `engines` | 31 → 45 | 179k → 164k | 13 → 18 |
| `map` | 70 → 77 | 314k → 384k | 14 → 19 |
| `ground` | 31 → 43 | 149k → 110k | 14 → 19 |
| `forest` | 23 → 37 | 156k → 163k | 11 → 16 |
| `water` | 25 → 39 | 188k → 167k | 11 → 16 |
| `coast` | 32 → 46 | 203k → 287k | 11 → 16 |
| `deposits` | 26 → 38 | 107k → 100k | 14 → 19 |

Die Dreiecke steigen vor allem durch die dichtere Vegetation (Bäume, Büsche, Blumen); die Zahl der Draw-Calls bleibt weit unter dem Ziel von 150. Die Modelle wurden dafür schlank gehalten (offene Kegel, Blumen aus Pyramiden, Fernformen mit ca. 20–40 Dreiecken statt 90–130).

Benchmark `?bench` (2.000 Einheiten, `node scripts/bench-fps.mjs --secs=8 --warm=3`, gleiche Parameter für beide Stände, nacheinander, **Rechner zeitgleich stark ausgelastet (Load ≈ 25–30 auf 4 Kernen), Software-GL SwiftShader**: FPS nur ein pessimistischer Richtwert, die JS-Zeit ohne Raster (`nodraw`) ist ebenfalls durch die Last verfälscht und eher als Obergrenze zu lesen):

**Vorher (Stand vor dem Umbau)**


- Browser: 141.0.7390.37, Viewport 1280x720, Pixel-Ratio 1, Kamera-Abstand 36
- GL: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (Software-Rendering)
- CPU: Intel(R) Xeon(R) Processor @ 2.80GHz × 4
- Messfenster: 8 s nach 3 s Warmlauf; Bildzeit = Abstand zwischen requestAnimationFrame-Aufrufen, JS = Aktualisierung + renderer.render (ohne Wartezeit auf die GPU)

| Stufe | FPS | Ø ms | p95 ms | p99 ms | JS Ø ms (voll) | JS Ø ms (ohne Raster) | davon Update / Render | JS p95 ms (ohne Raster) | Draw-Calls | Dreiecke | Einheiten (gezeichnet) | Partikel | Frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 0.4 | 2513.2 | 5766.5 | 5766.5 | 98.2 | 17.7 | 1.7 / 16.0 | 46.7 | 64 | 242k | 2002 (1359) | 158 | 5 |
| medium | 0.2 | 4572.0 | 7449.7 | 7449.7 | 183.4 | 7.4 | 1.3 / 6.1 | 12.1 | 64 | 287k | 2002 (1131) | 7 | 3 |
| high | 0.4 | 2606.6 | 3249.9 | 3249.9 | 68.5 | 11.5 | 4.9 / 6.5 | 29.4 | 70 | 389k | 2002 (1534) | 921 | 5 |

  - Ziel JS-Zeit ≤ 8 ms auf Mittel: erreicht (7.4 ms, ohne Raster)
  - Ziel Draw-Calls < 150: erreicht (max. 70)
  - Ziel 60 FPS auf Mittel: nicht erreicht (0.2 FPS)
  - Hinweis: Software-GL. Die FPS sind nur ein pessimistischer Richtwert; 60 FPS auf echter GPU sind damit weder bestätigt noch widerlegt (Lauf mit --hw auf einem Rechner mit GPU wiederholen).
**Nachher**


- Browser: 141.0.7390.37, Viewport 1280x720, Pixel-Ratio 1, Kamera-Abstand 36
- GL: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (Software-Rendering)
- CPU: Intel(R) Xeon(R) Processor @ 2.80GHz × 4
- Messfenster: 8 s nach 3 s Warmlauf; Bildzeit = Abstand zwischen requestAnimationFrame-Aufrufen, JS = Aktualisierung + renderer.render (ohne Wartezeit auf die GPU)

| Stufe | FPS | Ø ms | p95 ms | p99 ms | JS Ø ms (voll) | JS Ø ms (ohne Raster) | davon Update / Render | JS p95 ms (ohne Raster) | Draw-Calls | Dreiecke | Einheiten (gezeichnet) | Partikel | Frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 0.5 | 2213.8 | 3316.5 | 3316.5 | 32.7 | 7.5 | 1.7 / 5.8 | 22.5 | 66 | 246k | 2002 (1447) | 251 | 6 |
| medium | 0.2 | 5808.1 | 7916.4 | 7916.4 | 70.5 | 11.6 | 2.7 / 8.9 | 29.9 | 75 | 326k | 2002 (1096) | 8 | 2 |
| high | 0.1 | 7516.4 | 10499.6 | 10499.6 | 364.8 | 7.3 | 1.6 / 5.7 | 15.9 | 79 | 419k | 2002 (1167) | 9 | 2 |

  - Ziel JS-Zeit ≤ 8 ms auf Mittel: verfehlt (11.6 ms, ohne Raster)
  - Ziel Draw-Calls < 150: erreicht (max. 79)
  - Ziel 60 FPS auf Mittel: nicht erreicht (0.2 FPS)
  - Hinweis: Software-GL. Die FPS sind nur ein pessimistischer Richtwert; 60 FPS auf echter GPU sind damit weder bestätigt noch widerlegt (Lauf mit --hw auf einem Rechner mit GPU wiederholen).

Nachmessung nur der JS-Zeit ohne Raster (`&nodraw=1`, Mittel, 2.000 Einheiten, je Stand 3 abwechselnde Läufe, Rechner etwas weniger ausgelastet): vorher Minimum/Median **5,2 / 5,8 ms**, nachher **5,3 / 6,2 ms** (≈ +0–7 %; Draw-Calls im Bench 70 → 82). Der erste Lauf oben (höhere Last) zeigt vorher 7,4 und nachher 11,6 ms: die Messung schwankt mit der Rechnerlast stärker als der Unterschied zwischen den Ständen. Das Ziel ≤ 8 ms auf Mittel ist im ruhigeren Lauf für beide Stände erreicht, auf echter Hardware (M3) aber nicht gemessen.


Weitere Messwerte (Browser mit Software-GL, Rechner ausgelastet, daher nur relativ zu lesen): Bundle `scene-*.js` 596 → 630 kB (gzip 161 → 173 kB); die Rauschtexturen (2 x 256² RGBA8) werden beim ersten Material berechnet (≈ 0,15–0,8 s je nach Last); Kartenaufbau `setMap` (Gelände + Dekor, 128²) 170–570 ms, der Gelände-Aufbau allein dauert etwa das Doppelte des früheren (Node-Test, 192² Karte, gleiche Last: 0,65–1,0 s vorher, 1,4–2,2 s nachher); Dekor-Neuaufbau (`decor.rebuild`, Median von 25 Aufrufen) Niedrig 1,7 ms, Mittel 8,4 ms, Hoch 15,3 ms (vorher 0,7 / 4,1 / 4,9 ms); er läuft höchstens alle 0,35 s und nur nach 5 Feldern Kamerabewegung bzw. 20 % Zoomänderung.

#### Tests

Gate zum Abschluss: `pnpm -r typecheck`, `pnpm test` (shared 100, client 134, server 3 Tests), `pnpm build` grün. Neu in `pnpm test` (client): `render_world.test.ts` (Qualitätstabelle vollständig und monoton, Rauschtexturen deterministisch/kachelbar, Biom/Baumart/-gestalt deterministisch, Misch- und Übergangslogik, Bodenkarte, Gelände-/Dekor-Aufbau ohne GL, Kriegsnebel, LOD, Szenen deterministisch/überlappungsfrei, Kartensuche), `render_shaders.test.ts` (alle `onBeforeCompile`-Ersetzungen greifen gegen die Shader-Texte der installierten three.js-Version), `render_ambient.test.ts`. Browser: `node scripts/shots.mjs --check` für Niedrig/Mittel/Hoch (Konsole ohne Warnung/Fehler, d. h. alle Shader kompilieren ohne Meldung), `?quick=1` im echten Spielpfad (Konsole sauber).

#### Einschätzung (ehrlich)

Stärken: Der Boden ist als Bühne deutlich ruhiger und zugleich lebendiger (großflächige Wiesen-/Strohflecken, Pfade und getretene Erde um die Gebäude, Felder, weiche Kontaktschatten), Gebäude und Figuren bleiben lesbar; Wasser hat Tiefe, Ufer, Schaum; Klippen zeigen Gesteinsschichten; Wälder sind gemischt (Art, Größe, Neigung, Farbe) mit Unterholz, Blumen, Gras; die Gesamtkarte zeigt Biome und Gelände statt einer einheitlichen Fläche; Licht, Tonemapping und Dunst geben Tiefe.

Schwächen: Die Gebäude- und Figurenmodelle sind in meinen Vorher-/Nachher-Bildern noch die alten (parallele Arbeit) und wirken gegenüber dem neuen Boden einfacher; die Bäume sind weiterhin schlichte Low-Poly-Körper (Palmen wirken sternförmig, Akazien flach); das Gelände bleibt sim-bedingt aus Terrassen mit Stufenküsten; der Wolkenschatten ist im Standbild ein großer dunkler Fleck (in Bewegung unauffälliger); das Wasser wirkt im Standbild weniger dramatisch als in Bewegung (Wellen/Glitzer sind animiert); der Rand der Karte läuft in einen einfarbigen Dunst (kein Himmel/Horizont); Baum-LOD und Dekor-Sichtweite wechseln beim Verschieben der Kamera sichtbar in Schritten (Neuaufbau alle 5 Felder).

#### Safari-/M3-Checkliste (Ziel: MacBook Air M3, Safari, WebGL2)

Genutzte WebGL2-Fähigkeiten (alles Kern-WebGL2, keine Erweiterung ohne Rückfall):
- three.js r170 mit WebGL2 (`#version 300 es`): `dFdx/dFdy` (Flat Shading, Bump im Gelände-Shader), `transpose(mat3)` (Baumschwanken in Weltrichtung), Instanced Arrays, `mod/smoothstep/pow` mit geklammerten Argumenten (kein `pow` mit negativer Basis, kein `normalize(0)`).
- Texturen ausschließlich `RGBA8`/`UnsignedByte`: Rauschtexturen 256x256 mit Mipmaps und Repeat, Bodenkarte (Kartengröße, `Linear`, ohne Mipmaps, Clamp). Keine Float-/Half-Float-Texturen, keine Render-Targets außer den Schattenkarten von three.js, keine `EXT_color_buffer_float`, kein EffectComposer (das Canvas-MSAA bleibt erhalten).
- Anisotrope Filterung (`EXT_texture_filter_anisotropic`) ist optional: `renderer.capabilities.getMaxAnisotropy()` liefert ohne die Erweiterung 0, dann gilt 1 (`scene.ts`).
- Texturkanäle je Programm: Gelände 3 (Schattenkarte, Rauschen, Bodenkarte), Einheiten/Gebäude/Bäume 2 (Schattenkarte, Rauschen), Wasser 1 (Rauschen) – weit unter dem Minimum von 16.
- Tonemapping `NeutralToneMapping` (three-Standard, reine Shader-Mathematik) plus eigene Farbkorrektur als Konstanten im `colorspace_fragment` (keine Uniforms, damit auch Fremdshader wie Partikel unverändert kompilieren).
- Schatten: `PCFSoftShadowMap` wie zuvor; Tiefenmaterialien (`RGBADepthPacking`) mit gleicher Vertex-Animation bzw. Baumschwanken.
- Programmanzahl: 19–20 Programme im Showcase (vorher 14), davon neu: Gelände, Wasser, Laub, Laub-Schatten, Vögel, Schmetterlinge, Blätter. Kompilierzeit unter Safari/M3 nicht gemessen (nur Chromium/SwiftShader, siehe unten).

Bekannte Safari-Fallen und wie sie umgangen sind:
- `highp` im Fragment-Shader: three.js setzt `precision highp float`; Apple-GPUs unterstützen es. Uniforms, die in Vertex- und Fragment-Shader zugleich vorkommen (`uTime`, `uCloud` …), haben in beiden Stufen denselben Typ, sonst Linkfehler bei abweichender Präzision.
- Globale GLSL-Variablen nur mit konstantem Initialisierer (`float spNoCloud = 0.0;`).
- Keine dynamische Schleife über Uniform-Grenzen, keine Arrays als Uniforms, keine `discard` in Wasser/Gelände.
- Große Zeitwerte: `uTime` wächst über die Spieldauer; Sinus-Argumente skalieren mit Phasen, nicht mit dem Rohwert über Stunden hinaus (kein sichtbarer Genauigkeitsverlust bis ~10 h).
- Ladezeit: die Rauschtexturen (2 x 256x256) werden einmal beim ersten Material berechnet (Chromium unter Last ≈ 0,15–0,8 s, echte Hardware deutlich weniger); das Gelände baut Chunks beim Laden der Karte (`TerrainRenderer`).
- Safari begrenzt Canvas-Speicher: Pixel-Ratio-Deckel je Stufe (1 / 1,5 / 2) bleibt in `quality.ts`.

Nicht verifiziert (offen, weil hier kein Safari/M3 vorhanden): Shader-Kompilierzeit in Safari, tatsächliche FPS auf dem M3, Verhalten der Anisotropie, Aussehen der Farbkorrektur auf dem Display des MacBook Air (P3-Bildschirm, `outputColorSpace` bleibt sRGB wie zuvor).


#### Offene Punkte (Welt)

- Safari/M3 ungetestet (kein Zugang): Shader-Kompilierzeit, tatsächliche FPS und Farbwirkung auf dem Display; Messungen hier nur mit Software-GL und auf einem stark ausgelasteten Rechner.
- Terrain-Aufbau beim Kartenladen etwa doppelt so teuer wie vorher; Chunks werden synchron gebaut (bei 400x400 spürbar). Idee: Aufbau auf mehrere Frames verteilen.
- Kein Himmel/Horizont-Verlauf (Kamera blickt immer nach unten; Kartenrand = Dunstfarbe); optional „Meer“ außerhalb der Karte.
- Baum-LOD ohne Überblendung (Umschalten beim Neuaufbau), Pfade der Bodenkarte sind gerade Linien zwischen Gebäudemitten (keine Wegfindung).
- Gebäude-/Figurenagenten: nach dem Zusammenführen `node scripts/shots.mjs` für alle Stufen laufen lassen und Farben unter dem neuen Tonemapping/Grading prüfen (siehe Merge-Hinweise im Abschlussbericht).

## 4C Bauanimationen
- [x] Bauablauf je Gebäudetyp, zentrale Konfiguration (`render/build_config.ts`, `construction.ts`, `build_sites.ts`)
- [x] Reconnect/Laden/Abriss/Rückgängig geprüft (Tests `render_buildings.test.ts`: reine Funktionen, Mauerzug, Voll-Snapshot, Abbruch, Zerstörung während des Baus)

### Stand 4B-Gebäude und 4C (Agent Gebäude)
- **Modelle:** `models_castle.ts` (Bergfried, Türme, Tore, Zugbrücke, Mauern, Kaserne, Söldnerposten, Stall, Ingenieurzunft, Verlies, Ölkessel, Geschütze, Fallen), `models_economy.ts` (Lager, Rohstoffe, Farmen, Mühle, Bäckerei, Brauerei, Schenke, Werkstätten, Markt), `models_town.ts` (Hütte, Kirchen, Brunnen, Garten, Statue, Maibaum, Galgen, Pranger, Lagerfeuer); Bausteine in `building_parts.ts`/`building_house.ts`, Palette `building_palette.ts`. Dreiecke je Typ (volle Stufe): Bergfried 4.312, Kathedrale 2.504, Wehrturm 2.216, Schenke 2.176, übrige 100–1.900, Mauerstücke 120–170 je Teil.
- **Material:** `building_materials.ts` (Instanzvariation, Oberflächenmuster, Höhenmaske der Baustellen); materials.ts unverändert (das Gebäudematerial ist ein abgeleitetes Material über `animMaterial()`).
- **Bau:** Fortschritt aus `world.tick − BuildingRec.n`; keine Sim-Änderung. Zeitfenster der Modellteile folgen der Höhe (Test: kein schwebendes Dach, stetiges Wachstum, Endzustand = fertiges Modell). Mauerlinien laufen als Welle (Breitensuche ab dem Ende, ~0,07 s je Stück, höchstens ~2,4 s). Gerüst/Fundament/Baumaterial/Staub/Abschlusseffekt in `build_sites.ts`/`building_fx.ts`.
- **Befund (behoben):** Schornstein-/Brandlisten der Gebäude wurden erst bei der nächsten Gebäudeänderung eingetragen, nicht bei Fertigstellung (Rauch fehlte bis dahin) – jetzt setzt die Fertigstellung `bldDirty`.
- **Befund:** Die vorhandenen Geschütze (`Building.turret`/`BuildingRec.u`) wurden bisher nicht gezeichnet; jetzt Ballista/Mangonel auf Großen Türmen (Blickrichtung zum nächsten gegnerischen Bergfried, leichtes Schwenken).
- **Befund:** Das alte Torhaus überlappte seine Türme mit dem Durchgang; das neue Steintor hat einen 1,4 breiten Durchgang zwischen zwei Rundtürmen innerhalb des Footprints.
- **Messung (SwiftShader, Last ≈ 22 auf 4 Kernen, daher FPS bedeutungslos):** Aktualisierungszeit der Gebäude im Bench 0,03–0,08 ms vorher wie nachher, Draw-Calls 67–70 vorher/nachher, Dreiecke ≈ +5 % (Bench-Szene), Bundle `scene`-Chunk 596 → 665 kB (gzip 161 → 182 kB).
- **Offen:** Keine Distanz-LOD (nur Grafikstufen-LOD, siehe README); Geschütz-Schussanimation fehlt (Snapshot enthält keine Zielrichtung/Abklingzeit); Mauern „Doppel“ gibt es als Typ nicht; Aufnahmen der Bauanimation im laufenden Spiel nur stichprobenartig (Echtzeit-Aufnahme unter Software-GL zu langsam für feine Zeitpunkte, die Frame-Serien stammen deshalb aus der Prüfszene `showcase=build` mit gesetzter Weltzeit; der Renderpfad ist derselbe).
- Aufnahmen: `docs/phase4/before/buildings/` und `docs/phase4/after/buildings/` (gleiche Kamerapositionen).

## 4D Sprechende Einheiten
- [x] Voice-Architektur, Clip-Register, Fallback: `shared/src/data/voices*.ts` (Dialogdaten + Stimmprofile), `client/src/audio/voice.ts` (`VoiceSystem`, hängt als `AudioEngine.voice` an, erfüllt den Vertrag `voice_api.ts` unverändert), `voice_logic.ts` (Tor/Prioritäten/Zeilenauswahl, rein), `voice_groups.ts` (Einheit/Gebäude → Sprecher), `clips.ts` (Clip-Register: Manifest, träges Laden, Vorladen, LRU), `subtitles.ts`. Reihenfolge je Zeile: Clip → Browser-Sprachausgabe (`speechSynthesis`, abschaltbar) → nur Untertitel; ein Clip gilt nur, wenn sein Text zur angefragten Zeile passt.
- [x] Dialoge de + en: 20 Sprechergruppen (Schwertkämpfer, Speer/Pike, Bogenschütze, Armbrust, Ritter, Söldner, Assassine, Belagerungsmannschaft, Ingenieur, Mönch, Lord, Bauer, Holzfäller, Steinmetz, Landwirt, Bäckerin, Müller, Brauer, Schmied, Händler) + Hofberater (36 Zeilen, ruhig/dringend); Ereignisse Auswahl/Bewegung/Angriff/Halten/Arbeiten/Abschluss/verwundet/besonders, je mindestens 3 Varianten; 363 Zeilen je Sprache, alles Eigenentwürfe.
- [x] Prioritäten/Limits/Untertitel/Regler: Mindestabstände global und je Stimme je Ereignisart, nie dieselbe Zeile zweimal hintereinander, höchstens eine Einheitenstimme zugleich + Berater, Spielerrückmeldung unterbricht Hintergrund, Berater mit Schlange und Verdrängung durch Kritisches; räumlich/gedämpft bei Entfernung; Regler „Einheitenstimmen“, Untertitel-Overlay + Option, „Browser-Stimme als Ersatz“; Stumm (M) und Lautstärke 0 respektiert.
- [x] Hooks: `session.ts` (Auswahl mit Auswahl-Signatur, Befehle inkl. Haltung, Gebäudeanwahl), `soundscape.ts` (Arbeit/Abschluss als seltene Kandidaten, verwundet, Lagewechsel Halten/Angriff, Mannschaft beim Geschützschuss).
- [x] Stimmqualität: echte Sprachclips, siehe unten.
- [x] Tests: `client/test/audio_voice.test.ts` (Register vollständig, Varianten ≥ 3, keine toten Schlüssel/Gruppen/Clips, Manifest ↔ Text ↔ Datei, Tor/Prioritäten/Schlange, Zeilenauswahl, Sprachsystem mit Attrappen inkl. Untertitel-Weg).
- [x] Browserprüfung (Chromium, siehe Befunde): Autoplay ohne Konsolenwarnung, alle Clips dekodierbar, Untertitel sichtbar, Stimmen im Spiel, Ausgabe aufgenommen und rücktranskribiert.

### Stimmen und Qualität (ehrlich)
- **Vorliegend:** 498 (363 aus `voices.de.ts` + 135 Zusatzclips für die Beraterzeilen des Ereignis-Beraters, siehe unten) deutsche Clips (5,7 MB, MP3 mono 22,05 kHz, 15 min Sprechzeit) und 371 englische (3,2 MB). Erzeugt mit **Piper/VITS-Modellen**, ausgeführt mit `sherpa-onnx` (lokal, offline, kein API-Schlüssel, kein Online-Dienst), Nachbearbeitung mit ffmpeg (Tonhöhe per rubberband, leichter Raum je Profil, Pegel auf −20 dBFS RMS, weicher Begrenzer). Skript: `scripts/gen-voices.sh` → `scripts/gen_voices.py`; Prüfung `scripts/check-voices.sh`.
- **Quellen/Lizenzen** (nur belegbar freie Stimmen; Details und Eigenaufnahmen einsetzen: `client/public/voice/README.md`): Deutsch Thorsten Müller („Thorsten-Voice“: `thorsten-high`, `thorsten-medium`, `thorsten_emotional` mit 8 Stilen) und „kerstin“ – alle CC0 laut Modellkarte/Datensatz; Englisch joe (CC0), john und norman (gemeinfrei), kathleen (CC0). Bewusst nicht benutzt: Stimmen mit unklarer oder nicht-kommerzieller Lizenz (M-AILABS `eva_k`/`karlsson`/`ramona`, `ryan`, `hfc_*`: BY-NC-SA).
- **Was das ist:** neuronale Sprachsynthese, deutlich verständlich und nicht „piepend“, aber hörbar synthetisch (typische Piper-Medium-Qualität; Kerstin-Modell nur „low“, 16 kHz). Alle deutschen Rollen gehen auf **zwei echte Sprecher** zurück (Thorsten, Kerstin); unterscheidbar sind sie über Sprechstil, Tonhöhe (höchstens ±2,5 Halbtöne, mehr schadete der Verständlichkeit), Tempo und Klangfarbe. Echte Sprecher-Vielfalt und professionelle Schauspielerstimmen fehlen und sind **ausdrücklich offen**; die Architektur nimmt Aufnahmen 1:1 an (Anleitung im README der Voice-Pakete).
- **Messung (Whisper small, lokal, Rücktranskription, Wortfehlerrate; pessimistischer Richtwert, da Whisper bei Ein- bis Dreiwort-Zurufen oft halluziniert):** deutsche Stichproben mit mittlerer Wortfehlerrate 0,17–0,34 je Stimme (Gesamt ≈ 0,22, Anteil fehlerfrei erkannter Clips ≈ 50 %; Lord nach Entschärfung des Halls 0,57 → 0,17; Berater 0,14, Ingenieur 0,07, Armbrust 0,11 am besten, Händler 0,34 und Ritter 0,32 am schwächsten) – Sätze ab vier Wörtern werden meist komplett erkannt, Ein- bis Dreiwort-Zurufe schlechter; englisch (Berater, Bogenschütze, Bauer, Lord, Ritter, Schmied, 136 Clips) 0,11; Signalprüfung im Browser (`decodeAudioData`): alle Clips dekodierbar, Spitze ≤ 0,81, RMS −22,5 … −19,5 dB, 498 deutsche und 371 englische Clips, keine NaN/Stille. Ende-zu-Ende: Ausgabe der echten Engine per `MediaRecorder` aufgenommen und rücktranskribiert – alle sechs gesprochenen Zeilen erkannt.
- **Befund Bearbeitung:** Tonhöhenverschiebung und Hall verschlechterten die Verständlichkeit messbar (Lord: roh WER 0,17, +Tonhöhe 0,27, +starker Hall 0,47, leichter Hall 0,22) – deshalb sind Raumeffekte jetzt sehr leicht und Verschiebungen begrenzt. Whisper-small versagt an Einwort-Zurufen („Hilfe!“ → „Fertig“) auch bei der unbearbeiteten Rohausgabe; kurze Zeilen wurden dort verlängert, wo sie in der Messung auffielen.
- **Nur Ersatz/Platzhalter:** Beraterzeilen, die der Berater-Agent mit eigenen Texten über `voice.say` schickt und die hier nicht im Register stehen, laufen über die Browser-Sprachausgabe (Qualität je nach Browser/Betriebssystem) – sie lassen sich in `voices.de.ts` (`ADVISOR_DE`) ergänzen und mit `scripts/gen-voices.sh` nachträglich vertonen. Englisch ist als Clip-Paket vorhanden, aber weniger geprüft als Deutsch.
- **Beraterzeilen des Ereignis-Beraters (`advisor_lines.ts`, Branch des Berater-Agenten, nicht gemergt):** `scripts/export-voice-lines.ts` liest sie, wenn die Datei vorhanden ist. 8 Zeilen ohne Platzhalter sind direkt vertont; 127 Zeilen mit genau einem Namensplatzhalter (`{res}` je Ware, `{store}` je Lager, `{building}` je Betrieb bzw. Turm) sind je Wert ausgeschrieben (Manifest-Schlüssel `<zeile>@<wert>`, `"x": 1`), das Register findet sie über Zeilenschlüssel + fertigen Text. **Zeilen mit Zahlen oder freien Namen (`{n}`, `{months}`, `{list}`, `{name}` …) laufen über die Browser-Sprachausgabe** (Text mit eingesetzten Werten) – das ist der größte Teil der Beraterzeilen und die wichtigste verbleibende Qualitätslücke der Beraterstimme (Lösung später: Satzbausteine/Zahlwörter einzeln vertonen oder Aufnahmen).
- **Merge-Hinweise:** `AudioEngine.voice` (kein Namenskonflikt mehr: die frühere private Methode heißt `legacyVoice`); `session.ts` nur zwei kleine Hunks (`commandVoice`, `setSelection`); `shared/src/index.ts` +1 Zeile (`export * from './data/voices'`); `.gitignore` +`__pycache__`; Beraterzeilen nach dem Merge mit `scripts/gen-voices.sh` (und `VOICE_LANG=en`) nachvertonen, falls sich `advisor_lines.ts` geändert hat; Tests `audio_voice.test.ts` prüfen Clip ↔ Zeile (veraltete Clips schlagen an).

## 4E Berater
- [x] Ereignislogik mit Prioritäten und Entprellung: `client/src/ui/advisor.ts` (Erkennung aus ClientWorld/PlayerView, Hysterese-Zustände), `advisor_queue.ts` (Warteschlange, Abklingzeit je Art, Zeitfenster, Verdrängung durch Kritisches, Verfall, Bündelung); Zeilen als Daten `shared/src/data/advisor_lines.ts` (de vollständig, en ergänzend). Tests: `client/test/advisor.test.ts` (35), `shared/test/advisor_lines.test.ts`, angepasste Berater-Tests in `hud_logic.test.ts`.
- [x] Sprachausgabe (nur `audio.voice.say/replayLast/lastText/stop`, null-sicher), Wiederholen (Alt+H, ↻-Knopf, ohne Sprachsystem als Text), Sprachschalter (`Settings.advisorSpeech`, Optionen „Berater spricht“, Lautsprecher-Knopf im Panel), Sprung zum Ort inkl. Gebäudeauswahl, Meldungsliste (8 Einträge, kein Neuaufbau unter dem Mauszeiger).
- [x] Browserprüfung: Holz knapp -> genau eine Meldung, bei Leerstand eine zweite, keine Wiederholung, Klick springt, Wiederholen/Alt+H/Sprachschalter, F1 zeigt Hotkey (`scratchpad/agent4e/advscen.mjs`); Militär: Anrücken (45 Felder) -> Angriff -> Katapult je einmal in der richtigen Reihenfolge (`milscen.mjs`).
- Ereignisse/Schwellen: siehe README „Berater und Beliebtheits-Ansicht“.
- Absprache Stimmen-Agent (nur additive Wünsche): (1) `AudioEngine` hat bereits eine private Methode `voice(cls, mode, kind)`; die neue Eigenschaft `voice` (VoiceApi) kollidiert damit, die Methode bitte umbenennen. `Session.voice()` prüft deshalb `typeof voice.say === 'function'`. (2) Alle Berater-Zeilenschlüssel (`advisor.<ereignis>.<nr>`, Variante ab 1) lassen sich aus `ADVISOR_EVENTS`/`advisorKeys()` und `ADVISOR_DE` ableiten (Clip-Register); Platzhalter `{n}`, `{res}` … werden zur Laufzeit eingesetzt, d. h. für vorab erzeugte Clips fehlen die Zahlen -> TTS-Fallback mit `text`. (3) Der Berater plant Lesezeit/Zeitfenster selbst (`windowFor`), ruft `say` aber höchstens einmal je Fenster.

## 4F Beliebtheit + HUD
- [x] Beliebtheit: Zerlegung in einer Funktion (`popularityFactors`, bitgleich zur alten Sim, Vergleichslauf 5 Szenarien x 40 Intervalle identisch), `explainPopularity` (`shared/src/sim/popularity_explain.ts`) mit Prognose/Zeiteinheit (Punkte pro Monat = 60 s bei 1x, Bewertung alle 10 s, keine Annäherung an Zielwert), Faktoren, Obergrenzen, Hauptursache, Warnungen, Stellschrauben; Texte de/en `popularity_text.ts`. Tests `shared/test/popularity_explain.test.ts` (17, headless Sim: Steuern, Hunger, Rationen/Vielfalt, Bier+Kirche, Deckel gute/schlechte Dinge, Überfüllung, Bestechung ohne Gold, Abwanderung, Schwellenzeit, Wachstumsrate).
- [x] UI: Hover (Tooltip-System), Detailansicht (Taste L/Klick, zweispaltig, Esc/✕, nicht modal), Bergfried-Ansicht und Kopfleiste nutzen dieselbe Funktion (`ui/popularity.ts`, `popularity_model.ts`); Browserprüfung `popscen.mjs` (12 Prüfungen, Zahlen = Sim = Bergfried-Panel).
- [x] HUD-Polish: Warnsymbole/Farbstufen für Gold, Bauern, Beliebtheit, Truppen, Rohstoffe, Nahrung (Vorrat in Monaten), Tooltips für alle Kopfleisten-Werte, Gruppierung, kompakte/enge Kopfleiste bei kleiner wirksamer Breite (Fensterbreite/UI-Skalierung), Infopanel/Minikarte schmaler unter 940 px. Screenshots `docs/phase4/hud/` (vorher/nachher 820/1024/1280, UI-Skalierung 0,8/1,0/1,5).
- Gate (Stand 4E/4F): `pnpm test` shared 124, client 144, server 3 grün; `pnpm -r typecheck` und `pnpm build` grün. Browser-Szenarien mit Screenshots in `docs/phase4/hud/` (`after_*` = HUD nach der Überarbeitung, `before_*` = Ausgangslage; `pop_*` Beliebtheit Hover/Detail/Bergfried, `hunger_*`, `adv_*` Berater, `mil_*` Militär, `options_advisor`). Einzelne Zeitüberschreitungen im alten `uitest.mjs` (Markt-Klick, Strg+Z, Abreißen) treten bei hoher Rechnerlast (Load ≈ 30) auch auf dem Ausgangsstand auf.
- Befund Beliebtheit: `popTarget`/`PlayerView.popDelta` ist die Änderung pro Monat (Summe der Faktoren), kein Zielwert; vor der ersten Auswertung (erste 10 s) steht dort noch der Startwert 60 – die Anzeige behandelt „keine Faktoren“ als „noch keine Auswertung“. `PlayerState.events` (zeitlich begrenzte Beliebtheits-Ereignisse) wird von keiner Stelle der Sim befüllt.

## 4G Atmosphäre
- [x] Umgebungsgeräusche + Regler: `client/src/audio/ambience.ts` (Klangbetten Wind, Blätterrauschen, Wasser, Siedlungsgemurmel, Feuer, ferner Gefechtslärm; Einzelereignisse Vogelrufe in drei Arten, Feuerknacken, ferne Waffenschläge – alles synthetisiert, keine Dateien), `ambience_logic.ts` (reine Regeln, getestet), Kanal `ambient` + Regler „Umgebung“ (`Settings.volAmbient`, gespeichert), Eingabe aus `game/soundscape.ts` (alle 0,25 s: Wasseranteil/-richtung und Baumdichte um den Blickpunkt, Bewohner/Gebäude/Märkte im Bild, brennende Gebäude, Kampf im Bild bzw. außerhalb).
- [x] Abhängigkeit von Kamera (Zoom: nah Details, fern Wind), Umgebung (Wasser mit Stereolage, Wald, offenes Land), Spiellage (Frieden › Spannung › Schlacht; in der Schlacht keine Vögel, Natur und Siedlung gedämpft, ferner Lärm hebt sich, wenn außerhalb des Bildes gekämpft wird). Menü: Betten aus.
- [x] Keine Hammerwand: Werkstattgeräusche je Typ nur von den 2–3 nächsten Gebäuden (Schmiede 3, Mühle 2, Mine 3), Lautstärke nach Dichte kompressiv (`n^-0,45`), Phasenversatz je Gebäude; Arbeitsgeräusche der Bauern mit begrenzter Gesamtrate (≈ 3,5 Quellen je Periode); Einzelereignisse über das bestehende Voice-Limit (Vögel höchstens 2, Mindestabstand 2,2 s); Summe der Betten begrenzt.
- [x] Tests: `client/test/audio_ambience.test.ts` (Pegel in 0..1, Monotonie Wasser/Bäume/Bewohner, Zoom, Lage, Stereo, Glättung, Quellenauswahl, Dichte, Phasen, Ereignisplanung mit Rate/Obergrenze/Determinismus, Kartenabtastung). Offline-Render (`__audio.renderAll()`): 5 Einzelereignisse + 8 Szenarien (jedes Bett einzeln, Vögel, dichtes Gesamtszenario) ohne NaN, Spitze ≤ 0,58, Bus ≤ 0,27, kein Clipping.
- [x] Browser (Chromium): Betten reagieren (Burg nah/fern, Wasser nah/fern mit Stereolage, Wald), Schlacht im Bild/ferne Schlacht (Lärm 0,33 → 0,94, 15 ferne Waffenschläge, danach abklingend), Mood-Wechsel, Regler und Untertitel-Option gespeichert und nach Neuladen erhalten, Konsole sauber.
- Offen/ehrlich: Feuerknistern im Browser nicht live ausgelöst (nur Offline-Render und Logiktest); Klangbalance nur über Pegelmessung abgestimmt, nicht nach Gehör; Vogelrufe im Browser-Lauf wegen Software-GL (≈ 1 FPS, Soundscape-Zeit läuft langsamer) nur einmal gehört/gezählt, Rate per Test belegt.

## 4H Abnahme

Stand: Abnahme im echten Browser (Chromium 141, Software-GL/SwiftShader, 4 Kerne, kein Safari, keine echte GPU) auf dem zusammengeführten Stand. Skripte `scripts/qa/` (Aufruf und Übersicht: README „Abnahme-Skripte“), Ergebnisse je Szenario `docs/phase4/qa/<name>.json` (Prüfungen, Konsolenmeldungen, Messwerte), Bilder `docs/phase4/qa/<name>/`, Vorher/Nachher `docs/phase4/COMPARE.md`. Alle Szenarien liefen mit sauberer Konsole (außer den bekannten Software-GL-Hinweisen: 0 Meldungen in allen Läufen).

- [x] Browser-Szenarien 1–12 + Tutorial-Missionen praktisch durchgespielt (Tabelle unten), Befunde protokolliert und behoben (Abschnitt „Befunde 4H“)
- [x] Performance dokumentiert (Chromium/SwiftShader, Hotspots, Speicher), Safari-Anleitung im README, Safari-Risiken statisch geprüft (unten)
- [x] README ergänzt (Mac/Safari-Anleitung, Abnahme-Skripte, Hotkeys auf dem Mac), `docs/phase4/COMPARE.md`
- [ ] **offen, nicht verifiziert:** Messung auf echter GPU/Safari (60 FPS bei 2.000 Einheiten ist NICHT nachgewiesen), Klang nach Gehör (nur Pegel, Dekodierung und Rücktranskription gemessen), Live-Test auf dem MacBook Air M3 (Safari-Shader-Kompilierzeit, Hänger beim Start, Farbwirkung auf dem Display)

### Ergebnis der Browser-Szenarien

| # | Szenario | Ergebnis | Beleg (`docs/phase4/qa/`) |
| --- | --- | --- | --- |
| 1 | Gefecht gegen KI (Hauptmenü und `?quick=1`) | bestanden: Menü → Setup → Spiel, 3 Spieler, HUD, KI baut weiter (6/24/22 Gebäude nach 90 s) | `s01_start.json`, `s01_menu/*.jpg` |
| 2 | Wirtschaftsgebäude, Bauanimation, Sofortbau | bestanden: 10 Gebäude über den echten Befehlsweg; im Snapshot nach ≤ 1,9 s Beobachtungsraster (`n` = Platzierungs-Tick), Arbeiter ziehen nach 4–32 s ein (Laufweg/Arbeiterpool, nie an die Animation gekoppelt), Fortschritt 0 → 1; Bildserie Mühle bei 0,25× (Alter 3/14/23/32/42 Ticks = Fortschritt 0,10/0,36/0,57/0,79/1,0); Sim-Test `shared/test/instant_build.test.ts` | `s02_economy.json`, `s02_economy/bau_muehle_*.jpg`, `siedlung_*.jpg` |
| 3 | Bauern bei der Arbeit, Bewegung | Kennzahlen erfasst, **aber bei 4 FPS (Software-GL) nur eingeschränkt aussagekräftig**: Sprünge 0 %, Stehende ruhen (Drift 0,000 t/s), Gehen ohne Weg 0 %, Gleiten 0 % (alt 0,7 %); Halt/Rückwärts neu 1,7/0,9 % gegen alt 0,0/0,0 % – bei Bildabständen von ~250 ms (> Puffer von 100–300 ms) arbeitet die Interpolation naturgemäß schlechter. Das headless-Labor (30 FPS) zeigt den Unterschied klar zugunsten des neuen Modells (Tabelle unten). Echte 60-FPS-Aufnahme in Safari fehlt | `s03_motion.md`, `s03_motion_*.json` |
| 4 | Burg mit Mauern, Torhaus, Türmen, Treppen, Geschütz; Truppen über Tor/Treppe/Mauer | bestanden: 4 Rundtürme, 3 Wachtürme, Steintor, 2 Treppen, Ballista auf dem Turm; Mauerwelle (25 Stücke in ~2 s Spielzeit, im Lauf `--fast` mit Zwischenständen 0/25 → 8 → 12 → 25 fertig); 24 Soldaten durch das Tor hinaus (21/24 in 70 s), hinein (24/24), über die Treppe auf die Mauerkrone (23/24); Bewegung über Tor/Treppe bei 8 FPS: Sprünge 0,0 %, Rückwärts 0,8 %, Halt 2,0 % (alt: 0,0/0,05/0,25 %) | `s04_castle*.json`, `s04_castle/5_auf_der_mauer.jpg`, `6_treppe_nah.jpg` |
| 5 | Auswahl, Rahmen, Formationen, Angriffsmarsch, Patrouille | bestanden (nach Behebung zweier Testfehler): Einzelklick, Rahmen (30/30), Y, Rechtsklick-Marsch in Frei/Linie/Block/Keil (Aufstellungen unterscheiden sich messbar: Breite/Tiefe 2,6/1,1, 1,0/0,7, 0,9/0,7, 1,5/1,2), Angriffsmarsch (`move attack`), Patrouille (13 Wendungen, Spanne 8,6 Felder), Stopp/Halten/Defensiv/Aggressiv; Alt+H löst kein „Halten“ aus, Alt+W schwenkt die Kamera nicht mehr | `s05_units.json`, `s05_units/3_marsch_*.jpg` |
| 6 | Gesprochene Einheitenantworten | bestanden: kein Ton vor der ersten Geste (Autoplay, Konsole sauber), danach Kontext „running“; alle 498 deutschen Clips dekodiert (953 s, Spitze ≤ 0,81, −22,5 … −19,5 dB RMS, 0 Probleme); Auswahl/Befehle sprechen Clips, gleiche Auswahl und 12 Wechsel in 1,2 s erzeugen höchstens 1 Zeile (Rest „global-gap“), Massenbefehl an 14 Einheiten 1 Zeile; Untertitel an/aus, Regler „Einheitenstimmen“ wirkt und wird gespeichert, M stumm; Aufnahme am Bus (MediaRecorder) je Rolle (20 Sprecher + Berater) und Rücktranskription mit Whisper small: 10–12 von 21 Zeilen mit Wortfehlerrate ≤ 0,5, 4–6 fehlerfrei, Mittel 0,45–0,55 (zufällige Zeilenwahl, Whisper halluziniert bei 1–3-Wort-Zurufen; die rohen Clips erreichten in 4D 0,22) | `s06_voices.json`, `s06_voices/rec/*.webm`, `rec/stt.json` |
| 7 | Ressourcenmangel → Berater | bestanden: Holz knapp → genau 1 Meldung (Text sichtbar, Stimme ausgelöst), keine Wiederholung nach 48 s Spielzeit, bei Leerstand genau 1 zusätzliche; Klick springt zum Ort; ↻ und Alt+H sprechen erneut; Sprachschalter; Hunger: Vorwarnung → „food.empty“ genau einmal (kritisch, als Clip); insgesamt 8 Meldungen. **Zeilen mit eingesetzten Zahlen sprechen über die Browser-Stimme** (Ersatz), nur zahlenfreie Zeilen als Clip | `s07_advisor.json`, `s07_advisor/*.jpg` |
| 8 | Beliebtheit → Hover/Detail | bestanden: Steuern 4 → Hover und Detailansicht (Klick/L) nennen Steuern −8 (Hauptbelastung), Prognose pro Monat, Hinweistext; Zahlen = Sim = Bergfried-Panel (53,7 / −6,5 pro Monat); Berater meldet „pop.falling.tax“ und „pop.leaving.tax“ mit derselben Ursache; Gegenprobe Steuern −2 + Extra-Rationen → positive Faktoren (+5, +4) | `s08_popularity.json`, `s08_popularity/2_detail.jpg` |
| 9 | Schlacht mit mehreren Hundert Soldaten | bestanden (Endlauf nach B8): 309 gegen 313 Soldaten (+ 12 Ritter je Seite), Verluste auf beiden Seiten (309 → 153), Draw-Calls 52–68, Stimmung wechselt auf „battle“, Spitze am Bus 0,85 (kein Übersteuern, 0 Clip-Ereignisse), Effektivwert 0,30 bei allen Reglern auf Maximum, höchstens 2 Einheitenstimmen zugleich, bis zu 52 Leichen, 35 Geschosse, ~1.460 Partikel gleichzeitig; Bogenschützen nun mit Teamfarbe vorne sichtbar | `s09_battle.json`, `s09_battle/*.jpg` |
| 10 | Speichern/Laden | bestanden: Spielstand in IndexedDB, nach dem Laden gleiche Gebäude (16/16 inkl. Platzierungs-Tick), gleiche Einheiten, gleiche Höhenprüfsumme, **keine Bauanimation vorhandener Gebäude**, Berufsfiguren erkannt, Musik/Umgebung laufen, Bewegung ruhig (Sprünge 0 %) | `s10_saveload.json` |
| 11 | Multiplayer, Reconnect | bestanden: Server (`packages/server/dist`) + 2 Clients + KI; Gebäude beider Clients bis Tick T gleich (Prüfsumme); Trennen (WebSocket), hartes Offline, Neuladen → automatische Rückkehr, Gebäude/Baustufen korrekt, keine Neubau-Animation vor dem Trennen gesetzter Gebäude, Stimmen/Berater laufen; Server-Test 2 Menschen + 4 KI grün | `s11_online.json` |
| 12 | Grafikstufen Nah/Fern, Wechsel zur Laufzeit | bestanden: Mittel → Hoch → Niedrig → Mittel über das Optionsmenü ohne Fehler (Draw-Calls 50–78, Dreiecke 130–455k, Geometrien stabil); `scripts/shots.mjs --check` für Niedrig/Mittel/Hoch über alle 12 Szenen: Konsole sauber | `s12_quality.json`, `s12_shots_*.json` |
| – | Tutorial-Missionen 1–5 | bestanden: alle starten und laufen 20 s Zufallsbedienung bei 3×, keine Konsolenmeldung, Berater 2 Meldungen je Mission | `s14_missions.json` |
| – | Speicher beim Spielende (dreimal starten/beenden) | bestanden nach Behebung zweier Lecks (B6): Geometrien 38, Texturen 4, Programme 24, Szenenobjekte 82, Listener 17, DOM-Knoten 175 – alle konstant, Heap 58 → 63 → 63 MB | `s13_leaks.json` |
| – | WebGL 2 fehlt | bestanden: Erklärung statt leerer Seite | `s15_nowebgl/meldung.jpg` |

Messlabor Bewegung (headless, `cd packages/client && ../shared/node_modules/.bin/tsx bench/motion.ts all local30 all`, Profil 30 FPS): alle sechs Szenen neu gegenüber alt – Sprünge 0,00–0,01 % (alt 2,3–6,0 %), Halt 0,07–0,45 % (alt 8,4–10,0 %), Rückwärts ≤ 0,42 % (alt 2,4–3,5 %), Richtungsumkehr 0,0–3,2/min (alt 68–93/min).

### Befunde 4H

| Nr | Befund | Ursache / Zahlen | Behebung | Regressionstest |
| --- | --- | --- | --- | --- |
| B1 | Alt-Hotkeys schwenken die Kamera mit; auf dem Mac bleibt die Kamera nach Cmd+Taste hängen | gehaltene Tasten wurden ohne Modifikator-Prüfung gemerkt: `Alt+S` (Lager anwählen) und `Alt+W` (Waffenkammer) zählten als Schwenktasten S/W; macOS sendet bei gehaltener Cmd-Taste kein `keyup` der Buchstabentaste | `tracksHeldKey` (`game/hotkeys.ts`), Meta-Loslassen leert gehaltene Tasten | `client/test/hotkeys.test.ts` (scheitert vorher mangels Funktion/Regel: genau `KeyS`/`KeyW` teilen Alt- und Schwenkbelegung); Browser: `s05` „Alt+W schwenkt die Kamera nicht mit“ (Nachher-Prüfung; eine Vorher-Messung im Browser liegt nicht vor, der Fehler ist aus Code und Test belegt) |
| B2 | Füße gleiten gegenüber dem Körper | Schrittlänge je halber Phase π·v/W gegen Fußhub 2·Beinlänge·sin 0,66: Verhältnis 1,18–1,41 (Median 1,25) bei `W = 3 + 4,2·v`; Gehphase ist an die gezeichnete Geschwindigkeit gekoppelt (4A), aber die Frequenz war zu niedrig für die Schrittweite | `UNIT_WALK_W`: Faktor 4,2 → 4,8 (Fußvolk): Verhältnis 1,10–1,17 für normale Typen, schnelle Typen bleiben wegen der Obergrenze 14 rad/s bei ≤ 1,4 | `client/test/unit_gait.test.ts` (Median ≤ 1,2, alle 0,8–1,45; vorher Median 1,25 → rot) |
| B3 | Mac/Safari: Strg+Klick ohne Wirkung, Trackpad-Pinch skaliert die Seite, Mausrad in Zeilen-Einheiten zoomt kaum, keine Entf-Taste | nur Taste 2 war „Rechtsklick“; Safari-Gesten-Ereignisse nicht abgefangen; `deltaMode` ignoriert; „Abreißen“ lag nur auf `Delete` | `game/pointer.ts` (`isSecondaryClick`, `wheelPixels`), Gesten-Zoom in `input.ts`, Backspace-Alias (`comboAliases`) | `client/test/pointer.test.ts`, `hotkeys.test.ts` |
| B4 | Ohne WebGL 2 bleibt die Seite leer | `new WebGLRenderer` wirft, nichts erklärt es | `main.ts` zeigt eine Erklärung (Hardwarebeschleunigung/Browser) | Browser: `s15_nowebgl` (Chromium mit `--disable-3d-apis`) |
| B5 | Speichern scheitert still (Safari privat/blockierter Speicher) | `saves.save(...).then(...)` ohne Fehlerpfad (ungefangene Promise-Ablehnung, kein „gespeichert“) | Fehlermeldung „Speichern nicht möglich“, Laden fängt Fehler | keiner (IndexedDB-Sperre im Headless-Lauf nicht nachstellbar) |
| B6 | Speicher/Listener wachsen mit jedem Spiel | (1) `hud.ts` hängte pro Sitzung einen anonymen `pointerup`-Listener ans Fenster und entfernte ihn nie (hielt Hud und Welt im Speicher); (2) `MotionDebug` hängte Canvas + Textfeld in `#ui`, ohne sie zu entfernen. Messung vorher (3 Spiele): Listener 18 → 19 → 20, DOM-Knoten 177 → 179 → 181, JS-Heap 64 → 77 → 84 MB | benannte Handler, Entfernen in `Hud.destroy`, `MotionDebug.destroy` in `Session.destroy`, Debug-Hooks löschen | `client/test/leaks_source.test.ts` (3 Tests; vorher rot: anonymer Listener vorhanden), Browser `s13_leaks`: nachher 17/17/17, 175/175/175, Heap 58 → 63 → 63 MB |
| B7 | Prüfhilfe: `window.__place(type, x, y, rot)` (Platzierungsregeln der Sim für die Skripte) | kein Fehler, nur Werkzeug | `game/session.ts` | – |
| B8 | Spielerfarbe der Bogenschützen nur am Köcher auf dem Rücken: in der RTS-Ansicht (Blick auf Brust/Kopf) sind Archer-Massen beider Seiten nicht zu unterscheiden | Browser-Experiment `s16_teamcolors` (acht Spieler nebeneinander, mittel): Bogenschützen aller Farben wirken gleich grün; Flächenanteil Teamfarbe vorne oberhalb der Hüfte = 0,00 % | Waffenrock-Fläche (2 Dreiecke) in Teamfarbe vorne, Dreieckbudget 400 bleibt eingehalten | `client/test/unit_team_front.test.ts` (vorher rot für Bogenschützen: 0,00 %) |

Beobachtungen, die **nicht** geändert wurden (mit Begründung):

- **Beraterstimme:** von 52 Zeilenvorlagen haben 8 keinen Platzhalter und 9 genau einen endlichen Namensplatzhalter (Ware/Lager/Gebäude → je Wert ein Clip, 171 Clips); **35 Vorlagen mit Zahlen/freien Namen (z. B. „nur noch 18 im Lager“) sprechen über die Browser-Stimme** (Qualität je Browser/System, auf dem Mac die macOS-Stimme) statt über das Clip-Paket. Test `advisor_voice_clips.test.ts` stellt sicher, dass alle vorab vertonbaren Zeilen Clips haben (deutsch und englisch; keine Lücke gefunden, nichts neu zu erzeugen). Lösung später: Satzbausteine/Zahlwörter einzeln vertonen.
- **Verständlichkeit der Clips im Spiel:** Rücktranskription des Bus-Ausgangs (Opus-Aufnahme, Whisper small) mittlere Wortfehlerrate 0,45–0,55 gegenüber 0,22 bei den rohen Clips – Whisper ist bei Ein- bis Dreiwort-Zurufen pessimistisch, ein Hörtest durch Menschen fehlt (offen).
- **Bewegung bei sehr niedriger Bildrate:** unter Software-GL (4–8 FPS) zeigt das neue Modell geringfügig mehr Halt-/Rückwärtsbilder als das alte (Browser `s03`, `s04 --fast`); im Messlabor bei 30 FPS ist es durchweg deutlich besser. Bei < 10 FPS überschreitet der Bildabstand den Interpolationspuffer; auf einem MacBook sollte das nicht auftreten, ist aber ungemessen.
- **Erster Spielstart:** das erste Bild dauert unter SwiftShader ≈ 1,3 s (21 Programme werden kompiliert, `onFirstUse` ≈ 0,7 s von 1,8 s CPU in den ersten 12 s); danach kommen nur 3 Programme hinzu (nach 4 s: 24) und bleiben bei 24, auch nachdem alle 26 Einheiten- und 32 Gebäudetypen im Bild waren. Das erstmalige Modellbauen kostet pro Typ wenige ms (alle 57 Gebäudetypen zusammen ≈ 0,3 s CPU im Profil). Deshalb kein Vorwärmen eingebaut; unter Safari (ANGLE/Metal) ist die Kompilierzeit offen.
- **Programme wachsen beim Stufenwechsel** (24 → 39 nach Mittel → Hoch → Niedrig → Mittel): three.js behält die alten Programme; Geometrien/Texturen bleiben stabil, harmlos.
- **Partikel/Billboards** (`fx.ts`) laufen bewusst ohne Tonemapping/Farbkorrektur (eigene Fragment-Shader, Farben direkt); in den Bildern kein Farbbruch zu Figuren/Gebäuden/Gelände sichtbar.
- **Kartenrand** außerhalb der Karte ist einfarbiger Dunst (hell, in Randansichten sichtbar weiß); kein Himmel/Horizont (bekannt aus 4B).
- `checkClips` braucht neben einem laufenden Spiel unter Software-GL 7 Minuten, auf der Menüseite 6 s – nur Messartefakt.

### Zahlen (Chromium 141, SwiftShader, Intel Xeon 2,8 GHz × 4, 1280×720, Pixel-Ratio 1, Kamera 36, 2.000 Einheiten)

| Stufe | FPS (Software-GL) | JS Ø ms voll | JS Ø ms ohne Raster (`nodraw=1`) | JS p95 ms (ohne Raster) | Draw-Calls | Dreiecke | Einheiten (gezeichnet) | Partikel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Niedrig | 1,0 | 5,6 | 3,7 | 4,9 | 67 | 464k | 2002 (1642) | 484 |
| Mittel | 0,5 | 8,8 | 4,4 | 5,9 | 83 | 950k | 2002 (1712) | 1492 |
| Hoch | 0,4 | 9,0 | 4,1 | 5,7 | 84 | 1124k | 2002 (1720) | 2790 |

Rohdaten `docs/phase4/qa/bench-fps.md` / `.json` (`node scripts/bench-fps.mjs --units=2000 --secs=15 --warm=4 --dist=36`). „JS voll“ enthält bei Software-GL Befehlsaufbau und Treiberarbeit des Rasterizers; die Zielgröße zählt ohne Raster.

- Ziel Mittel JS-Zeit ≤ 8 ms (gemessen mit `nodraw=1`): **erreicht** (siehe Tabelle; in der Software-GL-Umgebung). Draw-Calls < 150: **erreicht**. **60 FPS: nicht erreicht und mit Software-GL nicht beurteilbar** (0,5–1,1 FPS sind reine Rasterizer-Zeit); nur eine Messung auf echter GPU/Safari kann das klären.
- Hotspots (CPU-Profil `nodraw=1`, Mittel, `scripts/qa/perf_profile.mjs`, `docs/phase4/qa/perf_*.json`): `tick` der synthetischen Bench-Welt 10 %, `updateBuffer` (three, Puffer-Hochladen) 7 %, `update` der Instanzen 6 %, `updateUnits` 5,5 %, `variantFor/unitVariant` 3 %; nichts, was eine Optimierung nahelegt – bewusst nicht angefasst.
- Szenen im Spiel (Mittel, 1280×720): Draw-Calls 50–78, Dreiecke 130–490k, Programme 24 (Mittel) / 26 (Hoch).

### Safari-/macOS-Risiken (statische Prüfung des Codes, Stand 4H)

Gefunden und behoben: B1 (Cmd/Alt-Tasten), B3 (Strg+Klick, Pinch, Backspace, `deltaMode`), B4 (WebGL 2 fehlt), B5 (IndexedDB gesperrt). Geprüft ohne Befund:

- **WebGL/Shader:** three.js r170 (WebGL 2 Pflicht); alle eigenen Shader nutzen nur GLSL-ES-3.00-Kern (`dFdx/dFdy`, `mod`, `smoothstep`, keine Erweiterungen; `getExtension` kommt nur in `bench.ts` für die GPU-Bezeichnung vor); keine Float-Texturen, keine Render-Targets außer Schattenkarten; Anisotropie optional (`getMaxAnisotropy()` kann 0 sein → 1); Pixel-Ratio-Deckel 1/1,5/2.
- **Workers/APIs:** Sim-Worker als Modul-Worker (`new Worker(new URL(...), { type: 'module' })`, Safari ≥ 15); Bundle-Ziel `es2022` mit Top-Level-Await (Safari ≥ 15); kein `OffscreenCanvas`, `structuredClone`, `SharedArrayBuffer`, `findLast`/`at()`/`Object.hasOwn`, keine Regex-Lookbehind, keine Klassen-Static-Blöcke, kein `MediaRecorder` im Spiel (nur in den QA-Skripten), kein `backdrop-filter`/`:has`/`dvh` im CSS.
- **Audio:** `AudioContext` mit `webkitAudioContext`-Rückfall, Kontext erst nach der ersten Geste (`userActivation`-Prüfung), Zustand „interrupted“ behandelt; verwendet werden `createStereoPanner`, Biquad, Kompressor, BufferSource (Safari ≥ 14.1), kein `AudioWorklet`, kein `cancelAndHoldAtTime`; Clips MP3 (Safari dekodiert MP3), `decodeAudioData` in Promise-Form.
- **Sprachausgabe:** `speechSynthesis` nur nach Geste; Stimmenwahl über Sprachpräfix `de`/`en` (Safari liefert `de-DE`, iOS `de_DE`), `getVoices()` erst zur Sprechzeit (Safari füllt die Liste asynchron: leer → Standardstimme der Sprache über `utterance.lang`), Namenshinweise für macOS-Stimmen (Anna, Markus, Petra, Yannick …).
- **Speicher:** `localStorage` überall in try/catch; IndexedDB-Fehler melden (B5).
- **Offen (nur auf dem Mac prüfbar):** Kompilierzeit der 24–26 Programme über ANGLE/Metal beim ersten Bild, tatsächliche FPS/Frame-Zeiten, Verhalten der Anisotropie, Farbwirkung (P3-Display), Autoplay-Verhalten der installierten Safari-Version, Qualität der macOS-Stimmen für die Berater-Zeilen mit Zahlen.

## 4B-Menschen (Figuren und Einheiten)

Stand: umgesetzt, Tests/Typecheck/Build grün. Bilder: `docs/phase4/before/units/` (Vorher) und `docs/phase4/after/units/` (Nachher, gleiche Kameras: `catalog_near_1..5`, `catalog_far/mid`, `army_near/mid/far`, `workers_1..3`) sowie neu `detail_figuren_1.png`, `detail_belagerung.png`, `detail_berufe.png` (beschriftete Raster aller Typen/Berufe, Hoch, Seitenwinkel 22°) und `anim_*.png` (Bildserien Gehen/Hieb/Stoß/Schuss/Arbeit/Fallen).

**Befund (Berufe):** die Sim kennt nur den Einheitentyp „Bauer“; Berufe gibt es nur als Arbeitsplatz. Der Beruf wird daher rein darstellerisch aus Arbeitsplatz-Gebäude neben dem Arbeiter, Arbeitsphase (`aux >> 4`) und getragener Ware abgeleitet und je Einheit gemerkt (`render/unit_jobs.ts`); kein Eingriff in Sim/Snapshot.

**Architektur:** ein Mesh je Typ (Draw-Calls unverändert 70 im Bench, alle Waren-Formen jetzt in einem Mesh statt zehn), Nah/Fern-LOD, Haar-/Bart-/Hut-Varianten und 23 Berufe als Sichtbarkeits-Bits in derselben Geometrie, eigener Figuren-Shader (`unit_shader.ts`) mit Knie, Gegenphase, Oberkörperneigung, Kopf, Umhang, Arbeitsstilen. Neue Dateien: `unit_builder.ts`, `unit_humans.ts`, `unit_types.ts`, `unit_jobs_models.ts`, `unit_beasts.ts`, `unit_siege.ts`, `unit_items.ts`, `unit_shader.ts`, `units_style.ts`, `unit_jobs.ts`; `models_units.ts` neu. Tests: `client/test/unit_models.test.ts` (Katalog, Budgets, Pivots, Variation, Unterscheidbarkeit per Silhouetten-/Farbsignatur, Berufserkennung, Entity-Integration), `render.test.ts` angepasst.

**Dreiecksbudgets (nah Hoch, schlimmster Variantenfall / fern):** Fußvolk und Berufe ≤ 400 / ≤ 230 (Lord fern ≤ 250), Ritter und Berittener Bogenschütze ≤ 800 (gemessen 562 / 534) / ≤ 380, Ochse ≤ 800 (240), Belagerung ≤ 1300–1500 (Katapult 654, Trebuchet 592, Rammbock 476, Belagerungsturm 636, Schutzschild 296, Feuerballista 359) / ≤ 520–600. Niedrig baut nur das ferne Modell, Mittel ohne Hoch-Details.

**Messung** (`?bench`, 2000 Einheiten, Mittel, Software-GL, nur JS-Zeit per `nodraw=1`, Dist 36, Median aus 3 Läufen im Wechsel Vorher/Nachher auf derselben Maschine; FPS in Software-GL nur Richtwert):

| | Draw-Calls | Dreiecke | JS gesamt | davon Update / Render |
| --- | --- | --- | --- | --- |
| Vorher Mittel | 70 | 378k | 5,5 ms | 1,4 / 4,1 |
| Nachher Mittel | 70 | 889k | 5,9 ms | 2,1 / 3,8 |
| Vorher Niedrig | 67 | 287k | 3,9 ms | 1,1 / 2,9 |
| Nachher Niedrig | 67 | 429k | 4,5 ms | 1,5 / 3,1 |
| Vorher Hoch | 70 | 438k | 4,5 ms | 1,5 / 3,1 |
| Nachher Hoch | 70 | 1056k | 6,7 ms | 2,6 / 4,1 |

Der JS-Mehraufwand liegt in der Einheiten-Aktualisierung (Beruf, Variation, Nah/Fern je Einheit, ≈ +0,7 ms bei ≈ 1400 sichtbaren Einheiten). Messrauschen auf der Testmaschine ≈ ±1 ms (frühere Einzelläufe bis 8,7 ms Vorher-Stand). Die höhere Dreieckszahl belastet nur die GPU; auf echter Hardware nicht gemessen (offen).

**Stärken:** Berufe, Soldatentypen und Teamfarben sind schon bei Zoom ~25 px lesbar; Gehen/Hieb/Arbeit wirken deutlich natürlicher (Knie, Gegenphase, Neigung); Bevölkerung wirkt durch Hüte/Haare/Stoffe/Größe individuell, ohne Extra-Draw-Calls. **Schwächen:** Gesichter sind bei RTS-Höhe (52°) kaum zu sehen (Hüte verdecken den Kopf); Schürzen sind flache Platten; Beine bei allen Typen eher dunkel/einheitlich; Waffen dünn und ab Fern-Zoom nur als Linie; Belagerungsräder sind erst nah sichtbar; Berufserkennung vor der ersten Arbeit/Lieferung zeigt den „Bauern“ (Beruf wird erst am Arbeitsplatz oder durch Ware erkannt); `?bench&showcase` Raster am Kartenrand zeigt bei den letzten Berufen Gelände im Hintergrund.

**Merge-Hinweise:** `render/entities.ts` – Importe, Felder (`detail`, `lodS`, `jobS`, `vars` …), `applyQuality` (Detailstufe, Meshes neu bauen), `unitMesh`, Cargo (ein Mesh `cargo` statt Map), `updateUnits` (Block nach der `useBlob`-Zeile, `tm.push` unverändert), `updateCorpses` (Beruf/Variation), neue Hilfsmethoden vor `visibleAt`, `Corpse` um `id`/`job` erweitert; `render/instanced.ts` – additiv (`vari`, `material`, `depthMaterial`, `styleLast`, `dispose`); `bench.ts` – Prüfszenen (`labels`, `still`, `face`, `prof`, `showcase=single`, `setTime`); `render.test.ts` – Einheitenmodell-Tests angepasst. `materials.ts`, `builder.ts`, `quality.ts` unverändert: Figuren haben ein eigenes Material (`unit_shader.ts`, nutzt `GFX`/`PART` aus `materials.ts`); ändert die Material-Arbeit dort Licht/Farbpipeline der Lambert-Materialien, muss dasselbe im Figuren-Material nachgezogen werden.

**Offen:** Hochwertigere Gesichter/Frisuren erst bei sehr naher Kamera sichtbar; Feintuning der LOD-Grenzen (32/46 Tiles) auf echter GPU; Safari/Mac-Messung steht aus; Bewegungs-Agent: Gehphase an echte Geschwindigkeit koppeln wirkt auf `iAnim.z` (Rad-Drehgeschwindigkeit nutzt `UNIT_WALK_W` und Radius).

## Befunde
Die Befunde der Abnahme stehen oben unter „Befunde 4H“.
