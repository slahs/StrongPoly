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
- [ ] SVG-Icons für alles (Gebäude, Einheiten, Ressourcen, Fähigkeiten, Werkzeuge, Beliebtheit)
- [ ] Galerie `?icons`
- [ ] Test: jedes Datenelement hat ein Icon
- [ ] Gate + Browser-Check

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
