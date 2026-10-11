# Consulta Astra — traducción cara a cara, 10 de octubre de 2026

1. Mantener Soniox `stt-rt-v5` como candidato base; no cambiar proveedor sin medir primer texto traducido y calidad ES/EN.
2. Compararlo primero con OpenAI `gpt-realtime-translate` y Gemini `gemini-3.5-live-translate-preview`, ambos con texto incremental.
3. “Nunca traducir ni mostrar mi voz” exige filtrar audio antes del traductor; ocultar tokens después no cumple.
4. Faceclaw ya tiene inscripción de voz, embeddings y dirección de llegada; Translate los desactiva actualmente.
5. Un filtro por idioma no identifica a Alexander: falla si habla inglés o el interlocutor habla español.
6. Usar español como destino y una pantalla de dos líneas actuales, una anterior opcional y un pie discreto.
7. Original oculto por defecto; ninguna transcripción propia, historial propio ni burbuja “Tú”.
8. Objetivo inicial sin identificación adicional: primer glifo en 0,7–1,5 s; es presupuesto propuesto, no medición.
9. El bloqueo automático conservador de voz puede añadir 0,5–1,2 s; todavía no demuestra cero fugas.
10. Aprobar solo con corpus bilingüe, métricas por tramo, pruebas de revisiones y vídeo a través de las lentes.

## Decisión y alcance

**Recomendación:** conservar Soniox, corregir selección de audio y presentación, y ejecutar un A/B/C Soniox–OpenAI–Gemini con idénticos audios. La exclusión de voz propia es ahora el criterio dominante: la API más rápida no sirve si traduce a Alexander. No afirmar que la experiencia actual supera Even ni que su proveedor es “barato”: no identifiqué públicamente el modelo de producción de Even.

Lectura del checkout `2505ab405c50e1758a72ca19e5058d07666bec52`; solo se escribe este informe. **Confirmado** significa código o documentación leída; **objetivo/inferencia** no significa benchmark; **pendiente** requiere ejecución o dispositivo. Ninguna latencia de Faceclaw o proveedor fue medida aquí. Investigación con Context7, Perplexity, TinyFish, deep-research (Perplexity + Parallel), páginas primarias y lectura GitHub autenticada como `ajmariduena`. Exa devolvió 402 sin crédito; Gemini figuró sin saldo. Algunas páginas se recuperaron desde caché reciente.

## Proveedores: texto traducido, no velocidad de STT

**TTFT-T** = tiempo desde inicio acústico de la frase hasta primera palabra traducida útil recibida; distinto del primer token original, del final de frase y del audio sintetizado. Ninguna documentación examinada ofrece un p50/p95 comparable de TTFT-T ES/EN. “No publicado” no significa lento. Los precios siguientes son de lista, sin impuestos, para el modo indicado.

