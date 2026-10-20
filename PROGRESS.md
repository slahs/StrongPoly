# PROGRESS – PROMPT-3 (Bugs + Meilensteine B–F)

Nach einem Neustart: zuerst diese Datei lesen und beim ersten offenen Punkt weitermachen.
Gate nach jedem Meilenstein: `pnpm test`, `pnpm -r typecheck`, `pnpm build`.
Lange Läufe (Turnier) immer mit festem `OUT` starten (fortsetzbar).

## 1. Bugs
- [ ] 1.1 KI hortet Gold, rekrutiert nicht (2v3 s14, 2v7 s29, 6v7 s6)
- [ ] 1.2 Restliche Patts (17 Timeouts), Ziel ≥ 90 % Keep-Fall
- [ ] 1.3 Unbrauchbare Waffen (Werkstätten nur für erreichbare Einheitenkosten)
- [ ] 1.4 Bevölkerungsschaukel prüfen
- [ ] 1.5 Burg mauert sich nicht ein / zerstörte Tore werden neu gebaut (Test)
- [ ] 1.6 `bench/dmg.ts` (Statistik in Sim oder Skript entfernen)
- [ ] 1.7 Geschützreichweiten nach `shared/data/`
- [ ] 1.8 Docker-Image neu bauen und prüfen
- [ ] 1.9 Tutorial-Missionen 1–5 per Skript bis zum Sieg + Browser ohne Konsolenfehler
- [ ] 1.10 Smoke 3 Seeds + Determinismus-Test
- [ ] 1.11 Laufend: Bugs aus B–F (siehe unten „Gefundene Bugs“)

## 2. Meilenstein B – Menüs und Bedienung
- [ ] Unteres Hauptpanel (Reiter, Unterkategorien, Kontextfeld, Minikarte)
- [ ] Kontextpanels (Bergfried, Kornspeicher, Lager, Waffenkammer, Kaserne, Söldner, Ingenieurgilde, Markt, Werkstätten, Schenke, Kirche)
- [ ] Beliebtheitsanzeige mit Aufschlüsselung + Prognose
- [ ] Werkzeuge (Abreißen, Reparieren, Rückgängig, Bau abbrechen, Rechtsklick)
- [ ] Platzieren (Geist grün/rot + Grund, Kosten am Cursor, Linien-Vorschau)
- [ ] Truppenpanel (Typen, Haltung, Formation, Patrouille, Bodenangriff, Stopp, Graben, Öl)
- [ ] Hotkeys frei belegbar + F1-Übersicht
- [ ] Berater + Meldungsliste + Kamerasprung
- [ ] Hauptmenü / Pausenmenü / Endbildschirm mit Statistik
- [ ] Optionen
- [ ] Gate + Browser-Check

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

Entscheidungen und offene Punkte (D):
- **SSAO nicht umgesetzt:** EffectComposer verliert das Canvas-MSAA, die Normal-/Tiefenpasses passen nicht zur Vertex-Animation der Instanzen, das Bundle würde wachsen. Ersatz: eingebackene AO, Kontaktschatten, weiche Schatten. Das Feld `ssao` in `quality.ts` bleibt `false`.
- **Baufortschritt:** Die Sim setzt Gebäude sofort. Minimal erweitert: `Building.born` (Tick der Platzierung, reine Ausgabe, wird mitgespeichert) → `BuildingRec.n` im Snapshot. Der Client leitet daraus die Baustufe ab (Dauer nur visuell, `buildTicks` in `render/entities.ts`); Pause und Spielgeschwindigkeit wirken mit, Reconnect zeigt den richtigen Stand.
- **Blut-Schalter ohne Options-UI:** `Settings.blood` existiert und wird gespeichert; ein Kontrollkästchen müsste in `ui/screens.ts` (Hauptagent) ergänzt werden.
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
- [ ] Tooltips Gebäude/Einheiten
- [ ] Enzyklopädie (Menü + F2), alle Seiten
- [ ] `descriptions.ts` + i18n (de fertig, en vorbereitet)
- [ ] Test: Text + Icon für jedes Gebäude/jede Einheit
- [ ] Gate + Browser-Check

## Abschluss
- [ ] Turnier-Endlauf (≥ 90 %, Median)
- [ ] FPS-Messung dokumentiert
- [ ] README aktualisiert
- [ ] Abschlussbericht

## Gefundene Bugs / Erkenntnisse
(laufend ergänzen)
- **E (Sound):** `ClientWorld.apply` bekam `proj` (Float32Array) und `tiles` (Int32Array) nach dem msgpack-Weg als `Uint8Array` (Rohbytes) – Geschosse und Tile-Änderungen im Client-Spiegel waren Datenmüll. Fix in `shared/src/net/world.ts` (`asFloat32`/`asInt32`), Regressionstest in `shared/test/snapshot.test.ts`.
- **E (Sound):** Hotkey `M` war mit Extreme-Fähigkeit 4 belegt; Fähigkeit 4 liegt jetzt standardmäßig auf `J`, `M` = Ton stumm (`toggleMute`).
