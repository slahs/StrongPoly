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
- [x] Menschen/Einheiten (siehe „4B-Menschen“ unten)
- [ ] Gelände/Vegetation/Wasser
- [ ] Lebendige Welt
- [ ] Vergleichsszenen, Vorher/Nachher

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
(laufend ergänzen)
