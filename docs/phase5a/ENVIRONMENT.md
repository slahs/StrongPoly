# Phase 5A – Teilschritt 5: Referenzumgebung (Terrain, Vegetation, Licht)

Stil `medieval` (`?lookdev=medieval`, `?style=medieval`). Der Stil `classic` ist unverändert (Nachweis unten).
Alle Zeiten/Bildraten: Chromium mit **Software-GL (SwiftShader)**, 4 Kerne, Rechner parallel stark belastet – **keine
GPU-Werte**. Safari/MacBook Air M3 ist nicht gemessen.

Stand: nach dem Merge der Materialbibliothek und der Burg-Assets (Koordinator-Stand `566e42e`).

## 1. Überblick

| Bereich | Umsetzung | Code / Quelle |
| --- | --- | --- |
| Vegetation | 24 GLB-Assets aus Blender-Skripten: Stieleiche, Hängebirke, Fichte je 3 Varianten (davon 1 Jungbaum), Hasel/Weißdorn, 2 Gräser, 2 Blumenmischungen, Farn, Findling/Fels/Platte/Lesesteine, Holzzaun, Flechtzaun, Gemüsebeet, liegender Stamm | `assets/blender/models/veg_*.py`, Bibliothek `assets/blender/lib/sp/veg.py` |
| Vegetation (Laufzeit) | Instancing je (Asset × LOD × Material), LOD je Instanz nach Abstand, Sichtkegel-Auslese, Verteilung rein/deterministisch, Wind, Alpha-Test inkl. Schattenpass, Durchlicht, Rückfall auf die prozedurale Dekoration | `render/env/veg_layer.ts`, `veg_place.ts`, `veg_material.ts` |
| Gelände | eigenes PBR-Material: Bibliothekstexturen Gras/Erde/Weg/Fels als Textur-Arrays, höhenbasierte Übergänge (ORM.a), Makro-Variation, zweite gedrehte Abtastung (Hoch), Klippen seitlich projiziert, Kriegsnebel/Chunks/Bodenkarte wie bisher | `render/env/terrain_medieval.ts`, `render/terrain.ts` (Zweig `medieval`) |
| Wege | Umgebungskarte (Wegstärke, Querabstand mit Vorzeichen, Richtung, Kronendach, Fahrspuren): Wegtextur entlang des Weges ausgerichtet (Spurrillen laufen mit), ausgefranste Ränder, Grasstreifen in der Mitte von Karrenwegen, Trampelpfade enden am nächsten Weg | `render/env/envmap.ts`, `groundmap.ts trailSegments` |
| Licht | Sonne aus dem Sonnenstand (Farbe 3.400–5.800 K-Anmutung), prozeduraler Himmel → PMREM (Himmelslicht + Glanz) und Hintergrund, Halbkugel nur für Rückfallmodelle, Schattenkamera auf den sichtbaren Boden eingepasst | `render/env/atmosphere.ts`, `render/scene.ts` |
| Atmosphäre | Exponentialnebel in Horizontfarbe (durch denselben Tonemapper geschickt), Höhendunst, Obergrenze für Lesbarkeit | `atmosphere.ts` (FOG_EXP2-Zweig der three-Chunks) |
| Tonemapping | AgX + Abstimmung (Sättigung 1,12, Kontrast 1,06, leichte Teiltonung); ACES zum Vergleich (`&tone=aces`) | `atmosphere.ts CustomToneMapping` |


## 2. Vegetation

### 2.1 Assets (Blender-Skripte, reproduzierbar; Dreiecke LOD0/LOD1/LOD2, Karten zählen)

