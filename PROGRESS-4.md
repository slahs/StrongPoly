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

## 4C Bauanimationen
- [ ] Bauablauf je Gebäudetyp, zentrale Konfiguration
- [ ] Reconnect/Laden/Abriss/Rückgängig geprüft

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
- [ ] Ereignislogik mit Prioritäten und Entprellung
- [ ] Sprachausgabe, Wiederholen, Sprung zum Ort

## 4F Beliebtheit + HUD
- [ ] Hover/Detailansicht mit realen Sim-Faktoren
- [ ] HUD-Polish

## 4G Atmosphäre
- [x] Umgebungsgeräusche + Regler: `client/src/audio/ambience.ts` (Klangbetten Wind, Blätterrauschen, Wasser, Siedlungsgemurmel, Feuer, ferner Gefechtslärm; Einzelereignisse Vogelrufe in drei Arten, Feuerknacken, ferne Waffenschläge – alles synthetisiert, keine Dateien), `ambience_logic.ts` (reine Regeln, getestet), Kanal `ambient` + Regler „Umgebung“ (`Settings.volAmbient`, gespeichert), Eingabe aus `game/soundscape.ts` (alle 0,25 s: Wasseranteil/-richtung und Baumdichte um den Blickpunkt, Bewohner/Gebäude/Märkte im Bild, brennende Gebäude, Kampf im Bild bzw. außerhalb).
- [x] Abhängigkeit von Kamera (Zoom: nah Details, fern Wind), Umgebung (Wasser mit Stereolage, Wald, offenes Land), Spiellage (Frieden › Spannung › Schlacht; in der Schlacht keine Vögel, Natur und Siedlung gedämpft, ferner Lärm hebt sich, wenn außerhalb des Bildes gekämpft wird). Menü: Betten aus.
- [x] Keine Hammerwand: Werkstattgeräusche je Typ nur von den 2–3 nächsten Gebäuden (Schmiede 3, Mühle 2, Mine 3), Lautstärke nach Dichte kompressiv (`n^-0,45`), Phasenversatz je Gebäude; Arbeitsgeräusche der Bauern mit begrenzter Gesamtrate (≈ 3,5 Quellen je Periode); Einzelereignisse über das bestehende Voice-Limit (Vögel höchstens 2, Mindestabstand 2,2 s); Summe der Betten begrenzt.
- [x] Tests: `client/test/audio_ambience.test.ts` (Pegel in 0..1, Monotonie Wasser/Bäume/Bewohner, Zoom, Lage, Stereo, Glättung, Quellenauswahl, Dichte, Phasen, Ereignisplanung mit Rate/Obergrenze/Determinismus, Kartenabtastung). Offline-Render (`__audio.renderAll()`): 5 Einzelereignisse + 8 Szenarien (jedes Bett einzeln, Vögel, dichtes Gesamtszenario) ohne NaN, Spitze ≤ 0,58, Bus ≤ 0,27, kein Clipping.
- [x] Browser (Chromium): Betten reagieren (Burg nah/fern, Wasser nah/fern mit Stereolage, Wald), Schlacht im Bild/ferne Schlacht (Lärm 0,33 → 0,94, 15 ferne Waffenschläge, danach abklingend), Mood-Wechsel, Regler und Untertitel-Option gespeichert und nach Neuladen erhalten, Konsole sauber.
- Offen/ehrlich: Feuerknistern im Browser nicht live ausgelöst (nur Offline-Render und Logiktest); Klangbalance nur über Pegelmessung abgestimmt, nicht nach Gehör; Vogelrufe im Browser-Lauf wegen Software-GL (≈ 1 FPS, Soundscape-Zeit läuft langsamer) nur einmal gehört/gezählt, Rate per Test belegt.

## 4H Abnahme
- [ ] Browser-Szenarien 1–12
- [ ] Performance dokumentiert, Safari-Anleitung
- [ ] README, Abschlussbericht

## Befunde
(laufend ergänzen)
