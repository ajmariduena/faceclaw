# Faceclaw lean: propuesta de interacción

10 oct 2026 · revisión de `feat/paseo-app`, `7f5c8af`. Propuesta, no implementación. Mandan `lean.md` y «Diseño aprobado» de `paseo-app/plan.md` sobre los antecedentes. Marco terminal: caja redondeada, fuente stock/paso 27 px, contenido blanco, secundarios tenues, elecciones anidadas con `>`, separador y pie de estado. Chrome siempre en inglés; contenido en su idioma; sin instrucciones gestuales.

## Home: cinco posiciones estables

**Calendar → Paseo → Translate → Converse → More**, circular mediante scroll vertical. Horizonte conserva hora 24 h, fecha inglesa y próximo evento; la tarjeta derecha usa el marco terminal. Nunca reordenar por actividad ni desaparecer por falta de datos.

| Tarjeta | Lo que permite saber sin abrir |
|---|---|
| Calendar | Los eventos posteriores al que ya muestra Horizonte; `Nothing else today`, `Loading` o `Calendar unavailable` cuando corresponda. |
| Paseo | Hasta dos agentes: título/antigüedad tenues y estado o última línea en blanco; prioridad a `Needs input`. Conteo pendiente en el pie. Sin depender de Luna en esta entrega. |
| Translate | `ES / EN`, `Ready` o `Setup required`; al abrir empieza la traducción bidireccional, una vez configurada. |
| Converse | `Live facts`, `ES / EN`, `Ready` o `Setup required`; al abrir empieza la sesión. No mostrar datos de conversaciones anteriores como actuales. |
| More | `AI Chat · Settings`; sin cuadrícula ni segunda página. |

**Converse merece tarjeta:** es una de las dos funciones que necesitas comenzar durante una conversación, sin buscarla en menús; completa cinco posiciones sin añadir otra. AI Chat admite acceso por voz y tolera More.

Despertar normal: **Calendar**. Excepción explícita: si hay captura o borrador activo, recuperar esa pantalla y su estado; despertar nunca inicia, reinicia ni envía audio. Atención de Paseo actualiza la tarjeta, sin desplazar una conversación ni aprobar nada. Volver conserva tarjeta y selección de origen.

## Una gramática, un nivel de retorno

| Entrada R1 / patillas | Contrato en todas las pantallas |
|---|---|
| Tap (`click`) | Ejecutar la acción enfocada, identificada por `>` cuando haya elección. Home abre; lista entra; elección confirma. |
| Scroll up/down | Anterior/siguiente: tarjeta, fila, opción o fragmento de historial. Solo Home es circular; listas y opciones se detienen en los extremos. Nunca cambia de app dentro de un chat. |
| Double-tap | Cerrar la capa superior o volver **un nivel**: detalle → lista → origen. En Home no hace nada. No envía, aprueba ni apaga. |
| Long-press | Menú del sistema, incluso durante captura: `Home`, `App actions`, `Brightness`, `Display off`. |
| Tap-then-hold | Atajo opcional a `App actions`; todo sigue accesible con los cuatro gestos básicos. Nunca apilar dos menús. |
| `ring-press` / release | Sin acción de producto: no iniciar micrófono, confirmar ni enviar. |

En chats, acción normal `Reply`; scroll recorre mensajes, sin mover el foco por llegadas nuevas. Tap inicia dictado; durante `Listening`, acción `Finish`; después aparece borrador con `> Send`, `Edit`, `Discard`. Double-tap cancela captura sin enviar y conserva el texto disponible. Lectura completa desde `App actions > Read full`; usar el mismo comportamiento en Paseo y AI Chat. Una pregunta/permiso toma el foco explícitamente, sin que un tap destinado a `Reply` apruebe una solicitud recién llegada.

En Translate/Converse, tap confirma `Pause` o `Resume`, visibles como acciones, no como instrucciones. Scroll consulta historial; indicador `History`/`Live`, sin saltar al llegar texto. Salir de una sesión con micrófono activo, también mediante `Home` o `Display off`, abre `Stop and leave?` / `> Keep listening` / `Stop and leave`; double-tap cancela el diálogo. Si está pausada, salir termina la sesión sin confirmación. Inactividad no cambia de pantalla durante captura. Un solo dueño del micrófono. `Hey Even` abre AI Chat cuando está libre; no interrumpe Translate, Converse o dictado.