| Asset | Beschreibung | Klasse / Rolle | Dreiecke LOD0/1/2 | Budget | Materialien | GLB |
| --- | --- | --- | --- | --- | --- | --- |
| `veg_birch_a` | Haengebirke, einstaemmig | tree / mature | 4680 / 658 / 121 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 292 KB |
| `veg_birch_b` | Haengebirke, kleiner, schief | tree / young | 3659 / 565 / 103 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 230 KB |
| `veg_birch_c` | Haengebirke, zweistaemmig | tree / mature | 5960 / 918 / 184 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 374 KB |
| `veg_bush_a` | Haselstrauch: viele Triebe aus dem Boden, lockere Krone | bush / bush | 1924 / 246 / 32 | 2400 / 700 / 160 | M_Bark, M_Foliage | 126 KB |
| `veg_bush_b` | Weissdorn: dicht, rundlich | bush / bush | 1718 / 163 / 18 | 2400 / 700 / 160 | M_Bark, M_Foliage | 112 KB |
| `veg_fence_rail` | Holzzaun: Eichenpfosten mit zwei Spaltstangen (1 Einheit) | prop / fence | 130 / 73 / 32 | 1500 / 600 / 150 | M_Timber_Oak | 18 KB |
| `veg_fence_wattle` | Flechtzaun: Staken mit geflochtenen Haselruten (1 Einheit) | prop / fence | 939 / 240 / 43 | 1500 / 600 / 150 | M_Bark | 82 KB |
| `veg_fern_a` | Farn (Wurmfarn), sieben Wedel | flora / fern | 392 / 132 / 12 | 420 / 140 / 40 | M_Flora | 48 KB |
| `veg_flowers_a` | Wiesenblumen | flora / flowers | 106 / 39 / 20 | 420 / 140 / 40 | M_Flora | 15 KB |
| `veg_flowers_b` | Wiesenblumen | flora / flowers | 111 / 43 / 20 | 420 / 140 / 40 | M_Flora | 15 KB |
| `veg_garden_bed` | Gemuesebeet: Erdhuegel mit Brettern, Kohl und Lauch | prop / garden | 472 / 144 / 48 | 1500 / 600 / 150 | M_Flora, M_Ground_Dirt, M_Wood_Planks | 56 KB |
| `veg_grass_a` | Grasbueschel | flora / grass | 110 / 12 / 5 | 420 / 140 / 40 | M_Flora | 16 KB |
| `veg_grass_b` | Grasbueschel (hoch, Samenstaende) | flora / grassTall | 106 / 18 / 4 | 420 / 140 / 40 | M_Flora | 16 KB |
| `veg_log` | liegender Baumstamm mit Rinde und Schnittflaechen | prop / log | 210 / 100 / 30 | 1500 / 600 / 150 | M_Bark, M_Timber_Oak | 28 KB |
| `veg_oak_a` | Stieleiche, ausgewachsen, breite Krone | tree / mature | 4724 / 518 / 151 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 311 KB |
| `veg_oak_b` | Stieleiche, hoeher, unregelmaessige Krone, leicht schief | tree / mature | 3761 / 450 / 129 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 250 KB |
| `veg_oak_c` | junge Eiche | tree / young | 2277 / 312 / 73 | 6000 / 1500 / 300 | M_Bark, M_Foliage | 148 KB |
| `veg_rock_a` | Findling: gerundet, halb eingesunken, moosig | rock / boulder | 1280 / 320 / 80 | 1500 / 500 / 150 | M_Rock | 111 KB |
| `veg_rock_b` | kantiger Fels mit Bruchflaechen und Schichtung | rock / rock | 1280 / 320 / 80 | 1500 / 500 / 150 | M_Rock | 107 KB |
| `veg_rock_c` | flache Felsplatte, rissig, moosig | rock / rock | 1280 / 320 / 80 | 1500 / 500 / 150 | M_Rock | 104 KB |
| `veg_rock_d` | Lesesteine (vier Steine) | rock / stones | 1280 / 320 / 80 | 1500 / 500 / 150 | M_Rock | 119 KB |
| `veg_spruce_a` | Fichte, ausgewachsen | tree / mature | 5683 / 586 / 150 | 6000 / 1500 / 300 | M_Bark, M_Foliage_Conifer | 380 KB |
| `veg_spruce_b` | Fichte, mittel, dicht | tree / mature | 5544 / 560 / 150 | 6000 / 1500 / 300 | M_Bark, M_Foliage_Conifer | 370 KB |
| `veg_spruce_c` | junge Fichte | tree / young | 3191 / 354 / 114 | 6000 / 1500 / 300 | M_Bark, M_Foliage_Conifer | 214 KB |

