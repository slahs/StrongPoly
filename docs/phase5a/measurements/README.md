# Messungen der Pipeline (Phase 5A)

Alle Werte: Chromium 141 mit **Software-GL (SwiftShader)**, 4 Kerne, Rechner parallel mit anderen Läufen belastet –
**keine GPU-Werte**. Safari/M3 ist nicht gemessen.

## Klassischer Stil unverändert (`scripts/shots.mjs`, Mittel, alle 12 Szenen)
Vorher = Build des Ausgangsstands `cc18be5`, nachher = Pipeline-Stand (Stil `classic`).

- Draw-Calls, Dreiecke und Programme sind in **allen 12 Szenen identisch** (z. B. early 51/196k/21, town 85/504k/21,
  castle 77/444k/21, siege 89/462k/22, map 77/498k/21), Konsole sauber (`--check`).
- Pixelvergleich (Anteil Pixel mit Abweichung > 8/255): vorher↔nachher 0,4–3,3 %; **vorher↔vorher (zweiter Lauf desselben
  Builds) 2,2–7,6 %**. Die Abweichungen liegen ausschließlich auf animierten Dingen (Gras im Wind, Fahnen, Figurenposen,
  Feuer): die Shader-Uhr der Szenen startet beim Laden der Seite (`performance.now`), das Bild ist dort nicht pixelgleich
  reproduzierbar. Statische Geometrie, Gelände und Schatten sind gleich. Ergebnis: classic im Rahmen des Messrauschens unverändert.
  (Die LookDev-Umgebung setzt die Uhr fest: `GameScene.setClockOrigin(0)`.)

## Texturformate (`texture_formats/`)
Kachelbare 1024²-Testtexturen (`gen.py`), Kodierung Basis Universal (`enc.mjs`, Encoder außerhalb des Repos), Laden in
Chromium (`index.html`, `run.mjs`). Ergebnisse `sizes.json`, `browser.json`; Auswertung in `../ARCHITECTURE.md` §6.5.

## Texturpfad und Figurenpfad im echten Renderer
- `texturtest_3c_material.jpg`: Brunnen mit einer vorübergehend eingesetzten Testtextur für `M_Stone_Rubble`
  (Albedo/Normal/ORM, WebP, erzeugt mit `assets/blender/tools/textures.py`): Fugen, Normalen und Rauheit wirken, LookDev zeigt
  16,0 MB Asset-Texturspeicher (3 Karten × 5,6 MB) und 23 statt 22 Programme. Die Testtextur ist **nicht** im Repo
  (Materialbibliothek liefert der Material-Agent).
- `figurentest_3b_figures.jpg`: vorübergehende Prüffigur (GLB mit `_PART/_PIVOT/_STYLE/_SLOT/_ARM`, Ziel Speerträger) im
  Figurenpfad: Teamfarbe am Waffenrock (COLOR_0.a), Farbklassen je Instanz (Stoffe verschieden), Vorderseite Richtung
  Blickrichtung, Vertex-Animation des Figuren-Shaders. Ebenfalls **nicht** im Repo.

## LookDev
`../lookdev/<stil>/<stufe>/<kamera>.jpg` und `stats.json` (`node scripts/lookdev.mjs --check`).

## Browserprüfung Stil „medieval“
`../qa/s17_style_medieval.json` und Bilder (`node scripts/qa/s17_style_medieval.mjs`): Laden, Platzierungsgeist aus dem GLB,
Bau über den Befehlsweg mit Höhenmaske, fertiges GLB, Auswahlrahmen, Hover-Kontur aus GLB-Geometrie, Stilwechsel zurück
auf classic; 10/10 Prüfungen, Konsole sauber.

## Bundle
Initial geladenes JS vorher 1.107 kB (gzip 334 kB) → nachher 1.182 kB (gzip 356 kB): +22 kB gzip, vor allem weil three
jetzt als eigener Chunk mehr exportiert (GLTFLoader 13 kB, KTX2Loader 24 kB, Meshopt-Decoder 6 kB und LookDev 5 kB gzip
werden nur bei Bedarf nachgeladen).
