# StrongPoly – Ausbau: Grafik, UI wie Stronghold, Icons, Sound & Musik, Enzyklopädie, Bugfixes

Repo: `StrongPoly` (Branch `claude/eloquent-thompson-rkoc06`). Das Spiel ist spielbar: Wirtschaft, Burgenbau, Einheiten, KI-Lords, Lobby und Multiplayer funktionieren.
Ziel dieser Runde: Es soll sich spielen und bedienen wie Stronghold Crusader Extreme, besser aussehen, klingen und alles erklären.

Lies zuerst README, `packages/shared/src/data/*`, `packages/client/src/ui/*`, `render/*` und `audio/audio.ts`, bevor du etwas änderst. Die bestehende Architektur bleibt: Simulation in `shared`, Renderer liest nur Zustand, Eingabe → Befehl → Simulation.

**Rechtliches:** Bedienung, Abläufe und Spielmechanik dürfen sich am Original orientieren. Grafiken, Icons, Sounds, Musik, Texte, Namen und Logos sind ausnahmslos eigene Entwürfe. Nichts aus dem Original übernehmen oder nachbauen, auch keine Melodien.

## 1. Bugs zuerst (Meilenstein A)
Bekannte Probleme:
- KI-Duelle enden teils nicht. `Baron vs Wolf` bleibt nach 120 Min unentschieden, beide haben ~25 Gold und kleine Armeen. `Benedikt vs Mathilde` endet ebenfalls nicht, obwohl Mathilde haushoch überlegen ist (ihre Wellen kommen zu selten). Ursachen in der Goldwirtschaft der KI und im Wellenintervall untersuchen.
- Bei Abt Benedikts Burg zählt die Diagnose dauerhaft `gates=0`. Prüfen, ob sein Torhaus gebaut wird bzw. ob der Torhaus-Platz im Burg-Template ungültig ist.
- Docker-Image und Client-Reconnect sind ungetestet: Image bauen und starten, Reconnect im Browser testen (Verbindung kappen, zurückkehren).

Systematische Fehlersuche:
- Werkzeuge: `bench/duel.ts`, `bench/diag.ts`, `bench/econ.ts` (in `packages/shared`).
- Alle 9 KI-Profile paarweise auf 3 Seeds je 90 Min laufen lassen. Ziel: ≥ 80 % der Partien enden mit Keep-Fall.
- Ein Skript `bench/smoke.ts`, das jeden Befehlstyp (bauen, abreißen, Linie, graben, rekrutieren, handeln, Steuern, Rationen, Fähigkeiten) gegen eine laufende Sim feuert. Es prüft Invarianten: keine NaN-Positionen, Bestände ≥ 0, keine Einheit in festen Gebäuden außer auf Mauerkronen, kein Gebäude mit HP > Max.
- Den Client im Browser durchspielen (Tutorial-Missionen 1–5, ein Gefecht gegen 3 KI) und alle Konsolenfehler beheben.
- Jeden gefundenen Bug mit einem Regressionstest in `shared/test` absichern.

## 2. Menüs und Bedienung wie in Stronghold (Meilenstein B)
Funktional dem Original nachempfinden, optisch eigener Stil:
- **Unteres Hauptpanel:** Pergament-/Holzrahmen. Links das Baumenü mit Kategorie-Reitern (Burg, Industrie, Landwirtschaft, Stadt, Waffen, Nahrungsverarbeitung) und darunter der Gebäudeleiste der Kategorie als Icon-Raster. Mitte das Info-/Kontextfeld. Rechts die Minikarte.
- **Unterkategorien der Burg-Kategorie:** Mauern, Türme, Tore, Belagerungsbau (Ingenieurgilde, Fallen, Öl, Graben).
- **Kontextpanel je Gebäude:**
  - Bergfried: Steuern, Beliebtheitsaufschlüsselung.
  - Kornspeicher: Rationen und Bestände je Nahrung.
  - Lager: Rohstoffe.
  - Waffenkammer: Waffen.
  - Kaserne: Rekrutierung mit Anzeige, welche Waffe und wie viel Gold fehlen; ausgegraute Einheiten mit Grund.
  - Söldnerposten.
  - Ingenieurgilde: Ingenieure, Tunnelgräber, Leiterträger.
  - Markt: Kaufen/Verkaufen je 1 und 5, Preise live.
  - Werkstätten: Rezeptwahl, Arbeiter an/aus, Produktionsfortschritt.
  - Schenke: Bierabdeckung.
  - Kirche: Abdeckung.
