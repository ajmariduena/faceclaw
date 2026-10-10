# Render sin teléfono

Pinta en la Mac, a PNG de 640x480 con los 16 niveles de gris reales, la barra del shell (`ShellChromeLayer`) y un menú (`MenuLayer`) usando el código de producción de `app/`. Sirve para iterar sobre estilos visuales en segundos, sin compilar ni instalar el APK.

```sh
cd tools/headless-render
npm install --ignore-scripts
node render.cjs bottom   # switcher abajo
node render.cjs popup    # switcher en popup
node render.cjs home    # dashboard + cinco apps, primera seleccionada
node render.cjs home-scrolled # Navigate (sexta), visibles Timers hasta Más…
node render.cjs home-alt # cuatro filas, texto mayor, panel 16 px más ancho
node render.cjs calendar # CalendarLayer real, cuatro eventos ficticios
node render.cjs calendar-even # mismos datos, propuesta de estilo
node render.cjs transition # cambio directo 0..4 y propuesta animada 0..4
node render.cjs transition-even # solo propuesta animada, 0/45/90/135/180 ms
```

Los PNG quedan en `tools/headless-render/out/` (ignorado por git).

## Cómo funciona

- Transpila los `.ts` con `tests/helpers/load-typescript.cjs`, el mismo helper de los tests.
- Reutiliza los mocks de geometría y chrome de `tests/app-layout.test.cjs`, extrayendo su código fuente. Está acoplado a ese test tal como estaba en el commit `84baee9`; si el test cambia, hay que ajustar los cortes de texto o, mejor, exportar fixtures explícitos.
- Fuente Terminus 16 desde el BDF del repo. Batería y reloj son datos fijos y los iconos se pintan como cuadrados.
- Los modos originales no cargan fuentes propietarias. Los modos stock usan una extracción local ignorada; no se redistribuye (ver abajo).

## Home propuesto

Los modos `home*` generan `home.png`, `home-scrolled.png` y `home-alt.png` en `out/`. Usan la geometría de producción: popup, estado solo al mostrar el switcher y sin borde de ventana; la banda 576×288 queda en (32,96) del PNG 640×480. No dibujan chrome.

`native-adapter.cjs` usa `@napi-rs/canvas` (Skia) exclusivamente en las fronteras nativas: métricas/cobertura para el `TtfFont` de producción y rasterizado de los SVG Lucide de `app/graphics/icons.ts`. `ui-fonts.ts` resuelve Roboto Light desde el TTF ya incluido; `GrayImage`, glyphs diferidos, el display list de selección y `withDrawsBaked()` componen el resultado. No se copian fuentes ni hay placeholders en estos modos. Los modos `bottom`/`popup` conservan Terminus e iconos simulados.

Datos fijos; el layout es una propuesta local en el runner, no un home funcional ni una ejecución de los widgets de Glanceboard. El adaptador de Skia puede diferir de Android en métricas, hinting y antialiasing. El programa comprueba que no se trunquen los nombres de las apps visibles y que carguen fuente/iconos; falla explícitamente si no cargan.

Medidas, integración, estimación y validación en [propuesta-home.md](../../research/even-ui/propuesta-home.md).

## Calendar y apertura

`calendar-scenes.cjs` fija fecha/hora al 7 de octubre de 2026, 09:41, America/Guayaquil; sustituye únicamente el proveedor de eventos, permiso, formato horario y las fronteras nativas del contexto. `calendar` pinta el `CalendarLayer` real; comprueba que tap no cambie la pantalla y que swipe abajo/arriba cambie/restaure la selección. Calendar no tiene detalle ni vistas día/semana: no se inventa un modo `calendar-even-detail`.

`calendar-even` es un painter propuesto usando las primitivas de producción, con los mismos datos y sin añadir acciones. Todos los PNG conservan banda y posición del home; no son capturas del teléfono.

`transition` produce `transition-0..4.png`: antes del tap y cuatro repeticiones de la agenda ya lista, porque el cambio de app actual no tiene animación. No asigna tiempos a la carga. También produce `transition-even-0..4.png`: desplazamiento horizontal de 180 ms/smoothstep, muestreado cada 45 ms. El home tiene seleccionada Calendar en ambos casos.

