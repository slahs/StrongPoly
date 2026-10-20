# Vorher / Nachher – Phase 4 (Abnahme 4H)

**Vorher** = Ausgangsstand `aec8165b` (Bilder unter `before/`), **Nachher** = der zusammengeführte Stand dieses Branches, neu aufgenommen für diese Abnahme (`final/`). Gleiche Karten (Seed 1 bzw. 2), gleiche Kameras, Stufe Mittel, 1280×720, JPEG, Chromium mit Software-GL (SwiftShader). Erzeugt mit `node scripts/shots.mjs --out=docs/phase4/final/world --quality=medium --format=jpg` (Welt) und `node scripts/qa/compare_shots.mjs` (Figuren, Gebäude, Siedlung, Burg). Ältere Zwischenstände einzelner Bereiche liegen unter `after/` (Aufnahmen der jeweiligen Teil-Branches vor dem Zusammenführen).

Die Bilder sind gesichtet; die Bewertung steht am Ende („Ehrliche Bewertung“). Alles, was auf Aussehen und Gefühl auf einem echten Bildschirm ankommt (Mac-Display, Bewegung in 60 FPS, Ton), ist hier **nicht** beurteilt.

## 1 Welt: Gelände, Vegetation, Wasser, Licht (`?shots=<szene>`)

<table>
<tr><th>vorher</th><th>nachher</th></tr>
<tr><td colspan="2"><b>Früher Aufbau (`early`)</b></td></tr>
<tr><td width="50%"><img src="before/world/early.jpg" alt="vorher"></td><td width="50%"><img src="final/world/early.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Dichte Siedlung (`town`)</b></td></tr>
<tr><td width="50%"><img src="before/world/town.jpg" alt="vorher"></td><td width="50%"><img src="final/world/town.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Große Steinburg (`castle`)</b></td></tr>
<tr><td width="50%"><img src="before/world/castle.jpg" alt="vorher"></td><td width="50%"><img src="final/world/castle.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Belagerung mit mehreren Hundert Soldaten (`siege`)</b></td></tr>
<tr><td width="50%"><img src="before/world/siege.jpg" alt="vorher"></td><td width="50%"><img src="final/world/siege.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Figuren im Detail (`figures`)</b></td></tr>
<tr><td width="50%"><img src="before/world/figures.jpg" alt="vorher"></td><td width="50%"><img src="final/world/figures.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Belagerungsgerät (`engines`)</b></td></tr>
<tr><td width="50%"><img src="before/world/engines.jpg" alt="vorher"></td><td width="50%"><img src="final/world/engines.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Gesamtkarte (`map`)</b></td></tr>
<tr><td width="50%"><img src="before/world/map.jpg" alt="vorher"></td><td width="50%"><img src="final/world/map.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Boden, Pfade, Feld (`ground`)</b></td></tr>
<tr><td width="50%"><img src="before/world/ground.jpg" alt="vorher"></td><td width="50%"><img src="final/world/ground.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Wald (`forest`)</b></td></tr>
<tr><td width="50%"><img src="before/world/forest.jpg" alt="vorher"></td><td width="50%"><img src="final/world/forest.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Gewässer (`water`)</b></td></tr>
<tr><td width="50%"><img src="before/world/water.jpg" alt="vorher"></td><td width="50%"><img src="final/world/water.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Küste und Klippen (`coast`)</b></td></tr>
<tr><td width="50%"><img src="before/world/coast.jpg" alt="vorher"></td><td width="50%"><img src="final/world/coast.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Rohstoffvorkommen (`deposits`)</b></td></tr>
<tr><td width="50%"><img src="before/world/deposits.jpg" alt="vorher"></td><td width="50%"><img src="final/world/deposits.jpg" alt="nachher"></td></tr>
</table>

## 2 Figuren und Heere (`?bench&showcase=units`, 600er Heer)

