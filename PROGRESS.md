# PROGRESS – PROMPT-3 (Bugs + Meilensteine B–F)

Nach einem Neustart: zuerst diese Datei lesen und beim ersten offenen Punkt weitermachen.
Gate nach jedem Meilenstein: `pnpm test`, `pnpm -r typecheck`, `pnpm build`.
Lange Läufe (Turnier) immer mit festem `OUT` starten (fortsetzbar).

## 1. Bugs
- [ ] 1.1 KI hortet Gold, rekrutiert nicht (2v3 s14, 2v7 s29, 6v7 s6)
- [ ] 1.2 Restliche Patts (17 Timeouts), Ziel ≥ 90 % Keep-Fall
- [x] 1.3 Unbrauchbare Waffen (Werkstätten nur für erreichbare Einheitenkosten)
- [x] 1.4 Bevölkerungsschaukel (Steuer/Rationen-Hysterese; Rest = Raubzüge)
- [x] 1.5 Burg mauert sich nicht ein / zerstörte Tore werden neu gebaut (Test)
- [x] 1.6 bench/dmg.ts entfernt
- [ ] 1.7 Geschützreichweiten nach `shared/data/`
- [ ] 1.8 Docker-Image neu bauen und prüfen
- [~] 1.9 Tutorial-Missionen 1–5 per Skript bis zum Sieg (fertig: test/missions_play.test.ts; Mission 5: Tutorial-KI nutzt keine Angriffsfähigkeiten); Browser-Check offen
- [x] 1.10 Smoke 3 Seeds (Seed 2 meldete nur kurzzeitig überbaute Einheit, jetzt 30-s-Schwelle) + test/determinism.test.ts
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
- [ ] Beleuchtung/Schatten, Terrain, Wasser/Gräben
- [ ] Gebäude: Baustufen, Arbeitsanimationen, Trümmer, Mauerverbindungen
- [ ] Einheitenanimation, getragene Waren
- [ ] Effekte, Auswahlkreise, Lebensbalken
- [ ] Grafikstufen Niedrig/Mittel/Hoch
- [ ] `?bench` mit 2000 Einheiten, FPS gemessen
- [ ] Gate + Browser-Check

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
- Offen für den Hauptagenten: Tooltips an Bau-/Truppenleiste anbinden (`attachTooltip(el, () => buildingTooltip(typeId))` usw.), Platzierungsfehler mit `explainPlacementError(reason)` erläutern, README ergänzen

## Abschluss
- [ ] Turnier-Endlauf (≥ 90 %, Median)
- [ ] FPS-Messung dokumentiert
- [ ] README aktualisiert
- [ ] Abschlussbericht

## Gefundene Bugs / Erkenntnisse
(laufend ergänzen)
- **E (Sound):** `ClientWorld.apply` bekam `proj` (Float32Array) und `tiles` (Int32Array) nach dem msgpack-Weg als `Uint8Array` (Rohbytes) – Geschosse und Tile-Änderungen im Client-Spiegel waren Datenmüll. Fix in `shared/src/net/world.ts` (`asFloat32`/`asInt32`), Regressionstest in `shared/test/snapshot.test.ts`.
- **E (Sound):** Hotkey `M` war mit Extreme-Fähigkeit 4 belegt; Fähigkeit 4 liegt jetzt standardmäßig auf `J`, `M` = Ton stumm (`toggleMute`).