La propuesta usa el encoder, decoder y painter de display lists de producción: home horneado como base raster desde `SCREEN`, Calendar en dos recursos 576×144, tres `RECT_COPY` con destinos animados y clip de banda. `SCREEN` debe contener también los glyphs/iconos del home, no solo sus píxeles previos a los draws diferidos. Cada recurso cabe bajo 64 KiB empaquetados; el renderer verifica endpoints iguales a los stills. Esto demuestra autoría/replay software, no instalación ni rendimiento del firmware. Falta integrar preparación, caché, interrupciones y el cambio definitivo de ventana.

## Apps lean (painters de producción)

```sh
node --test calendar-app.test.cjs translate-app.test.cjs paseo-app.test.cjs
```

`calendar-app.test.cjs` pinta el `CalendarLayer` y el detalle reales con la fuente stock: agenda de hoy, días siguientes, día vacío, detalle con asistentes y notas, 12 h y permiso. `translate-app.test.cjs` carga la app Translate entera (ventana, capas, sesión y el reintento de Soniox) con solo el socket, el micrófono y el reloj simulados: en vivo, pausa, «Stop and leave?», conectando, monólogo largo, historial, idioma fuera del par, sin clave y clave rechazada. Los PNG quedan en `out/calendar-app-*.png` y `out/translate-app-*.png`.

## Límites

Es una prueba de componentes, no el shell completo: no arranca `Shell` ni `dashboard-controller`, ni valida oclusión compleja, profundidad por ojo, rendimiento BLE o paridad con el compositor Kotlin. Para animaciones deterministas, inyectar un reloj fijo y capturar varios instantes con `paintDisplayList`; para fuentes e iconos nativos, aportar adaptadores.

## Referencia stock

La v2 `stock-*` usa `GrayImage` y `EvenHubFont` reales. Son painters de propuesta con datos ficticios en español; no se integra aún el shell ni se conectan widgets. La fuente stock se extrae en Mac con el extractor de producción y validación SHA-256 contra `CFW_PATCH_SET`; queda únicamente en `out/local-fonts/`, ignorado por git. El script no descarga firmware ni accede al teléfono. Reloj, fecha e iconos son dibujos propios (`stock-art.cjs`), sin píxeles extraídos de imágenes.

Desde esta carpeta, después de instalar las dependencias:

```sh
node stock-font.cjs /ruta/local/al/EVENOTA-2.3.0.24.bin
node render.cjs stock-all
node render.cjs stock-dashboard
node render.cjs stock-dashboard-music
node render.cjs stock-dashboard-notifications
node render.cjs stock-widget-expanded
node render.cjs stock-menu
node render.cjs stock-menu-scrolled
node render.cjs stock-menu-right
node render.cjs stock-menu-open
node render.cjs stock-open
node render.cjs stock-exit-dialog
node render.cjs stock-notification
node compare-stock.cjs /tmp/even-ref
node --test stock-scenes.test.cjs
```

También se aceptan individualmente `stock-menu-open-0` a `stock-menu-open-4` (0/125/250/375/500 ms), y `stock-open-0` a `stock-open-3` (0/100/200/300 ms). `stock-all` genera 18 PNG de 640×480, contenido 576×288 en (32,96), cuantizados a 16 niveles. Si falta el asset local, el runner falla explícitamente; no sustituye la fuente en silencio.

`stock-menu-open-*` anima un panel 196×260 usando `encodeDisplayList → readDisplayList → paintDisplayList`, recurso empaquetado de 25.485 bytes, clip fijo y smoothstep. Solo el movimiento es autónomo en la lista; desaparición del reloj/atenuación del fondo y `stock-open-*` son muestras raster de `dimmed()`. El endpoint se comprueba después de cuantizar a 4 bits. No se afirma una animación alpha en firmware ni fluidez BLE.

`stock-widget-expanded` muestra la tarjeta a ancho completo; `stock-open-3` es Calendario como función propia. `stock-menu-right` adapta reloj compacto sobre tarjeta izquierda y menú derecho; no existe una referencia stock equivalente. Música y recientes también son widgets propios. El prototipo conserva el catálogo completo y prueba su wrap; los PNG no ejecutan gestos ni abren «Más…».