Summe GLB 3.5 MB (unkomprimiert; gzip ≈ 65 %). Bearbeitbare Quellen: Skripte + `assets/src/veg/*.blend`.

Aufbau der Bäume (`veg_trees.py`): deterministisches Skelett je Variante – Stamm mit Wurzelanlauf (Rippen am Fuß),
Starkäste wachsen zu Zielpunkten auf einer Kronenhülle (Ellipsoid), Seitenäste bis zur Hülle; Blattkarten (Atlas `M_Foliage`,
Zellen Eiche/Birke; bei der Birke hängend) an den äußeren Zweigabschnitten, Kartennormalen von der Kronenmitte nach außen,
AO analytisch (innen/unten dunkler). Fichte: Quirle waagrechter Äste mit aufgebogenen Spitzen, Nadelzweig-Karten
(`M_Foliage_Conifer`, eigene prozedurale Textur) liegend und hängend, Wipfel aus gekreuzten Karten. LOD1: gleiches Skelett,
nur Stamm/Starkäste, Karten im Raster 0,2 gebündelt (größer); LOD2: Stamm + Hüllkarten (impostorartig, ≤ 300 Dreiecke).
Gras/Blumen/Farn sind Geometrie (Halme, Blütenfächer, Fiederblättchen) mit Palette `M_Flora` – kein Alpha-Test, also kein
Overdraw-Problem bei dichtem Gras. Felsen: verformte Ikosaeder (Rauschen, Bruchflächen durch Ebenenschnitte, Schichtung),
LOD aus derselben Form mit weniger Unterteilung, Moosanteil in der Datenfarbe, AO per Cycles-Bake.

### 2.2 Laufzeit (`render/env/`)
- **Katalog** aus dem Manifest (`veg.kind/species/role`), nichts ist im Code fest verdrahtet; fehlt eine Baumart oder
  scheitert das Laden, bleibt die prozedurale Dekoration (Rückfall, `console.info`). Bis die Assets geladen sind, zeichnet
  ebenfalls die prozedurale Dekoration.
- **Verteilung** (`veg_place.ts`, rein): jeder Baum-Tile bekommt einen Baum (Holz-Ressource bleibt sichtbar), Art aus Biom
  und Terrain → Eiche/Birke/Fichte, Variante per Hash; dichter Wald: Jungwuchs, Büsche, Farn; Waldsaum: Büsche, Farn, hohes
  Gras; Wiese: Grasbüschel (Dichte nach Stufe und Feuchte, nicht auf Wegen/Feldern/Gebäuden), Blumen in Rauschflecken,
  vereinzelt Büsche, Lesesteine, Findlinge; Felsgelände/Vorkommen: Felsen (getönt nach Vorkommen).
- **LOD** je Instanz nach Kameraabstand: Bäume 21/50, Büsche 14/34, Flora 9/20 (danach keine), Felsen 18/44, Requisiten
  16/40 Einheiten × Stufenfaktor (Niedrig 0,7, Mittel 1, Hoch 1,45); Niedrig nie Baum-LOD0. Fernformen (LOD2) der
  ausgewachsenen Varianten einer Art teilen sich ein Mesh und werfen keine Schatten (weniger Draw-Calls).
- **Auslese**: Instanzen außerhalb des um 5 Einheiten erweiterten Sichtkegels entfallen (Schatten knapp außerhalb stehender
  Bäume bleiben); Kameradrehung verteilt neu.
- **Instancing** je (Asset × LOD × Material) ein `InstancedMesh`; Draw-Calls unabhängig von der Instanzzahl.
- **Material** (`veg_material.ts`): ein MeshStandardMaterial je Bibliotheksname; Wind wie das bestehende Schwanken
  (gleiche Uniforms `uTime/uWind/uWindDir/uTreeSway`, Biegung ∝ Biegsamkeit², Äste phasenversetzt, Blätter/Halme flattern),
  Schattenmaterial mit derselben Bewegung **und Alpha-Test** (schließt die Lücke „Laub-Alpha im Schattenpass“), Alpha-Erhalt in
  den Mipmaps, Alpha-to-Coverage mit Kantenglättung, Rückseiten-Normalen nicht umgedreht (weiche Krone), Durchlicht (Sonne von
  hinten, verschattet), Laub matt (kein bläulicher Himmelsglanz), Birkenrinde und Moos aus der Datenfarbe; Kachelgröße der
  Rinde/des Felsens wird zur Laufzeit an die Bibliothek angepasst (`uvTile`).
