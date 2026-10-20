# STRONGPOLY – PROMPT 4
## Visual Evolution, Natural Movement & Living World

Repository `slahs/StrongPoly`, Ausgangsbranch `claude/eloquent-thompson-rkoc06`, Referenz-Commit `aec8165b`, Arbeitsbranch `claude/strongpoly-phase4-visual-evolution`.

(Wortgetreue Arbeitsanweisung des Auftraggebers, hier als Referenz abgelegt; Zusammenfassung der Verbindlichkeiten siehe unten. Kein Merge nach `main`, kein Produktivdeployment.)

## Ausgangslage
Grundlage aus Prompt 3 bleibt erhalten: Wirtschaft, Burgenbau, Belagerung, 9 KI-Lords, Multiplayer, Animationen, Sound/Musik, UI, Enzyklopädie, Tests/Benchmarks (KI-Turnier 98/108). Erster Praxistest (MacBook Air M3, Safari) zeigt: Bewegung ruckelt, Grafik wirkt wie früher Prototyp, Stimmen/Berater/Beliebtheits-Erklärung fehlen. Diese Phase ist eine grundlegende Qualitätsphase.

## Unveränderlich
Deterministische Sim, Serverautorität, Wirtschafts-/Kampfsystem, alle 9 KI-Lords, alle Funktionen/Gebäude/Einheiten/Modi, Snapshot-/Netzwerkpfad möglichst unverändert, Balance/Sim nur bei nachgewiesenem Problem ändern. Keine Original-Assets von Stronghold (Modelle, Grafiken, Musik, Sprache, Icons, Texte). `PROGRESS-4.md` führen, nach jedem Meilenstein committen+pushen, Meilensteine nacheinander ohne neue Freigabe.

## 4A – Natürliche Bewegungen (kritisch)
Bauern/Einheiten (vor allem um den Bergfried) zittern, ändern abrupt die Richtung, drehen unnatürlich, behindern sich, Gehbewegung nicht synchron zur Fortbewegung.
- Diagnose der ganzen Kette Sim → Positionsupdates → Snapshot → ClientWorld → Interpolation → Animation → Renderer (10 Ticks/s, Snapshot-Abstände, Interpolationsfaktor in `session.ts`, Positionshistorie `net/world.ts`, Interpolation/Rotation `render/entities.ts`, Richtungswechsel, Kollision/Separation, Wegfindung/Flowfields, schwankende FPS, Start/Stopp, Spielgeschwindigkeiten). Besonders: wird das Interpolationsfenster bei jedem Snapshot zurückgesetzt? Mehrere Snapshots pro Frame, Einheiten ohne Delta-Update. Höhere Tickrate nicht als pauschale Lösung.
- Ziele: kontinuierliche Position, sanfte Drehung (Winkelnormalisierung + zeitbasierte Glättung, ohne Zielrichtungen zu verfälschen), natürliche Übergänge Stillstand/Gehen/Arbeiten/Kampf, keine Sprünge, kein dauerhaftes Zucken vor Gebäuden, Schrittanimation passend zur Geschwindigkeit, Mauern/Treppen/Tore glaubwürdig, korrekt bei Pause/Beschleunigung/Reconnect. Sim-Änderungen nur gezielt, deterministisch, mit Regressionstests.
- Abschaltbarer Bewegungs-Debug-Modus (Sim-Position, gerenderte Position, Interpolationsfaktor, Snapshot-Abstand, Richtung/Geschwindigkeit, Korrekturereignisse).
- Testszenen: viele Bauern vor Bergfried; enges Tor; Formation; Warentransport; Treppen/Mauern; große Ansammlungen. Abnahme: in echter Browseraufnahme deutlich ruhiger (nicht nur Tests).

## 4B – Graphical Evolution
Art Direction „Refined Stylized Medieval RTS“: hochwertig, atmosphärisch, glaubwürdige Architektur, detailliertere Figuren, erkennbare Materialien, lebendige Stadt, aus RTS-Perspektive lesbar und auch nah überzeugend. Nicht nur mehr Polygone: Modelle, Materialien, Licht, Farbe, Proportionen, Animation gemeinsam. Instancing erhalten; neues Materialsystem erlaubt (stilisierte/PBR-Shader, Materialvariation, AO, Kontaktschatten, Tonemapping/Farbkorrektur, Oberflächenstruktur, Wasser, LOD). Keine fremden Assets.
- Gebäude: alle überarbeiten, Funktion/Maße nicht unnötig ändern. Bergfried monumental (Steinstruktur, Zinnen, Fenster, Eingang, Fahnen). Wirtschaftsgebäude: Dachformen, Fachwerk, Holz/Stein/Putz, Türen, Fenster, Schornsteine, Typenunterschiede, Produktionsdetails. Militär: Burgarchitektur, massive Türme/Torhäuser, Wehrgänge/Zinnen, Mauerübergänge. Auch bei Zoom überzeugend.
- Menschen: bessere Proportionen, Kopf/Arme/Beine, unterschiedliche Kleidung/Ausrüstung, Berufe erkennbar (Bauer ≠ Holzfäller ≠ Steinmetz ≠ Soldat), Soldatentypen unterscheidbar (Silhouette/Farbe), kleine Variationen, glaubwürdige Waffen/Werkzeuge, kompatibel mit Animationsarchitektur.
- Gelände/Atmosphäre: glaubwürdiger Boden, Vegetation mit variierenden Baumformen, hochwertigere Felsen/Vorkommen, Küsten/Wasser, Straßen/Nutzflächen, Übergänge, Licht/Schatten; keine einheitliche Landschaft.
- Lebendige Welt (zurückhaltend): Rauch, Dampf, Funken, Mühlenflügel, Fahnen, Staub, Wasserbewegung, Arbeits-/Transportanimationen.
- Qualitätskontrolle: feste Vergleichsszenen (früher Aufbau, dichte Siedlung, große Steinburg, Belagerung mit mehreren Hundert Soldaten, Figuren-Detail, Gesamtkarte), Vorher-/Nachher-Screenshots, tatsächlich sichten.