El comparador produce `compare-stock-<estado>.png` para cada modo, hojas `stock-comparisons-1..3.png` y `stock-comparison-manifest.json`, siempre en `out/`. Referencia a la izquierda, banda generada a la derecha a escala 1:1. Los renders oficiales conservan color/anotaciones originales; los frames de vídeo se recortan y escalan, sin asumir equivalencia temporal exacta. Ninguna referencia se lee desde el painter ni se incorpora a código/producto. La extracción de fuente no copia dígitos ni iconos de capturas.

Spec, diferencias frente a v1 y estimación en [referencia-stock.md](../../research/even-ui/referencia-stock.md) y [plan.md](../../research/even-ui/plan.md). Los modos anteriores mantienen fuentes, contenido y rutas originales.

`node stock-digits.cjs` genera `out/stock-digits.png`: diez dígitos propios 56×68 con segmentos llenos y conectados, puntos 2×2/paso 3, «1» centrado con remate/base. Incluye 09/41, 12:54, 07:52 y 18:30 a escala 1:1, fecha «Mie 07/10» sin acento y clima con grado hueco.

## V3: cinco tarjetas, sin menú de apps

Decisiones finales de la revisión Fable/Astra: Calendario → Música → Notificaciones → Traducir → Más, fijo y circular. AI Chat está en Más y se propone entrada por «Hey Even». Más lista Conversar, AI Chat, Teleprompter, Navegar, Timers y Ajustes. El menú existente del shell conserva tap+mantener.

```sh
node render.cjs v3-all
node render.cjs v3-home-calendar
node render.cjs v3-home-music
node render.cjs v3-home-music-empty
node render.cjs v3-home-notifications
node render.cjs v3-home-translate
node render.cjs v3-home-more
node render.cjs v3-more-list
node render.cjs v3-enter
node render.cjs v3-app-calendar
node render.cjs v3-translate-confirm-exit
node render.cjs v3-notification
node --test v3-scenes.test.cjs stock-scenes.test.cjs
```

`v3-enter-0..3` también se aceptan individualmente: 0/67/133/200 ms. Deslizamiento horizontal recortado mediante display lists de producción, retorno inverso probado, sin crecimiento. Dos recursos destino de 41.477 bytes, fuente en `SCREEN`; se pinta una sola tarjeta visible y el batch guarda cada PNG antes de generar el siguiente. La flecha ⇄ de Traducir es pixel-art propio porque falta ese glifo en el asset local; texto y fuente stock no cambian.

Catorce escenas finales de 640×480, banda en (32,96), cinco puntos siempre presentes. Los estados vacíos no quitan tarjetas. El reloj conserva exactamente los píxeles v2. No hay modos v3 para AI Chat/Conversar ni integración real de gestos, voz o proveedores. Doble tap vuelve a la tarjeta desde app; en home apaga; despertar seleccionará Calendario. Solo una grabación activa confirma con «¿Detener y salir? / > Seguir / Salir». Fuente privada sigue exclusivamente en `out/local-fonts/` ignorado; no se tocaron modos anteriores.

Modelo completo, límites de caché y estimación vigente: [v3: sin menú](../../research/even-ui/plan.md#v3-sin-menú).

## Columna del home (producción)

`home-column.cjs` pinta con `paintHome` de producción el home lean con su columna izquierda: reloj de matriz de puntos HH/MM, día, medidores de anillo y gafas, clima y agentes de Paseo que esperan, junto a las tarjetas Paseo, Calendar y Translate a las 09:41 y 22:07. Deja `out/home-column-*.png`. `home-column.test.cjs` genera los mismos seis PNG más `home-column-full/unknown/extremes` y comprueba que filas y reloj no se toquen, que haya hueco entre día/medidores y clima/agentes, que las complicaciones ocultas no dejen tinta, que el texto sea inglés sin pistas de gestos y que tarjeta y puntos sigan intactos.

```sh
node home-column.cjs
node --test home-column.test.cjs
```

## Lean CORE

`lean-core.test.cjs` pinta con los painters de producción las pantallas del CORE lean (`research/lean-spec.md`): las cinco tarjetas del home con sus estados, More, el placeholder de Converse, los estados de Settings y Timers. Deja `out/lean-core-*.png` y comprueba marco, paso de 27 px, chrome en inglés y que no haya instrucciones de gestos.

```sh
node --test tools/headless-render/lean-core.test.cjs
```
