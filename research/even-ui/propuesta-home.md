# Home con dashboard y apps fijadas

**Propuesta, no integración realizada.** Sobre el fork local `2fd9942`, 2026-10-07. Se implementó únicamente el render headless; no se modificó `app/`, no se compiló APK ni se accedió al teléfono.

## Lo que se ve

[Home](../../tools/headless-render/out/home.png): reloj, fecha, batería **de las gafas**, clima y próximo evento a la izquierda; apps a la derecha, sin barra de estado ni switcher permanentes. Fondo negro, una familia —Roboto Light incluida en el repo—, contornos sin relleno e iconos Lucide existentes. Sin recursos de Even extraídos.

[Home desplazado](../../tools/headless-render/out/home-scrolled.png): selección global **6, Navigate**; visibles Timers, Navigate, Teleprompter, Settings y Más…. Conserva el dashboard inmóvil. El contador `6 / 9` comunica posición, no cantidad de páginas.

[Alternativa](../../tools/headless-render/out/home-alt.png): panel 16 px más ancho, texto de apps de 22 en lugar de 20 px, cuatro filas con paso 52 en lugar de cinco con paso 44. Prioriza legibilidad; exige más desplazamiento. La base conserva mejor el reparto 55/45 y muestra más accesos. Elegir definitivamente tras Preview Only y, fuera de este alcance, lectura en las gafas.

Fixtures: `09:41`, `Miércoles, 7 oct` (2026), `82%`, `18° Nublado`, `10:30 Daily`. Las ocho apps conservan los nombres de producción solicitados; «Más…» es la novena fila fija, abre el launcher completo existente, incluidas sus carpetas. Ningún juego o herramienta de desarrollo se fija por defecto.

## Medidas

Coordenadas locales a la banda, salvo el primer renglón; tamaños en px.

| Elemento | Base |
|---|---|
| Panel físico / banda | 640×480 / 576×288, origen **(32,96)**; posición vertical central, profundidad 0 en la captura |
| Reparto | Izquierda hasta x=320 (55,6%); panel derecho x=320, y=8, 248×272; margen derecho 8 |
| Reloj | x=20, y=24, Roboto Light 64 |
| Fecha / batería | (23,108), fuente 17; batería (24,152), texto (62,146), fuente 16 |
| Clima / evento | Iconos 20×20 en (24,206)/(24,240); texto 17 en (56,202)/(56,236) |
| Panel / selección | Contorno 1 px, radios 16/8; gris 119/238 sobre 255, sin relleno |
| Lista | Cinco filas; inicio (332,26), ancho 224, alto 40, paso 44; icono 20 y texto 20 |
| Jerarquía | Texto seleccionado 255; otras apps 170; fecha/evento 204; batería 187; 16 niveles al exportar |

Las posiciones de texto son el tope de la caja de línea, no la línea base. El renderer usa `ui-fonts` para pequeño/medio (16/17 con este adaptador); reloj y lista usan `TtfFont` de la misma familia. No reduce las apps no seleccionadas a los 50/255 de EvenHub: se mantienen legibles en la previsualización. La selección ocupa toda la fila para alinear iconos y nombres.

## Piezas verificadas y trabajo nuevo