- **Gras am Sichtrand** schrumpft weich aus (kein harter Rand beim Nachverteilen).

## 3. Gelände und Wege
- Gleiche Architektur wie classic (Chunks à 32 Tiles, Terrassen, Klippen, Wasser, Kriegsnebel über die Vertexfarbe,
  Bodenkarte), im Stil medieval aber eigener Materialpfad: Vertexfarbe = Tönung (≈ 1) der Texturen, zusätzliches Attribut
  `aMed` (Kartenrand, Feuchte); Wasser natürlicher getönt.
- Material: Gras/Erde/Weg/Fels aus der Materialbibliothek als **Textur-Arrays** (je Karte ein Sampler, Safari hat 16
  Textureinheiten), Weltmaß-UVs mit der Kachelgröße der Bibliothek; Gewichte aus Terrain, Rauschflecken (trockene Stellen),
  Bodenkarte (getretene Erde, Felder mit Furchen), Umgebungskarte (Wege, Laubstreu unter Bäumen); **höhenbasierte
  Übergänge** über die Höhe in ORM.a, falls vorhanden – die ausgelieferten WebP-ORM tragen keine Höhe (Alpha = 1), daher
  Ersatzhöhe aus AO (Hohlräume tief) + Helligkeit; Makro-Variation (zwei Rauschebenen, trockene/satte Flecken);
  Hoch: zweite gedrehte/skalierte Abtastung gegen Kachelwiederholung; Normalen der Texturen ab Mittel, Niedrig nur Albedo+ORM.
- Wege: Wegtextur entlang der Wegrichtung (die Spurrillen der Bibliothekstextur folgen dem Weg; an Kreuzungen Weltprojektion,
  damit nichts verschmiert), Kontrast der Rillen gemildert (dunkle Rillen der Textur auf ≥ 72 % der Grundfarbe angehoben), Ränder mit drei Rauschfrequenzen ausgefranst, Grasstreifen in der
  Mitte von Karrenwegen. Fehlen Texturen, zeichnet ein prozeduraler Rückfall aus den Grundfarben der Bibliothek.
- Texturspeicher: 3 Arrays × 4 Schichten; Mittel/Hoch 1024² (≈ 67 MB unkomprimiert inkl. Mipmaps), Niedrig 512² (≈ 17 MB).

## 4. Licht, Schatten, Atmosphäre
- Sonne Standard Stil medieval: Azimut 232° (Südwest), Höhe 34° (Nachmittag; Spiel und LookDev gleich, LookDev-Regler
  bleibt), Farbe aus der Höhe, Stärke 3,5 (flach etwas schwächer). Himmel prozedural (Zenit, dunstiger Horizont,
  Aureole, Bodenreflex) als 128×64-Equirect → PMREM (`scene.environment`, Stärke 0,85) und Hintergrund; die
  Halbkugel-Lichtquelle trägt dieselben Himmelsfarben, wirkt aber nur auf Lambert-Rückfallmodelle (`uHemiK`).
- Schatten: Schattenkamera auf die Bodenpunkte der Sichtpyramide eingepasst (Rechteck je Achse, Fernpunkte auf 2,2 ×
  Kameraabstand begrenzt) – bei RTS-Sicht deutlich mehr Texel je Einheit als der feste Radius; Texel-Snapping je Achse;
  Normal-Bias = 1,1 Texel, Tiefen-Bias −0,00012 (weder Akne auf Blattkarten noch Peter-Panning an Hauswänden in den
  Nahaufnahmen); volle Schattenstärke (Aufhellung kommt aus dem Himmelslicht). Kontaktschatten: gebackene AO der Assets
  (mit Bodenplatte), Bodenkarte an Gebäuden, Kronendach-AO im Gelände.
