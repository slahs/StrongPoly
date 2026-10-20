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
- [ ] Menschen/Einheiten
- [ ] Gelände/Vegetation/Wasser
- [ ] Lebendige Welt
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
- [ ] Bauablauf je Gebäudetyp, zentrale Konfiguration
- [ ] Reconnect/Laden/Abriss/Rückgängig geprüft

## 4D Sprechende Einheiten
- [ ] Voice-Architektur, Clip-Register, Fallback
- [ ] Dialoge de (+ en)
- [ ] Prioritäten/Limits/Untertitel/Regler

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
- [ ] Umgebungsgeräusche + Regler

## 4H Abnahme
- [ ] Browser-Szenarien 1–12
- [ ] Performance dokumentiert, Safari-Anleitung
- [ ] README, Abschlussbericht

## Befunde
(laufend ergänzen)