<table>
<tr><th>vorher</th><th>nachher</th></tr>
<tr><td colspan="2"><b>Katalog nah, Reihe 1 (Bauer, Ochse, Lord, Bogenschütze, Armbrust, Speer; je vier Zustände)</b></td></tr>
<tr><td width="50%"><img src="before/units/catalog_near_1.png" alt="vorher"></td><td width="50%"><img src="final/units/catalog_near_1.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Katalog nah, Reihe 3</b></td></tr>
<tr><td width="50%"><img src="before/units/catalog_near_3.png" alt="vorher"></td><td width="50%"><img src="final/units/catalog_near_3.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Katalog mittel</b></td></tr>
<tr><td width="50%"><img src="before/units/catalog_mid.png" alt="vorher"></td><td width="50%"><img src="final/units/catalog_mid.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Katalog fern</b></td></tr>
<tr><td width="50%"><img src="before/units/catalog_far.png" alt="vorher"></td><td width="50%"><img src="final/units/catalog_far.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Heer nah</b></td></tr>
<tr><td width="50%"><img src="before/units/army_near.png" alt="vorher"></td><td width="50%"><img src="final/units/army_near.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Heer mittel</b></td></tr>
<tr><td width="50%"><img src="before/units/army_mid.png" alt="vorher"></td><td width="50%"><img src="final/units/army_mid.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Heer fern</b></td></tr>
<tr><td width="50%"><img src="before/units/army_far.png" alt="vorher"></td><td width="50%"><img src="final/units/army_far.jpg" alt="nachher"></td></tr>
</table>

Weitere Figurenbilder des Figuren-Zweigs (Berufe, Waffen, Animationsserien Gehen/Hieb/Stoß/Schuss/Arbeit/Fallen): `after/units/detail_*.png`, `after/units/anim_*.png`.

## 3 Gebäude, Siedlung, Burg

<table>
<tr><th>vorher</th><th>nachher</th></tr>
<tr><td colspan="2"><b>Überblick aller Gebäudetypen</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_00_overview.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_00_overview.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Bergfried nah</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_01_keep.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_01_keep.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Bergfried fern</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_02_keep_far.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_02_keep_far.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Mühle</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_03_mill.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_03_mill.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Schmiede</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_05_smith.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_05_smith.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Kirche</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_09_church.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_09_church.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Kathedrale</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_10_cathedral.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_10_cathedral.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Kaserne</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_11_barracks.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_11_barracks.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Türme</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_12_towers.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_12_towers.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Torhäuser</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_13_gates.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_13_gates.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Großer Turm</b></td></tr>
<tr><td width="50%"><img src="before/buildings/showcase_15_roundtower.png" alt="vorher"></td><td width="50%"><img src="final/buildings/showcase_15_roundtower.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Dichte Siedlung, fern</b></td></tr>
<tr><td width="50%"><img src="before/buildings/settlement_settlement_far.png" alt="vorher"></td><td width="50%"><img src="final/buildings/settlement_settlement_far.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Siedlung, mittel</b></td></tr>
<tr><td width="50%"><img src="before/buildings/settlement_settlement_mid.png" alt="vorher"></td><td width="50%"><img src="final/buildings/settlement_settlement_mid.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Siedlung, nah</b></td></tr>
<tr><td width="50%"><img src="before/buildings/settlement_settlement_close.png" alt="vorher"></td><td width="50%"><img src="final/buildings/settlement_settlement_close.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Burg, fern</b></td></tr>
<tr><td width="50%"><img src="before/buildings/castle_castle_far.png" alt="vorher"></td><td width="50%"><img src="final/buildings/castle_castle_far.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Burg, mittel</b></td></tr>
<tr><td width="50%"><img src="before/buildings/castle_castle_mid.png" alt="vorher"></td><td width="50%"><img src="final/buildings/castle_castle_mid.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Burg, Torturm</b></td></tr>
<tr><td width="50%"><img src="before/buildings/castle_castle_gate_tower.png" alt="vorher"></td><td width="50%"><img src="final/buildings/castle_castle_gate_tower.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Burg, Ecke</b></td></tr>
<tr><td width="50%"><img src="before/buildings/castle_castle_corner.png" alt="vorher"></td><td width="50%"><img src="final/buildings/castle_castle_corner.jpg" alt="nachher"></td></tr>
<tr><td colspan="2"><b>Burg, Bergfried</b></td></tr>
<tr><td width="50%"><img src="before/buildings/castle_castle_keep.png" alt="vorher"></td><td width="50%"><img src="final/buildings/castle_castle_keep.jpg" alt="nachher"></td></tr>
</table>

## 4 Bauanimation (4C) – Aufnahmen aus dem laufenden Spiel

Mühle (große Klasse, ≈ 4,4 s Spielzeit) bei 0,25-facher Geschwindigkeit, Platzierung über den echten Befehlsweg; Alter in Ticks seit der Platzierung / Fortschritt: 3 / 0,10, 14 / 0,36, 23 / 0,57, 32 / 0,79, 42 / 1,00 (Messwerte `qa/s02_economy.json`). Das Gebäude ist in der Sim von Anfang an funktionsfähig; die Animation ist rein visuell (Fundament und Staub → Gerüst → Wände und Dach von unten nach oben → Gerüst weg, Abschlusswolke).