- Nebel: FOG_EXP2 (nur Stil medieval), Hälfte bei 3,2 × Kameraabstand, über 1–7 Einheiten Höhe auf 62 % ausgedünnt,
  höchstens 85 %; Farbe = Horizont des Himmels durch denselben Tonemapper gerechnet (three mischt den Nebel nach dem
  Tonemapping) → nahtloser Übergang zum Hintergrund.
- Tonemapping AgX + Abstimmung; das globale Grading aus `materials.ts` wird im Stil medieval übersprungen (`spGradeMode`),
  classic unverändert. **Kein Bloom** (zusätzliche Render-Ziele/Programme, auf Safari/M3 nicht gemessen – bewusst weggelassen).

### Tonemapping-Vergleich AgX ↔ ACES (Mittel, gleiche Szene/Sonne, links AgX, rechts ACES)
![AgX/ACES Landschaft](assets/environment/tonemapping_agx_aces_3h-landscape.jpg)
![AgX/ACES RTS](assets/environment/tonemapping_agx_aces_1-rts.jpg)

Entscheidung **AgX**: ACES verdunkelt die Schatten deutlich (Figuren im Hausschatten schlechter lesbar), sättigt Ziegelrot
und Grün stark (Richtung Postkarte) und verschiebt helle Töne ins Gelbliche. AgX rollt Lichter weicher ab und hält
Stein/Putz/Holz neutral; die fehlende Spannung gleicht die Abstimmung aus (Sättigung 1,12, Kontrast 1,06). ACES bleibt
für Vergleiche abrufbar (`&tone=aces`).

## 5. LookDev
- Szene ergänzt (`lookdev_scene.ts`): Karrenweg vom Tor über den Platz, Abzweig zum Bergfried, Gasse zur Schmiede,
  Fußpfad zur Bäckerei (`road`), einzelne Solitärbäume (`tree`), Gärten mit Flechtzaun, Weide mit Holzzaun, Findling,
  Lesesteine, liegender Stamm (`prop`, `propLine`); Waldsäume wie bisher.
- Neue Kamera `3h-landscape` (Landschafts-Nahkamera: Garten, Waldsaum Eiche/Birke/Fichte, Wiese).
- `&tone=agx|aces` (Vergleich), LookDev wartet auf Bodentexturen und Vegetation (`GameScene.whenEnvReady`), ebenso `?bench&style=medieval`.

## 6. Bilder (LookDev, 1280×720, Software-GL, Sonne 232°/34°)

`docs/phase5a/assets/environment/<stil>/<stufe>/<kamera>.jpg` – Stil `medieval` (neu) und `classic` (alt, gleiche Szene),
Stufen `low`/`medium`/`high`, Kameras `1-rts`, `2-mid`, `3a-building`, `3b-figures`, `3c-material`, `3e-gate`,
`3h-landscape`; je Ordner `stats.json`. Stand der Texturen: gemergte Materialbibliothek (19 Materialien) + eigene
`M_Foliage_Conifer`/`M_Flora`; Bergfried/Mauer/Tor als GLB (Burg-Agent), übrige Gebäude/Figuren noch prozedural.

| Kamera | alt (classic, Mittel) | neu (medieval, Mittel) |
| --- | --- | --- |
| 1 RTS | ![](assets/environment/classic/medium/1-rts.jpg) | ![](assets/environment/medieval/medium/1-rts.jpg) |
| 2 Mittel | ![](assets/environment/classic/medium/2-mid.jpg) | ![](assets/environment/medieval/medium/2-mid.jpg) |
| 3h Landschaft | ![](assets/environment/classic/medium/3h-landscape.jpg) | ![](assets/environment/medieval/medium/3h-landscape.jpg) |
| 3e Tor/Weg | ![](assets/environment/classic/medium/3e-gate.jpg) | ![](assets/environment/medieval/medium/3e-gate.jpg) |
| 3c Material | ![](assets/environment/classic/medium/3c-material.jpg) | ![](assets/environment/medieval/medium/3c-material.jpg) |

## 7. Messungen (Software-GL / SwiftShader – KEINE GPU-Werte)

