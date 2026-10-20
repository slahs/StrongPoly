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
- [x] Gebäude (alle 57 Typen neu; siehe README „Gebäude (4B)“, Details unten)
- [ ] Menschen/Einheiten
- [ ] Gelände/Vegetation/Wasser
- [ ] Lebendige Welt (Gebäudeanteil erledigt: Rauch/Dampf/Funken/Staub/Mehl/Späne, Mühlenflügel, Fahnen – Rest bei den anderen Teilen)
- [ ] Vergleichsszenen, Vorher/Nachher

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
