**Inferido — recomendación:** empezar en la app con huella continua, buffer y bloqueo de voz ajena antes de Soniox; conservar Translate aparte.
**Confirmado:** G2 tiene cuatro micrófonos, pero la captura habitual de Faceclaw entrega mono de 16 kHz y metadatos de dirección/SSR cada 50 ms. [1–3]
**Inferido:** nivel + SSR + dirección merecen un ensayo barato; no bastan como garantía de que habla Alexander.
**Confirmado:** existe una extensión de firmware para PCM adicional, pero tiene restricciones de canales, truncamiento y ABI pendientes de validación física. [4]
**No verificado:** que el IMU permita detectar vibraciones de la voz o que exista un sensor de conducción ósea; no basar la solución en ello.

## Alcance y criterio de evidencia

**Confirmado:** revisión del 2026-10-11, sin cambios de código, builds, commits, push ni pruebas por adb. Checkout Faceclaw `900ff3e147869f57b6f7c17bcae2f9067f33638d`. Leí `CLAUDE.md`, `research/solo-mi-voz.md` y ambas consultas de `research/translate/`. El filtro `wearer-voice.ts` se leyó mediante `git show` en `origin/main` (`fdf38e76b31ce21890f125860a46bb028dbca3af`), porque no existe en este checkout.

**Confirmado** significa fuente leída o comportamiento estático del código; no significa demostrado en las gafas. **Inferido** significa propuesta, cálculo o consecuencia razonada. **No verificado** significa que falta evidencia. Las latencias propuestas son presupuestos de ensayo, nunca mediciones del teléfono.

## Hardware: qué existe y qué recibe el teléfono

### Micrófonos y ubicación

- **Confirmado:** Even anuncia cuatro micrófonos y mejoras de direccionalidad y filtrado. Su documentación pública describe un solo stream PCM del array. [1, 5]
- **Confirmado en el código de ingeniería inversa; no verificado físicamente aquí:** `g2flash/patches/mic_control.c:11–18` describe dos micrófonos por patilla, dos procesadores Apollo510 y relojes/enlaces independientes. `app/apps/microphones/mic-protocol.ts:13–16` sitúa uno cerca de la bisagra y otro hacia el touchpad. [4]
- **No verificado:** posición exacta de los cuatro orificios, separación medida, modelo de cápsula, patrón polar y asignación física de cada canal. El propio `mic-protocol.ts:317–321` advierte que canal 0 = frontal es una suposición pendiente. Las coordenadas de `G2_DEFAULT_GEOMETRY`, en `dsp.ts:27–39`, son parámetros del modelo, no un plano metrológico.
- **Inferido:** la voz del portador suele tener ventaja de proximidad frente a alguien a un metro. No asumir que todos los micrófonos están a «pocos centímetros de la boca», ni una ventaja constante de 10–20 dB. Depende de la posición, volumen, orientación, reflexiones y procesamiento.
- **Confirmado como anuncio del fabricante:** Even también promociona captura de conversaciones hasta unos tres metros. El producto no está diseñado para escuchar exclusivamente al portador. [6]

### Audio normal de Faceclaw

**Confirmado en la implementación:** `Lc3PacketFramer.kt:21–39` y el decodificador JNI establecen este formato. [2, 3]

| Propiedad | Valor y estado |
| --- | --- |
| Códec por BLE | **Confirmado:** LC3; no PCM crudo ni un canal por micrófono. |
| Trama LC3 | **Confirmado:** 40 bytes, 10 ms, 160 muestras decodificadas. |
| Paquete útil | **Confirmado:** 205 bytes = cinco tramas LC3 + 4 bytes de metadatos + contador de 1 byte. |
| Duración | **Confirmado:** 50 ms, 800 muestras. No 100 ms. |
| Trailer | **Confirmado:** SSR `s16 LE` en offset 200, ángulo `s16 LE` en 202 y contador módulo 256 en 204. |
| Audio decodificado | **Confirmado:** PCM firmado de 16 bits, little-endian, 16.000 Hz, mono. |
| Caudal calculado | **Inferido:** LC3 = 32 kbit/s; paquete útil = 4.100 B/s, sin sobrecarga BLE. PCM mono = 32.000 B/s. |
| Envío a Soniox | **Confirmado:** `pcm_s16le`, 16 kHz, `num_channels: 1`; `soniox-stt.ts:63–70` y `cloud-stt.ts`. |