| Reutilizar | Evidencia local |
|---|---|
| Primitivas, glyphs diferidos y display lists | [image.ts:249](../../app/graphics/image.ts:249), [image.ts:515](../../app/graphics/image.ts:515), [image.ts:626](../../app/graphics/image.ts:626) |
| Resolver Roboto y métricas; SVG Lucide | [ui-fonts.ts:89](../../app/graphics/ui-fonts.ts:89), [ttf-font.ts:82](../../app/graphics/ttf-font.ts:82), [icons.ts:159](../../app/graphics/icons.ts:159) |
| Reloj, batería y sus fuentes de datos | [system-card.ts:62](../../app/apps/glanceboard/widgets/system-card.ts:62), [system-card.ts:115](../../app/apps/glanceboard/widgets/system-card.ts:115), [system-card.ts:171](../../app/apps/glanceboard/widgets/system-card.ts:171) |
| Clima cacheado y caducidad | [system-card.ts:227](../../app/apps/glanceboard/widgets/system-card.ts:227), [weather-icons.ts:87](../../app/apps/weather/weather-icons.ts:87) |
| Calendario y sus estados/suscripciones | [calendar-widget.ts:28](../../app/apps/glanceboard/widgets/calendar-widget.ts:28), [calendar-widget.ts:47](../../app/apps/glanceboard/widgets/calendar-widget.ts:47) |
| Menú, scroll y contorno de selección | [list-menu.ts:58](../../app/apps/evenhub/list-menu.ts:58), [list-menu.ts:123](../../app/apps/evenhub/list-menu.ts:123) |
| Ventana persistente, catálogo y launch | [launcher-app.ts:291](../../app/apps/launcher/launcher-app.ts:291), [launcher/index.ts:11](../../app/apps/launcher/index.ts:11), [launcher/index.ts:32](../../app/apps/launcher/index.ts:32) |

Construir `HomeLayer` y `createHomeWindow`, un modelo breve de datos, un painter de filas con iconos y la preferencia ordenada de apps fijadas. **No pegar los widgets completos:** sus painters incluyen otros elementos y medidas; extraer funciones de datos/formato compartidas manteniendo sus suscripciones, cachés y estados de error. El PNG usa fixtures; no ejecuta esos widgets ni consulta sus proveedores.

## Integración propuesta

1. **Ventana:** `home` / `window:home`, altura `min`, `closeable:false`, creada con el mecanismo del launcher. En [apps/launcher/index.ts:40](../../app/apps/launcher/index.ts:40), registrar primero home y después el launcher actual; conservar `launchApp('launcher')` para «Más…». Fijar foco en home al arrancar y al volver. Revisar [restoreOpenApps:2482](../../app/g2/dashboard-controller.ts:2482): hoy restaura también el foreground; no debe quitarle el foco inicial al home. Las apps abiertas conservan sus ventanas.
2. **Chrome:** el PNG verifica la geometría existente `popup + statusBarVisibility=switcher + windowBorder=false`, que entrega exactamente 576×288 en (32,96) ([geometry.ts:172](../../app/ui/shell/geometry.ts:172), [geometry.ts:377](../../app/ui/shell/geometry.ts:377)). En el producto, resolver ese perfil **para home**, sin reescribir preferencias globales. Pasar el appId a las decisiones de geometría/chrome, reconfigurar superficies al cambiar foco y comprobar [chrome-layer.ts:428](../../app/ui/shell/chrome-layer.ts:428). Poner solo el dibujo encima del chrome no recupera el espacio que este reserva.
3. **Datos:** compartir reloj al minuto, `shell.getBatteryLevels().headset`, `weatherBridge.snapshot()` y `readUpcomingEvents()` filtrado por `endMs > now`. Iniciar/detener listeners con `onForegroundChanged` ([in-process-window.ts:224](../../app/ui/shell/in-process-window.ts:224)). Añadir la necesidad de clima del home al OR de refresco existente ([weather-indicators.ts:29](../../app/apps/weather/weather-indicators.ts:29)); escuchar snapshots por sí solo no solicita datos. Seleccionar evento actual o siguiente; truncar títulos y manejar día completo/sin permiso/sin datos. Batería desconocida: `—`, nunca 0% ni la del teléfono.
4. **Input:** `scroll-up/down` mueve una fila, sin wrap; `click` llama `ctx.launchApp(appId)`. Mantener selección y scroll al regresar. Al salir por abajo de las cinco filas, adelantar la ventana dejando la selección cerca de arriba (el snapshot 6 muestra filas 5–9). Con pantalla encendida y sin modal, interceptar el **doble tap del anillo** antes del dispatch al sidebar/app en [shell.ts:1015](../../app/ui/shell/shell.ts:1015), enfocar home y consumirlo; en home no hace nada. Modales de captura/confirmación conservan primero su cancelación; pantalla apagada conserva wake. Documentar esa prioridad y probarla: hoy el doble tap también significa back/sleep, y cambiar solo `yieldFocusToSidebar()` no cubre apps que lo consumen internamente ([shell.ts:822](../../app/ui/shell/shell.ts:822), [gestures.ts:33](../../app/ui/gestures.ts:33)). Preview Only ejercita los eventos equivalentes desde el teléfono, no BLE físico.
5. **Fijadas:** nueva preferencia JSON `home.pinnedApps` con IDs `ai-chat, notifications, calendar, music, timer, navigate, teleprompter, settings`. Resolver etiquetas/iconos por catálogo, quitar duplicados y omitir IDs inexistentes. Distinguir preferencia ausente (defaults) de lista vacía elegida por el usuario; añadir siempre «Más…», que no se puede quitar. En Settings → Customization → Inicio, añadir/quitar/reordenar/restablecer usando [ConfigSettingString:191](../../app/ui/dashboard-settings.ts:191) y [settings-menus.ts:243](../../app/ui/dashboard/settings-menus.ts:243); invalidar la lista conservando selección por ID.