LookDev 1280×720, Szene wie oben, Rechner parallel stark belastet (Last 15–28 auf 4 Kernen). Draw-Calls/Dreiecke inkl.
Schattenpass (three `renderer.info`), Programme = kompilierte Shaderprogramme, Texturspeicher geschätzt (unkomprimiert,
mit Mipmaps; Spalte „Assets“ = Materialbibliothek der GLB-Assets). **Nicht enthalten** in diesen Läufen: die
Gelände-Texturarrays des Stils medieval (Niedrig 512² ≈ 17 MB, Mittel/Hoch 1024² ≈ 67 MB; ab jetzt zählt die LookDev-Statistik
sie mit) und die Umgebungskarte (Karte 96² × 4² Texel × 2 Texturen ≈ 1,2 MB).

| Stil | Stufe | Kamera | Draw-Calls | Dreiecke | Programme | Texturspeicher ≈ MB (davon Assets) | Geometrie MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| medieval | low | 1-rts | 87 | 141k | 20 | 56.7 (56.2) | 13.3 |
| medieval | low | 2-mid | 96 | 127k | 22 | 57 (56.2) | 14 |
| medieval | low | 3a-building | 82 | 109k | 22 | 52.7 (56.2) | 13.6 |
| medieval | low | 3b-figures | 91 | 118k | 22 | 57 (56.2) | 14.4 |
| medieval | low | 3c-material | 86 | 103k | 22 | 57 (56.2) | 14.1 |
| medieval | low | 3h-landscape | 98 | 182k | 22 | 57 (56.2) | 14.1 |
| medieval | low | 3e-gate | 100 | 137k | 22 | 57 (56.2) | 14.2 |
| medieval | medium | 1-rts | 97 | 253k | 26 | 225 (224.2) | 16.6 |
| medieval | medium | 2-mid | 112 | 273k | 27 | 225 (224.2) | 20.8 |
| medieval | medium | 3a-building | 90 | 252k | 27 | 209 (224.2) | 19.4 |
| medieval | medium | 3b-figures | 94 | 271k | 27 | 225 (224.2) | 19.4 |
| medieval | medium | 3c-material | 86 | 240k | 27 | 225 (224.2) | 18.4 |
| medieval | medium | 3h-landscape | 106 | 581k | 27 | 225 (224.2) | 22.2 |
| medieval | medium | 3e-gate | 100 | 380k | 27 | 225 (224.2) | 19 |
| medieval | high | 1-rts | 107 | 349k | 29 | 465 (368.2) | 20.6 |
| medieval | high | 2-mid | 113 | 392k | 29 | 465 (368.2) | 22.6 |
| medieval | high | 3a-building | 102 | 457k | 29 | 449 (368.2) | 22.4 |
| medieval | high | 3b-figures | 104 | 397k | 29 | 465 (368.2) | 21.7 |
| medieval | high | 3c-material | 100 | 417k | 29 | 465 (368.2) | 22.3 |
| medieval | high | 3h-landscape | 108 | 1110k | 29 | 465 (368.2) | 22.8 |
| medieval | high | 3e-gate | 117 | 576k | 29 | 465 (368.2) | 23.1 |
| classic | low | 1-rts | 38 | 131k | 14 | 8.7 (0) | 11.4 |
| classic | low | 2-mid | 42 | 106k | 14 | 8.7 (0) | 11.5 |
| classic | low | 3a-building | 36 | 75k | 14 | 8.7 (0) | 11.3 |
| classic | low | 3b-figures | 40 | 89k | 14 | 8.7 (0) | 11.5 |
| classic | low | 3c-material | 36 | 80k | 14 | 8.7 (0) | 11.3 |
| classic | low | 3h-landscape | 35 | 70k | 14 | 8.7 (0) | 11.2 |
| classic | low | 3e-gate | 40 | 86k | 14 | 8.7 (0) | 11.5 |
| classic | medium | 1-rts | 53 | 305k | 21 | 32.7 (0) | 12.6 |
| classic | medium | 2-mid | 49 | 202k | 21 | 32.7 (0) | 12.5 |
| classic | medium | 3a-building | 42 | 131k | 21 | 32.7 (0) | 12.2 |
| classic | medium | 3b-figures | 46 | 146k | 21 | 32.7 (0) | 12.5 |
| classic | medium | 3c-material | 42 | 135k | 21 | 32.7 (0) | 12.2 |
| classic | medium | 3h-landscape | 41 | 126k | 21 | 32.7 (0) | 12.1 |
| classic | medium | 3e-gate | 47 | 144k | 21 | 32.7 (0) | 12.5 |
| classic | high | 1-rts | 55 | 477k | 23 | 128.7 (0) | 13.8 |
| classic | high | 2-mid | 50 | 296k | 23 | 128.7 (0) | 13.8 |
| classic | high | 3a-building | 44 | 185k | 23 | 128.7 (0) | 13.4 |
| classic | high | 3b-figures | 48 | 202k | 23 | 128.7 (0) | 13.7 |
| classic | high | 3c-material | 44 | 190k | 23 | 128.7 (0) | 13.4 |
| classic | high | 3h-landscape | 43 | 180k | 23 | 128.7 (0) | 13.3 |
| classic | high | 3e-gate | 49 | 200k | 23 | 128.7 (0) | 13.8 |