## 4C – Bauanimationen (Sofortbau bleibt!)
Gebäude ist direkt nach Platzierung funktional; Animation rein visuell, keine mechanische Wartezeit. Stadien: Staub/Fundament → Gerüst/Bauelemente → Aufbau Wände/Dach → Abschluss → fertig mit kurzem Effekt; je Gebäudetyp. Richtwerte (zentral konfigurierbar): kleine Wirtschaft 1–3 s, große 3–5 s, Türme/Torhäuser 4–7 s, Mauern schnell und zusammenhängend. Keine harten Skalierungssprünge, keine schwebenden/versinkenden Dächer, Mauern verbunden, keine Ressourcen, kein Einfluss auf KI/Multiplayer, kein Neuaufbau bei Reconnect/Laden, Rückgängig/Abriss/Zerstörung funktionieren, keine widersprüchlichen Zustände. `born`/`buildTicks` als Ausgangspunkt.

## 4D – Sprechende Einheiten und Bewohner
Echte, verständliche deutsche Sätze (originell, keine Stronghold-Dialoge/Imitation). Datengetriebene Voice-Architektur; Dialoggruppen je Einheitenklasse: Auswahl, Bewegung, Angriff, Verteidigung, Arbeiten, Abschluss, Besonderes; mind. 3 Varianten je häufigem Ereignis. Beispiele: Soldat „Befehl verstanden!“; Bogenschütze „Unsere Bögen sind bereit.“; Holzfäller „Ich mache mich an die Arbeit.“; Bauer „Die Felder warten.“
Qualität: kein roboterhaftes Piepen. Bevorzugt: wiederverwendbares Clip-Register, vorab erzeugte Audiodateien, austauschbare de/en Voice-Packs, Fallback (z. B. Browser-TTS) bei fehlenden Clips, keine externen API-Aufrufe/kostenpflichtigen Dienste/API-Schlüssel. Browser-TTS allein ist keine endgültige Lösung; falls keine hochwertigen Dateien produzierbar: vollständige Architektur + tatsächlich hörbare deutsche Zwischenlösung + fehlende Assets ausdrücklich dokumentieren.
Verhalten: Prioritäten, keine überlappenden Massenrückmeldungen, Mindestabstände, unterschiedliche Stimmen je Klasse, Lautstärkeregler, räumlich soweit sinnvoll, Stummschaltung, optionale Untertitel, Autoplay-Regeln; Einheiten reden nie ständig nur weil sie ausgewählt bleiben.

## 4E – Intelligenter Sprachberater
Hofberater mit eigener Persönlichkeit (mittelalterlich, respektvoll nicht unterwürfig, ruhig, bei Gefahr alarmiert, gelegentlich leicht humorvoll, kurze Sätze; Deutsch zuerst; mehrere Stimmen später möglich). Liest relevante Ereignisse vor: Wirtschaft (Holz knapp, Kornspeicher fast leer, Produktion steht, zu wenig Arbeitskräfte), Beliebtheit (Steuern, Rationen, sinkend, Abwanderung), Militär (Gegner nähern sich, Angriff, Turm gefallen, Belagerung), Entwicklung (Wachstum, Lage besser, Engpass behoben, Heer bereit). Echte Simulationsdaten, keine erfundenen Ereignisse. Prioritäten kritisch/wichtig/normal; keine Wiederholung alle paar Sekunden (melden bei Entstehen oder wesentlicher Verschlimmerung); Kritisches darf Weniges unterbrechen/verdrängen. Bedienung: Beraterstimme separat regelbar, Sprache abschaltbar, Text lesbar, letzten Hinweis erneut abspielen, Sprung zum Ort. Bestehendes Beraterpanel erweitern.