| Proveedor actual | Entrega y revisiones | Idioma/direcciones | Precio y TTFT-T verificable |
|---|---|---|---|
| **Soniox `stt-rt-v5`** | Texto traducido a mitad de frase, tokens/subpalabras. Contrato general: `is_final=false` se reemplaza, finales se acumulan una vez; falta observar frecuencia y revisiones de traducciones no finales reales. Original y traducción no tienen alineación 1:1; traducción sin timestamps. | `two_way` ES/EN nativo, `one_way` a ES; identificación por token y diarización. | ~**$0,18/h** traduciendo; STT solo ~0,12/h. Facturación real por tokens: audio RT $2/M, texto entrada/salida $4/M. TTFT-T numérico **no publicado**. [S1–S3] |
| **OpenAI `gpt-realtime-translate`** | Endpoint `/v1/realtime/translations`; `session.output_transcript.delta` mientras entra audio; también original y audio. Referencia define deltas append-only, sin reescritura retroactiva. `elapsed_ms` alinea, no identifica un delta. Medir correcciones semánticas añadidas y flush. | Detecta fuente, 70+ entradas/13 salidas; ES/EN disponibles. Una sesión por destino; dos sesiones/ruteo para doble vía, no confundir con `two_way` Soniox. | **$0,034/min = $2,04/h por sesión**. Descartar audio localmente no implica descuento ni modo exclusivamente textual facturado. TTFT-T **no publicado**. WS exige PCM16 24 kHz. [S4] |
| **Google Gemini `gemini-3.5-live-translate-preview`** | Live dedicado; audio traducido y `output_transcription` incremental opcional. Configuración publicada usa `response_modalities=[AUDIO]`; verificar semántica de deltas/finalización, no asumir estabilidad palabra a palabra. | 70+ idiomas; destino fijo por sesión; `echo_target_language=false` silencia entrada en destino. Dos destinos requieren orquestación adicional. | Audio entrada **$0,0053/min**, salida **$0,0315/min**; ~**$2,21/h** solo si duran igual. TTFT-T **no publicado**; PCM16 16 kHz entrada. Preview. [S5] |
| **Google Cloud STT + Translation** | Cascada: parciales de STT → solicitudes de traducción. Revisión y ritmo dependen de nuestra política; traducción de texto por petición no equivale a traducción de voz incremental nativa. | Depende del modelo/identificación elegidos; ES/EN factible. | STT V2 Standard **$0,016/min (~$0,96/h)**, primer tramo; Translation NMT **$20/M caracteres por destino**, después del crédito de 500.000 caracteres/mes. No reutilizar precio de Gemini ni inventar TTFT-T. [S13] Menor prioridad que Live Translate para este ensayo. |
| **Speechmatics Enhanced; Melia 1 en catálogo** | `translation_config.enable_partials=true`: `AddPartialTranslation` de frases incompletas; finales `AddTranslation`, normalmente al concluir oración, ya no se revisan. Por defecto solo finales. | Enhanced configura fuente; hasta cinco destinos. Melia 1 detecta varios idiomas pero **no admite traducción**, según tabla oficial. Enhanced tiene pack bilingüe ES/EN; su combinación con traducción queda por probar. | Página muestra Enhanced **$0,38/h** y traducción **$0,49/h**; confirmar selector RT/descuentos/cuenta antes de cotizar total (extracción no preserva selector). Melia STT $0,12/h. TTFT-T **no publicado**. El “<1 s” de STT no demuestra traducción. [S6] |
| **Azure Speech Translation** | `Recognizing` da traducciones intermedias reemplazables; `Recognized` final. La modalidad multilingüe sin candidatos de idioma no ofrece intermedios según guía; verificar modalidad/SDK concretos. | Fuente explícita o identificación de candidatos; ES/EN y hasta dos destinos incluidos en tarifa estándar. | Standard **$2,50/h**. Live Interpreter separado: entrada $1/h + texto $10/M caracteres + audio si se usa. TTFT-T **no publicado**. [S7] |
| **Deepgram Nova-3 Multilingual / Flux Multilingual** | APIs consultadas de reconocimiento; para traducción propongo cascada. Nova ofrece `interim_results` revisables; no atribuir traducción nativa a esos eventos. | Nova identifica/cambia idiomas; ES/EN. Direcciones las decide traductor externo. | Nova RT **$0,0058/min (~$0,348/h)**; Flux multi $0,0078/min; sumar MT/LLM. TTFT-T **no publicado** para cascada. [S8] |
| **AssemblyAI Universal-3.6 Pro Realtime** | Guía oficial de traducción usa LLM Gateway tras `end_of_turn`; esa receta espera final, pero es una elección del ejemplo, no una obligación matemática de las cascadas. Parciales originales disponibles; revisiones de traducción serían nuestras. | 32 idiomas en 3.6; alternativa Universal-Streaming Multilingual incluye ES/EN. | 3.6 **$0,45/h**, Universal-Streaming multi $0,15/h, más LLM; diarización +0,12/h. TTFT-T **no publicado**. [S9] |
| **ElevenLabs Scribe v2 Realtime** | STT `partial_transcript` revisable y `committed_transcript`; `transcript_edit` edita segmentos comprometidos (+30%), pero su uso para traducción no está confirmado. Cascada externa como base; no confundir Dubbing batch con streaming. | 90+ idiomas; verificar identificación y cambios con corpus ES/EN. | **$0,39/h** mostrado en API pricing; más traductor. El reclamo **~150 ms** corresponde a transcripción, no TTFT-T. [S10] |

**Otros:** Azure merece entrar como control con parciales. Cartesia Ink puede ser otro frontend STT, pero no hay motivo probado para ampliar primero el ensayo: todavía falta medir los tres candidatos directos. `soniox/soniox-compare` contiene adaptadores ejecutables de Soniox/OpenAI/Gemini/Speechmatics/Azure; su tabla de competidores es evidencia de su implementación, no autoridad neutral sobre todo el mercado. Repositorio MIT, no archivado, último push consultado 2026-10-07; HEAD remoto leído `2964552eda738440e13d67fd16acae9904e1387d`; leer/adaptar contrato, no adoptar su ranking. [S11]

La consulta profunda coincidió en Soniox como primer candidato y en la ausencia de TTFT-T comparable; discrepó en tarifas Speechmatics/ElevenLabs. Se priorizan páginas primarias, dejando pendiente el selector RT de Speechmatics. No se adoptan sus recomendaciones basadas en ahorro: el precio no decide aquí.

