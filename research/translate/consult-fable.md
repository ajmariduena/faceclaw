# Traducir en vivo: consulta Fable (10 oct 2026)

## Resumen ejecutivo

1. Quedarse con Soniox `stt-rt-v5`: es el único proveedor verificado que emite la traducción token a token a mitad de frase sobre el mismo socket que el audio; los demás traducen por frase (Speechmatics, Gladia, Azure) o devuelven voz con texto de acompañamiento (OpenAI, Gemini). Precio ≈ US$0,18/h.
2. Nadie publica la latencia de la traducción. Hay que medirla con un harness en Node antes de tocar la interfaz; presupuesto objetivo: original parcial ≤ 0,6 s, primer glifo traducido ≤ 1,2 s, frase final ≤ 1,5 s tras callar.
3. Cambiar `two_way` por `one_way → es` y descartar en el modelo todo token con `language: "es"`: la voz de Alexander (y cualquier español) desaparece sin coste de latencia. Para el caso en que él hable inglés, etiqueta de diarización del portador fijada con la huella de voz que ya existe en el repo; la huella sola llega ≥ 1 s tarde y solo sirve para retractar.
4. El DOA del firmware no separa al portador de la persona de enfrente (ambos a ~0°); el array de 4 mics del G2 está afinado para la voz del portador, lo contrario de lo que queremos. Solo el SSR merece un experimento.
5. Presupuesto de pantalla: 5 líneas como máximo de las 8 que caben: frase actual (hasta 3 líneas, blanco), frase anterior (hasta 2, tenue), nada más. Original oculto; un tap lo muestra una línea (patrón «dual-view» de Even).
6. Cola no final en gris 187 y blanco solo lo final: las revisiones ocurren en la zona «blanda» y no parpadean; repintar parciales como máximo cada 120 ms; quitar el reloj por segundo del pie (hoy fuerza un frame BLE cada segundo).
7. Lo que hace Even: traducción sola, tap revela el original, actualizaciones por frase, 1–5 s de retraso según el usuario, y también transcribe al portador. Meta esconde al portador con beamforming de 5 mics y solo subtitula a quien miras (2,7 s en el dispositivo). Rokid y Captify reciben quejas justo por mostrar la voz propia y por el bloque de texto que se desplaza.
8. OpenAI `gpt-realtime-translate` es el único rival con un número medido mejor en arranque (711 ms al primer audio) pero fue el peor en comprensión, acumula hasta 20 s de rezago en habla densa, exige 24 kHz y siempre genera audio. Solo como comparación en el harness, no como principal.
9. No cascada STT + LLM como primer paso: Cerebras tarda ~285 ms pero retraducir prefijos produce las borraduras que arruinan a Azure (121 por 2 min). Reservarlo para si Soniox mide > 1,5 s de rezago.
10. Pruebas: harness `tools/translate-probe/latency.mjs` con audio 16 kHz a tiempo real (fixtures propios grabados con el mic del G2 + el audio público del benchmark de LiveLingo), trazas de tokens reproducidas en el renderer headless para contar parpadeos, y prueba real con `frame-timings.txt` para medir el coste BLE del frame.

---

## 1. Panorama de proveedores (texto traducido en streaming, ES⇄EN)

