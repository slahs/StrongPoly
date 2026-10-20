## Benchmark ?bench – 2000 kämpfende Einheiten

- Browser: 141.0.7390.37, Viewport 1280x720, Pixel-Ratio 1, Kamera-Abstand 36
- GL: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (Software-Rendering)
- CPU: Intel(R) Xeon(R) Processor @ 2.80GHz × 4
- Messfenster: 15 s nach 4 s Warmlauf; Bildzeit = Abstand zwischen requestAnimationFrame-Aufrufen, JS = Aktualisierung + renderer.render (ohne Wartezeit auf die GPU)

| Stufe | FPS | Ø ms | p95 ms | p99 ms | JS Ø ms (voll) | JS Ø ms (ohne Raster) | davon Update / Render | JS p95 ms (ohne Raster) | Draw-Calls | Dreiecke | Einheiten (gezeichnet) | Partikel | Frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 1.0 | 953.9 | 1099.9 | 1099.9 | 5.6 | 3.7 | 1.8 / 1.8 | 4.9 | 67 | 464k | 2002 (1642) | 484 | 17 |
| medium | 0.5 | 1966.6 | 2199.8 | 2199.8 | 8.8 | 4.4 | 2.1 / 2.3 | 5.9 | 83 | 950k | 2002 (1712) | 1492 | 8 |
| high | 0.4 | 2347.8 | 2699.9 | 2699.9 | 9.0 | 4.1 | 2.0 / 2.1 | 5.7 | 84 | 1124k | 2002 (1720) | 2790 | 8 |

- Ziel JS-Zeit ≤ 8 ms auf Mittel: erreicht (4.4 ms, ohne Raster)
- Ziel Draw-Calls < 150: erreicht (max. 84)
- Ziel 60 FPS auf Mittel: nicht erreicht (0.5 FPS)
- Hinweis: Software-GL. Die FPS sind nur ein pessimistischer Richtwert; 60 FPS auf echter GPU sind damit weder bestätigt noch widerlegt (Lauf mit --hw auf einem Rechner mit GPU wiederholen).