El plan local contiene una premisa incorrecta: **un LLM en cascada no necesita esperar toda la oración**. Puede traducir prefijos estables; el coste es contexto incompleto, reordenamiento y reescrituras. Ensayo opcional: Soniox STT sin traducción → prefijo de 3–6 palabras estable durante 150–250 ms → LLM rápido, con una solicitud activa, cancelación/revisión numerada y contexto corto. No fijar Cerebras u otro modelo como ganador sin benchmark actual. Nunca enviar prefijos de voz propia; nunca usar un LLM para inventar el final aún no oído. Solo promover híbrido si mejora p95 o precisión sin aumentar fugas/revisiones.

## Nunca traducir ni mostrar la voz de Alexander

**Hecho local decisivo:** ya existen `FaceclawSpeakerId.kt:49` (embedding por utterance, mínimo aproximado 0,5 s), `app/apps/microphones/speakers.ts:210` (enrollment) y `:225` (comparación con wearer; umbral actual 0,8). No desarrollar esto de cero. Pero **no es un separador de audio** ni garantía de identidad en solapamiento.

`app/native/voice-control.ts:219` expone DoA/SSR. `mic-session.ts:77` documenta cuatro micrófonos: dos por patilla. Ruta stock: mono mezclado 16 kHz, LC3 y metadatos cada 50 ms; ruta extendida CFW: pares PCM por patilla, beamforming delay-and-sum y cancelación NLMS en teléfono. `startRawCapture():245–250` desactiva supresión, beam y verificación; es la ruta actual de Translate. La verificación de `VoiceCaptureSession.kt:668` opera al finalizar y **falla abierta** para comandos. No invertir un booleano y llamarlo exclusión segura.

| Método, orden recomendado | Fiabilidad respecto de “nunca” | Latencia/coste propuesto |
|---|---|---|
| **1. Control explícito de escucha + bloqueo antes de red** | Más controlable: escuchar solo al interlocutor; al hablar Alexander, puerta cerrada y PCM propio nunca enviado. Depende de uso correcto; no resuelve que hable mientras deja abierto. Solapamiento: bloquear todo. | Casi ningún cómputo; coste de interacción. Para validación estricta inicial, usar botón/ring/estado visible, sin presentarlo como manos libres automático. |
| **2. Enrollment local + clasificación continua conservadora + DoA** | Mejor opción automática a investigar. Tres estados `OTHER / SELF / UNKNOWN`; solo OTHER habilita traducción. Cambio/solapamiento/inseguridad vuelve a UNKNOWN y bloquea. Falsos negativos siguen siendo posibles: no prometer garantía absoluta. | Buffer de voz 0,5–1,2 s como hipótesis, más inferencia móvil medida. Ventana deslizante y retención de audio también al cambiar hablante: identificar una vez al inicio no basta. |
| **3. Micrófono remoto próximo al interlocutor + gate** | Mejora relación señal/voz propia; útil en reuniones. No garantiza aislamiento acústico si Alexander está cerca. Fuente externa/turnos separados ayudan más que un filtro de idioma. | Buffer/conexión a medir; requiere hardware o teléfono ubicado cerca del otro. |
| **4. DoA/beamforming G2 únicamente** | Rechaza direcciones, no identidades; reflexión, cabeza girada, proximidad y voz propia frontal pueden fallar. Stock gate silencia mezcla completa, no extrae al otro de una mezcla. | Metadatos stock cada 50 ms; cómputo pequeño, latencia end-to-end pendiente. Modo 4 mics exige capacidad CFW y medir congestión BLE. |
| **5. Diarización Soniox + mapping speaker→wearer** | Útil defensa de pantalla y evaluación, insuficiente para “nunca traducir”: el servicio ya recibió/tradujo. IDs anónimos, inestables al inicio/reconexión; no son identidad biométrica. | Esperar atribución añade tiempo no publicado; finalización agresiva reduce su precisión según Soniox. [S12] |
| **6. One-way ES + descartar fuente ES** | Solo heurística de dirección: pierde español del interlocutor y deja pasar inglés propio. Gemini echo=false tiene el mismo límite conceptual. No cumple el requisito. | Bajo coste adicional después de identificar idioma; no proporciona identidad. |
| **7. Umbral de energía/VAD** | VAD distingue voz/silencio, energía distancia/intensidad; ninguno identifica persona. No autorizar audio por volumen bajo/alto. | Milisegundos de procesamiento; únicamente señal auxiliar. |

**Contrato propuesto:** traducción unidireccional a español, detrás del gate de identidad; SELF/UNKNOWN no producen texto, historial ni solicitudes de traducción. El español del interlocutor puede mostrarse como subtítulo original si se desea seguir la conversación; no hay que traducirlo a inglés. Si se quiere solo ayuda con inglés, ocultar ese español por preferencia de idioma **después** del filtro de persona. Los ejemplos iniciales ES→EN quedan como fixtures del motor, no como comportamiento por defecto para Alexander.