| Proveedor | Modelo | Primer texto traducido | Granularidad | Revisión | Precio | Dos vías / detección |
|---|---|---|---|---|---|---|
| **Soniox** | `stt-rt-v5` (jun 2026) | Sin cifra pública; «antes de que termine la frase». STT «sub-200 ms» es dicho del vendedor | Token a token, mezclado con el original en el mismo stream; tokens de traducción sin timestamps | Tokens `is_final:false` se reenvían revisados en cada respuesta; finales llegan una vez | $0,12/h STT RT + $4/1M tokens de salida (≈ +15k tokens/h por idioma) ≈ **$0,18/h** | `two_way` nativo; `one_way` traduce todo al destino; ID de idioma y diarización en el mismo modelo |
| **OpenAI** | `gpt-realtime-translate` (7 may 2026) | **711 ms** mediana al primer audio (p10–p90 485–1 012), medido por LiveLingo; deltas de transcript junto al audio | `session.output_transcript.delta` continuos; motor de 200 ms | El audio dicho no se revisa; el transcript sigue al audio | **$0,034/min = $2,04/h** | Un idioma destino por sesión; auto-detecta 70+ entradas; **omite habla que ya está en el idioma destino**; entrada PCM16 **24 kHz** obligatoria; `session.update` solo cambia `output.language`, transcripción y noise reduction (no se puede apagar el audio) |
| **Google** | `gemini-3.5-live-translate-preview` (9 jun 2026) | ~2,9 s al primer audio (LiveLingo, día de lanzamiento) | Voz; transcripts de entrada/salida como acompañamiento, **sin modo texto streaming** | Irrevisable | ≈ $2,2/h estimado por terceros | Un destino por sesión; también se calla ante habla en el idioma destino |
| **Azure Speech Translation** | TranslationRecognizer | Interinos desde ~0,9 s; final **4,8 s** mediana | Interinos por reconocimiento, no por palabra | **121 borraduras / 120 s** (alucina y retracta) | $2,50/h (hasta 2 destinos) | Auto-detección con candidatos; «Live Interpreter» es voz a voz |
| **Speechmatics** | `enhanced` + `translation_config` | Sin cifra; `enable_partials: true` da «traducciones de frases sin terminar» | Por frase parcial | Parcial → final por frase | Add-on $0,49/h + STT | Idioma fuente fijo por sesión (o ID), hasta 5 destinos; no hay modo dos vías |
| **Gladia** | Solaria-1 live | Parciales STT < 103 ms; traducción **por enunciado** | Evento por utterance | n/d | $0,75/h (Starter) | Detección automática; sin dos vías |
| **Palabra.ai** | Streaming API | «Sub-segundo», sin medición pública | Voz + subtítulos «progresivos» | n/d | ≈ $0,04/min | Dos vías ofrecido |
| **Deepgram** | nova-3 | — | **No tiene traducción**; su blog remite a iTranslate | — | — | — |
| **AssemblyAI** | Universal-3.6 Pro RT | — | **Sin traducción nativa**; su guía oficial traduce los finales con LLM Gateway (por frase) | — | — | — |
| **ElevenLabs** | Scribe v2 Realtime | 150 ms STT | **Sin traducción**; su demo usa la Chrome Translator API | — | — | — |

Notas:
- Soniox aclara que «los chunks de transcripción y traducción se siguen, pero los tokens no están alineados 1 a 1». Los tokens de traducción no llevan `start_ms`, así que el rezago de la traducción solo se puede medir desde el cliente (tiempo de llegada vs `end_ms` del último original).
- Soniox: `api_key` en el mensaje de inicio está **deprecado**; la clave va en el header `Authorization` o en los protocolos. Hay `endpoint_sensitivity` (−1..1), `endpoint_latency_adjustment_level` (0..3) y `max_endpoint_delay_ms` (500..3000, default 2000). Endpointing y finalización manual **reducen la precisión de la diarización**.
- Soniox Compare (`stt.compare.soniox.com`, MIT) emite la misma captura a varios proveedores a la vez; útil como segunda opinión, no mide traducción.
- El benchmark de LiveLingo (jun 2026, 3 clips VOA de 120 s, n=30) es el único con números comparables, y lo publica un competidor: tomar como orden de magnitud, no como veredicto.

Fuentes: soniox.com/docs/translation/stt-translation/rt-translation · soniox.com/docs/translation/stt-translation · soniox.com/docs/api-reference/stt/websocket-api · soniox.com/docs/stt/rt/endpoint-detection · soniox.com/docs/stt/concepts/speaker-diarization · soniox.com/pricing · soniox.com/blog/soniox-v5-real-time · openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api · developers.openai.com/api/docs/guides/realtime-translation · developers.openai.com/api/docs/models/gpt-realtime-translate · ai.google.dev/gemini-api/docs/live-api/live-translate · livelingo.io/research/benchmark-2026 · learn.microsoft.com/azure/ai-services/speech-service/speech-translation · docs.speechmatics.com/speech-to-text/features/translation · assemblyai.com/docs/streaming/guides/real_time_translation · elevenlabs.io/blog/how-scribe-v2-realtime-works · gladia.io/blog/openai-whisper-api-vs-gladia-a-technical-comparison-for-production-speech-to-text · blog.palabra.ai.

