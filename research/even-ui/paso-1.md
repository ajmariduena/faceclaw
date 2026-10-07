# Paso 1: prueba chica en app/

Implementado localmente en `feat/v3-home`, desde `main`, el 2026-10-07. Pendiente compilar/instalar por el usuario y aceptar en Preview Only. No APK, teléfono, BLE ni acciones remotas en esta entrega.

## Comportamiento

- Inicio persistente/no cerrable, banda centrada `(32,96,576,288)`. Geometría por app: ignora tamaño/posición global solo para Inicio. Sin barra, marco exterior ni switcher permanente; el menú y el switcher siguen accesibles por los gestos del shell.
- Calendario → Música → Notificaciones → Traducir → Más, circular. Scroll/swipe abajo avanza; arriba retrocede. Tap abre la app existente. En el espejo, tocar la tarjeta también abre; tocar el reloj no abre apps.
- Doble tap dentro de cualquier app vuelve a la tarjeta de origen, sin cerrar ventanas ni parar música/timers. Los overlays del shell conservan prioridad: primero se cierra el overlay. Doble tap en Inicio duerme; despertar normal vuelve a Calendario.
- Arranque en Inicio: esta prueba omite restaurar automáticamente ventanas de la ejecución anterior, porque los workers pueden reclamar foco después de resolver su lanzamiento. Las ventanas abiertas durante la sesión siguen vivas al volver a Inicio. No se borran los datos de las apps.
- Solo se pinta la tarjeta visible. Sin animación. Tick de 30 s y suscripciones mientras Inicio está visible/despierto; al ocultarlo se desuscriben.

## Datos reales y límites

| Elemento | Fuente / estado |
|---|---|
| Calendario | Lector existente; dos eventos del día aún vigentes, incluyendo el que está en curso. Sin permiso / Sin eventos hoy / cargando / error. Tap abre Calendar y su solicitud de permiso. El lector Android existente convierte fallos de consulta en lista vacía. |
| Música | Snapshot del bridge existente, iniciado también en Preview Only. Título/artista y Sonando/En pausa; vacío Nada sonando. Sin progreso ni carátula en esta prueba. |
| Notificaciones | Activas reales, ordenadas por publicación; respeta fuentes deshabilitadas. Dos recientes en tarjeta y contador de activas permitidas. Sin notificaciones si vacío/sin acceso; no se mantiene historial. |
| Reloj/batería | Fecha/hora local 24 h, dígitos propios; batería de gafas del shell, raya si desconocida. |
| Clima | Solo snapshot existente, Fahrenheit convertido a Celsius; sin snapshot se omite. Inicio no solicita ubicación ni inicia consultas. El proveedor existente puede no cubrir Ecuador. |
| Traducir | Tarjeta estática ES ⇄ EN · Toca para empezar; abre Microphones. No inicia traducción/grabación ni incorpora Soniox. |
| Más | Abre el launcher actual completo; apps abiertas desde allí vuelven a Más. |
| Fuente | EvenHub extraída si el cargador existente tiene glifos latinos; si falta, fuente UI seleccionada por defecto. No se empaqueta ni extrae aquí firmware/fuentes. |

La confirmación al salir de una grabación pertenece a la siguiente fase. En esta prueba el doble tap cambia foco y no detiene sesiones. No usar este paso como aceptación de Traducir/Conversar grabando.

## Probar en Preview Only

1. Compilar en la Mac mini e instalar por cuenta del usuario; elegir **Preview Only**. No se necesitan ajustes de tamaño, status bar o app switcher para Inicio.
2. Para aislar la prueba de despertar, desactivar **Enable Glanceboard** en los ajustes de Glanceboard (accesible desde Más). Si se mantiene activo, tap/hold/head-tilt dormido conservan su función de Glanceboard; doble tap despierta el shell normal.
3. Ver Calendario al arrancar. Sin permiso, tocar y conceder acceso Android en Calendar. Doble tap: regresar a Calendario y ver los eventos de hoy, o Sin eventos hoy.
4. Recorrer las cinco tarjetas en ambas direcciones, probar el salto Más↔Calendario y abrir cada app. Desde Más, abrir Timers y volver: debe seguir seleccionada Más.
5. Para Música/notificaciones reales, conceder a Faceclaw **acceso a notificaciones** en Android. Reproducir música en otra app; comprobar título/estado, una notificación nueva y el contador. Cambios sin callback pueden tardar hasta 30 s.
6. En Música o Más, volver a Inicio; doble tap apaga y otro doble tap muestra Calendario. Repetir con timeout desde una app. Comprobar que la música sigue.
7. Long-press abre el menú del shell; tap+hold conserva el menú existente de cada app o del shell. Con una notificación modal presente, el primer doble tap la cierra y no cambia la tarjeta guardada.

## Validación local

**49/49 tests rápidos pasan** (1,5 s en la ejecución final): modelo, adapter de datos/input/ciclo de vida, painter, rutas reales del shell, geometría/chrome, preview y regresiones headless stock/v3. Sin ejecutar suites completas.

```sh
NODE_PATH=tools/headless-render/node_modules node --test tests/home-model.test.cjs tests/home-app.test.cjs tests/home-painter.test.cjs tests/home-shell.test.cjs tests/app-layout.test.cjs tests/phone-preview.test.cjs tools/headless-render/stock-scenes.test.cjs tools/headless-render/v3-scenes.test.cjs
```

TypeScript estricto de `home-model.ts`, `home-painter.ts` y `stock-art.ts` pasa con un stub temporal exclusivamente del acceso FS `knownFolders` de NativeScript. La raíz no tiene `node_modules`: se usó TypeScript 5.4.5 del runner. El chequeo del grafo de integración queda incompleto por dependencias/tipos NativeScript y Android ausentes; los diagnósticos de los archivos tocados son esas referencias nativas existentes. No sustituye el build Android.

Riesgos pendientes: empaquetado/resolución NativeScript en el APK, permisos/callbacks nativos reales, métricas de la fuente fallback, foco/composición al despertar y fluidez en teléfono. BLE y gafas no validados. Los tests del shell aíslan los servicios nativos; no son ejecución del APK.

## Archivos

- `app/apps/home/{index.ts,home-app.ts,home-model.ts,home-painter.ts,stock-art.ts}`.
- `app/apps/all-apps.ts`.
- `app/g2/dashboard-controller.ts`.
- `app/ui/shell/{shell.ts,geometry.ts,chrome-layer.ts,in-process-window.ts}`.
- `tools/headless-render/stock-art.cjs`: adaptador al arte TS compartido, conservando los painters anteriores.
- `tests/{home-model.test.cjs,home-app.test.cjs,home-painter.test.cjs,home-shell.test.cjs,app-layout.test.cjs}`.
- `research/even-ui/{plan.md,paso-1.md}`.