En uso automático, es incorrecto prometer “cero errores” con biometría probabilística. Si “nunca” es literal, el producto debe bloquear cuando no puede establecer fuente autorizada y mantener control explícito de turnos. Una sesión ciega enviada a Soniox y borrada después incumple aunque la pantalla quede limpia. Audio/embeddings del enrollment locales; no persistir audio propio incidental para “mejorar” el clasificador sin necesidad.

## Presupuesto de latencia y coste del display

Estimaciones de ingeniería para conexión caliente, no resultados:

| Tramo | Presupuesto de ensayo |
|---|---:|
| Micrófono, DSP/LC3 y paquete BLE de entrada | 50–120 ms; el código describe paquetes stock de 50 ms |
| Decode/cola teléfono/envío WS | 5–30 ms |
| Transporte ida+vuelta agregado | 60–180 ms; medir desde Guayaquil/red real |
| Contexto acústico + traducción incremental del proveedor | 300–900 ms; principal incógnita |
| Coalescing de UI | 0–120 ms; primer contenido se envía inmediatamente |
| Paint/composición | 5–20 ms |
| Transferencia BLE de salida/ACK/presentación | 100–350 ms de objetivo para cambios pequeños |
| **Suma orientativa sin clasificación extra** | **0,52–1,72 s**; objetivo inicial típico **0,7–1,5 s** |
| **Gate automático conservador adicional** | **0,5–1,2 s** de hipótesis; total ~1–3 s, sujeto a medición |

No sumar latencia publicada “audio→texto” a transporte si ya lo incluye. Registrar qué reloj/corte usa cada proveedor. Ni el endpoint de Soniox a 500 ms ni un panel a 60 Hz significan primera traducción visible a esas velocidades.

Hay evidencia histórica en código de un round-trip BLE de **124 ms** (`GlassesSessionSend.kt:193`) y de un upload de **11 KB ACK a 536 ms** (`CfwMessageWindow.kt:13`). No son benchmarks actuales de Translate. `GlassesSessionSend.kt:607` termina el frame al ACK; eso no demuestra iluminación del píxel. Medir cambios de 1 palabra, 1 línea, 2 líneas y salto de frase **con mic abierto**. Evitar repintar todo por cada token o por el reloj de segundos.

Política: primer texto inmediato; después máximo ~5 actualizaciones/s, coalescing leading/trailing, un frame en vuelo y el siguiente más reciente. Es objetivo a adaptar al p95 de ACK; si tarda 300 ms, no acumular cinco frames obsoletos. Sin ticker animado, typewriter, fade ni scroll suave. Los cambios de identidad/reconexión invalidan versiones en vuelo antes de mostrarlas.

A/B Soniox: configuración actual contra `endpoint_latency_adjustment_level=1` y `max_endpoint_delay_ms=800`; probar 500/1500 después si el corpus lo justifica. Cambia finalización, no garantiza TTFT-T. No forzar `finalize` cada pocas palabras: perjudica contexto y diarización. No introducir `max_non_final_tokens_duration_ms` con valores adivinados: confirmar contrato/modelo si se experimenta. [S2, S12]

## Diseño: conversación compacta

**Tres líneas de contenido como máximo:** dos líneas actuales (blanco final 15/15, provisional 11/15); tercera línea opcional con la cláusula anterior (7/15). Una línea de pie con estado e idioma, sin cronómetro por segundos. Ancho real 532 px (`LEFT=22`, `RIGHT=554`), pitch 27 px: contenido 81 px más aire; anclar en zona inferior-media, dejando centro/arriba libres. La fuente real decide saltos; no usar un límite de caracteres como sustituto de `measureLine`.

No original permanente. Un gesto podría revelar **el original del interlocutor** reemplazando la frase actual, nunca sumando líneas. Evitar header de hablante para dos personas: solo aparece el interlocutor. En grupo, etiqueta corta A/B al inicio de la primera línea, solo si estable; no nombre adivinado. Footer direccional “EN a ES” o icono dibujado, no ES⇄EN ni glifo no soportado.

Mostrar palabras completas, actualizar solo cola provisional, mantener quiebres de línea ya leídos. Una corrección necesaria reemplaza la cola aunque haya cambiado sentido: no congelar una hipótesis equivocada para eliminar flicker. No llamar “final” a un prefijo solo porque no cambió en dos mensajes. Al superar dos líneas: avanzar por cláusulas completas; conservar una línea anterior si cabe, marcar corte con puntos suspensivos; jamás resumir u omitir negaciones silenciosamente. Historial solo bajo demanda.

**Cuatro secuencias de diseño.** Los tiempos son storyboards hipotéticos desde inicio de audio, no salidas observadas ni promesa. `~` marca texto provisional aquí; en gafas será intensidad 11/15, sin el carácter. Cada bloque tiene ≤3 líneas de contenido; el pie se omite por repetitivo.