## 2. Recomendación y presupuesto de latencia

**Decisión: Soniox, afinado.** Razones: (a) único stream donde la traducción llega mientras el original sigue abierto; (b) la ID de idioma por token es lo que permite ocultar el español sin un segundo servicio; (c) la app ya tiene el cliente y la carpeta de tokens; (d) 10× más barato que OpenAI, y el coste no es el criterio pero tampoco compra nada mejor hoy.

**No híbrido como primer paso.** Soniox original + Cerebras (`gpt-oss-120b` vía OpenRouter, ~285 ms medido el 9 oct, `research/lean-ux-fable.md:71`) retraduciendo prefijos estables cada ~500 ms sería el patrón de Azure/Google Cloud, que LiveLingo mide en 121–353 borraduras por 2 min. La única versión que funciona es «commit monotónico de prefijos» (lo que vende LiveLingo, 1,5 s a final, cero borraduras), que es un proyecto en sí. Condición para abrirlo: que el harness mida un rezago de traducción de Soniox > 1,5 s p50 detrás del original.

**OpenAI realtime translate**, comparación de un día en el harness, no más: hay que remuestrear 16→24 kHz, pagar audio que se tira, y LiveLingo lo midió con 3,8 s mediana por enunciado y rezagos de hasta 20 s en habla densa, con la peor comprensión de 6 sistemas (4,53/5).

### Presupuesto mic → gafas

| Tramo | Estimación | Evidencia |
|---|---|---|
| Captura G2: paquete LC3 de 5 × 10 ms | 50 ms + intervalo BLE (~15–30 ms) + decode (~1 ms) | `Lc3PacketFramer.kt:23-26`; el raw tap manda cada paquete tal cual a Soniox (`translate-session.ts:60`) |
| Teléfono → Soniox (ida) | 40–80 ms desde Guayaquil a EE. UU.; **medir** | sin dato de región del endpoint |
| Soniox: original no final | 200–400 ms tras la palabra (dicho del vendedor, sin verificar) | soniox.com/platform |
| Soniox: primera traducción | **desconocido**; hipótesis 0,5–1,2 s tras la palabra, porque traduce «chunk a chunk» tras varios originales | docs rt-translation; **medir** |
| Vuelta + parse + fold | 40–80 ms + <5 ms | `soniox-stt.ts:171-217`, `translate-model.ts:37` |
| Pintar + enviar frame | paint pocos ms; Java composite+pack ~5 ms; el texto viaja como draws de glifos cacheados, no como píxeles; transferencia BLE **sin medir** | `faceclaw-communicator.ts:649-662`; exportar con `adb pull .../frame-timings.txt` (`FrameTimings.kt:21-22`) |
| Repintado del firmware | ≤ 45 ms | `research/02-mapa-arquitectura.md:32` |

Objetivo: original parcial en las gafas ≤ 0,6 s después de dicha la palabra; primer glifo traducido ≤ 1,2 s; frase final ≤ 1,5 s tras callar (clase LiveLingo, dentro del «ear-voice span» de 2–3 s de un intérprete humano y lejos de los 4 s donde cae la comprensión).

Dos sumideros propios de la app que hay que cerrar: cada respuesta de Soniox dispara `requestRender` sin coalescer (`translate-app.ts:139`, `in-process-window.ts:103`), y el tick de 1 s repinta el reloj «0:42» (`translate-app.ts:172-175`), lo que el deduplicado por huella (`dashboard-controller.ts:2628-2635`) no puede descartar porque el texto cambia: un frame BLE por segundo solo para el contador.

## 3. Nunca mostrar la voz de Alexander

