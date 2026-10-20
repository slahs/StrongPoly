# Sprachpakete (Einheiten, Bewohner, Berater)

`de/` enthält die vorab erzeugten deutschen Sprachclips (MP3, mono, 22,05 kHz) und `de/manifest.json`
(Schlüssel → Datei, Dauer, Text, Stimme). Das Spiel lädt das Manifest beim ersten Ton und die Clips bei Bedarf.
Ein Clip wird nur benutzt, wenn sein Text zur angefragten Zeile passt; sonst gilt der Ersatz (Browser-Sprachausgabe)
oder die Zeile erscheint nur als Untertitel.

## Herkunft und Lizenzen

Die Clips sind **synthetisch** (lokale neuronale Sprachsynthese, keine Aufnahmen, keine Online-Dienste, keine API-Schlüssel):

| Stimme im Generator | Modell (Piper/VITS, ONNX) | Sprecher/Datensatz | Lizenz laut Modellkarte / Datensatz |
| --- | --- | --- | --- |
| `thorsten-high`, `thorsten-medium` | `de_DE-thorsten-high` / `-medium` | Thorsten Müller, Datensatz „Thorsten-Voice“ | CC0 (gemeinfrei) |
| `thorsten-emotional` (8 Sprechstile) | `de_DE-thorsten_emotional-medium` | Thorsten Müller, „Thorsten-Voice Dataset 2021.06 (Emotional)“ | CC0 (gemeinfrei) |
| `kerstin` | `de_DE-kerstin-low` | Sprecherin „kerstin“, `rhasspy/dataset-voice-kerstin` | CC0 1.0 |
| `en-joe` (Englisch) | `en_US-joe-medium` | Datensatz „joe“ | CC0 |
| `en-john`, `en-norman` (Englisch) | `en_US-john-medium`, `en_US-norman-medium` | Datensätze „john“, „norman“ | gemeinfrei („public domain“ laut Modellkarte) |
| `en-kathleen` (Englisch) | `en_US-kathleen-low` | `rhasspy/dataset-voice-kathleen` | CC0 |

Die Modelle stammen aus den fertig gepackten Paketen des Releases `tts-models` von `k2-fsa/sherpa-onnx`
(`vits-piper-de_DE-*.tar.bz2`, `vits-piper-en_US-*.tar.bz2`, enthalten je `MODEL_CARD` mit der Lizenzangabe). Ausgeführt werden sie mit dem Python-Paket
`sherpa-onnx` (Apache-2.0). Die Nachbearbeitung (Tonhöhe, Raum, Pegel, MP3) macht `ffmpeg`.
Bewusst **nicht** verwendet: Stimmen, deren Lizenz sich nicht belegen ließ (z. B. die M-AILABS-Stimmen `eva_k`, `karlsson`, `ramona`,
Modellkarte: „License: See URL“) und alles, was nicht frei nutzbar ist. Die gesprochenen Sätze sind Eigenentwürfe (`packages/shared/src/data/voices.de.ts`).

Alle 20 deutschen Einheiten-/Bewohnerstimmen und der Berater gehen auf **zwei echte Sprecher** zurück (Thorsten männlich, Kerstin weiblich; Englisch: vier Sprecher);
unterscheidbar werden sie über Sprechstil (acht Stile im Emotional-Modell), Tonhöhe, Tempo und Klangfarbe (Helm, Halle, Kapelle, Werkstatt).

## Beraterzeilen des Ereignis-Beraters

`scripts/export-voice-lines.ts` nimmt, wenn vorhanden, `shared/src/data/advisor_lines.ts` (Schlüssel `advisor.<ereignis>.<nr>`) mit auf: Zeilen ohne Platzhalter
werden direkt vertont, Zeilen mit **einem** endlichen Namensplatzhalter (`{res}` Ware, `{store}` Lager, `{building}` Betrieb/Turm) je Wert ausgeschrieben
(Manifest-Schlüssel `<zeile>@<wert>`, Markierung `"x": 1`); das Sprachsystem findet den Clip über Zeilenschlüssel **und fertigen Text**.
Zeilen mit Zahlen oder mehreren/freien Platzhaltern (`{n}`, `{months}`, `{list}`, `{name}` …) können nicht vorab erzeugt werden – dort spricht der Ersatz
(Browser-Sprachausgabe mit dem fertigen Text). Nach Änderungen an `advisor_lines.ts` einfach `scripts/gen-voices.sh` erneut laufen lassen.

## Neu erzeugen

```
scripts/gen-voices.sh            # exportiert die Zeilen, erzeugt alle Clips und das Manifest (Modelle werden geladen, siehe Skript)
scripts/gen-voices.sh --only knight,advisor
scripts/check-voices.sh          # Signalprüfung + Rücktranskription (Whisper) je Clip
```

## Eigene Aufnahmen oder ein anderes Paket einsetzen

1. Pro Zeile eine Datei (MP3/OGG/AAC, was der Browser dekodiert) ablegen, z. B. `de/archer/select_1.mp3`.
2. In `de/manifest.json` den Eintrag anpassen: `"archer.select.1": { "f": "archer/select_1.mp3", "d": 1.2, "t": "Unsere Bögen sind bereit.", "v": "archer" }`
   (`d` = Dauer in Sekunden, `t` = gesprochener Text – muss mit der Zeile in `voices.de.ts` übereinstimmen, `v` = Stimme).
3. Ein komplettes anderes Paket lässt sich ohne Neubau testen: `?voicepack=/mein/pfad/` (Struktur `<pfad>/<lang>/manifest.json`).
4. Fehlt ein Eintrag, spricht die Browser-Stimme (Option „Browser-Stimme als Ersatz“) oder die Zeile bleibt Untertitel.
5. Englisch liegt als eigenes Paket unter `en/` (gleiche Struktur, `VOICE_LANG=en scripts/gen-voices.sh`); ein weiteres Sprachpaket braucht nur Texte in `voices.<lang>.ts` und ein Manifest.