**Confirmado:** `Lc3PacketFramer` elimina duplicados y paquetes tardíos por contador. Su comentario indica que ambas patillas pueden retransmitir el mismo paquete. Recibir paquetes desde dos conexiones BLE no demuestra dos canales independientes. La ruta de voz termina en un único mono.

**Confirmado — discrepancia de fuentes:** `g2-kit-unofficial/ble/docs/audio.md:38–59` describe 205 bytes como cabecera de 2 bytes + 203 bytes LC3 y dice 20 ms. Eso contradice el decodificador ejecutable de Faceclaw y el contrato de g2flash. Para este proyecto prevalece el código local: cinco bloques de 40 bytes y 50 ms. No usar esa página para configurar el decoder. Sí coincide en LC3, 16 kHz, mono y servicio BLE dedicado `6450`. [7]

**Confirmado:** el SDK oficial de Even ofrece PCM mono S16LE de 16 kHz. Su FAQ coloca el acceso por micrófono y el ángulo DOA en el roadmap. Esto limita la API pública; no invalida los metadatos que Faceclaw extrae directamente de BLE. [5]

### DSP dentro de las gafas

- **Confirmado en el código analizado:** el contrato de g2flash describe captura estéreo, cálculo SSR/TDOA sobre esa captura y promedio a mono en la ruta original. `MIC_FLAG_BEAMFORM` habilita el cálculo de metadatos; su nombre no demuestra que el firmware haga separación de voces. [4:20–37, 87–106, 309–312]
- **Confirmado en la app:** `VoiceCaptureSession.kt:465–477` implementa un filtro por ángulo. Si `ssr > 0` y el ángulo cae fuera del haz, descarta el paquete completo. Es una puerta angular; no elimina selectivamente una voz de una mezcla simultánea.
- **No verificado:** fórmula completa, escala y calibración física de SSR. Aquí se documenta como señal de intensidad/confianza, pero no está probado que mida distancia o identidad. Un SSR alto no debe convertirse automáticamente en «Alexander».
- **Confirmado como afirmación comercial:** Even anuncia aislamiento y reducción de ruido. **No verificado:** qué parte ocurre en firmware, app o nube, y si la misma cadena se aplica al audio BLE de Faceclaw. No atribuirle un beamformer adaptativo, cancelador de viento o VAD específico sin evidencia. [1, 6]
- **No verificado:** un evento de firmware que indique «está hablando el portador». Los metadatos leídos por Faceclaw son SSR/ángulo/contador, no identidad. La detección de fin de habla que se ve en `VoiceCaptureSession.kt:500–501` ocurre en el teléfono.
- **Confirmado:** la supresión espectral de BLE vive en `FaceclawNoiseSuppressor.kt:6–25`: ventanas de 16 ms, solapamiento 50 %, seguimiento de ruido y ganancia Wiener. `AndroidNoiseEffects.kt:28–33` reserva los efectos AudioRecord para el micrófono del teléfono. **Inferido:** activar un efecto Android de captura no limpia por sí solo el PCM llegado por BLE.

### IMU, vibración y conducción ósea

- **Confirmado:** Even documenta IMU y adición de brújula. La API expone `x/y/z`, y `ble/gen/EvenHub_pb.ts:922–936` contiene esos tres valores, sin timestamp ni contador de muestra en el payload IMU. [1, 5, 8]
- **Confirmado:** los códigos oficiales `P100…P1000` son códigos de ritmo, no Hz literales. Las unidades físicas siguen pendientes en la FAQ. No interpretar `reportFreq=1000` como 1 kHz. [5]
- **Confirmado:** `app/native/imu.ts:4–9` advierte que históricamente el stream fue poco fiable. **No verificado:** tasa real, jitter, ancho de banda, modelo del sensor, señal de aceleración sin filtrar y sincronía con audio en las gafas de Alexander.
- **No verificado:** un micrófono de contacto, acelerómetro dedicado a voz, sensor de vibración laríngea o sensor de conducción ósea. Las fuentes primarias consultadas no los identifican. Esto no demuestra su ausencia física.
- **Inferido:** un IMU pensado para orientación podría registrar movimiento de mandíbula o cabeza, pero caminar, masticar y tocar las patillas también lo excitan. Detectar vibración vocal exige medir primero sensibilidad y ancho de banda. La brújula ayuda a estabilizar dirección al girar la cabeza; no identifica a quien habla.