Einordnung:
- **Vegetation/Gelände/Licht (Stil medieval)** gegenüber classic: +40…+60 Draw-Calls (RTS: 48 Vegetations-Gruppen je
  Asset × LOD × Material im Hauptpass, dazu ihre Schattenwerfer; Fernformen werfen keine Schatten, Gras gar keine), +5…+7
  Programme (Gelände PBR, Vegetation fest/Laub/Flora, Schattenvarianten, Himmel-Hintergrund). Die übrigen Mehrkosten im
  Stil medieval stammen von den GLB-Burgassets und der Materialbibliothek (Spalte Assets).
- Dreiecke: RTS-Sicht 141k/253k/349k (Niedrig/Mittel/Hoch), Nahsicht in den Wald (3h) bis 581k (Mittel) bzw. 1,1 Mio. (Hoch;
  dichtes Gras + Bäume LOD0 bis 30 Einheiten). Gras ist reine Geometrie: LOD0 110, LOD1 12 Dreiecke je Büschel, nur bis
  9/20 Einheiten × Stufenfaktor, keine Schatten.
- Ladezeit der Seite (Software-GL, alles inkl. Shaderkompilierung, belasteter Rechner): Niedrig 81 s, Mittel 226 s, Hoch
  306 s gegenüber classic 29/90/62 s – auf echter GPU nicht aussagekräftig; dominiert von Texturdekodierung (19 + 2 Materialien
  × 3 Karten) und Kompilierung.
- `?bench&style=medieval` (2000 kämpfende Einheiten, 1280×720, `node scripts/bench-fps.mjs --style=medieval --secs=8 --warm=3`):

| Stil | Stufe | JS Ø ms ohne Raster (Update / Render) | JS p95 ms | Draw-Calls | Dreiecke | Bildzeit Software-GL ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| medieval | low | 7.6 (3.6 / 4.0) | 11.4 | 83 | 435k | 3533 |
| medieval | medium | 8.5 (3.3 / 5.2) | 12.6 | 88 | 678k | 6741 |
| medieval | high | 9.4 (4.1 / 5.3) | 13.1 | 91 | 876k | 6550 |
| classic | low | 5.3 (2.5 / 2.8) | 7.1 | 66 | 442k | 1283 |
| classic | medium | 5.3 (2.3 / 3.0) | 8.1 | 82 | 786k | 2929 |
| classic | high | 6.3 (2.8 / 3.4) | 9.2 | 83 | 951k | 2767 |

  Die JS-Zeit (die zwischen Rechnern vergleichbarste Zahl) steigt um 2–3 ms (GLB-Assets, PBR-Materialien, Vegetation,
  Schattenkamera); das Ziel ≤ 8 ms auf Mittel wird mit 8,5 ms knapp verfehlt. Die Bildzeit unter SwiftShader ist 2–3× höher
  als classic, vor allem durch den Gelände-Shader (Messung Nahsicht: ohne Gelände 0,83 s statt 2,2 s je Bild) – auf einer GPU
  ist das ein üblicher 4-Lagen-Splat, unter Software-GL aber der Engpass.
