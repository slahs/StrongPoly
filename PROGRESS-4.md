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
