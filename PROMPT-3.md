# StrongPoly – Restliche Bugs + Meilensteine B bis F (kompletter Durchlauf)

Repo: `StrongPoly`, Branch `claude/eloquent-thompson-rkoc06`. Arbeite **alle** Punkte dieses Prompts nacheinander ab, ohne zwischendurch auf Freigabe zu warten. Frag nur bei Entscheidungen, die sich nicht rückgängig machen lassen.

Lies zuerst `README.md`, `PROMPT-2.md` (enthält die Detail-Spezifikation der Meilensteine B bis F), `packages/shared/src/data/*`, `packages/client/src/ui/*`, `render/*` und `audio/audio.ts`.
Architektur bleibt:
- Simulation in `shared`, Renderer liest nur Zustand.
- Eingabe → Befehl → Simulation ist der einzige Weg, Spielzustand zu ändern.
- Alle Balance-Werte stehen in `shared/data/`.

**Rechtliches:** Bedienung, Abläufe und Mechanik dürfen sich am Original orientieren. Grafiken, Icons, Sounds, Musik, Texte, Namen und Logos sind ausnahmslos eigene Entwürfe; nichts aus dem Original übernehmen oder nachbauen, auch keine Melodien.

## Stand
- **Meilenstein A ist erledigt.** Turnier (9 KI-Profile paarweise, 3 Seeds, je 90 Min): 91 von 108 Partien enden mit Keep-Fall (84 %), Median 40,8 Min.
- **Tests grün:** `pnpm test` (65 shared, 3 Server), `pnpm -r typecheck`, `pnpm build`.
- **Werkzeuge** in `packages/shared/bench`:
  - `tournament.ts` (fortsetzbar über `OUT=<datei>`) und `duel.ts`
  - Diagnose: `diag.ts`, `econ.ts`, `aistate.ts`, `deaths.ts`, `gates.ts`, `iron.ts`
  - `smoke.ts`
- **Regeländerungen, die auch menschliche Spieler betreffen** (bleiben drin, müssen aber in Tooltips und Enzyklopädie erklärt werden):
  - Bauverbot im Umkreis von 8 Tiles um feindliche Soldaten (`ENEMY_BUILD_RADIUS`).
  - Katapulte zielen automatisch nur auf feindliches Gerät, nicht auf Fußtruppen.
  - Mauergeschütze haben kürzere Reichweite (Ballista 18, Mangonel 16).

## Arbeitsweise (wichtig: die Umgebung kann jederzeit neu starten)
- **Fortschritt dokumentieren:** Lege `PROGRESS.md` im Repo-Root an, mit einer Checkliste aller Punkte dieses Prompts. Hake nach jedem erledigten Punkt ab und notiere offene Erkenntnisse. Nach einem Neustart liest du zuerst `PROGRESS.md` und machst dort weiter.
- **Häufig sichern:** Nach jedem abgeschlossenen Teilschritt committen und pushen, nicht erst am Ende eines Meilensteins.
- **Lange Läufe fortsetzbar halten:** Turniere immer mit festem `OUT` starten, damit ein abgebrochener Lauf mit demselben Befehl weiterläuft. Turniere auf einer Kopie des Repos laufen lassen, damit du parallel am Code arbeiten kannst.
- **Gate nach jedem Meilenstein:** `pnpm test`, `pnpm -r typecheck` und `pnpm build`. Das Spiel bleibt nach jedem Meilenstein lauffähig.
- **Browser-Check nach jedem UI-, Grafik- und Sound-Meilenstein:** Client im Browser (Playwright/Chromium) öffnen, Screenshots ansehen, Konsolenfehler beheben.
- **Jeder behobene Bug bekommt einen Regressionstest** in `shared/test`, der auf dem alten Stand nachweislich fehlschlägt.

## 1. Bugs (zuerst)
1. **KI hortet Gold, rekrutiert aber nicht.** In mehreren Patts sitzt ein Lord auf 3.000–5.000 Gold mit nur 6–20 Soldaten. Beispiele:
   - Ritter Falk in `duel.ts 2 3 14 90`
   - Mathilde in `duel.ts 2 7 29 90` und `duel.ts 6 7 6 90`

   Ursache finden (fehlende Pferde, Rüstung, freie Bauern als Rekruten, Warteschlangen-Deckel, Waffenproduktion o. Ä.) und beheben.