- GLB der Vegetation: 24 Dateien, zusammen ≈ 3,6 MB roh (gzip ≈ 65 %), einmal je Sitzung geladen.
- Spiel `?quick=1&style=medieval` und `?bench&style=medieval` (wartet auf Bodentexturen + Vegetation) laufen; Konsole sauber
  (siehe PROGRESS-5A). Stil `classic`: alle 12 `?shots`-Szenen mit identischen Draw-Calls/Dreiecken/Programmen wie der
  Ausgangsstand `af8cbb1` (early 51/196k/21 … deposits 39/102k/19), Pixelabweichungen nur an animierten Stellen (Wasser,
  Fahnen, Gras im Wind).


## 8. Kritische Einschätzung

**Was trägt:** Aus der RTS-Sicht liest sich die Landschaft als zusammenhängende Wiese mit ausgefahrenen Wegen, Waldsaum,
Solitärbäumen und Felsen; Schatten der Bäume sind weich und haben echte Laubkanten (Alpha im Schattenpass). In den
Nahaufnahmen wirken Grasbüschel, Wegtextur mit Spurrillen, Laubstreu, Birkenrinde, Gärten und Zäune glaubwürdig; der
Himmel/Dunst staffelt die Tiefe ohne Kitsch, AgX hält Stein/Holz/Putz neutral, Figuren bleiben im Schatten lesbar.

**Schwächen (ehrlich):**
- Blattkarten-Kronen sind nah noch als Karten erkennbar (zu flächig, zu gleichmäßige Dichte); keine echten Lücken/Astgabeln
  im Kronenrand, keine Herbst-/Zustandsvarianten. Fichten: Quirle wirken an den Spitzen noch etwas „gesteckt“.
- Wiese aus RTS-Sicht noch etwas gleichförmig (Rasen-Eindruck); es fehlen großflächige Wiesentypen (Blühwiese, Brache),
  Gras-Karten für die Fernsicht und Bodenbewuchs in Waldböden.
- Wege: Ränder ausgefranst, aber Kreuzungen/Abzweige sind geometrisch (Liniensegmente, keine Wegaufweitung); die
  Spurrillen der Bibliothekstextur bleiben etwas gleichmäßig. Trampelpfade sind gerade Linien zum nächsten Weg.
- Felsen: Formen gut, die Felstextur (Material-Agent: „Facetten wie Polygonplatten“) zeigt nah Plattenmuster.
- Licht: kein SSAO/Kontaktschatten unter Felsen/Büschen außer dem eigenen Schatten und gebackener AO; Himmel ohne Wolken.
- Prozedurale Häuser/Figuren (noch nicht migriert) wirken neben den PBR-Elementen deutlich stilfremd – wird mit den
  übrigen Assets besser, ist aber im Bild der größte Bruch.
- Software-GL: Leistung auf dem M3 unbekannt (siehe Messungen); die Bäume sind 3–6k Dreiecke nah, das Gras hat viele
  dünne Dreiecke – auf echter GPU wahrscheinlich unkritisch, aber zu messen.

## 9. Offene Punkte / Empfehlungen
- Safari/M3-Messung (`?lookdev=medieval` mit Statistik, `?bench&style=medieval`).
- KTX2 für die Bodentextur-Arrays (heute 3 × 4 × 1024² RGBA8 ≈ 67 MB auf Mittel/Hoch) und die Bibliothek.
- Kronen: Astgabeln/Lücken, mehr Kartenvarianten, Impostor-Atlas für LOD2 statt Hüllkarten; Herbstvarianten.
- Wege als Spieldaten (Straßenbau) statt Trampelpfad-Linien; Kreuzungsaufweitung; Pfützen/Nässe nach Wetter.
- Höhenkarten der Bodenmaterialien ausliefern (ORM.a), damit die Übergänge echte Texturhöhen nutzen (heute Ersatz aus AO).
- Wolken (Schatten sind vorhanden, Himmel ohne Wolken), dezentes Bloom erst nach M3-Messung.


