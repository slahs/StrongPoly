# PROGRESS-4 – Visual Evolution, Natural Movement & Living World

Branch `claude/strongpoly-phase4-visual-evolution`, Ausgangs-Commit `aec8165b`. Spezifikation: `PROMPT-4.md`.
Nach einem Neustart: diese Datei lesen und beim ersten offenen Punkt weitermachen.
Gate nach jedem Meilenstein: `pnpm test`, `pnpm -r typecheck`, `pnpm build` + Browser-Check. Keine KI-Turniere nach reinen Grafik-/UI-/Audio-Änderungen.

## 4A Bewegung
- [ ] Diagnose (Snapshot → ClientWorld → Interpolation → Rendering), Ursache dokumentiert
- [ ] Fix + Tests
- [ ] Debug-Modus
- [ ] Testszenen + Browseraufnahme

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
- [ ] Ereignislogik mit Prioritäten und Entprellung
- [ ] Sprachausgabe, Wiederholen, Sprung zum Ort

## 4F Beliebtheit + HUD
- [ ] Hover/Detailansicht mit realen Sim-Faktoren
- [ ] HUD-Polish

## 4G Atmosphäre
- [ ] Umgebungsgeräusche + Regler

## 4H Abnahme
- [ ] Browser-Szenarien 1–12
- [ ] Performance dokumentiert, Safari-Anleitung
- [ ] README, Abschlussbericht

## Befunde
(laufend ergänzen)
