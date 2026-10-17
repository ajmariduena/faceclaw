# Adaptacion de audio de upstream al fork custom

Base del fork: `4145c81e209af1889a9892906bd9db2477e022d6` (`origin/main`).
La rama de trabajo se actualizo por fast-forward antes de aplicar los cambios.

Cambios adaptados, sin fusionar el resto de upstream:

- `b50898ea02585a901006ee37ae0ec34a908f78c5`: recuperacion de microfonos,
  continuidad del beamformer, almacenamiento y manejo de errores de captions.
- `60c87521b0667ead63409e529f9d57c93847211e`: propietarios del microfono,
  cierre asincrono de captions, recuperacion de WAV y conversion sin perder audio.
- `5f2799f56949d51fbee9e935318ac2c83736190b`: reloj de captions, recuperacion
  de conversiones incompletas y captura continua compartida.

## Adaptaciones del fork

- Conversar y Traducir usan un propietario distinto por instancia. Cerrar una
  sesion no corta otra, incluso si se reabre una ventana antes de cerrar la anterior.
- Cada captura raw de un worker (incluido Paseo) tiene su propio propietario;
  un intento rechazado libera su solicitud y un cierre repetido es inocuo.
- El audio del dictado no se entrega a suscriptores raw mientras ese dictado
  tiene el microfono. Conversar y Traducir lo recuperan al terminar.
- Se conserva la conversion masiva de bytes Java del fork, el filtro nativo
  `WearerGate`, su umbral de verificacion `0.55` y el filtro de voz de Traducir.
- El cambio de `VoiceDraft` se aplica en su ubicacion custom `app/ui/voice-draft.ts`.
- La captura continua de Calculadora, Transcribe y Teleprompter usa clientes
  separados para que el cierre de uno no detenga a los demas.
- Home, su diseno, las funciones de Conversar/Traducir y los proveedores cloud
  custom conservan sus implementaciones.

## Validacion

Comandos pesados ejecutados en la Mac mini mediante Crabbox, con
`CRABBOX_STATIC_ID=faceclaw-swift-meerkat`. JDK 21 y Android SDK existentes;
no se copian credenciales ni configuracion del telefono.

- TypeScript (`npx tsc --noEmit -p tsconfig.json`): aprobado.
- Lint completo: 0 errores, 0 advertencias.
- Compilacion Android (`npm run build -- --env.production`): aprobada.
  APK debug: `dist/faceclaw-custom-audio-debug.apk` (artefacto local ignorado por Git).
  No se instala ni publica. No se ejecuta una compilacion iOS en esta revision.
- 12 regresiones nuevas: aprobadas (propiedad del microfono, reconexion,
  preemption, filtro de voz, ultimo subtitulo y persistencia de grabaciones).
- 43 pruebas Kotlin dirigidas: aprobadas. Incluyen `CaptionEngineCoreTest`,
  `GlassesSessionCoreTest`, `VoiceCaptureSessionTest`, `WavRecorderRepairTest`
  y `WearerGateTest`.
- Suite Node completa: 928 aprobadas, 1 fallida y 1 omitida. El fallo de
  `lean-api-keys.test.cjs` tambien se reproduce sobre un archivo limpio de la
  base `4145c81`: su mock no refleja la interfaz actual de ajustes
  (`grokBotNamesSetting.displayValue`). No se modifica esa interfaz ni su prueba.
- Suite Kotlin completa: 224 aprobadas y 1 fallo de timing en
  `PreviewAnimationListenerTest`, en la asercion del primer frame. La prueba y
  el compositor no cambian en este parche. La prueba pasa aislada sobre la base;
  upstream documenta y corrige la carrera en `1d257e8`. No se incorpora ese
  cambio ajeno al audio.

La validacion automatica no demuestra el comportamiento en gafas fisicas.
Falta comprobar en dispositivo la reconexion durante captura, alternar dictado
con Conversar/Traducir, el cierre de captions con una frase pendiente y la
recuperacion de grabaciones tras terminar el proceso.
