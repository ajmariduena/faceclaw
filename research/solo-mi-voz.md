# Transcribir solo mi voz (y quitar el ruido de fondo)

Investigación del 2026-10-11. Pregunta: al transcribir, ¿se puede reconocer la voz de Alexander y descartar las demás voces? ¿Y limpiar el ruido de fondo?

> Revisión de hardware con Astra (mismo día): `research/solo-mi-voz-astra.md`. Correcciones: ya existe Voice Focus 2.2; los "30 ms" son del proveedor y no la latencia real; Voice Focus sigue al hablante que domina, no a una persona en particular. El audio de las gafas llega mono, pero cada paquete de 50 ms trae SSR y ángulo.

## Respuesta corta

Sí, hay dos maneras, y se pueden combinar:

1. **Limpiar el audio antes de mandarlo a Soniox** con un modelo que aísla al "hablante principal". El micrófono de los G2 está pegado a la boca, así que el hablante principal casi siempre eres tú. No necesita grabar tu voz antes (no hay enrolamiento).
2. **Filtrar el texto después** con la huella de voz que el app ya tiene (sherpa-onnx, `FaceclawSpeakerId.kt`, `app/apps/microphones/speakers.ts`): se calcula la huella de cada frase y se descarta si no eres tú.

Para el ruido de fondo solo (sin quitar otras voces) hay una opción gratuita que ya está en la librería que usamos.

## Opciones

| Opción | Qué hace | ¿Quita otras voces? | Corre en el teléfono | Costo / licencia | Estado para Faceclaw |
|---|---|---|---|---|---|
| **ai-coustics Quail Voice Focus 2.1** | Aísla al hablante principal en tiempo real; "se engancha" al hablante de primer plano | Sí, sin enrolamiento | CPU, 30 ms de latencia, 16 kHz; versión S es 10x más chica | Comercial, prueba gratis, cobro por uso | SDK en C/C++/Rust/Python/Node/WASM. **Android no aparece listado**: habría que compilar el SDK de C con el NDK o preguntarles |
| **Krisp BVC (Background Voice Cancellation)** | Quita voces de fondo y ruido, deja al usuario del headset | Sí, sin enrolamiento | Tiene SDK de Android (RTC Android SDK v9.21) | Comercial, se contrata con ventas | Diseñado para headsets y audífonos (justo nuestro caso). Pide una lista de dispositivos permitidos; no funciona a 8 kHz o menos |
| **Huella de voz del app (sherpa-onnx)** | Compara cada frase con tu huella (coseno, umbral 0,8) | Descarta frases enteras, no limpia el audio | Ya corre en el teléfono | Gratis, ya está | Hoy solo corre al final de la frase en push-to-talk. Falla con frases muy cortas y cuando hablan dos a la vez |
| **Speechmatics speaker identification** | STT en la nube que etiqueta tus palabras con tu nombre si inscribes tu voz | Etiqueta; el app filtra | Nube | De pago por minuto | Implicaría cambiar Soniox por Speechmatics. Soniox solo tiene diarización (Speaker 1/2), no voz inscrita |
| **sherpa-onnx OnlineSpeechDenoiser (GTCRN / DPDFNet)** | Quita ruido de fondo en streaming | **No**, solo ruido | Sí, en la misma librería que ya usamos | Gratis, Apache-2.0 | Nuestra copia vendorizada de sherpa no incluye las clases del denoiser; habría que actualizarla |
| **Picovoice Eagle** | Reconocimiento de hablante en streaming | Da un puntaje por trozo de audio; el app decide | Sí (Android) | Comercial | Haría lo mismo que nuestra huella, pero continua en vez de por frase |
| **VoiceFilter-Lite (Google)** | Separación del hablante inscrito, 2,2 MB, en el teléfono | Sí, con enrolamiento | Sí | Solo paper; no hay pesos públicos | No usable |

## Datos que importan

- ai-coustics publicó el WER (errores de palabra) de Soniox en vivo con audio de varias voces: **77,1 % sin limpiar, 13,2 % con Voice Focus 2.1 L**. La mejora viene casi toda de no transcribir las voces de los demás (sustituciones e inserciones); las palabras tuyas que se pierden suben poco. Es su propio benchmark: hay que medirlo con tu audio.
- Quitar ruido a secas puede **empeorar** al STT de la nube, porque Soniox está entrenado con audio ruidoso. Solo se activa si al medir mejora.
- El app ya tiene un supresor de ruido "spectral" para el stream de los lentes (`AndroidNoiseEffects.kt`, `noiseSuppression` en `app/native/voice-control.ts`), pero es DSP clásico y no quita voces.
- Ninguna API de STT tiene un modo "transcribe solo a esta persona". Siempre es: limpiar el audio antes, o etiquetar y filtrar después.
- Translate hace justo lo contrario (oculta tu voz y muestra la de los demás), usando el volumen por etiqueta de Soniox (`app/apps/translate/wearer-voice.ts`). Un aislador de hablante principal no sirve para Translate; solo para dictado, el asistente y Live facts.

## Recomendación

1. **Probar ai-coustics Voice Focus primero**: es lo que mejor encaja (no hay que inscribir la voz, 30 ms, mejora fuerte de WER con Soniox). Paso 1: grabar 2 o 3 clips reales desde los lentes con otra gente hablando, pasarlos por su plataforma de prueba (developers.ai-coustics.com) y por Soniox, y comparar. Si gana, preguntarles por el build de Android o compilar el SDK de C.
2. **Krisp BVC como plan B** si ai-coustics no da Android: ya tiene SDK de Android, pero hay que pasar por ventas.
3. **Gratis mientras tanto**: usar la huella existente como filtro de frases en dictado y asistente (descartar las que no te reconoce) y medir cuántas frases tuyas pierde.
4. **Ruido solo**: actualizar sherpa-onnx y probar GTCRN, midiendo el WER con y sin él antes de dejarlo prendido.

## Fuentes

- ai-coustics, Quail Voice Focus 2.1: https://ai-coustics.com/blog/quail-voice-focus-2.1
- ai-coustics, docs y modelos: https://docs.ai-coustics.com/ , https://docs.ai-coustics.com/reference/sdk/models
- Krisp, BVC: https://sdk-docs.krisp.ai/docs/background-voice-cancellation-bvc , índice https://sdk-docs.krisp.ai/llms.txt
- Speechmatics, identificación en tiempo real: https://docs.speechmatics.com/speech-to-text/realtime/speaker-identification
- sherpa-onnx, denoiser en Kotlin: https://github.com/k2-fsa/sherpa-onnx/tree/master/kotlin-api-examples (`OnlineSpeechDenoiser.kt`)
- Google, VoiceFilter-Lite: https://research.google/blog/improving-on-device-speech-recognition-with-voicefilter-lite/
- Picovoice Eagle: https://picovoice.ai/docs/eagle/
