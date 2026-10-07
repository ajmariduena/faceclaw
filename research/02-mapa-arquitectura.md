# Mapa de arquitectura: qué se puede modificar

Análisis de solo lectura sobre upstream `84baee9`. Faceclaw es GPLv3 y no tiene SDKs de analítica. Las gafas solo ejecutan lo mínimo; el teléfono dibuja la UI, procesa gestos y corre el asistente. ~98k líneas de TypeScript en `app/`, ~218 archivos Kotlin.

## Resumen por capa

| Capa | Qué se puede cambiar | Dificultad | Riesgo |
|---|---|---|---|
| Apps web EvenHub | `.ehpk` instalable desde Files o URL en modo dev; extensiones de Faceclaw: lienzo 576x452, fuentes, brújula, voz, vibración, herramientas del asistente | Baja | Nulo |
| Apps nativas | 2 archivos + una línea en `app/apps/all-apps.ts` | Baja | Nulo |
| Glanceboard y barra de estado | Widgets y tray icons | Baja | Nulo |
| Herramientas del asistente | `registry.registerSystemTool(...)` | Baja | Nulo |
| Prompts | `app/prompts.ts` | Baja | Nulo |
| Ajustes y menús | `dashboard-settings.ts`, `settings-menus.ts` | Baja | Nulo |
| UI del teléfono | XML/CSS/view models en `app/phone-ui/` | Baja-media | Nulo |
| Proveedor de LLM nuevo | ~6 puntos; chat/completions necesita cliente propio (el actual usa Responses API) | Media | Nulo |
| Integraciones Android | Clase Kotlin + wrapper TS | Media | Bajo |
| Protocolo BLE | Lado teléfono; el formato debe coincidir byte a byte con g2flash | Media-alta | Bajo |
| Firmware | 39 parches sobre stock 2.3.0.24 generados desde g2flash | Alta | Alto: sin modo de recuperación documentado |

## Apps

- `AppDefinition` en `app/apps/app-definition.ts:16-41` (`appId`, `title`, `icon`, `launch`, opcionales `boot`, `showInLauncher`, `renderIcon`, `glanceboard`). Registro único y orden del launcher en `app/apps/all-apps.ts:35-63`.
- Plantilla worker: `app/apps/minesweeper/` (`index.ts` de 18 líneas con `launchWorkerAppWindow`, más el worker con `handleInput`, `paint`, `renderAndSubmit`). Protocolo en `app/ui/shell/worker-window.ts:17-165`. El worker debe crearse con `new Worker("./x.worker")` con ruta literal (webpack).
- Plantilla en proceso: `app/apps/compass/index.ts` → `createInProcessWindow` (`app/ui/shell/in-process-window.ts:88`) con un `Layer` (`app/ui/layers.ts:82-117`).
- Iconos: `IconName` existente o SVG Lucide nuevo en `app/graphics/icons.ts`.

## Render

- Panel 640x480 (`app/graphics/image.ts:7-8`), 16 niveles (cuantizador en `app/graphics/display-list.ts:182`). Ventana por defecto 576x288; switcher 64 px y barra superior 28 px (`app/ui/shell/geometry.ts`).
- Primitivas en `image.ts`: `fillRect`, `drawRect`, `drawLine`, `drawText(Wrapped)`, `drawRoundedRect`, `drawImage`, `drawDisplayList`, `drawDepthImage`, `imageFromAsciiArt`.
- Display lists (`display-list.ts`, `display-list.md`): `RECT_COPY`, `IMAGE`, `ROUNDED_RECT`, `CLEAR`, `DRAWS`, con coordenadas animadas por expresiones con easing que ejecuta el firmware. Límites: 256 imágenes por lista, 64 KiB por imagen, 4096 llamadas, bytecode de 1024 bytes; repintado cada 45 ms.
- Caché de texturas: 192 KiB, 512 slots (`ResourceCacheState.kt:23-27`). El "256 KiB" de `native/kotlin/README.md` está desactualizado.

## Input

- `InputEvent` en `app/ui/gestures.ts:24-76`. Las apps reciben eventos por `Layer.handleInput`; `acceptsDirectional` para swipes crudos, `hitTest` para toques en el espejo del teléfono, `receiveTextInput` para texto.
- Reservado por el shell (`app/ui/shell/shell.ts:945-1000`): long-press abre el menú del sistema; tap-then-hold abre el menú de la app.
- Fuentes de input: anillo, táctil del teléfono (`app/phone-ui/phone-gestures.ts`), reloj Wear (`app/g2/wear-remote.ts`, `wear/PROTOCOL.md`) y remoto por tokens en 127.0.0.1:8791 (`app/remote/`, `scripts/faceclaw-input.cjs`). Todos llegan como el mismo `InputEvent`.

## Glanceboard y barra de estado

- Widget: implementar `GlanceWidget` (`app/apps/glanceboard/widget.ts:13-28`), agregar el id a `GlanceWidgetId`, registrarlo en `GLANCE_WIDGETS` (`widgets/index.ts:11-19`) **y** en `SLOT_CHOICES` (`glanceboard-settings.ts:8`), lista separada fácil de olvidar. Ejemplo más chico: `compass-widget.ts`.
- Tray icon: `shell.setTrayIcon(ownerId, GrayImage|null)` (`shell.ts:608`); ejemplo en `app/apps/timer/timer-app.ts:1353-1390`.

