# Paso 1: prueba chica en app/

Implementado localmente en `feat/v3-home`, desde `main`, el 2026-10-07. El usuario compiló la primera versión en la Mac mini y validó en Infinix/Preview Only los datos reales, el carrusel Ring y Calendar con retorno. Las correcciones posteriores descritas aquí requieren recompilar y repetir la aceptación. El agente no compiló APK, accedió al teléfono ni ejecutó acciones remotas.

## Comportamiento

- Inicio persistente/no cerrable, banda centrada `(32,96,576,288)`. Geometría por app: ignora tamaño/posición global solo para Inicio. Sin barra, marco exterior ni switcher permanente; el menú y el switcher siguen accesibles por los gestos del shell.
- Al arrancar esta rama se aplican ajustes globales: **App switcher position = Popup**, **Status bar visibility = In app switcher**, **Window border = Off**, **Display mode = 576×288**. También reemplazan los valores guardados de la instalación previa; no hace falta cambiarlos manualmente. El popup sigue disponible desde el menú del shell. Se pueden cambiar durante la sesión, pero este preset se vuelve a aplicar al reiniciar. Las excepciones de tamaño propias de otras apps se conservan.
- Calendario → Música → Notificaciones → Traducir → Más, circular. Scroll/swipe abajo avanza; arriba retrocede. En Watch, swipe izquierda avanza y derecha retrocede, también circularmente. Tap abre la app existente. En el espejo, tocar la tarjeta también abre; tocar el reloj no abre apps.
- Doble tap dentro de cualquier app vuelve a la tarjeta de origen, sin cerrar ventanas ni parar música/timers. Los overlays del shell conservan prioridad: primero se cierra el overlay. Doble tap en Inicio duerme; despertar normal vuelve a Calendario.
- Arranque en Inicio: esta prueba omite restaurar automáticamente ventanas de la ejecución anterior, porque los workers pueden reclamar foco después de resolver su lanzamiento. Las ventanas abiertas durante la sesión siguen vivas al volver a Inicio. No se borran los datos de las apps.
- Columna izquierda **Horizonte**, portada del painter `clock-astra.cjs`: Roboto Light del repo a 80 px, hora HH:MM en (14,23), fecha española en (18,118), separador y próximo evento. Colores 255/204/85/221 del prototipo. Sin batería, clima ni contador. Para conservar la tarjeta en x=230 y los puntos en x=218, la columna termina en x=212: separador de 194 px y texto truncado a ese ancho; el prototipo había movido la tarjeta a x=250.
- Solo se pinta la tarjeta visible. Sin animación. Tick de 30 s y suscripciones mientras Inicio está visible/despierto; al ocultarlo se desuscriben.

## Datos reales y límites

| Elemento | Fuente / estado |
|---|---|
| Calendario | Lector existente; dos eventos del día aún vigentes, incluyendo el que está en curso. Si hoy está vacío, muestra Sin eventos hoy y el siguiente evento disponible en la ventana de lectura existente (14 días), con fecha, título y Todo el día/hora. Sin permiso / cargando / error conservan sus estados. Tap abre Calendar y su solicitud de permiso. El lector Android existente convierte fallos de consulta en lista vacía. |
| Música | Snapshot del bridge existente, iniciado también en Preview Only. Título/artista y Sonando/En pausa; vacío Nada sonando. Sin progreso ni carátula en esta prueba. |
| Notificaciones | Activas reales, ordenadas por publicación; respeta fuentes deshabilitadas. Dos recientes en tarjeta; sin contador en la columna izquierda. Sin notificaciones si vacío/sin acceso; no se mantiene historial. |
| Horizonte | Hora local 24 h y fecha como Miércoles 7 oct. Usa el mismo `HomeCalendar` ya leído para la tarjeta: primer evento vigente de hoy, o próximo futuro. En N min se calcula por diferencia real, Ahora durante el evento, Mañana HH:MM o fecha/hora después de hoy; Todo el día cuando corresponde. Sin eventos cuando la lectura está vacía; sin detalles si faltan permisos. |
| Traducir | Tarjeta estática ES ⇄ EN · Toca para empezar; abre Microphones. No inicia traducción/grabación ni incorpora Soniox. |
| Más | Abre el launcher actual completo; apps abiertas desde allí vuelven a Más. |
| Fuente | Reloj Roboto Light 80 px, con fallback a la fuente UI grande si el renderer falla. Resto de texto: EvenHub extraída si el cargador existente tiene glifos latinos; si falta, fuente UI seleccionada por defecto. No se empaqueta ni extrae aquí firmware/fuentes. |

La confirmación al salir de una grabación pertenece a la siguiente fase. En esta prueba el doble tap cambia foco y no detiene sesiones. No usar este paso como aceptación de Traducir/Conversar grabando.