- **Beliebtheitsanzeige:** Zahl plus farbiges Gesichtssymbol. Klick öffnet die Aufschlüsselung aller Faktoren mit Vorzeichen und Monatsprognose (+/−).
- **Werkzeuge:** Abreißen (mit Rückerstattung), Reparieren, Rückgängig der letzten Platzierung (nur solange noch nicht gebaut), Bau abbrechen. Rechtsklick bricht den aktuellen Bau-/Auswahlmodus ab.
- **Platzieren:** Geistermodell grün/rot mit Grund, Kosten am Cursor. Mauern und Gräben per Ziehen, mit Kostenvorschau für die ganze Linie. Drehen mit R/Mausrad.
- **Einheiten:**
  - Unten Truppenpanel mit Porträt-Icons je Typ und Anzahl. Ein Klick auf ein Typ-Icon wählt nur diesen Typ.
  - Haltung (Stellung halten / Defensiv / Aggressiv), Formation, Patrouille, Angriff auf Boden (für Fernkämpfer und Belagerung), Stopp, Abriss/Graben für Ingenieure und Tunnelgräber, Ölkessel befüllen.
- **Hotkeys** Stronghold-typisch und in den Optionen frei belegbar. Dazu eine Hotkey-Übersicht auf F1.
  - Gebäude: Bergfried, Kornspeicher, Kaserne, Markt, Lager und Waffenkammer direkt anwählen.
  - Kamera: Leertaste = Kamera zur letzten Meldung, Einheiten zentrieren.
  - Einheiten: Strg+Zahl = Gruppe speichern, Zahl = Gruppe wählen, doppelt = hinzoomen.
- **Berater:** Ein eigener Berater (Name und Figur eigen) meldet wichtige Ereignisse als Textzeile mit Sound und Kameraklick:
  - Nahrung knapp, Beliebtheit fällt, Lager voll, Angriff von X, Mauer durchbrochen, Lord in Gefahr, Verbündeter bittet um Hilfe.
  - Meldungsliste oben rechts, anklickbar.
- **Hauptmenü** im gleichen Stil:
  - Gefecht, Online (Lobby), Tutorial, Karteneditor, Laden, Optionen, Credits.
  - Pausenmenü mit Speichern/Laden/Optionen/Aufgeben.
  - Endbildschirm mit Statistik (Gold verdient, Einheiten rekrutiert/verloren, Gebäude, Zeit) und Siegerpodest.
- **Optionen:** Grafikstufe, Schatten, Kantenglättung, UI-Skalierung, Lautstärken (Master/Effekte/Musik/Berater), Scrollgeschwindigkeit, Hotkeys.

## 3. Icons (Meilenstein C)
- Ein Icon für jedes Gebäude, jede Einheit, jede Ressource/Waffe/Nahrung, jede Fähigkeit, jedes Werkzeug und jeden Beliebtheitsfaktor.
- Erzeugt als SVG im Code (`client/src/ui/icons/`), einheitlicher Stil: dicker dunkler Umriss, flache Low-Poly-Facetten, Palette aus dem Spiel, 64×64-Raster, gut lesbar bei 32 px.
- Einheiten-Icons in Spielerfarbe einfärbbar.
- Optional zusätzlich Gebäude-Porträts als kleine Live-Render der echten Low-Poly-Modelle (Offscreen-Renderer, einmal pro Typ gecacht).
- Icon-Galerie-Seite im Dev-Modus (`?icons`) zur Kontrolle.

## 4. Grafik (Meilenstein D)
Low Poly bleibt, aber hochwertiger:
- **Beleuchtung:**
  - Hemisphären- plus Richtungslicht, warmer Wüstenton, weiche Schatten (PCF), leichte Ambient-Occlusion über Vertex-Farben an Gebäudesockeln und Mauerfugen.
  - Optional SSAO in der höchsten Stufe.
- **Terrain:** sanfte Farbverläufe zwischen Terraintypen, Felsklippen an Höhenstufen, Sanddünen-Muster, Oasengras mit leicht wiegenden Instanced-Grasbüscheln, Steinvorkommen und Eisenadern deutlich erkennbar.
- **Wasser und Gräben:** animierter Low-Poly-Shader mit Uferschaum.
- **Gebäude:**
  - Baufortschritt in Stufen (Fundament → Gerüst → fertig).
  - Arbeitsanimationen: Rauch aus Schmiede/Bäcker, drehende Mühlenflügel, Holzfäller-Hackbewegung.
  - Zerstörte Gebäude als Trümmer.
  - Mauern verbinden sich nahtlos (Eck- und T-Stücke), Zinnen und Treppen sauber.
- **Einheiten:**
  - Einfache prozedurale Animation ohne Skelett: Gehen (Beinschwingen per Vertex-Shader), Angriffsschwung, Schießen, Sterben (Umkippen), Arbeiten.
  - Getragene Waren sichtbar.
  - Lord, Ritter und Belagerungsgerät klar unterscheidbar.
- **Effekte:** Pfeile mit Bogenflug, Steinbrocken mit Staubwolke, Feuer und Rauch als Partikel (Instanced), brennende Gebäude, Pechgräben, kochendes Öl, Blut sparsam und abschaltbar.
- **Auswahl:** Kreise unter Einheiten, Lebensbalken bei Schaden/Auswahl, Gebäudeumriss bei Hover.
- **Leistung:** Das Performance-Ziel aus dem ersten Prompt gilt weiter (60 FPS bei 2.000 Einheiten). Grafikstufen Niedrig/Mittel/Hoch schalten Schatten, Partikelzahl, Gras und AO.