<table><tr>
<td><img src="qa/s02_economy/bau_muehle_00.jpg" alt="Bauphase"></td>
<td><img src="qa/s02_economy/bau_muehle_01.jpg" alt="Bauphase"></td>
<td><img src="qa/s02_economy/bau_muehle_02.jpg" alt="Bauphase"></td>
<td><img src="qa/s02_economy/bau_muehle_03.jpg" alt="Bauphase"></td>
<td><img src="qa/s02_economy/bau_muehle_04.jpg" alt="Bauphase"></td>
</tr></table>

Mauerwelle (25 Stücke, `s04 --fast`, Fortschritt gemessen): 0/25 → 8/25 → 12/25 → 25/25 fertig innerhalb von ≈ 2,3 s Spielzeit. Weitere Serien (Kirche, Turm, Wirtschaftsgebäude, Mauern): `before/buildings/build_*.png`, `after/buildings/build_*.png`.

## 5 Bewegung (4A)

| | Vorher (alt, `&motionlegacy=1`) | Nachher |
| --- | --- | --- |
| Messlabor, 30 FPS, Szene „Bauern vor dem Bergfried“ | Sprünge 5,5 %, Halt 10,0 %, Rückwärts 2,4 %, Umkehr 68/min, Stehende driften 0,35 t/s | Sprünge 0,0 %, Halt 0,2 %, Rückwärts 0,0 %, Umkehr 0,3/min, Stehende 0,000 t/s |
| Messlabor, 30 FPS, Tor / Formation / Transport / Treppen / Gedränge | Sprünge 2,3–6,0 %, Halt 8,4–10,0 %, Umkehr 75–93/min | Sprünge ≤ 0,01 %, Halt 0,07–0,45 %, Umkehr ≤ 3,2/min |
| Browser, Software-GL (`qa/s03_motion.md`, 4 FPS) | Halt 0,0 %, Gleiten 0,7 % | Halt 1,7 %, Rückwärts 0,9 %, Gleiten 0,0 % – **bei so niedriger Bildrate nicht aussagekräftig**, siehe PROGRESS-4 |

Aufnahmen und Diagramme der 4A-Browserläufe: `movement/idle-bauern.png` (stehende Bauern, alt pendelt, neu ruht), `movement/tempo-gate.png`, `movement/tempo-haul.png` (gezeichnete Geschwindigkeit je Bild: alt Sägezahn 0–4 Tiles/s, neu gleichmäßig), `movement/<szene>-<legacy|new>-NN.jpg` (Overlay: Sim-Position rot, gezeichnete grün).

## 6 HUD und Beliebtheit (4F)

<table>
<tr><th>vorher</th><th>nachher</th></tr>
<tr><td width="50%"><img src="hud/before_1280_1.png" alt="vorher"></td><td width="50%"><img src="hud/after_1280_1.png" alt="nachher"></td></tr>
<tr><td width="50%"><img src="hud/before_820_1.png" alt="vorher 820 px"></td><td width="50%"><img src="hud/after_820_1.png" alt="nachher 820 px"></td></tr>
</table>

Beliebtheit im laufenden Spiel (Abnahme 4H, Steuern 4): Hover, Detailansicht, Bergfried-Panel, Berater:

<table>
<tr><td width="50%"><img src="qa/s08_popularity/1_hover.jpg" alt="Hover"></td><td width="50%"><img src="qa/s08_popularity/2_detail.jpg" alt="Detailansicht"></td></tr>
<tr><td width="50%"><img src="qa/s08_popularity/3_bergfried.jpg" alt="Bergfried-Panel"></td><td width="50%"><img src="qa/s08_popularity/4_berater_abfall.jpg" alt="Berater"></td></tr>
</table>

## 7 Im Spiel gesichtet (Abnahme 4H)

<table>
<tr><td width="50%"><img src="qa/s04_castle/5_auf_der_mauer.jpg" alt="Burg"></td><td width="50%"><img src="qa/s04_castle/6_treppe_nah.jpg" alt="Treppe"></td></tr>
<tr><td width="50%"><img src="qa/s09_battle/2_schlacht_mittel.jpg" alt="Schlacht mittel"></td><td width="50%"><img src="qa/s09_battle/3_schlacht_nah.jpg" alt="Schlacht nah"></td></tr>
<tr><td width="50%"><img src="qa/s16_teamcolors/teams_mittel.jpg" alt="Spielerfarben"></td><td width="50%"><img src="qa/s16_teamcolors/teams_nah.jpg" alt="Spielerfarben nah"></td></tr>
<tr><td width="50%"><img src="qa/s02_economy/siedlung_fern.jpg" alt="Siedlung"></td><td width="50%"><img src="qa/s02_economy/siedlung_nah.jpg" alt="Siedlung nah"></td></tr>
</table>