## Estimación y límites

Estimación de ingeniería, **no medición**; una persona familiarizada con el repo, entorno Android operativo. Etapas aditivas; incluye pruebas acotadas y aceptación futura en Preview Only.

| Etapa | Días/persona | Entrega |
|---|---:|---|
| (a) Home funcional mínimo en teléfono, Preview Only | **3–4** | Ventana/arranque/restore, chrome por home, datos y estados vacíos, defaults configurables en almacenamiento, abrir/volver/scroll |
| (b) Pulido visual | **1–2** | Métricas nativas, contraste, clipping, nombres largos, scroll y transiciones, revisión del preview |
| (c) Apps fijadas desde Settings | **1–2** | Añadir/quitar/ordenar/restablecer, persistencia y actualización inmediata |
| **Total** | **5–8** | Home listo para evaluación; no paridad con la UI stock completa |

Riesgos: doble tap frente al back de cada app; restauración de foco; cambios de tamaño entre home y otras ventanas; listeners persistentes; permisos de calendario/ubicación. **Clima:** el código actual usa `api.weather.gov` ([weather.ts:109](../../app/native/weather.ts:109)), contempla falta de cobertura ([weather.ts:395](../../app/native/weather.ts:395)) y muestra Fahrenheit ([weather-icons.ts:93](../../app/apps/weather/weather-icons.ts:93)). `18° Nublado` es un fixture, no prueba clima operativo en Ecuador. Conversión °C y etiquetas breves en español caben en el modelo de presentación; un proveedor con nueva cobertura queda fuera.

No incluye rediseñar apps internas, servicios de Even, fuentes/iconos propietarios, cambios de firmware, proveedor meteorológico nuevo, build/instalación ejecutados en esta tarea, validación BLE/anillo real ni ajuste óptico binocular. El rasterizador local es Skia (`@napi-rs/canvas` 1.0.10), conectado a las interfaces nativas de `TtfFont`/SVG; **no garantiza coincidencia píxel a píxel con Android**. La selección sí se hornea mediante el display list de producción. No hay placeholders en los tres homes.

Validado aquí: tres PNG inspeccionados; 640×480, escala gris cuantizada, banda correcta; modos `bottom` y `popup` siguen generando. **53/53 tests rápidos** (`app-layout`, `row-metrics`, `menu-core`, `evenhub-list-menu`), con 16 dependencias TypeScript transpiladas a `.test-build` para ejecutarlos, sin suite completa ni typecheck Android. Los renders quedan en `tools/headless-render/out/`, ignorado por git.

## Abrir una app: Calendar

**Base de cinco filas aprobada.** Al seleccionar Calendar (tercera fila) y pulsar, se abre una agenda de próximos eventos que ocupa la banda completa, sustituyendo al dashboard. No es una grilla mensual. [calendar.png](../../tools/headless-render/out/calendar.png) ejecuta el **`CalendarLayer.paint()` real**, con Roboto Light por defecto, geometría 576×288 en (32,96), permiso concedido y cuatro eventos ficticios. Se conservan los textos ingleses que pinta hoy la app; los nombres y lugares de los eventos están en español.