### A. Pregunta y respuesta propia

Fixture bilingüe original: interlocutor dice «¿Sabes dónde queda la estación de tren más cercana?». Para probar ES→EN el motor podría emitir `Do you know…` / `Do you know where…` / `the nearest train station…` / pregunta final. **En el modo elegido a español**, si el hablante ajeno está admitido, se muestra su español sin retraducción; si el idioma se filtra, permanece vacío. Secuencia principal equivalente del interlocutor en inglés:

```text
0,5 s                 1,0 s                 2,0 s
~¿Sabes…              ~¿Sabes dónde         ¿Sabes dónde queda
                       queda…               ~la estación de tren…

Final (~3,5 s)         Alexander responde: «Two blocks away.»
(¿Sabes dónde queda…) [misma pregunta retenida; ninguna palabra propia]
la estación de tren   [al cerrar escucha se atenúa; luego se limpia]
más cercana?
```

En el final, la primera línea entre paréntesis representa contexto previo tenue (los paréntesis no se dibujan); las otras dos son la cláusula actual. Si la medida real permite la pregunta completa en dos líneas, no paginar. Así se conserva el sentido sin reducir letra ni superar 2+1 líneas.

### B. Monólogo, otras 20–30 s de conversación

Interlocutor: “Take the second left, walk past the pharmacy, and the station is across from the park. The ticket office closes at six.”

```text
0,5 s                 1,0 s                 2,0 s
~Gira…                ~Gira en la           Gira en la segunda
                       segunda calle…       a la izquierda.

A mitad               Final
Gira a la izquierda.  La estación está frente al parque.
Pasa la farmacia;     La taquilla cierra
~la estación está…    a las seis.
```

Primera línea tenue es el único contexto anterior; no aumentar líneas ni hacer desfilar el párrafo acumulado. Saltos ilustrativos: medir especialmente la línea del parque.

### C. Interrupción y solapamiento

Interlocutor: “The train leaves at…”; Alexander interrumpe “At six?” mientras el otro dice “seven”.

```text
0,5 s                 1,0 s                 2,0 s (solapamiento)
~El tren…             ~El tren sale…       El tren sale…
                                            [sin nueva frase]

Final, interlocutor repite solo «Seven, platform two.»
A las siete,
andén dos.
```

Durante mezcla se bloquea el audio completo; no fabricar un “seis” traducido, no enseñar “Tú:”. Pie puede indicar “Voces superpuestas” si existe detector confiable. Si no sabemos separar, perder ese tramo es preferible a violar exclusión; jamás atribuir el número a partir de la voz propia.

### D. Revisión de parcial y negación

Interlocutor: “I can… actually, I can't come until Friday.”

```text
0,5 s                 1,0 s                 2,0 s
~Puedo…               ~En realidad,         En realidad, no puedo
                       no puedo…            ~venir hasta…

Final
No puedo venir
hasta el viernes.
```

Una cola provisional puede cambiar mucho: pintarla tenue, agrupar revisiones a 150–200 ms y mantener el área estable. Correcciones de negación/número tienen prioridad sobre conservar el prefijo visual. No borrar toda la pantalla entre versiones.

## Referencias de producto: qué copiar y qué no asumir

