# Render sin teléfono

Pinta en la Mac, a PNG de 640x480 con los 16 niveles de gris reales, la barra del shell (`ShellChromeLayer`) y un menú (`MenuLayer`) usando el código de producción de `app/`. Sirve para iterar sobre estilos visuales en segundos, sin compilar ni instalar el APK.

```sh
cd tools/headless-render
npm install --ignore-scripts
node render.cjs bottom   # switcher abajo
node render.cjs popup    # switcher en popup
```

Los PNG quedan en `tools/headless-render/out/` (ignorado por git).

## Cómo funciona

- Transpila los `.ts` con `tests/helpers/load-typescript.cjs`, el mismo helper de los tests.
- Reutiliza los mocks de geometría y chrome de `tests/app-layout.test.cjs`, extrayendo su código fuente. Está acoplado a ese test tal como estaba en el commit `84baee9`; si el test cambia, hay que ajustar los cortes de texto o, mejor, exportar fixtures explícitos.
- Fuente Terminus 16 desde el BDF del repo. Batería y reloj son datos fijos y los iconos se pintan como cuadrados.
- No carga ni redistribuye fuentes propietarias del firmware.

## Límites

Es una prueba de componentes, no el shell completo: no arranca `Shell` ni `dashboard-controller`, ni valida oclusión compleja, profundidad por ojo, rendimiento BLE o paridad con el compositor Kotlin. Para animaciones deterministas, inyectar un reloj fijo y capturar varios instantes con `paintDisplayList`; para fuentes e iconos nativos, aportar adaptadores.