**Comportamiento verificado:** [launcher-app.ts:153](../../app/apps/launcher/launcher-app.ts:153) llama `launchApp`; [calendar/index.ts:10](../../app/apps/calendar/index.ts:10) abre o enfoca la ventana singleton mediante [dashboard-controller.ts:2341](../../app/g2/dashboard-controller.ts:2341). Nueva ventana: selección del primer evento. Reabrir una existente conserva su instancia y selección. [calendar.ts:46](../../app/apps/calendar/calendar.ts:46) pinta título, cabeceras de día, hora inicial o «All day», título del evento y ubicación opcional. No muestra descripción, hora final ni nombre del calendario, aunque parte de esos datos exista en el modelo. Lee hasta 50 eventos en una ventana predeterminada de 14 días; caché y tick de actualización de 30 s ([calendar.ts:20](../../app/native/calendar.ts:20), [calendar-app.ts:59](../../app/apps/calendar/calendar-app.ts:59)).

- **Swipe:** anterior/siguiente evento, sin wrap; centra la selección cuando hace falta desplazarse. El título se desplaza con la lista ([calendar.ts:70](../../app/apps/calendar/calendar.ts:70)).
- **Tap:** con permiso no hace nada; sin permiso vuelve a solicitarlo en el teléfono. El permiso también se solicita al crear la ventana ([calendar.ts:90](../../app/apps/calendar/calendar.ts:90), [calendar-app.ts:28](../../app/apps/calendar/calendar-app.ts:28)).
- **Doble tap actual:** `YieldAtRootLayer` entrega foco al switcher ([in-process-window.ts:265](../../app/ui/shell/in-process-window.ts:265)). **Con el home propuesto:** la interceptación del shell descrita arriba vuelve al home, con Calendar seleccionado; no cierra la agenda. Se mantienen las prioridades de modales y wake.
- **Sin sub-vistas:** esta implementación no abre detalle, día ni semana. Por eso no se genera `calendar-even-detail.png`; añadirlo sería funcionalidad nueva.

[calendar-even.png](../../tools/headless-render/out/calendar-even.png) propone el mismo contenido y navegación con cabeceras españolas, título de 22 px, eventos de 20, horas de 16 y ubicaciones/días de 14, todos Roboto Light. Margen 16–22; columna de hora x=30 y contenido x=132; filas de 48 px con lugar y 32 sin él. Selección: contorno 1 px, radio 8, sin relleno; 255/204 para título seleccionado/otros, 153 para datos secundarios. Caben los cuatro eventos de hoy/mañana, incluido uno de día completo. Es un **painter de propuesta** con primitivas y formato horario de producción, no un cambio aplicado a `CalendarLayer` ni navegación interactiva ya implementada.

### Transición actual y propuesta

| Caso | Duración / easing | Ejecución |
|---|---|---|
| Abrir Calendar hoy | **Sin animación de apertura**, sin easing; latencia de carga desconocida | El teléfono cambia visibilidad/foco; el compositor publica la nueva superficie |
| Menús/grilla existentes | 120 ms, smoothstep; rebote 160 ms, salida cuadrática y vuelta smoothstep | Display lists; no equivalen a una animación entre apps |
| Screen fade existente | 280 ms a velocidad Normal; la preferencia no define easing | Orden de brillo al firmware para encender/apagar, no fundido al abrir Calendar |
| Propuesta de apertura | **180 ms, smoothstep** `3t²−2t³` | Home sale a la izquierda y Calendar entra desde la derecha; expresiones de una display list |