- **Even G2 producción:** fuente oficial confirma mic→Bluetooth→app→nube→texto, traducción visible y original al tocar, doble vía compartiendo teléfono. La página mezcla “35+” y “33” idiomas; evitar convertir marketing en contrato. No publica proveedor/modelo, número fijo de líneas ni garantía de no capturar voz propia. También dice que micrófonos direccionales enfocan “your voice”: no es prueba de cancelación del wearer. [P1]
- **Experiencia Even:** un usuario Reddit reporta <1 s mirando K-dramas; otro estima 0,5–1 s según Wi‑Fi, aprecia contacto visual y menciona confundir “budget cut”. Son testimonios, no cronometraje ES/EN. PCMag observa traducción bastante fiable aunque imperfecta y selección manual de idiomas. Hay críticas en pruebas de Osaka; no mezclar quejas del G1 con G2. [P2–P4]
- **Vídeo Even:** localicé *Even Realities G2 Translate In Depth Review*; la extracción no devolvió transcripción/frame verificable. No invento conteo de líneas ni mediciones de ese vídeo. Revisarlo visualmente con tiempo anotado es trabajo pendiente para la comparación física. [P5]
- **Meta Ray-Ban Display:** producto oficial muestra captions/traducción escrita privada en la lente. Es distinto del Ray-Ban Meta sin display con audio. No encontré contrato de supresión de la propia voz ni TTFT-T comparable en la documentación consultada. Adoptar acceso inmediato a subtítulos, no copiar densidad de una pantalla 600×600 a 576×288. [P6]
- **Rokid:** guía documenta Microsoft Translator online, seis idiomas offline, overlay verde de líneas cortas en campo inferior; comercialmente promete <1 s, no benchmark reproducible. Buen precedente para poco texto y centro libre. La propia página contiene texto editorial sobre assets: no tratarlo como medición física. [P7]
- **INMO GO2:** manual concreto: mitad superior traducción del otro, inferior original propio; click cambia hablante, doble click pausa y ajustes de tamaño/número de líneas. Su control de turnos es relevante; **su panel de voz propia contradice nuestro requisito**. No extrapolar GO2 a GO3. [P8]
- **XREAL + XRAI:** XRAI pone captions en Air/Beam y ofrece speaker ID; el stack depende de app/dispositivo, no demuestra traducción nativa autónoma XREAL. Relevante la colocación/personalización y mantener mirada en el hablante. [P9]
- **Brilliant Labs Frame/Halo:** documentación/producto permite traducción y flujos de audio/display; no verificó un layout de traducción de producción con SLA o exclusión de voz propia. Es plataforma de desarrollo, no evidencia de mejor latencia. [P10]
- **Vuzix:** soluciones concretas Z100+TranscribeGlass y Xander, además de Mentra; no tratar “Vuzix” como único traductor. TranscribeGlass documenta elección de fuente de captions y formato configurable. [P11]
- **Captify:** binocular, captions centrados, dual beamforming; producto ofrece captions offline en 30+ idiomas y traducción offline 20+. No tomar micrófonos direccionales ni reseñas comerciales como garantía de eliminación propia. [P12]

**Conclusión visual:** adoptar traducción primero y original bajo demanda de Even; área inferior/compacta de Rokid; control claro de turnos de INMO; configuración de legibilidad de TranscribeGlass. La regla exacta de 2+1 líneas es nuestra propuesta para Alexander, no un supuesto estándar de estos fabricantes.

## Prueba mínima que sí decide

1. **Acceso:** claves Soniox, OpenAI y Gemini con facturación activa; después Speechmatics/Azure para control. `SONIOX_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`; para Azure clave+región. Deepgram/AssemblyAI/ElevenLabs solo si entran cascadas. No imprimir claves. Usar región/modelo/config exactos en resultados; no cambiar clave o teléfono como parte de esta consulta.
2. **Corpus:** ≥30 diálogos consentidos ES/EN, voces de Alexander en ambos idiomas y ≥5 interlocutores; segmentos cortos de 0,3–1 s, frases de 3–8 s, monólogos de 30–60 s. Inglés de distintos acentos y español ecuatoriano; números, negaciones, nombres, giros, idioma mixto. Silencio, TV, calle/cafetería, cabeza girada, distancia 0,5/1/2 m, interlocutor también hablando español, risas/susurros, interrupciones y solapamientos anotados. WAV PCM16 mono 16 kHz; versión multipista separada para ground truth de identidad, sin dar al proveedor información que el uso real no posee.
3. **Harness Node propuesto**, no implementado aquí: `tools/translate-probe/latency.mjs`, adaptadores con eventos normalizados `source_partial/source_final/translation_revision/translation_final/error`, IDs de sesión, frase y versión. Reproducir PCM con plazos absolutos basados en `performance.now()`, chunks de 20/50/100 ms; no `setTimeout(100)` acumulativo. Mantener pausas reales y silencio de cierre; medir jitter y bytes en cola. Parsear chunks RIFF correctamente. OpenAI resample 16→24 kHz continuo, incluyendo tiempo de conversión; Gemini usa 16 kHz.
4. **Métricas:** primer original, primera traducción provisional, primera palabra traducida útil, primera traducción estable y último final desde final acústico anotado. Registrar palabra/frase fuente que justifica traducción; en Soniox no inventar timestamps de traducción. Medir lag de seguimiento de cláusulas durante monólogo, proporción antes de fin de frase, palabras corregidas tras verse, tokens descartados, desconexiones y calidad bilingüe ciega. Métrica de seguridad aparte: milisegundos propios enviados a traductor, solicitudes propias, glifos propios visibles y tiempo de fuga; UNKNOWN bloqueado y falsos descartes del otro.
5. **Diseño experimental:** ≥5 repeticiones por fixture/config; cold connect separado de warm stream; alternar orden y registrar ISP/red/región. p50/p95 y distribución, sin tratar tokens correlacionados como muestras independientes. No prealimentar archivos ni inferir TTFT a partir de toda la respuesta. Comparar providers en secuencial controlado; prueba simultánea aparte para comprobar contención. Mantener resultados brutos JSONL locales redactados.
6. **Bases existentes:** `tools/paseo-probe/dictation.mjs:17` envía bloques de 100 ms a Paseo y mide final, no proveedor ni primer token; sirve para pacing conceptual. `tools/conversar-probe/latency.mjs:1` mide decide→search→write, no audio; reutilizar `performance.now()`/reporte, no afirmar que ya hay benchmark de traducción. Adaptadores Soniox Compare útiles tras auditoría; no ejecutar su servicio contra audio privado por comodidad.
7. **Headless:** ampliar `tools/headless-render/translate-app.test.cjs:36` y modelo con fixtures temporales: identidad desconocida/propia jamás dibujada; finales tardíos tras cambio EN→ES→EN; dos hablantes mismo idioma; revisiones de negación; monólogo; pausa/reconexión; sonido sin texto. Afirmar 2 actuales+1 previa, 16 niveles, glyph coverage, ancho real, bounding boxes, jerarquía y ausencia de auto-scroll mientras se revisa historial. Comparar píxeles por actualización y número de líneas movidas. No basta “PNG bonito”.
8. **Gafas reales:** primero baseline Even oficial, luego Faceclaw en misma red/diálogo/configuración de idioma; grabar audio de referencia y lente a alta velocidad con un evento de sincronización. Marcar captura→PCM→WS→token→paint→submit→ACK→primer glifo óptico. ACK/Preview Only no prueban visibilidad. Mic continuo, ambos lentes, Bluetooth congestionado y 15–20 min de uso; medir legibilidad, atención al interlocutor y respuesta percibida. No tocar firmware para este experimento inicial.
9. **Criterio de promoción propuesto:** ninguna fuga propia en corpus/ensayo (declarar tamaño y que cero observado no prueba cero universal); ningún error crítico de negación/número introducido por UI; TTFT visible warm p50≤1 s/p95≤1,8 s en modo sin gate extra, y objetivo independiente realista para gate. Final tras silencio p95≤1,5 s; reportar si identificación lo impide. Un proveedor gana solo con calidad ciega igual/mejor y mejora práctica de ≥200 ms en p95 o menor tasa de errores; no por precio ni benchmark STT.