2. **Restliche Patts.** Die 17 Timeouts des letzten Turniers (Profil A vs B, Seed):
   `1v2 s17, 0v7 s27, 1v5 s26, 1v6 s27, 1v8 s29, 2v3 s14, 2v7 s29, 2v8 s3, 3v4 s16, 3v6 s7, 3v7 s3, 4v7 s15, 4v7 s26, 5v7 s5, 5v7 s27, 6v7 s6, 6v8 s7`.
   Mathilde (7) ist in 8 davon. Ursachen wie bisher an Einzelfällen diagnostizieren und echte Fehler beheben. Ziel: ≥ 90 % Keep-Fall im Turnier, ≥ 80 % darf nie wieder unterschritten werden.
3. **Unbrauchbare Waffen.** Die KI produziert Waffen, deren Einheit sie nie rekrutieren kann (z. B. Baron: 60 Streitkolben ohne Gerber/Lederrüstung). Werkstätten stellen nur Waren her, deren komplette Einheitenkosten erreichbar sind. Sonst die Ressourcen anders nutzen.
4. **Bevölkerungsschaukel.** Bei Beliebtheit um 50 schwankte die Bauernzahl binnen Minuten zwischen 80 und 19 (Baron gegen Gräfin, Seed 15, vor den letzten Fixes). Prüfen, ob das noch auftritt. Wenn ja: Ursache (Rationen, Hunger, Steuersprünge) beheben.
5. **Eigene Burg darf sich nicht einmauern.** Nachweisen, dass keine KI ihren Ring je ohne Durchgang schließt (Mauerstücke auf den Torkacheln, wenn das Tor nicht gebaut werden konnte). Prüfen, dass zerstörte Tore nach dem Sturm wieder aufgebaut werden. Test: Nach 60 Min hat jede KI in allen Turnier-Seeds einen Weg vom Bergfried nach draußen.
6. **`bench/dmg.ts`** liest `globalThis.DMG`, das im Spielcode nicht existiert, und gibt nichts aus. Entweder eine saubere optionale Schadensstatistik in der Sim einbauen (standardmäßig aus) oder das Skript entfernen.
7. **Balance-Wert im Code:** Die Geschützreichweiten sind in `sim/fire.ts` fest eingetragen. Nach `shared/data/` verschieben.
8. **Docker:** Image mit dem aktuellen Stand neu bauen, starten, `/healthz` und Client prüfen. Das Dockerfile nicht an Eigenheiten einer einzelnen Build-Umgebung (Proxy-CA) anpassen.
9. **Tutorial-Missionen 1–5:** Jede Mission per Skript (Sim + Missionsziele) bis zum Missionssieg durchspielen. Alles beheben, was das Erreichen eines Ziels verhindert. Zusätzlich jede Mission einmal im Browser starten und auf Konsolenfehler prüfen.
10. **Smoke und Determinismus:** `smoke.ts` gegen 3 Seeds laufen lassen. Ein Test stellt sicher, dass dieselbe Sim mit demselben Seed und denselben Befehlen zweimal identische Zustände liefert (Grundlage für Multiplayer-Synchronität).
11. **Alles, was dir bei B–F an Bugs auffällt,** behebst du sofort und trägst es in `PROGRESS.md` ein.

## 2. Meilenstein B – Menüs und Bedienung wie in Stronghold
Vollständig nach `PROMPT-2.md`, Abschnitt 2:
- Unteres Hauptpanel mit Bau-Kategorien und Unterkategorien, Kontextfeld, Minikarte.
- Kontextpanels für alle Gebäude (Bergfried, Kornspeicher, Lager, Waffenkammer, Kaserne, Söldnerposten, Ingenieurgilde, Markt, Werkstätten, Schenke, Kirche).
- Beliebtheitsanzeige mit Aufschlüsselung und Monatsprognose.
- Werkzeuge: Abreißen, Reparieren, Rückgängig, Bau abbrechen, Rechtsklick bricht ab.
- Platzieren: Geistermodell grün/rot mit Grund (auch „Feinde in der Nähe“), Kosten am Cursor, Linien mit Kostenvorschau.
- Truppenpanel mit Haltungen, Formationen, Patrouille, Angriff auf Boden, Stopp, Graben/Abriss, Öl.
- Hotkeys frei belegbar, Übersicht auf F1.
- Berater mit Meldungsliste und Kamerasprung.
- Hauptmenü, Pausenmenü, Endbildschirm mit Statistik.
- Optionen.

## 3. Meilenstein C – Icons
Nach `PROMPT-2.md`, Abschnitt 3:
- Eigenes SVG-Icon für jedes Gebäude, jede Einheit, Ressource, Waffe, Nahrung, Fähigkeit, jedes Werkzeug und jeden Beliebtheitsfaktor.
- Einheitlicher Stil, lesbar bei 32 px, Einheiten in Spielerfarbe einfärbbar.
- Galerie unter `?icons`.
- Ein Test prüft, dass jedes Element aus `shared/data` ein Icon hat.