### Desmontajes y FCC: límite de lo comprobado

**Confirmado:** el registro público reflejado en FCCID.io identifica `2BFKR-G2` y lista fotos internas, fotos externas y manuales. **No verificado:** componentes concretos en esas fotos; no inspeccioné los PDF. FCC.report devolvió una pantalla de cookies, y la extracción alternativa solo permitió leer el índice del expediente. [9]

**Confirmado como testimonio:** el autor de un desmontaje en Reddit dice que abrió la parte posterior de la patilla izquierda y no la derecha. Otro hilo pide localizar los orificios; la respuesta remite a una imagen que la extracción textual no permitió comprobar. No uso esos hilos para certificar ubicación ni sensores. No encontré un desmontaje específico de G2 en iFixit en la búsqueda dirigida; no afirmo que no exista. [10, 11]

## Firmware: información adicional y riesgo

### Lo que ya está escrito, y sus límites

**Confirmado:** comparé por lectura las 38 operaciones de `app/g2/firmware/cfw-patches.ts` con `g2flash/patches/cfw_patches.json` del commit `ca7e0b7a882d50c8ec8e0e597ff93640950a655f`. Son idénticas. Coinciden base `g2_2.3.0.24.bin`, hash base y hash de salida `90b932552e987fc554e6f748e50989503aaff0a93a3915702eacd96e3bd99e9b`. Esto vincula el artefacto distribuido con ese repositorio; no es una prueba de instalación ni de funcionamiento físico. [4, 12]

**Confirmado:** la extensión `mic_control.c` tiene control por campos 103/104, renovación de lease de 90 s y paquetes `SM` con cabecera de 21 bytes. Incluye número de canales, tasa efectiva, secuencia, tick local de 1 ms, ángulo, SSR y PCM. La app contiene parser y DSP en `mic-protocol.ts`, `mic-control.ts`, `mic-session.ts` y `dsp.ts`.

**Confirmado — restricciones decisivas del código fuente de esa revisión:**

1. `mic_effective_channels():238–244` devuelve **un canal para PDM**. Solo la entrada `codec` puede devolver dos. La app configura `source: "pdm"` por defecto (`mic-protocol.ts:99–109`). El comentario genérico «cada patilla entrega dos canales» no describe todas las configuraciones.
2. `mic_control.c:94–106` reconoce que el orden físico de canales no está validado; el layout PDM tampoco. La tasa efectiva permanece en 16 kHz. Pedir otra tasa no la activa. Pedir LC3 sigue entregando raw PCM; el byte de códec indica lo efectivo.
3. `MIC_STREAM_MAX_PAY=1600` y `mic_pcm_tap():314–338` recortan cualquier payload mayor. Para el bloque estéreo descrito de 3.200 bytes/50 ms, se envían solo los primeros 25 ms y se marca truncamiento. **Inferido:** en ese caso falta la mitad de las muestras; no es audio estéreo continuo apto para STT sin resolverlo.
4. `tick` se toma al empaquetar, en el reloj de cada patilla. **Inferido:** no equivale a timestamp de ADC ni a sincronización de fase entre cuatro micrófonos. El propio `dsp.ts:1–4` evita sumar muestras entre patillas por sus relojes independientes.
5. `mic_control.c:118–127` exige validar inicialización y envío en hardware de sacrificio. `armHardware` es `false` por defecto, aunque el ajuste de desarrollador `useMicControl` es `true` (`dashboard-settings.ts:712–718`). Activar el menú no prueba que la captura adicional esté armada ni validada.