**Conflictos verificados:** Home ya consume `scroll-up/down` (`home-app.ts:80`); no necesita swipes laterales. El problema es `shell.ts:1038`: intercepta double-tap, manda cualquier app a Home y allí apaga; impide el `goBack` de Paseo (`paseo-app.worker.ts:692`). Dar primero retorno a modal/app; solo la raíz vuelve a Home. `finishDictation` (:1109) envía directamente: introducir revisión del borrador. El shell tiene excepciones hold-to-talk/bloqueos de menú durante voz (:962): eliminarlas del perfil lean. Son hallazgos de código, no pruebas físicas.

## More y poda

**More: AI Chat → Settings.** Teleprompter y Timers quedan fuera del build lean inicial: el primero añade gestión de guiones en un Android secundario; el segundo duplica una necesidad ya cubierta por el teléfono principal. Es una decisión de alcance, no una limitación técnica. Navigate se incorpora después, antes de Settings, cuando esté listo; sin fila deshabilitada hoy.

Settings en gafas: brillo, estado G2/R1 y conexión; configuración detallada en teléfono. Retirar del recorrido cuadrícula, carpetas, sidebar de ventanas, editores de claves en gafas, selectores de proveedores/modelos, ajustes de Music/Notifications y descargas de modelos locales. Translate debe abrir su sesión, no el menú técnico Microphones. Quitar tarjetas, suscripciones y popups Android de Music/Notifications; conservar atención propia de Paseo. Reducir el teléfono a conexión/dispositivos, servicios y diagnóstico desplegable. No borrar datos existentes al simplificar.

## Teléfono: API keys agrupadas por función

Supuesto de producto: AI Chat/Converse corren en Android; Paseo conserva su daemon. **Cuatro credenciales de nube:** Soniox, Cerebras, OpenRouter y un buscador. La integración todavía debe comprobarse.

| Grupo | Credenciales y comprobación visible |
|---|---|
| Speech · Translate / Converse / AI Chat | Soniox, guardada una vez. `Test`: audio sintético breve conocido; comprobar transcripción y traducción ES/EN. |
| AI Chat | Cerebras; `Test`: respuesta breve del modelo configurado. Indicar `Also used by Converse`. |
| Converse | Reutilizar Soniox/Cerebras; OpenRouter para Jev; una clave Search. Mantener Parallel del prototipo como punto de partida, Brave como alternativa excluyente, no exigir ambas. `Test`: decisión, búsqueda y frase con fuente; resultado por etapa. |
| Paseo connection | Pairing y `Test connection`: conexión autenticada + lectura de agentes. Dictado ElevenLabs configurado en el daemon; `Test dictation` separado, sin copiar esa clave al Android. |

OpenAI y Anthropic no son requisitos del perfil elegido; ElevenLabs local tampoco. Ocultar sus campos. Assistant bridge queda fuera al usar agente integrado; no confundirlo con pairing Paseo. Mapbox queda fuera hasta decidir Navigate. El prototipo redactó vía OpenRouter/Cerebras: la clave directa de Cerebras corresponde al diseño propuesto, no prueba una integración existente.

Cada servicio: clave enmascarada, `Test`, `Not configured / Untested / Testing / Working / Failed`, hora del último test y error útil (`Invalid key`, `Rate limited`, `Offline`). Editar clave/modelo invalida el resultado. Los tests usan fixtures y avisan de consumo; no graban conversación real. `Working` no certifica micrófono/BLE ni lectura en lentes. La feature solo muestra `Ready` si están todas sus dependencias; las demás siguen funcionando si falta una clave.

**Riesgos prioritarios:** captura oculta por el shell, aprobación/envío accidental, confundir ausencia de datos con desconexión y calendario vacío porque la cuenta del iPhone no está sincronizada en Android. Validación siguiente: con R1, regresar chat→lista→Home, cancelar dictado sin envío, salir de captura por todas las rutas, despertar una sesión activa y probar pérdida de red. Lectura/BLE pendientes de gafas reales.

Fuentes: planes indicados en el encargo; `app/ui/gestures.ts`, `app/apps/home/`, `app/apps/paseo/`, `app/ui/shell/shell.ts`, `app/ui/dashboard-settings.ts:800–925`. La semántica base coincide con [Even: The grammar of a ring](https://www.evenrealities.com/blogs/even-insider/the-grammar-of-a-ring); las reglas de foco, salida y despertar son propuestas de esta revisión. Renders de apoyo: `tools/headless-render/lean-ux-astra.cjs`.