## 8 Ehrliche Bewertung

**Stärken**

- **Lesbarkeit der Gebäudetypen:** Jeder Typ hat eine eigene Silhouette (Bergfried mit vier Rundtürmen und Spielerdach, Mühle mit Flügelkreuz, Kirche mit Turm, Markt mit gestreiften Ständen, Felder mit Reihen, Torhaus mit Fallgitter, Wehrgänge mit Zinnen). Die Siedlung wirkt aus RTS-Höhe „bewohnt“ (Wege, Gärten, Rauch, Felder) statt wie ein Prototyp; im Vorher-Bild sind fast alle Gebäude Quader mit Satteldach.
- **Burgen:** Mauern, Türme, Tor und Treppen sind zusammenhängend und glaubwürdig; Truppen laufen sichtbar über Wehrgang und Treppe, die Ballista steht auf dem Turm.
- **Figuren:** Berufe, Soldatentypen und Reiter sind schon bei mittlerem Zoom unterscheidbar (Helme, Waffen, Rüstungsfarben, Umhänge); Heere lesen sich als Blöcke mit eigener Teamfarbe.
- **Farbstimmung insgesamt:** warme, leicht entsättigte Erdtöne mit kräftigen Dachfarben und Spielerfarbe nur an Dächern/Bannern/Rüstung; ein einheitliches Licht (Tonemapping und Farbkorrektur für Figuren, Gebäude und Gelände gemeinsam), weiche Schatten, Dunst gibt Tiefe. Gegenüber dem Vorher-Stand (flaches, gesättigtes Grün/Gelb) deutlich ruhiger und atmosphärischer.
- **Gelände:** Pfade und getretene Erde um Gebäude, Felder, Kiesel, Gras und Blumen, gemischte Wälder, Küstenschaum, Klippenschichten; die Gesamtkarte zeigt Biome statt einer einheitlichen Fläche.
- **Zoom nah/fern:** Nah (Figuren-Katalog, Bergfried) halten Details (Fenster, Quaderfugen, Hände, Haare) stand; fern geht nichts auseinander (Nah/Fern-Modelle), Dreiecke und Draw-Calls bleiben im Budget.
- **Bewegung und Bauablauf:** im Messlabor deutlich ruhiger; Bauanimation ohne Skalierungssprünge, ohne schwebende Dächer.

**Schwächen**

- **Spielerfarben:** Rot und Blau sind auch in der Masse gut zu erkennen. In der Abnahme fiel auf, dass Bogenschützen die Teamfarbe nur am Köcher auf dem Rücken trugen und deshalb in der RTS-Ansicht (Blick auf Brust und Kopf) für alle Spieler gleich grün wirkten (Befund B8, behoben: Waffenrock in Teamfarbe, vergleiche `qa/s09_battle/2_schlacht_mittel.jpg`, Bogenschützen mit rotem Brustteil). Die **olivgrüne Farbe** bleibt auf Sand und Gras in Heeren dunkel und ist von Rüstungsbraun und Wald schwerer zu trennen. Acht Spieler in einer Szene: `qa/s16_teamcolors/` (nur Sichtprüfung, nicht quantitativ gemessen): bei Nah/Mittel sind die Gruppen unterscheidbar; Gelb und Orange liegen bei kleinen Gruppen aus großer Höhe nahe beieinander. Die Szene liegt zufällig auf Fels und Wasser, weil die KI die Gruppen schon während der Aufnahme bewegt.
- **Gesichter** sind aus RTS-Höhe kaum zu sehen, Waffen ab Fern-Zoom nur Linien, Beine sind bei allen Typen eher dunkel und einheitlich (siehe 4B-Menschen).
- **Bäume** sind weiter schlichte Low-Poly-Körper (Palmen sternförmig); das Gelände bleibt sim-bedingt aus Terrassen mit Stufenküsten.
- **Kartenrand:** außerhalb der Karte ist der Hintergrund ein einfarbiger heller Dunst (Beige), kein Himmel/Horizont; in Ansichten am Rand wirkt das leer.
- **Wolkenschatten** sind im Standbild ein großer dunkler Fleck (in Bewegung unauffälliger).
- **Dichte Gedränge** an Toren und vor dem Bergfried bleiben eng; große Heere (Hunderte) werden fern zu bunten Punktwolken (gewollt, aber ohne Zoom schwer zu unterscheiden).
- **Nicht beurteilbar hier:** Wirkung auf dem MacBook-Display (P3, Retina), flüssige Bewegung in 60 FPS, Klang.