**Inferido — decisión:** no hay que inventar otro protocolo para explorar canales separados; ya existe uno. Pero tampoco se debe prometer «activar cuatro micrófonos» como un cambio de app terminado. Primero hacen falta pruebas del mapeo, continuidad, tasa y transporte. El caudal PCM16 completo de cuatro canales a 16 kHz sería 128.000 B/s, unos 1,024 Mbit/s útiles, más cabeceras. Es un cálculo de demanda; no una medición de capacidad BLE, batería o estabilidad.

### Si se necesitara modificarlo

**Inferido:** exponer muestras completas requeriría dividir/transportar bloques sin truncarlos, o validar compresión por canal. Habría que conservar secuencia, número de muestras y reloj de captura. Para IMU sincronizado habría que recuperar la lectura real del sensor y fecharla con el mismo reloj que el audio de esa patilla; fechas de llegada al teléfono solo permiten alineación aproximada.

**Inferido:** modificar la app es el primer camino. Cambiar callbacks, buffers o drivers en RTOS tiene riesgo alto de fallos, bloqueo del micrófono, pérdida de datos y consumo. Si afecta al arranque, puede impedir recuperación OTA. El README de g2flash advierte expresamente sobre ese último escenario. Los leases ayudan al cierre de sesiones; no reparan un ABI erróneo. [13]

**No verificado:** necesidad de un nuevo flash para experimentar en el dispositivo concreto, porque no leí su revisión instalada. No se ejecutó ningún comando de captura, activación o firmware.

## Técnicas: orden de implementación y utilidad

**Inferido:** separar dos objetivos. Filtrar resultados impide que la app actúe sobre texto ajeno, pero el audio ya llegó a Soniox. Si se quiere excluirlo antes de transcribir, la puerta debe estar antes de `cloudClient.acceptPcm()` en `voice-control.ts:508–515`. Ningún clasificador elimina por sí solo una segunda voz que habla simultáneamente.

### 1. Huella continua + buffer: primera opción para identidad

**Confirmado:** existe embedding sherpa, coseno y umbral 0,8 en `FaceclawSpeakerId.kt` y `speakers.ts:19`. El embedder admite desde unos 0,5 s; la verificación de sesión exige 1 s y almacena como máximo 10 s. `runSpeakerVerification()` corre al acabar captura y acepta como portador los errores o muestras cortas (`VoiceCaptureSession.kt:96–97,396,668–704`). El bridge solo vacía finales rechazados, no bloquea audio ni parciales (`voice-control.ts:541–548`).

**Inferido — propuesta:** ventanas de voz de 0,8–1,5 s, actualización cada 200–300 ms y estados `SELF / OTHER / UNKNOWN`. Mantener el audio retenido hasta clasificar. Revalidar durante toda la sesión; no dejar abierta la puerta después del primer acierto. Fijar la huella durante la sesión para evitar contaminarla con voces ajenas. Usar matrícula/enrolamiento recogido con las propias gafas.

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo medio; mejor candidato existente para identificar a Alexander cuando los turnos están separados. Decisión inicial de aproximadamente 0,8–1,5 s más cómputo, como presupuesto. Peor con monosílabos, susurros y solapamiento. Para exclusión estricta, `UNKNOWN` retiene o descarta; no hereda el actual fallo abierto. No prometer tasa de acierto sin corpus.

**Inferido — archivos:** `FaceclawSpeakerId.kt`, `VoiceCaptureSession.kt`, `app/apps/microphones/speakers.ts`, `app/native/voice-control.ts` y `app/g2/dashboard-controller.ts`. Aplicar la misma política a dictado, asistente y captura continua/Live facts; no a Translate. Transportar eventos de identidad por segmento si se filtra también texto.

### 2. Nivel + SSR + DOA: señal auxiliar barata

**Inferido — propuesta:** combinar RMS/dBFS del PCM original, SSR, ángulo y estabilidad temporal. Calibrar con voz propia y ajena. Añadir histéresis y hangover corto. No usar la geometría de campo lejano como identidad: una persona enfrente puede compartir dirección aparente con la boca del portador.

