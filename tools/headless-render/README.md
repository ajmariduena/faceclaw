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
- No carga ni redistribuye fuentes propietarias del firmware.

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

## Límites

Es una prueba de componentes, no el shell completo: no arranca `Shell` ni `dashboard-controller`, ni valida oclusión compleja, profundidad por ojo, rendimiento BLE o paridad con el compositor Kotlin. Para animaciones deterministas, inyectar un reloj fijo y capturar varios instantes con `paintDisplayList`; para fuentes e iconos nativos, aportar adaptadores.