## 4F – Beliebtheit und HUD
Kompakte Anzeige oben links bleibt. Hover: Kurzzusammenfassung wichtigster positiver/negativer Faktoren. Klick: übersichtliche Detailansicht (Faktor/Einfluss, z. B. Rationen +8, Vielfalt +3, Religion +2, Steuern −6, Überfüllung −5 – nur Beispiel; reale Sim-Werte, keine separate UI-Berechnung). Getrennt zeigen: aktuelle Beliebtheit 0–100, Entwicklung/Prognose mit korrekter Zeiteinheit, positive/negative Faktoren, Warnungen; Verzögerungen/Deckelungen korrekt. Verständlicher Hinweistext („Eure hohen Steuern belasten die Stimmung im Volk.“) passend zu den Werten. Anzeige und Berater nutzen dieselben Daten; Ansage nicht bei jeder kleinen Änderung. HUD-Polish: Lesbarkeit von Nahrung, Rohstoffen, Gold, Bevölkerung, Beliebtheit, Militär, Warnungen; Abstände, Kontraste, Tooltips, Hierarchie; nicht überladen.

## 4G – Atmosphäre/Weltgeräusche
Dezente räumliche Kulisse: Wind, Wasser, Vögel, Werkstatt/Hammer/Holzarbeit, Mühlen, Siedlungs-/Marktatmosphäre, Feuer, Kampf/Belagerung. Vorhandene Mechaniken nutzen; keine Überlagerung (mehrere Schmieden ≠ Hammerwand); abhängig von Kamera/Entfernung/Situation; separater Lautstärkeregler Umgebung; Musik/Effekte bleiben.

## 4H – Performance, Tests, Mac-Abnahme
Qualitätsstufen bleiben. Instancing, Wiederverwendung, Sichtbarkeit, LOD, begrenzte Schatten-/Partikelkosten, geringe CPU je Einheit. Ziel: flüssiges normales Gefecht auf MacBook Air M3 (Safari). `?bench` mit 2.000 Einheiten bleibt; nicht gemessenes Ergebnis nie als erreicht; FPS/Bildzeiten/Auflösung/Stufe/Hardware ehrlich dokumentieren; Anleitung für lokalen Safari-Test. Tests: gezielte Unit-/Regressionstests, Bewegungstests, Sichtprüfungen, kurze Smoke-Tests, Sprachwiedergabe, Performance-Stichproben, Build+Typecheck je Meilenstein. KEINE 108-Partien-Turniere nach reinen Grafik-/UI-/Audioänderungen (nur bei substanziellen Sim-/KI-Änderungen, dann erst gezielte Reproduktion).
Browser-Szenarien (praktisch): Gefecht starten; Wirtschaftsgebäude bauen; Bauern beobachten; große Burg mit Mauern/Torhaus; Einheiten bewegen; Einheitenstimmen hörbar; Ressourcenmangel → Berater; Beliebtheit ändern → Detailanzeige; Schlacht mit vielen Einheiten; Speichern/Laden; Multiplayer/Reconnect; Grafikstufen und Nah/Fern. Audio wirklich verständlich hörbar prüfen.
Lokal: `corepack pnpm --filter @strongpoly/client dev` → `http://localhost:5173/?quick=1` und `http://localhost:5173/?bench&quality=medium&units=2000&secs=20` müssen funktionieren; neue Debug-Parameter nur bei Bedarf, dokumentiert.

## Reihenfolge
4A → 4B → 4C → 4D → 4E → 4F → 4G → 4H (Teile dürfen technisch sinnvoll gebündelt/parallelisiert werden, nach jeder Phase committen+pushen, jeweils funktionsfähiger Stand).

## Definition of Done
Ruckeln reproduziert/diagnostiziert/verbessert; Figuren laufen/drehen/arbeiten natürlicher; neuer Grafikstil konsistent; Gebäude/Menschen/Gelände deutlich aufgewertet; hochwertige Bauanimationen bei Sofortbau; deutsche gesprochene Sätze; Berater reagiert verständlich; Beliebtheit mit Detailansicht; Umgebungsgeräusche; Wirtschaft/KI/Kampf/Multiplayer funktionieren; Grafikstufen und Bench bleiben; `pnpm test`, `pnpm -r typecheck`, `pnpm build` grün; Browserprüfungen mit Screenshots dokumentiert; Safari-Test vorbereitet; nicht verifizierte Performance-/Audioziele offen ausgewiesen.

## Abschlussbericht
1 Ausgangs-/End-Commit · 2 Änderungen je Meilenstein · 3 Bewegungsproblem Diagnose/Behebung · 4 neuer Grafikstil · 5 Vorher/Nachher · 6 Spracharchitektur und tatsächlich verfügbare Stimmen · 7 Beraterereignisse/Audiofunktionen · 8 Beliebtheitsdarstellung · 9 Test-/Performanceergebnisse · 10 Einschränkungen · 11 Anleitung Mac-Test · 12 Empfehlungen. Keine unerledigten Aufgaben als abgeschlossen markieren.

**Qualität, Atmosphäre und Spielgefühl haben in dieser Phase Vorrang vor neuen Gameplay-Features.**