**Confirmado:** ya existen los metadatos cada 50 ms y el filtro angular. El filtro de Translate en `origin/main` usa mediana de volumen, mínimo cuatro observaciones y margen de 10 dB (`wearer-voice.ts:9–57`). **Inferido:** ese umbral es una heurística del producto, no una especificación acústica. Invertir el filtro tampoco resuelve el primer hablante desconocido ni quien grita cerca.

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo bajo; posible mejora útil en salas y distancias calibradas. Identidad poco fiable por sí sola. Con ventanas propuestas de 100–200 ms, agregaría ese tiempo de decisión más cómputo; los 50 ms de empaquetado ya existen. Un susurro propio y una voz ajena fuerte son los contraejemplos mínimos.

**Inferido — archivos:** calcular y asociar PCM/metadatos en `VoiceCaptureSession.kt`, exponerlos juntos mediante `VoicePorts.kt`/bridge y decidir en `voice-control.ts`. Hoy `onPcm` sale antes que `onFrameMeta`: leer «el último ángulo» desde el callback PCM puede usar el paquete anterior. No usar niveles ya suavizados del radar para entrenar el detector.

### 3. Aislador de hablante principal + huella

**Confirmado:** la documentación actual de ai-coustics presenta Quail Voice Focus 2.2, 16 kHz y bloques óptimos de 240 muestras/15 ms. Dice explícitamente que selecciona al hablante predominante, puede cambiar de persona y no es un bloqueo de identidad. El arranque necesita contexto sin tiempo fijo garantizado. Esto actualiza la referencia a 2.1 del informe previo. [14]

**Confirmado:** Krisp BVC se orienta a headsets/earbuds, funciona mejor con micrófono de brazo y no requiere enrolamiento. Procesa internamente a 32 kHz y admite entradas por encima de 8 kHz. **No verificado:** eficacia y latencia con G2/LC3/Android concreto; las gafas no equivalen acústicamente a un boom mic. [15]

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo medio-alto, integración nativa/comercial. Potencialmente el método más útil para voces simultáneas, combinado con verificación de identidad. La huella se evaluaría sobre una rama conservada y/o la salida, midiendo cuál discrimina mejor. No declarar 30 ms de latencia total: la guía actual exige medir retardo del procesador, adaptación de bloques, CPU y arranque. Bloque de 15 ms no equivale a latencia de 15 ms. [16]

**Inferido — archivos:** procesador nativo antes de la salida PCM en `VoiceCaptureSession.kt`, adaptador Android/JNI, configuración por captura en `voice-control.ts`. `soniox-stt.ts` debería seguir recibiendo mono 16 kHz. No subir grabaciones ni contratar un SDK en esta fase de investigación.

### 4. Supresión de ruido: mejora independiente

**Inferido:** comparar el supresor espectral existente apagado/encendido antes de añadir otro modelo. Puede reducir ruido estacionario; no identifica al portador ni garantiza eliminar conversaciones. Si no mejora reconocimiento y retención de palabras propias, dejarlo apagado para esa ruta.

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo bajo con lo existente; medio para evaluar un denoiser neuronal como los citados en `solo-mi-voz.md`. Fiabilidad como identificador: nula. Ventana existente de 16 ms/hop 8 ms confirmada en código; latencia efectiva y CPU pendientes de medición. Archivos: `FaceclawNoiseSuppressor.kt`, `VoiceCaptureSession.kt`, `AndroidNoiseEffects.kt` y `voice-control.ts`.

### 5. Diferencias entre micrófonos y campo cercano: después de validar captura

**Inferido:** con dos canales completos y simultáneos por patilla, probar relación de energías frontal/posterior, retardos, coherencia y un modelo de fuente cercana en la posición de la boca. Combinar evidencias entre patillas a nivel de características; no sumar sus ondas sin corregir desfase y deriva.

**Confirmado:** `dsp.ts` ya implementa delay-and-sum y cancelación NLMS por patilla. Su estimador sustituye GCC-PHAT por correlación normalizada en el dominio temporal (`dsp.ts:6–9`). **Inferido:** la geometría horizontal y onda plana actuales no modelan directamente una boca cercana y situada debajo; se necesitaría calibración específica.

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo alto por los límites de firmware; potencial medio-alto para separar campo cercano de voces externas. Latencia propuesta de características 20–50 ms si el transporte entrega muestras continuas; hoy no comprobada. Archivos: `mic-protocol.ts`, `mic-control.ts`, `mic-session.ts`, `dsp.ts`; posiblemente `g2flash/patches/mic_control.c` para continuidad. No es la primera entrega.