## Probar en Preview Only

1. Compilar en la Mac mini e instalar por cuenta del usuario; elegir **Preview Only**. El preset global de chrome se aplica automáticamente al arrancar; comprobar Calendar sin barra inferior ni estado permanente. El panel del teléfono debe decir Inicio al volver a la tarjeta.
2. Para aislar la prueba de despertar, desactivar **Enable Glanceboard** en los ajustes de Glanceboard (accesible desde Más). Si se mantiene activo, tap/hold/head-tilt dormido conservan su función de Glanceboard; doble tap despierta el shell normal.
3. Ver Calendario al arrancar. Sin permiso, tocar y conceder acceso Android en Calendar. Doble tap: regresar a Calendario y ver los eventos de hoy, o Sin eventos hoy acompañado del próximo evento si existe.
4. Recorrer las cinco tarjetas en ambas direcciones, con scroll-up/down en Ring y swipe-left/right en Watch, probar el salto Más↔Calendario y abrir cada app. Desde Más, abrir Timers y volver: debe seguir seleccionada Más.
5. Para Música/notificaciones reales, conceder a Faceclaw **acceso a notificaciones** en Android. Reproducir música en otra app; comprobar título/estado y una notificación nueva en su tarjeta. Cambios sin callback pueden tardar hasta 30 s.
6. En Música o Más, volver a Inicio; doble tap apaga y otro doble tap muestra Calendario. Repetir con timeout desde una app. Comprobar que la música sigue.
7. En Horizonte, comprobar un evento que empieza en unos minutos: el contador debe cambiar con el tick existente de 30 s, pasar a Ahora al empezar y desaparecer al terminar. Probar mañana, cambio de día y calendario vacío; no deben aparecer batería/clima/contador. La tarjeta Calendario sigue repitiendo el primer evento: sería útil dedicarla a los siguientes, pero esta entrega no la cambia.
8. Long-press abre el menú del shell; tap+hold conserva el menú existente de cada app o del shell. Con una notificación modal presente, el primer doble tap la cierra y no cambia la tarjeta guardada.

## Validación local

**60/60 tests rápidos pasan** tras integrar Horizonte: modelo, adapter de datos/input/ciclo de vida, painter, rutas reales del shell, geometría/chrome, preview y regresiones headless stock/v3. Sin ejecutar suites completas.

```sh
NODE_PATH=tools/headless-render/node_modules node --test tests/home-model.test.cjs tests/home-app.test.cjs tests/home-painter.test.cjs tests/home-shell.test.cjs tests/app-layout.test.cjs tests/phone-preview.test.cjs tools/headless-render/stock-scenes.test.cjs tools/headless-render/v3-scenes.test.cjs tools/headless-render/horizonte-home.test.cjs
```

TypeScript estricto de `home-model.ts`, `home-painter.ts`, `horizonte-painter.ts` y `stock-art.ts` pasa con un stub temporal exclusivamente del acceso FS `knownFolders` de NativeScript. La raíz no tiene `node_modules`: se usó TypeScript 5.4.5 del runner. El chequeo del grafo de integración queda incompleto por dependencias/tipos NativeScript y Android ausentes; los diagnósticos de los archivos tocados son esas referencias nativas existentes. No sustituye el build Android.

Pendiente de volver a validar con la nueva build: Horizonte en el renderer Android (métricas nativas de Roboto Light), contador de minutos y cambio de día. Las seis combinaciones 09:41/22:27 × próximo/ahora/mañana se inspeccionaron localmente; los hashes de tarjetas y puntos son idénticos a la versión anterior. Despertar y fluidez siguen requiriendo aceptación en teléfono. BLE y gafas no validados. Los tests del shell aíslan los servicios nativos; no son ejecución del APK.

## Archivos

- `app/apps/home/{index.ts,home-app.ts,home-model.ts,home-painter.ts,stock-art.ts,home-layout.ts,horizonte-painter.ts}`.
- `app/apps/all-apps.ts`.
- `app/g2/dashboard-controller.ts`.
- `app/ui/shell/{shell.ts,geometry.ts,chrome-layer.ts,in-process-window.ts}`.
- `tools/headless-render/horizonte-home.test.cjs`: render de producción con Roboto Light real a 80 px y seis estados.
- `tools/headless-render/stock-art.cjs`: adaptador al arte TS compartido, conservando los painters anteriores.
- `tests/{home-model.test.cjs,home-app.test.cjs,home-painter.test.cjs,home-shell.test.cjs,app-layout.test.cjs,phone-preview.test.cjs}`.
- `research/even-ui/{plan.md,paso-1.md}`.