Hechos del hardware y del repo:
- G2 tiene **4 micrófonos** «para aislar la voz del portador del ruido» (blog de Even «How we shaped Even G2»); Even promete captura a 2–3 m y «micrófonos direccionales que se enfocan en tu voz». El array está afinado al revés de lo que necesitamos.
- El firmware adjunta a cada paquete de 50 ms un **ángulo de llegada** (0° = enfrente, + a la derecha) y un **SSR** (ratio de intensidad) calculados sobre el estéreo antes del downmix (`Lc3PacketFramer.kt:31-36`, `voice-control.ts:85-93`). Solo llega mono: no hay beamforming posible en el teléfono.
- Ya existe un filtro de haz por ángulo que descarta paquetes fuera de `centro ± ancho` (`VoiceCaptureSession.kt:229-241, 465-477`) y la app Microphones lo expone como radar.
- Ya existe **huella de voz del portador**: enrolamiento (`mic-session.ts:763`, `speakers.ts:210`), embedding sherpa-onnx (`FaceclawSpeakerId.kt`), verificación por coseno con umbral 0,8 (`speakers.ts:19`), que hoy corre **una vez al final del enunciado** sobre ≥ 1 s de audio (`VoiceCaptureSession.kt:96-97, 674-700`) y solo en sesiones push-to-talk, no en el raw tap.
- Soniox: con `enable_speaker_diarization` cada token trae `speaker`; en tiempo real «cambios temporales de hablante que se estabilizan» y el endpointing baja la precisión.

Opciones, de mejor a peor (fiabilidad × coste de latencia):

| # | Mecanismo | Fiabilidad | Latencia | Cubre «él habla inglés» | Cubre «el otro habla español» |
|---|---|---|---|---|---|
| 1 | **Puerta de idioma**: `one_way` → `es` y descartar todo token con `language:"es"` (`none` u `original`) | Alta para lo que Alexander dice en español; la ID de idioma de v5 es por token y bien evaluada | 0 | No | Sí (se oculta, y él lo entiende de oído) |
| 2 | **Etiqueta de diarización del portador, fijada con la huella**: el teléfono embebe cada segmento cerrado; cuando uno da ≥ 0,8 con la huella, su `speaker` queda marcado como portador y desde entonces sus tokens se descartan **al llegar** | Media-alta; las etiquetas pueden cambiar, así que se re-verifica cada segmento y se re-fija | 0 tras la primera frase; durante la primera frase en inglés de Alexander puede escaparse 1 s de parcial | Sí | Sí |
| 3 | **Huella por segmento como retractor**: sin diarización, embeber ≥ 1 s del segmento abierto cada 250 ms y borrar el segmento si es el portador | Media (EER de pocos % con modelos 3D-Speaker); falla con enunciados cortos | Verdicto ~1 s tras el inicio: **solo retracta**, no previene; usado como puerta añadiría ≥ 1 s a todo | Sí | n/a |
| 4 | **SSR / energía de campo cercano**: la voz propia llega 10–20 dB más fuerte y simétrica a ambas sienes; umbral sobre el SSR del trailer o sobre RMS | Desconocida; ruido y gente que grita lo rompen | 0 (por paquete) | Sí si funciona | n/a |
| 5 | **Haz por DOA** | Baja para este fin: el interlocutor de enfrente y la boca del portador caen ambos cerca de 0°; solo sirve para tirar voces de los lados y de atrás | 0 | No | n/a |

Plan: 1 + 2 en producción; 3 como respaldo cuando la diarización esté apagada; 4 un experimento de una tarde (registrar ángulo/SSR mientras Alexander habla vs alguien a 1 m); 5 no.

Advertencia: `one_way` con habla ya en español es lo que la doc no especifica (si `translation_status` será `none` u `original` sin traducción); el harness lo confirma en la primera corrida. La puerta de idioma descarta por `language`, así que funciona en ambos casos. Cortar el audio antes de Soniox (opciones 4 y 5) es más barato pero amputa palabras del otro cuando falla; filtrar tokens no.

## 4. Pantalla: presupuesto de líneas y ejemplos

Geometría (del render y del test): contenido de y=14 a 236 con paso 27 px (8 líneas teóricas), regla del pie en 244, texto de 22 a 554 (≈ 40–45 caracteres por línea en la fuente stock; con «Larger» 28 px, 5 líneas siguen cabiendo: 5 × 28 + 12 = 152 ≤ 222).