Ensayos extensos/builds se ejecutarían en Mac mini según reglas del repo; pruebas unitarias cortas locales. Aquí no se ejecutaron audios, renders, builds ni pruebas de gafas: es especificación investigada, no aprobación del producto.

## Cambios concretos propuestos, no aplicados

- `app/apps/translate/translate-session.ts:21,60,69`: sustituir doble vía por destino ES; gate antes de `acceptPcm`, estados SELF/OTHER/UNKNOWN, epoch al reiniciar y contador de audio bloqueado. No enviar audio propio esperando ocultarlo después.
- `app/native/soniox-stt.ts:25,34,63`: ampliar configuración one-way/tuning/context; conservar `start_ms/end_ms`, speaker y métricas de progreso; no perder metadatos al normalizar. Drenar final sin asociarlo a nueva sesión.
- `app/apps/translate/translate-model.ts:10,37,80`: IDs persistentes de frase/sesión y speaker; separar final/provisional. `translationTarget` solo mira idioma actual/anterior: A→B→A y dos hablantes del mismo idioma pueden mezclar traducciones tardías. Cola ordenada de tramos fuente pendientes; speaker cuando venga; no inventar alineación 1:1 que API no da. Varias traducciones no finales necesitan buffers por destino/segmento, no un solo `liveTranslationClosed`.
- `app/apps/translate/translate-painter.ts:29,67,114`: presupuesto 2+1, original opt-in, provisional tenue, saltos estables por cláusula. Hoy permite cuatro líneas traducidas más dos originales y recorta desde arriba cuando no cabe: puede quitar información principal antes que secundaria. Incluso si caben geométricamente, son demasiadas para el objetivo.
- `app/apps/translate/translate-app.ts:32,139,172`: vista solo de interlocutor, coalescing y deduplicación visual; pie sin segundos para evitar tráfico; preservar pause/stop/reconnect y token epoch.
- Reutilizar `app/apps/microphones/speakers.ts:210` y `FaceclawSpeakerId.kt:49` mediante servicio pequeño de identidad, sin arrastrar grabación/insights de Microphones. `app/native/voice-control.ts:219,245` precisa vía opt-in de metadatos/filtro para Translate; conservar semántica raw para otras apps. `VoiceCaptureSession.kt:668` no es el gate correcto: fail-open y tardío.
- Añadir pruebas descritas a `tools/headless-render/translate-app.test.cjs:70` y harness nuevo; actualizar premisa “cascada siempre espera oración” de `research/translate/plan.md:7`. Todo ello requiere implementación posterior: este informe no modifica app.

## Fuentes consultadas