## Ajustes

- Clases `ConfigSettingBoolean/Enum/String` en `app/ui/dashboard-settings.ts:76-230` → `app/native/settings-store.ts` → `FaceclawSettings.kt` → `shared_prefs/faceclaw_settings.xml`.
- Filas de menú en `app/ui/dashboard/settings-menus.ts`.
- `scripts/pull_config.sh` / `push_config.sh` (ver bug en [04-bug-import-ajustes-bak.md](04-bug-import-ajustes-bak.md)). Los archivos exportados contienen API keys.

## Asistente

- "Hey Even" lo detecta el firmware (`EVEN_AI_WAKE_UP`, `app/g2/events.ts:24`).
- STT local con sherpa-onnx (Moonshine, Whisper base.en); nube con OpenAI, ElevenLabs y Soniox (`app/native/voice-control.ts:343-375`).
- Loop LLM en `app/assistant/direct-backend.ts` (8 pasos de herramientas, 4 en local, 2 minutos). Clientes en `app/native/anthropic.ts` y `app/native/openai.ts`; Qwen3-4B local vía llama.cpp (`app/native/llama.ts`). Modelos en `app/assistant/models.ts`.
- Herramientas: `registry.registerSystemTool({name, description, inputSchema, proactive?, timeoutMs?}, handler)` (`tool-registry.ts:108`); se registran en `g2/dashboard-controller.ts:392-398`. Las apps worker publican las suyas con `{type:"set-tools"}`. Timeout por defecto 10 s.

## Superficies remotas

- **Puente de agente** (`app/assistant/bridge-client.ts`): el teléfono se conecta por websocket a `ws://host:8790` con token, canales `ctl|chat|mcp`. Sin TLS, pensado para tailnet. Servidor: plugin [faceclaw-agent-bridge](https://github.com/jimrandomh/faceclaw-agent-bridge).
- **MCP** (`app/assistant/mcp-server.ts`): JSON-RPC 2025-06-18 que expone todo el `ToolRegistry`, solo sobre el canal `mcp` del puente. Llamadas proactivas requieren `assistant.allowProactive` y tienen límite de 6/min.
- **Tokens de entrada** (`app/remote/`): TCP 8791, una línea JSON por conexión, acciones `ping|input|text|assistant`. Tokens `fc1_<64hex>` guardados como SHA-256; solo escucha en 127.0.0.1 y Tailscale.
- **g2mirror** (`app/native/g2mirror-client.ts`): espejo de terminal.

## EvenHub

- WebView servido desde `<pkg>.evenhub.invalid` con shim del SDK stock (`app/apps/evenhub/session.ts`, `webview.ts`, `FaceclawEvenHubJsBridge.kt`).
- Extensiones `@faceclaw/evenhub-extensions` (`evenhub-extensions/`): lienzo 576x452, fuentes y `measureText`, buzzer, brújula, touch-down, entrada de texto y voz, herramientas del asistente, icono de ventana, keep-screen-on, `quit` real.
- EHPK (`ehpk.ts`): contenedor de registros con `app.json` + `dist/`, entradas zstd XOR "EVEN REALITIES". `networkWhitelist` no se aplica.

## BLE y firmware

- UUIDs y framing stock en `native/kotlin/shared/.../g2protocol/BleProtocol.kt`; transporte custom SID `0xf0` en `CfwTransport.kt:52-129` (zlib persistente con SYNC_FLUSH), ventana de 3 mensajes en `ConnectionOptions.kt:67`, timeouts y reintentos en `CfwMessageWindow.kt:16-23`.
- La app exige firmware `Faceclaw/37` (`app/g2/firmware-compat.ts:29`); el "13" de `notes/ios-protocol-sync.md` está desactualizado.
- `app/g2/firmware-builder.ts`: descarga stock 2.3.0.24 de `cdn.evenreal.co`, verifica SHA-256, aplica 39 parches con verificación de bytes y un blob de ~71 KB de g2flash, y verifica el SHA-256 final. Requiere 30% de batería en ambos brazos. Flasheo por OTA en bloques de 4096 bytes, lente izquierda y luego derecha.
- Recuperación: "Uninstall custom firmware" reflashea stock 2.3.0.24; la app oficial de Even también puede actualizar. Las gafas solo verifican CRC, sin firma.

## Licencias

GPLv3: redistribuir obliga a publicar el código modificado. El firmware stock no va incluido (se descarga) y sus fuentes se extraen en el teléfono. `cfw-patches.ts` incluye bytes del firmware stock y ~71 KB compilados de g2flash, cuya licencia no figura en este repo.

## Discrepancias encontradas

- Caché 192 KiB, no 256.
- Firmware requerido revisión 37, no 13.
- `PRIVACY` no menciona Roam, T3 Code, HuggingFace, el CDN del firmware ni api.weather.gov.
