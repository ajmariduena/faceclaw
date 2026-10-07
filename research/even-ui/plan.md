# Plan: UI estilo Even stock

Estado al 2026-10-07. **Vigente: v3 sin menú** (resumen abajo; detalle en [v3: sin menú](#v3-sin-menú)). [referencia-stock.md](referencia-stock.md) documenta la UI stock medida; [propuesta-home.md](propuesta-home.md) y las secciones v2 quedan como antecedente.

## Plan vigente

**Actualización de implementación (2026-10-07):** el código del PASO 1 está integrado en `feat/v3-home`; ver [prueba chica, ajustes y límites](paso-1.md). Validación local de modelo/painters/shell; compilación, instalación y aceptación en Preview Only pendientes del usuario. Las afirmaciones de “no integrado en app/” más abajo describen la etapa de render anterior.

**Interfaz (v3):** reloj stock a la izquierda y una tarjeta a la derecha. Cinco tarjetas fijas y circulares: Calendario → Música → Notificaciones → Traducir → Más (Conversar, AI Chat, Teleprompter, Navegar, Timers, Ajustes). Swipe cambia de tarjeta, tap entra a la app, doble tap en una app vuelve a la misma tarjeta sin confirmar, doble tap en el inicio apaga la pantalla, despertar muestra Calendario. Solo se confirma al salir de Traducir/Conversar grabando. Entrada por deslizamiento de 200 ms. Tap+mantener conserva el menú del shell. Decidido con revisión de Fable y Astra.

**Pasos:**

1. **Prueba chica (1–2 días):** inicio v3 dentro de `app/` con datos reales de Calendario, swipe entre tarjetas, tap a Calendario y doble tap de vuelta. Compilar en la Mac mini (Crabbox), instalar en el Infinix y validar en Preview Only. Si algo falla aquí, se revisa el plan antes de seguir.
2. **Base (9–15 días en total, incluye el paso 1):** fases de la [reestimación vigente](#reestimación-vigente). Se prueba todo en Preview Only en el Infinix.
3. **Prueba con las gafas G2 (al final):** flashear firmware Faceclaw 37 (reemplaza el de Even hasta desinstalarlo), validar fluidez BLE, gestos reales del anillo/touchpad y lectura en el lente.
4. **Traducir y Conversar (+8–15 días, 17–30 en total):** Soniox para español ↔ inglés y pistas de IA; solo se prueban con las gafas.

**Comprobado:** las pantallas se dibujan con el código de producción y la fuente stock (extraída localmente); el deslizamiento se arma como display list de producción y cabe en la memoria de texturas; Calendario, música y notificaciones ya existen en Faceclaw.

**No comprobado:** nada está integrado en `app/` ni corrió en el teléfono o las gafas; fluidez BLE de la animación; cambio de semántica del doble tap en el shell; clima en Ecuador (`api.weather.gov`, Fahrenheit); Traducir/Conversar. Los días son estimaciones.

**Pendiente de decidir:** proveedor de clima; API keys (AI Chat, Traducir, Conversar); cuándo flashear las gafas.

**Reglas:** nunca PRs, issues ni comentarios a upstream, ni push a `upstream`. No commitear la fuente extraída del firmware (`tools/headless-render/out/local-fonts/`, ignorado) ni imágenes copiadas de Even; reloj e iconos son dibujos propios. Referencias de Even solo en `/tmp/even-ref/` (local, fuera del repo).

## Decisiones v2 (histórico)

- **Inicio = Dashboard:** estado izquierdo con fecha/batería, reloj HH/MM dot-matrix propio, clima °C y contador; tarjeta derecha con Calendario, Música o Notificaciones recientes. Swipe pagina widgets, tap expande, doble tap colapsa.
- **Menú temporal stock:** sustituye el reloj con panel izquierdo, cinco filas de 52 px, radio 6, iconos pixel propios, lista circular y fondo atenuado. Se reutilizará el gesto de menú existente del shell, respetando sus excepciones.
- **Catálogo:** Notificaciones, Conversar, Traducir, Teleprompter, Navegar, AI Chat, Calendario, Música, Timers, Ajustes, Más…. Más… abrirá el launcher actual. Se usan etiquetas españolas y fixtures realistas; ningún servicio nuevo está conectado.
- **Tipografía:** fuente stock 20 px/pitch 27 extraída localmente del firmware validado, en carpeta ignorada; arte propio para dígitos y los iconos. La extracción funcionó en Mac, sin TTF sustitutiva. No redistribuir el asset propietario.
- **Transiciones:** menú entra desde la izquierda ~500 ms; función abre por fundido ~300 ms. Display list para desplazamiento; dimming muestreado por raster en el prototipo. Faltan preparación de superficies, latencia, cancelación y handoff sin flashes en producto.
- **Salida:** doble tap desde función abre «¿Terminar esta función? / No / > Sí»; confirmar vuelve al dashboard. Requiere decidir por app si termina actividad o solo cierra/enfoca ventana, preservando capturas, permisos y wake.
- **Capa de sistema:** notificaciones y confirmación sobre contenido atenuado. Widget expandido y Calendario-función son estados distintos.

## Fases y reestimación v2 (histórico)

Días/persona estimados, no medidos; una persona familiarizada con el repo. Incluye integración y pruebas acotadas en Preview Only futuras, no APK ni pruebas físicas ejecutadas en esta tarea. El render reduce incertidumbre visual, pero no sustituye el trabajo del shell.

| # | Fase | Días/persona |
|---|---|---:|
| 1 | Dashboard, ciclo de vida, datos/estados y tres widgets, expansión/scroll | 3–5 |
| 2 | Integrar fuente stock local, arte propio y métricas/contraste | 1–2 |
| 3 | Menú overlay, catálogo circular, foco y gesto existente | 2–3 |
| 4 | Calendario como función y estados vacíos/permisos | 1–2 |
| 5 | Deslizamiento/fundido, preparación, handoff e interrupciones | 2–3 |
| 6 | Diálogo de salida y composición de notificaciones | 1–2 |
| 7 | Apps fijadas editables en Ajustes (posponible) | 1–2 |
| | **Dashboard + menú + Calendario + capas (1–7)** | **11–19** |
| | **Mínimo con lista fija (sin 7)** | **10–17** |
| 8 | Traducir, integración bidireccional y pantalla | 3–5 |
| 9 | Conversar, pistas en vivo, notas y resumen | 5–10 |
| | **Con Traducir y Conversar** | **19–34** |

Antes: 7–12 días base / 15–27 con voz. Ahora: 11–19 / 19–34. Aumenta por widgets paginados y expandidos, overlay del menú, prioridades de input, salida confirmada y composición/transiciones; no por producir estos PNG. Fuente stock ya extraída localmente: no implica licencias para distribuirla. Excluye proveedor meteorológico nuevo, nuevos servicios de calendario, detalle/edición de eventos y validación óptica/BLE.

## Pendientes de v2 (ver decisiones v3)

- **Lista izquierda vs derecha:** izquierda reproduce stock; `stock-menu-right` compara una adaptación con reloj compacto y widget izquierdos. Mantener ambas en el render, elegir antes de integrar geometría.
- Integración mínima con catálogo fijo o edición en Ajustes; estados mientras Traducir/Conversar aún no existen.
- Semántica de «Terminar» por app: cerrar actividad, detener micrófono, o conservar ventana; doble tap y modales conservan prioridades.
- Proveedor de clima para Ecuador y conversión °C; el actual usa `api.weather.gov`/Fahrenheit.
- Política de extracción de fuente en Preview Only y fallback cuando falte; nunca empaquetar el asset extraído.
- Fundido de producto: coste de repintado/transferencia y compatibilidad del compositor, duración exacta y retorno. PNG no demuestra fluidez en gafas.
- API keys para AI Chat, Traducir y Conversar.

## Evidencia local

Modos `stock-*`, comparativos `compare-stock-*.png` y hojas `stock-comparisons-1..3.png` en `tools/headless-render/out/`, ignorado. README del runner documenta extracción y reproducción. Dashboard/calendario/notificación usan medidas de referencia; Música, recientes, variante derecha y agenda de función son adaptaciones propias identificadas. Los modos v1 quedan intactos para comparación.

## Traducción y Conversate

Conversate de Even muestra subtítulos y pistas de IA breves durante la charla (términos, personas mencionadas, posibles respuestas, notas preparadas antes) y guarda resumen y tareas en el teléfono; requiere internet. Translate de Even usa la nube, ~33 idiomas, eligiendo idioma de entrada y salida ([evenrealities.com/conversate](https://www.evenrealities.com/conversate), [evenrealities.com/translation-glasses](https://www.evenrealities.com/translation-glasses)).

Lo que ya hay en Faceclaw, en la app Microphones (`app/apps/microphones/`):

- Subtítulos en vivo con los micrófonos de las gafas (`mic_control` del CFW), con nombre de quien habla.
- Traducción en el teléfono con ML Kit al idioma del teléfono (`translate.ts`, ajuste `microphones.translate-enabled`).
- Conversaciones guardadas con transcripción, hablantes y tono; preguntas sobre ellas con Qwen local (`conversation-qa.ts`).

Límites:

- El reconocimiento de los subtítulos usa solo Moonshine base **en inglés** (`mic-session.ts:733`): traduce a quien habla inglés, no a quien habla español.
- Soniox ya está integrado para el dictado (`app/native/soniox-stt.ts`, modelo `stt-rt-v5`) y soporta traducción en vivo en una o dos vías, ~US$0,12–0,18 por hora de audio. Falta conectarlo a los subtítulos.
- Las pistas de IA en vivo necesitan un modelo en la nube (API key); Qwen local es lento para eso.
- Preview Only no usa el micrófono de las gafas: Traducir y Conversar solo se prueban con G2 y firmware Faceclaw.


## v3: sin menú

**Decisiones tras la revisión de Fable y Astra, incorporadas por instrucción del usuario.** Sustituyen el modelo de navegación v2 y la primera variante v3 de siete tarjetas; los modos anteriores se conservan como referencia. «Sin menú» elimina el launcher overlay propio de v2, no el menú existente del shell.

### Modelo y gestos

- **Cinco tarjetas fijas, máximo cinco, circulares:** Calendario → Música → Notificaciones → Traducir → Más → Calendario. Un punto por tarjeta; el activo indica posición y los cinco visibles indican el total. No se ocultan ni reordenan tarjetas por falta de datos.
- **Inicio:** columna stock izquierda sin cambios (fecha, batería, reloj HH/MM, clima °C y contador) y una sola tarjeta derecha en (230,14), 318×260, borde 1 px/radio 6. La tarjeta identifica la app. Las vacías usan icono pixel propio 48×48, nombre y estado centrados, con aire: «Sin eventos hoy», «Nada sonando», «Sin notificaciones».
- **Traducir:** «ES ⇄ EN · Toca para empezar». La flecha ⇄ es un dibujo propio porque no está en la fuente extraída; el resto conserva el texto stock de 20 px/pitch 27. No hay tarjeta AI Chat: acceso mediante «Hey Even» y desde Más. Conectar ese disparador a Faceclaw queda pendiente; el render no ejecuta voz.
- **Más:** lista simple a pantalla completa, en este orden: Conversar, AI Chat, Teleprompter, Navegar, Timers, Ajustes. Seis filas de 37 px; un solo contorno de selección. Conserva acceso al resto sin ampliar el carrusel principal.
- **Swipe en inicio:** anterior/siguiente tarjeta, circular. **Tap:** entra en la app a pantalla completa; en Más abre la lista. Ya no hay una vista intermedia de widget expandido. En Más, swipe cambia selección y tap abre la app.
- **Doble tap en app:** vuelve directamente al inicio, conservando la tarjeta de origen. Las apps abiertas desde Más vuelven a la tarjeta Más. Regresar no detiene reproducción musical ni timers.
- **Doble tap en inicio:** apaga la pantalla. **Despertar:** siempre Calendario, tarjeta 1, aunque se apagara desde otra tarjeta. Este reset de navegación no implica detener procesos activos.
- **Única confirmación:** Traducir o Conversar están grabando. «¿Detener y salir?», «> Seguir» por defecto, «Salir» secundario. Seguir cancela la salida y mantiene la grabación; Salir la detiene antes de regresar a la tarjeta de origen. Doble tap del diálogo equivale a Seguir. No reutilizar el cierre de ventana como señal para detener música/timers.
- **Tap+mantener:** conserva el menú existente del shell; no se inventa otro overlay ni se intercepta para abrir Más. Notificaciones conservan prioridad de foreground y el fondo atenuado; no cambian la tarjeta guardada.

### Entrada, retorno y memoria

**No se hace crecer la tarjeta.** Se eligió deslizamiento horizontal recortado de **200 ms**, smoothstep: inicio sale a la izquierda y Calendario entra desde la derecha; al volver se invierten movimiento y origen/destino. `v3-enter-0..3` muestrea **0/67/133/200 ms**. Los recortes temporales de texto al atravesar el borde son intencionales. Los extremos y el retorno inverso se verifican después de cuantizar a 4 bits.

Solo se pinta la tarjeta visible. No se prerenderizan las cinco tarjetas ni sus vecinas; los estados vacíos conservan el mismo índice. El runner guarda cada escena antes de generar la siguiente. Durante la transición, la superficie actual horneada alimenta `SCREEN`; el destino se divide en dos imágenes 576×144 para no superar 64 KiB por recurso. Usa `encodeDisplayList → readDisplayList → paintDisplayList`, sin pintar un PNG por frame para animar en firmware.

Los dos recursos ocupan **82.954 bytes** empaquetados (41.477 cada uno), más 32 bytes de cabeceras de bloque. El código actual reserva 192 KiB de caché, con **194.560 bytes de arena** tras la tabla de 512 entradas. Incluso presupuestar otra pareja del mismo tamaño para una base raster da 165.972 bytes con cabeceras, bajo esa arena. Es una cuenta acotada de las imágenes de la transición, no una prueba de residencia con todos los glyphs/overlays del producto: liberar recursos al terminar, admitir el destino antes de mover foco y validar presión de caché siguen siendo trabajo de integración.

Evidencia local: `app/graphics/display-list.ts` (RECT_COPY, clip y límite por recurso), `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/g2protocol/ResourceCacheState.kt` (caché/arena), `tools/headless-render/v3-scenes.cjs` (autoría y reproducción software). No se cambia firmware ni se afirma fluidez BLE medida.

### Frente a v2

| Aspecto | Ventaja | Coste o riesgo |
|---|---|---|
| Acceso a apps | Un gesto por paso y tarjeta con contenido útil; cinco posiciones estables | Muchas apps exigirían demasiados swipes; se limita a cinco y el resto vive en Más |
| Descubribilidad | Nombre de app y cinco puntos visibles; Traducir/Más tienen invitación a tocar | Los puntos no nombran destinos; aprender swipe/tap requiere aceptación en Preview Only |
| Orden fijo | Memoria espacial estable, no desaparecen tarjetas vacías | No hay personalización ni tarjetas AI Chat/Conversar; para llegar a ellas se usa Más o voz |
| Circularidad | Con cinco tarjetas, cualquier destino está como máximo a dos swipes por la dirección más corta | Pasar de Más a Calendario debe ser evidente; probar confusiones de vuelta al inicio |
| Volver/despertar | Volver conserva contexto; despertar ofrece una referencia única | Son dos reglas distintas; comprobar que el reset no altere sesiones de fondo |
| Menú y salida | Se elimina el menú overlay de apps y la confirmación rutinaria | Se conserva el shell y hay que distinguir grabación activa de reproducción/timers |

### Reestimación vigente

**Se mantiene 9–15 días base / 17–30 con Traducir y Conversar:** el ahorro del menú y del editor de tarjetas se compensa parcialmente con contratos de despertar, retorno, grabación activa y residencia de texturas. Estimación de ingeniería, no duración medida del render.

| Fase | Cambio frente a v2 | Días/persona |
|---|---|---:|
| Cinco tarjetas, datos, estados vacíos y ciclo de vida | Se elimina expansión/scroll del widget; se fija el carrusel | 3–4 |
| Fuente local y arte propio en producto, contraste/métricas | Se reutilizan fuente y dibujos ya probados headless | 1–2 |
| Más y lanzamiento por app | Sustituye menú overlay; elimina animación/foco/gesto propios y editor de tarjetas | 1–2 |
| Calendario, retorno conservado y despertar/apagado | Incluye estados/permisos, sin detalle de evento | 2–3 |
| Deslizamiento, caché y handoff/interrupciones | Un movimiento y su inverso; sin crecimiento ni fundido adicional | 1–2 |
| Confirmación condicional y notificaciones | Se elimina diálogo general; se verifican sesiones activas y procesos que continúan | 1–2 |
| **Base** | Antes v2: 11–19 | **9–15** |
| Traducir funcional | Reconocimiento/traducción bidireccional, permisos y sesión | 3–5 |
| Conversar funcional | Pistas en vivo, notas, resumen y cierre de sesión | 5–10 |
| **Total con Traducir y Conversar** | Antes v2: 19–34 | **17–30** |

No incluye un editor de tarjetas (son fijas), proveedor meteorológico nuevo, detalle/edición de eventos, ni integración nueva del motor AI Chat/wakeword. La estimación presupone reutilizar su entrada de voz existente; si exige un motor nuevo se estima por separado. Aceptación futura en Preview Only y pruebas acotadas incluidas; APK, teléfono y validación óptica/BLE no se ejecutan aquí.

### Entrega y límites

Modos finales: `v3-home-calendar`, `v3-home-music`, `v3-home-music-empty`, `v3-home-notifications`, `v3-home-translate`, `v3-home-more`, `v3-more-list`, `v3-enter-0..3`, `v3-app-calendar`, `v3-translate-confirm-exit`, `v3-notification`. AI Chat no tiene tarjeta ni modo home. Las primitivas, fuente y arte se reutilizan; no se modifica `app/`.

Los 14 PNG son escenas con fixtures, no navegación conectada al shell. Los estados vacíos de Calendario/Notificaciones están implementados en el painter genérico y probados sin añadir modos finales extra. El gesto de voz, el despertar, la detención de una grabación y la continuidad de música/timers son contratos de integración pendientes, no comportamientos demostrados por un PNG.

Validación de esta iteración: 14/14 PNG inspeccionados y verificados como 640×480/16 niveles; 11/11 tests rápidos pasan (5 v3 + 6 stock), incluidos estados vacíos, columna stock idéntica, límites de banda, extremos/retorno y presupuesto de texturas. Los 57 PNG previos conservan sus hashes; se regeneraron los modos originales y stock para comprobar compatibilidad. Sin commits ni acciones remotas, APK o acceso al teléfono.