### 6. Relación directo/reverberante: investigación secundaria

**Inferido:** un estimador monofónico podría aportar cercanía, pero reverberación, orientación, LC3 y reducción de ruido alteran las pistas. Un entorno absorbente o una persona muy cercana puede confundirlo. No extraer distancia fiable de RMS o SSR sin calibración.

**Inferido — esfuerzo/efectividad/latencia:** esfuerzo medio-alto; eficacia baja como identidad, quizá útil como característica adicional. Ensayar ventanas de 0,5–2 s; presupuesto propuesto, no medición. Archivos: un procesador de características junto a `VoiceCaptureSession.kt` y fusión en `voice-control.ts`. No añadirlo hasta demostrar que mejora sobre huella + nivel/SSR/DOA.

### 7. Vibración IMU: último experimento

**Inferido:** correlacionar bandas de aceleración con actividad de voz, después de conocer frecuencia, unidades y ruido. Primero distinguir voz propia de pasos, tos, masticación y contacto manual. Si solo llegan señales lentas de orientación, podrán informar movimiento, pero no se habrá demostrado captación de vibración vocal.

**No verificado:** eficacia, ancho de banda y latencia. **Inferido — esfuerzo:** alto e incierto; evitar firmware hasta agotar la API actual. Archivos: `app/native/imu.ts`, `FaceclawImuListener.kt`, `GlassesSessionCore.kt`, `VoiceCaptureSession.kt`; firmware solo si se demuestra necesario y viable.

## Protocolo de medición propuesto, sin ejecutarlo

**Inferido — fase 1, mono actual:** grabar un corpus consentido con Alexander, al menos tres interlocutores y dos días/salas. Incluir habla propia normal/suave/fuerte, ajena a 0,3/1/3 m y distintos ángulos, ambos simultáneos, televisión, ventilador, viento, caminar y girar la cabeza. Variar quién empieza. Separar los datos de calibración de los de evaluación por persona ajena, sala y día.

**Inferido — instrumentación:** guardar PCM antes de supresión, contador de paquete, offset de muestra, SSR, ángulo, lado de llegada, huecos y timestamp monotónico. Asociarlos en el hilo nativo antes de emitir callbacks. Marcar verdad de terreno `SELF / OTHER / OVERLAP / NOISE` y límites de palabras. No usar la propia diarización de Soniox como verdad de identidad. No tocar adb en esta investigación.

**Inferido — comparación:** ensayar (A) sin filtro, (B) solo nivel, (C) nivel+SSR+DOA, (D) huella, (E) huella+características y (F) aislador+huella, con el mismo audio. Antes de entrenar C, comprobar que SSR no es constante/cero y que sus distribuciones cambian de forma repetible. No establecer que SSR mide proximidad porque correlacione una sola vez.

**Inferido — métricas:** tasa de aceptación de voz ajena, rechazo de voz propia, palabras ajenas insertadas, palabras propias perdidas, WER de Alexander, tiempo hasta primer texto propio, p50/p95 de decisión y consumo/cola del procesador. Reportar solapamiento por separado. Para exigir «solo mi voz», fijar previamente la tolerancia a rechazos de Alexander; cero fugas en un corpus pequeño no demuestra cero fugas futuras.

**Inferido — criterio para SSR+DOA+nivel:** solo considerarlo detector autónomo si mantiene el objetivo acordado en días, salas y hablantes no usados al calibrar. Si falla con voz ajena cercana o voz propia baja, conservarlo únicamente como apoyo de la huella. Una vez abierta la puerta, seguir verificando cada ventana.

**Inferido — continuidad:** al bloquear audio, preservar el tiempo mediante silencio de igual duración o una correspondencia explícita de offsets. No concatenar trozos separados y después reutilizar timestamps como si no faltara audio. Retener también los cambios de hablante; liberar de golpe un gran buffer puede volver lento o errático el streaming. Mantener endpointing y actividad coherentes con el audio permitido.