**Presupuesto: 5 líneas como máximo, normalmente 2–4.**
- Frase actual: hasta **3 líneas**, anclada abajo (línea nueva en sitio fijo), blanco 255 lo final y **gris 187 la cola no final**; si excede, se conservan las últimas 3 con «…» (ya existe `wrapTail`).
- Frase anterior: hasta **2 líneas** en 120, encima, con hueco de 12 px. Se recorta a 2 con «…» al final (no al inicio).
- Original: **oculto**. Un tap lo muestra como **1 línea** en 120 debajo de la actual (entonces anterior baja a 1 línea: 3 + 1 + 1 = 5). Es el «dual-view» de Even.
- Nada de etiquetas de hablante en 1:1; en grupo, un prefijo «2 ·» de un carácter.
- Pie: «· Traduciendo  EN → ES» sin reloj por segundo (o minutos solos, «3 min»). «· Pausado» en blanco.
- Vacío por encima: ≥ 3 líneas libres de las 8, para que la cara del otro se vea.

«Original fantasma»: mientras la frase actual no tiene **ningún** token de traducción (los primeros 0,3–1 s), mostrar el original parcial en 120 en la posición de la frase actual; al llegar el primer token traducido se sustituye de golpe. Un solo cambio, no parpadeo, y la pantalla responde en < 0,5 s aunque la traducción tarde 1 s. Si el harness mide traducción < 0,7 s, quitarlo.

Reglas anti-parpadeo: finales solo crecen; la cola no final se repinta como máximo cada 120 ms; una revisión nunca mueve texto blanco; cambio de segmento solo con `<end>`, cambio de idioma o de hablante.

### Ejemplo A: el otro pregunta (EN → ES), ~2,4 s de habla

```
t = 0,5 s  (solo originales no finales; «original fantasma»)
┌──────────────────────────────────────────────┐
│                                              │
│  Perfecto, nos vemos a las ocho.       (120) │
│                                              │
│  Do you know where                      (120)│
│──────────────────────────────────────────────│
│ · Traduciendo  EN → ES                       │
└──────────────────────────────────────────────┘

t = 1,0 s  (primeros tokens de traducción)
│  Perfecto, nos vemos a las ocho.       (120) │
│                                              │
│  ¿Sabes dónde queda                     (187)│

t = 2,0 s
│  Perfecto, nos vemos a las ocho.       (120) │
│                                              │
│  ¿Sabes dónde queda la estación de     (255) │
│  tren                                   (187)│

fin (~3,0 s, llega <end>)
│  Perfecto, nos vemos a las ocho.       (120) │
│                                              │
│  ¿Sabes dónde queda la estación de     (255) │
│  tren más cercana?                      (255)│
```

### Ejemplo B: Alexander responde (ES) y luego mete una frase en inglés

Él: «Sí, está a dos cuadras, junto al mercado.» → tokens `language:"es"` descartados; **la pantalla no cambia**. Él: «Take the second left» → si la etiqueta de portador ya está fijada, nada; si es su primera frase en inglés, puede aparecer «Toma la segunda» en 187 durante ≤ 1 s y la huella lo retracta (la frase desaparece y la anterior vuelve a ocupar el sitio). Ese es el único caso en que se borra texto, y nunca texto blanco.

```
│  ¿Sabes dónde queda la estación de     (120) │
│  tren más cercana?                      (120)│
│                                              │
│                                       (vacío)│
```

### Ejemplo C: monólogo de 25 s del otro

El endpointing semántico parte el monólogo en frases; cada `<end>` convierte la actual en «anterior». Dentro de una frase larga, se ven las últimas 3 líneas con «…».

```
t = 9 s
│  Mira, la estación queda cerca, pero   (120) │
│  los domingos cambia el horario:…      (120) │
│                                              │
│  abren a las ocho y el último tren     (255) │
│  sale a las nueve de la noche, así    (255)  │
│  que si vas a viajar tarde            (187)  │

t = 25 s (frase 4 en curso)
│  …comprar el boleto antes y llegar     (120) │
│  con tiempo.                            (120)│
│                                              │
│  Siempre hay fila en la boletería,     (255) │
│  sobre todo los                         (187)│
```