## 5. Sound und Musik (Meilenstein E)
Alles eigen: prozedural per WebAudio oder selbst erzeugt und als kleine OGG-Dateien im Repo.
- **Effekte:**
  - Bauen, Abreißen, Platzieren nicht möglich, Holzhacken, Steinbruch, Schmiedehammer, Mühle.
  - Pfeilschuss/-einschlag, Schwertklirren, Katapult, Mauereinsturz, Feuer, Tor öffnen.
  - Rekrutierung, UI-Klicks, Meldungs-Gong, Sieg/Niederlage.
  - Räumlich gemischt nach Kameraposition und Zoom (Lautstärke/Pan), Voice-Limit pro Soundtyp.
- **Einheiten-Rückmeldung:** Kurzer Ton bei Auswahl und Befehl, je Einheitenklasse verschieden. Keine Sprachaufnahmen nötig; falls Sprache, dann synthetische Fantasiesprache.
- **Musik:**
  - Generativer Soundtrack im nahöstlich-mittelalterlichen Stil, eigene Komposition.
  - Modale Skalen (z. B. Hijaz, Dorisch), synthetische Laute/Oud, Flöte, Rahmentrommel, Drone.
  - Drei Stimmungen mit weichen Übergängen: Aufbau (ruhig), Spannung (Feind nähert sich), Schlacht (Trommeln).
  - Eigenes Thema für Hauptmenü und Sieg/Niederlage.
- **Lautstärkeregler** pro Kanal in den Optionen, Stummschalten mit M.

## 6. Erklärungen und Enzyklopädie (Meilenstein F)
- **Tooltips** beim Hover über jedes Bau-Icon:
  - Name, Kosten, Arbeiterzahl, Größe, Platzierungsregel (z. B. „nur auf Steinvorkommen“).
  - Eingang → Ausgang mit Produktionszeit pro Stück, wohin geliefert wird.
  - Effekt auf Beliebtheit/Angstfaktor, Voraussetzungen.
  - Ein Satz Spieltipp.
- **Tooltips über jedes Einheiten-Icon:**
  - Kosten (Gold + Waffen + Pferd), Rekrutierungsort, Lebenspunkte, Rüstungsklasse, Schaden und Schadensart, Reichweite, Tempo.
  - Besonderheiten (klettert, unsichtbar, gräbt, trägt Leiter).
  - Stark gegen / schwach gegen, berechnet aus `DMG_TABLE`.
- **Enzyklopädie** (Menüpunkt und im Spiel auf F2):
  - Seiten für alle Gebäude, Einheiten, Ressourcen, Wirtschaftsketten als Flussdiagramm (z. B. Weizen → Mühle → Mehl → Bäcker → Brot → Kornspeicher), Beliebtheitsfaktoren, Kampfsystem (Schadenstabelle als Matrix), Belagerung, Extreme-Fähigkeiten.
- **Datengetrieben:** Alle Zahlen werden aus `shared/data/*` generiert, nie von Hand abgetippt. Nur die beschreibenden Texte stehen zusätzlich in `shared/data/descriptions.ts`.
- **Test:** prüft, dass jedes Gebäude und jede Einheit einen Text und ein Icon hat.
- Alle Texte auf Deutsch, Struktur aber i18n-fähig (Schlüssel + Sprachdatei), Englisch als zweite Datei vorbereitet.

## Vorgehen
Meilensteine A → F nacheinander abarbeiten:
- Nach jedem Meilenstein `pnpm test`, `pnpm -r typecheck` und `pnpm build`, dann committen und pushen. Das Spiel bleibt nach jedem Meilenstein lauffähig.
- Den Client nach jedem UI-/Grafik-Meilenstein im Browser öffnen, Screenshots prüfen und Konsolenfehler beheben.
- Keine Balance-Werte mehr im Code verstreuen: alles in `shared/data/`.

## Definition of Done
- Alle bekannten Bugs behoben, je mit Regressionstest. Die Smoke-Invarianten halten.
- ≥ 80 % der KI-Duelle enden innerhalb von 90 Min mit Keep-Fall.
- Docker-Image startet, Reconnect funktioniert im Browser.
- Jedes Gebäude, jede Einheit, Ressource und Fähigkeit hat ein Icon, einen Tooltip und eine Enzyklopädie-Seite mit korrekten Zahlen aus den Datentabellen.
- Alle Kontextpanels, Werkzeuge, Hotkeys und Meldungen aus Abschnitt 2 funktionieren.
- Soundeffekte, drei Musikstimmungen und alle Lautstärkeregler funktionieren.
- 60 FPS bei 2.000 Einheiten auf Stufe Mittel.
- Zwei Spieler plus 4 KI können über die Railway-URL ein komplettes Gefecht spielen, ohne Desync, Absturz oder Konsolenfehler.