Evidencia: [shell.ts:751](../../app/ui/shell/shell.ts:751), [shell.ts:1291](../../app/ui/shell/shell.ts:1291), [SurfaceCompositor.kt:479](../../native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/graphics/SurfaceCompositor.kt:479), [menu-highlight-motion.ts:4](../../app/ui/menu-highlight-motion.ts:4), [menu-scroll-motion.ts:42](../../app/ui/menu-scroll-motion.ts:42), [dashboard-settings.ts:484](../../app/ui/dashboard-settings.ts:484), [GlassesSessionBrightness.kt:13](../../native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/g2protocol/session/GlassesSessionBrightness.kt:13). Las velocidades actuales dividen la duración por 5/2/1/0,5; Disabled da 0 ([animation-speed.ts:9](../../app/ui/animation-speed.ts:9)). Propuesta: respetar esa preferencia también al abrir apps.

`transition-0.png` muestra Calendar seleccionado antes del tap; `transition-1..4.png` repiten la agenda tras el primer frame listo. **Son estados ilustrativos del cambio directo**, no una captura temporal ni una promesa de apertura instantánea: no simulan la espera o un posible frame transitorio de carga.

`transition-even-0..4.png` muestrean **0/45/90/135/180 ms**, después de preparar la agenda. Se generaron con `encodeDisplayList → readDisplayList → paintDisplayList` de producción. El recorte de texto en los bordes durante el movimiento es intencional; los extremos coinciden con las pantallas completas. Es una propuesta propia, no una reproducción observada de una transición stock de Even.

**Factibilidad:** `RECT_COPY` admite destino con expresiones y clip fijo; `E.progress(180).ease()` usa smoothstep. El firmware puede evaluar el movimiento después de subir recursos y presentar la lista; **no necesita un PNG/repintado por frame vía BLE**. Preview Only lo reproduciría en el compositor del teléfono. [display-list.md:27](../../app/graphics/display-list.md:27) documenta expresiones/clip y el temporizador de 45 ms; [FrameDisplayList.kt:45](../../native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/graphics/FrameDisplayList.kt:45) compila esas operaciones.

El prototipo reutiliza el home estable desde `SCREEN` y divide Calendar en dos imágenes 576×144: **41.477 bytes empaquetados cada una**, bajo 64 KiB; 82.954 bytes en total antes de asignación. La arena disponible es 194.560 bytes compartidos con otros recursos ([ResourceCacheState.kt:24](../../native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/g2protocol/ResourceCacheState.kt:24)). Una sola imagen 576×288 sobrepasaría el límite por recurso. Falta integrar la capa transitoria: conservar el home **horneado como base raster, incluidos glyphs e iconos** (`SCREEN` lee el frame sin componer, no los draws diferidos), preparar Calendar oculto, iniciar timeline cuando esté listo, bloquear taps duplicados/cancelar al salir y sustituir overlay/foco al finalizar sin flash. Preparar esa base también puede tener coste de transferencia. El contrato del repo requiere CFW 37 ([firmware-compat.ts:29](../../app/g2/firmware-compat.ts:29)), posterior al clip de rev. 35. La caché, carga inicial por BLE y entrega final requieren validación real; el PNG prueba el recorrido software, no el firmware instalado.

Expandir progresivamente el ancho del panel o hacer alpha-crossfade **no se expresa directamente en la API TS actual**: dimensiones y colores son literales y no hay operación de mezcla alfa ([display-list.ts:19](../../app/graphics/display-list.ts:19)). Un painter por frame podría simularlos, con repintados/envíos adicionales; no se necesita esa ampliación para el deslizamiento implementado aquí.

| Trabajo adicional al home | Días/persona |
|---|---:|
| Reestilizar Calendar, incluidos scroll, estados vacíos/permisos y nombres largos | **1–2** |
| Transición, preparación de recursos, handoff de superficies e interrupciones | **1–2** |
| **Adicional / total con home** | **2–4 / 7–12** |

Excluye detalle de evento, edición, nuevas vistas, proveedor de calendario, pruebas físicas BLE y recursos propietarios. Se revisaron los 12 PNG nuevos, se verificó tap sin detalle y swipe ida/vuelta contra `CalendarLayer` real, y pasaron **41/41 tests rápidos** de geometría, métricas, autoría de display lists y animaciones. Sin APK, teléfono, commits ni cambios en `app/`.