### Ejemplo D: interrupción y solapamiento

Ambos hablan a la vez 1,5 s. Soniox etiqueta hablantes; los tokens del portador se descartan por idioma o etiqueta; los del otro siguen en la frase actual aunque la traducción salga más literal. El segmento se cierra por cambio de hablante (hoy solo por idioma, `translate-model.ts:67`), así que lo del otro antes y después de la interrupción queda en dos bloques y no se mezcla con restos.

```
│  Siempre hay fila en la boletería.     (120) │
│                                              │
│  Pero si quieres yo te                 (255) │
│  acompaño                               (187)│
```

### Ejemplo E: revisión rechazada

Soniox manda no final «…la estación de **trenes**» y luego el final «…de tren más cercana?». Como la cola no final está en 187, el cambio ocurre en gris; el blanco solo avanza.

```
t = 1,8 s
│  ¿Sabes dónde queda la estación de     (255) │
│  trenes                                 (187)│
t = 2,1 s
│  ¿Sabes dónde queda la estación de     (255) │
│  tren más                               (255)│
│  cercana                                (187)│
```

Hablante: sin atribución visible en 1:1. La atribución real la hace la puerta (qué se descarta), no una etiqueta.

## 5. Qué hacen Even y la competencia (y por qué el diseño es este)

**Even Realities Translate (stock G2).** Página oficial: «dual-view»: se ve la traducción, y un tap en el TouchPad muestra el original al lado; 33 idiomas en la nube; mic útil a 2–3 m. Usuarios en r/EvenRealities: 0,5–1 s con buena conexión y «≈ medio segundo en silencio 1:1» (reseña de 5 meses), pero otros reportan «un par de segundos», actualizaciones que llegan en bloque tipo párrafo cuando la red es lenta, y fallos con italiano rápido; el hilo «Wearer speech translation» confirma que **también transcribe y traduce al portador** (la gente lo usa para leer en voz alta y verlo traducido). VisibleCompute (no hands-on) pone 3–5 s. El proyecto `intelc/soniox-translate` (EvenHub + Soniox, jun 2026) nació justo de ese retraso: «las palabras aterrizan uno o dos segundos después»; su diseño: original arriba, traducción abajo, **línea nueva anclada abajo en sitio fijo**, `Max lines`, lista «Don't translate: es, fr» (nuestra puerta de idioma) y etiquetas de hablante opcionales.
Fuentes: evenrealities.com/translation-glasses · evenrealities.com/blogs/even-insider/how-we-shaped-even-g2-from-the-outside-in · reddit.com/r/EvenRealities/comments/1t71epi · …/1sxtjp1 (wearer speech) · …/1s6njn9 (really disappointed) · reddit.com/r/SmartGlasses/comments/1wdfiym · visiblecompute.com/blog/smart-glasses-live-translation-tested · github.com/intelc/soniox-translate.

**Meta Ray-Ban Display.** Subtítulos y traducción en la pantalla de 600×600 solo de **la persona que miras**: «mira a otro lado y los subtítulos paran» (UploadVR); el array de 5 mics con beamforming «distingue al portador de su interlocutor» (blog de ingeniería de Meta); lo que dice el portador va traducido **al teléfono**, que se le muestra al otro. Latencia: Meta bajó de 5+ s a **2,7 s** en el dispositivo; reseñas hablan de 0,5–2 s. Quejas: se pierde habla rápida, hay que mirar fijo al otro, 4 idiomas.
Fuentes: meta.com/blog/live-translation-ai-glasses-deep-dive · meta.com/ai-glasses/learn/live-translation-captions · uploadvr.com/meta-ray-ban-display-review · tomsguide.com/computing/smart-glasses/meta-ray-ban-display-review.