- **S1:** [Soniox real-time translation](https://soniox.com/docs/translation/stt-translation/rt-translation), [modelos](https://soniox.com/docs/stt/models).
- **S2:** [Token final/non-final](https://soniox.com/docs/stt/rt/real-time-transcription), [endpointing](https://soniox.com/docs/stt/rt/endpoint-detection), [WebSocket](https://soniox.com/docs/api-reference/stt/websocket-api).
- **S3:** [Soniox speech translation](https://soniox.com/speech-translation), [precios](https://soniox.com/pricing). FAQ comercial contiene afirmaciones desactualizadas sobre OpenAI; se usó tabla propia de precios, no su comparación.
- **S4:** [OpenAI guía](https://developers.openai.com/api/docs/guides/realtime-translation), [modelo/precio](https://developers.openai.com/api/docs/models/gpt-realtime-translate), [deltas append-only](https://developers.openai.com/api/reference/resources/realtime/translation-server-events).
- **S5:** [Gemini Live Translate](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-live-translate), [pricing](https://ai.google.dev/gemini-api/docs/pricing.md.txt).
- **S6:** [Speechmatics traducción](https://docs.speechmatics.com/speech-to-text/features/translation), [idiomas y restricciones Melia](https://docs.speechmatics.com/speech-to-text/languages), [pricing](https://www.speechmatics.com/pricing).
- **S7:** [Azure guía](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-translate-speech), [identificación](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-identification), [precios](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/).
- **S8:** [Deepgram interim](https://developers.deepgram.com/docs/interim-results), [modelos](https://developers.deepgram.com/docs/models-languages-overview), [pricing](https://deepgram.com/pricing).
- **S9:** [AssemblyAI receta de traducción](https://www.assemblyai.com/docs/streaming/guides/real_time_translation), [pricing](https://www.assemblyai.com/pricing).
- **S10:** [Scribe Realtime](https://elevenlabs.io/realtime-speech-to-text), [API pricing](https://elevenlabs.io/pricing/api), [eventos realtime y edición](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime).
- **S11:** [Soniox Compare código y contrato](https://github.com/soniox/soniox-compare/tree/main/translate).
- **S12:** [Soniox diarización y límites](https://soniox.com/docs/stt/concepts/speaker-diarization), [diarización vs identidad](https://soniox.com/wiki/diarization-vs-speaker-identification).
- **S13:** [Google STT pricing](https://cloud.google.com/speech-to-text/pricing), [Cloud Translation pricing](https://cloud.google.com/translate/pricing).
- **P1:** [Even producción/FAQ](https://www.evenrealities.com/translation-glasses).
- **P2:** [Testimonio G2 hands & eyes-on](https://www.reddit.com/r/EvenRealities/comments/1pscp0x/even_realities_g2_hands_eyeson_review/).
- **P3:** [Testimonio reuniones/latencia](https://www.reddit.com/r/EvenRealities/comments/1rkmr21/one_week_with_g2_office_translation_review/).
- **P4:** [PCMag G2](https://uk.pcmag.com/smart-glasses/164322/even-realities-g2), [opiniones sobre traducción](https://www.reddit.com/r/EvenRealities/comments/1sv35nv/worth_purchasing_for_live_translation/).
- **P5:** [Vídeo G2 Translate](https://www.youtube.com/watch?v=CDvAN_Sspak), localizado; sin validación visual de frames.
- **P6:** [Meta Display oficial](https://www.meta.com/ai-glasses/meta-ray-ban-display/), [Ray-Ban Display](https://www.ray-ban.com/usa/l/discover-meta-ray-ban-display).
- **P7:** [Rokid guía](https://global.rokid.com/blogs/academy-glasses/3-2-real-time-translation), [claim comercial](https://global.rokid.com/products/rokid-glasses).
- **P8:** [INMO GO2 manual](https://support.inmoxr.com/go2/guides/quick-start/).
- **P9:** [XRAI](https://xrai.glass/), [XREAL Beam](https://xrai.glass/xreal-beam/), [configuración](https://knowledge.xrai.glass/smart-glasses).
- **P10:** [Brilliant Halo](https://brilliant.xyz/products/halo), [SDK Frame](https://docs.brilliant.xyz/frame/frame-sdk/).
- **P11:** [Vuzix/TranscribeGlass](https://ir.vuzix.com/news-events/press-releases/detail/2115/ai-powered-transcribeglass-solution-selects-vuzix-z100), [formato/fuentes de captions](https://www.transcribeglass.com/features.html), [Vuzix/Mentra](https://ir.vuzix.com/news-events/press-releases/detail/2113/vuzix-z100-smart-glasses-and-mentra-augmentos-usher-in-a).
- **P12:** [Captify Pro](https://captify.glass/products/captify-pro).