## 4. Meilenstein D – Grafik
Nach `PROMPT-2.md`, Abschnitt 4:
- Beleuchtung und Schatten, besseres Terrain, Wasser und Gräben.
- Gebäude mit Baustufen, Arbeitsanimationen, Trümmern und nahtlosen Mauern.
- Prozedurale Einheitenanimationen (Gehen, Angriff, Schießen, Sterben, Arbeiten), getragene Waren sichtbar.
- Effekte: Projektile, Feuer, Rauch, Staub, Öl.
- Auswahlkreise und Lebensbalken.
- Grafikstufen Niedrig, Mittel, Hoch.

**Leistung messen:** eine Benchmark-Szene unter `?bench` mit 2.000 kämpfenden Einheiten. Ziel 60 FPS auf Stufe Mittel. Miss die Bildzeit im Browser und nenne Ergebnis und Testumgebung. Headless-Zahlen gelten nur als Richtwert.

## 5. Meilenstein E – Sound und Musik
Nach `PROMPT-2.md`, Abschnitt 5, alles eigen (WebAudio-Synthese oder selbst erzeugte kleine OGG-Dateien):
- **Effekte:** alle Effekte aus Abschnitt 5, räumlich nach Kameraposition gemischt, mit Voice-Limit.
- **Rückmeldungen:** Töne je Einheitenklasse bei Auswahl und Befehl.
- **Musik:** generativ, modal, drei Stimmungen (Aufbau, Spannung, Schlacht) mit weichen Übergängen, dazu Themen für Menü, Sieg und Niederlage.
- **Bedienung:** Lautstärkeregler pro Kanal, Stummschalten mit M.
- **Browser-Autoplay-Regeln beachten:** Audio erst nach erster Nutzerinteraktion starten, ohne Konsolenfehler.

## 6. Meilenstein F – Erklärungen und Enzyklopädie
Nach `PROMPT-2.md`, Abschnitt 6:
- **Tooltips** für Gebäude und Einheiten mit allen Kennzahlen. Stark/schwach gegen wird aus `DMG_TABLE` berechnet.
- **Enzyklopädie** (Menü und F2) mit Seiten für:
  - alle Gebäude, Einheiten und Ressourcen,
  - Wirtschaftsketten als Flussdiagramm,
  - Beliebtheit,
  - Kampfsystem mit Schadensmatrix,
  - Belagerung,
  - Extreme-Fähigkeiten,
  - die Regeländerungen oben (Bauverbot, Katapult-Zielwahl, Geschützreichweite).
- **Datenquelle:** Alle Zahlen kommen aus `shared/data`. Texte stehen in `shared/data/descriptions.ts`, i18n-fähig (Deutsch fertig, Englisch vorbereitet).
- **Test:** Jedes Gebäude und jede Einheit hat Text und Icon.

## Definition of Done (alles muss erfüllt sein)
- Alle Bugs aus Abschnitt 1 behoben oder mit belegter Begründung als „kein Fehler“ markiert. Jeder Fix hat einen Regressionstest.
- Turnier: ≥ 90 % Keep-Fall innerhalb von 90 Min (mindestens aber ≥ 80 %, falls 90 % nachweislich nur über unvertretbare Balance-Eingriffe ginge; dann begründen).
- Tutorial-Missionen 1–5 sind per Skript gewinnbar und laufen im Browser ohne Konsolenfehler.
- Determinismus-Test grün. Docker-Image mit aktuellem Stand startet. Reconnect funktioniert weiterhin.
- Meilensteine B bis F vollständig umgesetzt, wie in `PROMPT-2.md` und hier beschrieben.
- 60 FPS bei 2.000 Einheiten auf Stufe Mittel (gemessen und dokumentiert).
- Zwei Spieler plus 4 KI können über die Railway-URL ein komplettes Gefecht spielen, ohne Desync, Absturz oder Konsolenfehler.
- `pnpm test`, `pnpm -r typecheck` und `pnpm build` grün. `README.md` und `PROGRESS.md` aktuell.

## Abschlussbericht
Am Ende ein kurzer Bericht mit:
- **Pro Meilenstein:** was umgesetzt ist, was nicht, mit Grund.
- **Turnierergebnis:** Quote und Median-Spieldauer.
- **FPS-Messung:** Ergebnis mit Testumgebung.
- **Liste der Commits.**
- **Offene Punkte:** was du als Nächstes angehen würdest.