**Rokid Glasses.** Microsoft Translator, texto verde en «líneas cortas» en la parte baja; un usuario: «traducía mi propia voz también y no sabía de quién era lo que leía»; «menos de un segundo» es dicho del fabricante.
**Captify Pro.** PCMag: «un solo bloque de texto que se desplaza, a veces párrafos enteros», sin identificar hablantes (prometido para Premium); retrasos de 10–20 s reportados.
**XRAI Glass / TranscribeGlass / Vuzix.** Identificación de hablante solo en tiers de pago; sin ella, el solapamiento es «un revoltijo»; TranscribeGlass dibuja «una banda fina de texto abajo»; Vuzix+TranscribeGlass promete < 300 ms (dicho del vendedor).
**INMO Air 3, Brilliant Halo, XREAL.** Sin diseño documentado de subtítulos; XREAL depende de la app (XRAI).
Fuentes: global.rokid.com/blogs/academy-glasses/3-2-real-time-translation · reddit.com/r/rokid_official/comments/1q3b1p5 · pcmag.com/reviews/captify-pro · apps.apple.com/.../xrai-glass · uploadvr/tomsguide arriba.

Justificación del diseño: ocultar al portador es lo que Meta logra con hardware y lo que a Rokid y Even les reprochan; «traducción primero, original a un tap» es la convención de Even y de intelc; línea nueva en sitio fijo y pocas líneas evitan el bloque de Captify; sin etiquetas en 1:1 porque la atribución la hace el filtro.

## 6. Plan de pruebas

**Claves.** Soniox (ya en ajustes, `sonioxApiKeySetting`). Opcional para comparar: OpenAI (realtime translations) y un trial de Speechmatics. Gemini no (sin texto streaming).

**Fixtures (16 kHz mono PCM/WAV), carpeta `tests/fixtures/translate/`:**
1. 12 frases EN por un hablante no nativo a 1 m, grabadas **con el mic del G2** (la ruta `saveRecordings` de `voice-control.ts:291` existe; el raw tap la apaga en `:244`, habilitarla en el probe).
2. 12 frases ES de Alexander con el G2 puesto (para la puerta de idioma y la huella).
3. Diálogo ES/EN de 2 min con 3 solapamientos y una pregunta en español del otro.
4. `audio.zip` del benchmark de LiveLingo (30 enunciados EN) y el clip VOA es→en (dominio público), para comparar con sus números.
5. Diálogos sintéticos por TTS con timestamps por palabra (Soniox TTS o ElevenLabs) como verdad de terreno.

**Harness `tools/translate-probe/latency.mjs`** (base: `tools/paseo-probe/dictation.mjs` para el replay a tiempo real en chunks de 100 ms; `tools/conversar-probe/latency.mjs` para la tabla de medianas y adaptadores por proveedor):
- Adaptadores: `soniox` (ws, header `Authorization`, `one_way`/`two_way`, flags de endpoint), `openai` (ws `/v1/realtime/translations`, remuestreo a 24 kHz, chunks de 200 ms, `session.output_transcript.delta`), `speechmatics` (`enable_partials`).
- Por token guardar `t_arrival`, texto, `is_final`, `translation_status`, `language`, `speaker`, `start_ms/end_ms`. Guardar la traza JSON completa.
- Métricas por enunciado: **TTF-original** (llegada del primer no final − `start_ms` de la primera palabra + offset del stream), **TTF-traducción** (llegada del primer token de traducción − `start_ms`), **rezago de traducción** (llegada de cada chunk traducido − `end_ms` del último original que cubre), **final** (`<end>` − fin del audio), **borraduras normalizadas** (tokens no finales retirados / tokens finales), **fugas** (tokens `es` o del portador que habrían llegado a pantalla).
- Correr desde la Mac y **desde el teléfono por tethering** (la ruta real es móvil). Repetir 3 veces; reportar p50/p90.
- Variantes Soniox: `two_way` vs `one_way`; endpoint `level 0/2`, `max_endpoint_delay_ms 2000/1000`, `endpoint_sensitivity 0/0.3`; con y sin diarización.

**Renderer headless** (`tools/headless-render/translate-app.test.cjs`): añadir un test que reproduzca una traza real del harness token a token con el reloj falso, saque PNG a 0,5/1/2 s y al final de cada enunciado, y cuente (a) frames en que texto blanco cambió (debe ser 0), (b) frames por segundo de parciales (≤ 8), (c) líneas pintadas por frame (≤ 5), (d) tokens `es` visibles (0).