**Inferido — fase 2 opcional:** solo si la fase 1 deja una limitación relevante, validar por separado canales CFW, mapeo físico, payload truncado, pérdidas y deriva. Para IMU, medir tasa real/jitter/unidades antes de estudiar correlación vocal. Ninguna de esas pruebas se ejecutó aquí.

## Fuentes

**Confirmado:** URLs y archivos siguientes fueron consultados. Los rangos locales corresponden al checkout indicado; las observaciones sobre `wearer-voice.ts` corresponden exclusivamente a `origin/main`. Las búsquedas usaron Perplexity, TinyFish y Brave, más extracción de páginas y GitHub autenticado como `ajmariduena`. Context7 solo encontró EvenDemo y no devolvió documentación G2 pertinente; se usaron las páginas primarias. No se emplearon Exa ni Gemini, sin saldo. La consulta de GitHub y la comparación de parches fueron las comprobaciones remotas de solo lectura; no hubo prueba física.

1. [Even: sensor array e IMU](https://www.evenrealities.com/blogs/even-insider/how-we-shaped-even-g2-from-the-outside-in).
2. `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/Lc3PacketFramer.kt:21–39,70–100`.
3. `App_Resources/Android/src/main/native/faceclaw_lc3_decoder.c:44–78`; `app/native/soniox-stt.ts:63–70`.
4. [g2flash, mic_control.c, revisión consultada](https://github.com/jimrandomh/g2flash/blob/ca7e0b7a882d50c8ec8e0e597ff93640950a655f/patches/mic_control.c): topología 11–18; contrato 74–127; cap 195–198; canales 238–244; tap 289–342. Repo no archivado, GPL-3.0, último push consultado 2026-10-06.
5. [Even Device APIs, audio e IMU](https://hub.evenrealities.com/docs/build/device-apis) y [FAQ](https://hub.evenrealities.com/docs/reference/faq).
6. [Even: subtítulos, alcance y aislamiento anunciado](https://www.evenrealities.com/subtitle-glasses).
7. [g2-kit: audio.md](https://github.com/Commute773/g2-kit-unofficial/blob/33da3a7ec2b905ca7148acad69f105a0986b3fb7/ble/docs/audio.md). Repo no archivado, MIT, último push consultado 2026-04-17. Su framing contradice Faceclaw; no se adopta.
8. [g2-kit: EvenHub_pb.ts](https://github.com/Commute773/g2-kit-unofficial/blob/33da3a7ec2b905ca7148acad69f105a0986b3fb7/ble/gen/EvenHub_pb.ts), `IMU_CtrlCmd` e `IMU_Report_Data`.
9. [FCCID.io: 2BFKR-G2, índice de documentos](https://fccid.io/2BFKR-G2). Espejo, no inspección de fotos/PDF.
10. [Reddit: desmontaje G2 y alcance declarado por el autor](https://www.reddit.com/r/EvenRealities/comments/1riezgy/even_realities_g2_technical_analysis_teardown/).
11. [Reddit: ubicación de micrófonos](https://www.reddit.com/r/EvenRealities/comments/1v4fb17/where_are_the_microphones_in_the_even_g2_a_glasses/). Imagen no verificada.
12. `app/g2/firmware/cfw-patches.ts:1–22` y [JSON comparado](https://github.com/jimrandomh/g2flash/blob/ca7e0b7a882d50c8ec8e0e597ff93640950a655f/patches/cfw_patches.json).
13. [g2flash README: riesgo de cambios de firmware](https://github.com/jimrandomh/g2flash/blob/ca7e0b7a882d50c8ec8e0e597ff93640950a655f/README.md).
14. [Quail Voice Focus: selección y límites de identidad](https://docs.ai-coustics.com/models/voice-focus/quail-voice-focus) y [catálogo actual](https://docs.ai-coustics.com/reference/sdk/models).
15. [Krisp BVC: dispositivo y frecuencia](https://sdk-docs.krisp.ai/docs/background-voice-cancellation-bvc).
16. [ai-coustics: qué significa latencia y cómo medirla](https://docs.ai-coustics.com/reference/concepts/latency).

**Confirmado:** los documentos anteriores de `research/` se usaron como contexto, no como prueba independiente. En particular, no se heredan sus promesas de cuatro canales utilizables, latencia fija del aislador o identidad garantizada por proximidad.