**Gafas reales** (`build_and_run.sh`, `adb logcat`, `adb pull /sdcard/Android/data/<pkg>/files/frame-timings.txt`):
- Medir spans `paint`/`submit` por frame y el tamaño del frame (draws vs píxeles) durante 2 min de traducción; contar frames/min.
- Extremo a extremo con marca: reproducir la fixture 1 por un altavoz a 1 m y filmar la lente a 240 fps junto al altavoz, o más simple: registrar `Date.now()` en el primer token traducido y en el `submit` completado, más el contador de paquetes LC3 para fechar el audio.
- Prueba de voz propia: 20 frases ES + 10 EN de Alexander con alguien enfrente; **0 fugas** admitidas, retracciones ≤ 1 s.
- Prueba «el otro habla español»: nada en pantalla, sin pausa.
- Umbrales de aceptación: original parcial p50 ≤ 0,6 s; primer glifo traducido p50 ≤ 1,2 s, p90 ≤ 2 s; final p50 ≤ 1,5 s; ≤ 1 borradura visible por 120 s; ≤ 5 líneas siempre.

## 7. Ajustes concretos al código

1. `app/apps/translate/translate-session.ts:21`: `TRANSLATION` → `{ type: "one_way", target_language: "es" }`; pasar `language_hints: ["en","es"]` sin `strict`.
2. `app/native/soniox-stt.ts:63-77`: la clave al header (`FaceclawWebSocket(url, listener, "Authorization", "Bearer …")`, `FaceclawWebSocket.kt:27`) y fuera `api_key` del JSON; añadir `max_endpoint_delay_ms`, `endpoint_latency_adjustment_level`, `endpoint_sensitivity`, `context.translation_terms`, `client_reference_id: "translate"`; conservar `start_ms/end_ms/speaker` en `SonioxToken` (`:25-32`) y sellar `receivedAtMs` en `handleMessage` (`:171`) para la telemetría.
3. `app/apps/translate/translate-model.ts:37-73`: descartar tokens con `language === "es"` (y `translation_status !== "translation"`) antes de plegar; descartar tokens cuyo `speaker` sea la etiqueta del portador; cerrar segmento también por cambio de `speaker` (`:67`); exponer la cola no final por separado en `segments()` (`:106-120`) en vez de concatenarla, para pintarla en 187.
4. `app/apps/translate/translate-model.ts:21`: `MAX_SEGMENTS` 60 → 8.
5. `app/apps/translate/translate-painter.ts:29-31`: `NEWEST_LINES` 4 → 3, `NEWEST_ORIGINAL_LINES` 2 → 0 (1 cuando el tap lo activa), `OLDER_LINES` 2 y **un solo** bloque anterior en el bucle de `paintTranslate` (`:110`); «original fantasma» cuando `translation === ""`; cola no final en 187.
6. `app/apps/translate/translate-app.ts:139`: coalescer `requestRender` de parciales a 120 ms (los finales y `<end>` inmediatos); `:172-175`: no repintar por el reloj, o mostrar minutos.
7. `app/apps/translate/translate-app.ts:87-92`: el tap hoy pausa; pasar «pausar» al doble tap o a tap largo y usar el tap para alternar el original, siguiendo el gesto stock de Even.
8. Nuevo gancho de portador: desde `translate-session.ts:60` alimentar un `WearerGate` que (a) embeba cada segmento cerrado con `wearerVerificationOptions()` (`speakers.ts:300-311`) y fije `speaker` como portador, (b) retracte el segmento si es el portador y la etiqueta no estaba fijada; requiere exponer la embebida por utterance fuera de `runSpeakerVerification` (`VoiceCaptureSession.kt:674`) para el raw tap.
9. `app/native/voice-control.ts:244`: dejar `saveRecordings` configurable para grabar fixtures con el mic del G2.
10. Experimento SSR: suscribirse a `onFrameMeta` (`voice-control.ts:220`) desde la sesión y registrar `ssr`/ángulo por paquete junto a los tokens, para decidir si la opción 4 vale.
