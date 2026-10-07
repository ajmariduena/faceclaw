**Veredicto: sí, es viable.** Faceclaw puede ofrecer una apariencia cercana al Even G2 original y conservar su interfaz actual como alternativa. Requiere cambios en TypeScript; no identifico necesidad de modificar adicionalmente su firmware personalizado para el rediseño descrito. No existe un tema global: hay componentes compartidos, pero numerosos valores visuales locales.

Estudio del commit `84baee9`, coincidente con la [página pública consultada](https://github.com/jimrandomh/faceclaw). Las estimaciones cubren inicio, shell, lanzador, ajustes y diálogos; no todas las aplicaciones ni equivalencia funcional con los servicios de Even.

**Mapa del código.** Rutas relativas a `app/`; los números indican líneas.

| Área | Archivos:líneas | Centralización y alcance |
|---|---|---|
| Geometría | [ui/shell/geometry.ts:18–307](../../app/ui/shell/geometry.ts:18) | Central: barra 28 px, lateral 64, switcher inferior 36, banda 288; viewport, bordes y profundidad. |
| Chrome/estado | [ui/shell/chrome-layer.ts:61–109,428–446,739–943](../../app/ui/shell/chrome-layer.ts:61) | Dibujo central, medidas/brillos locales. Con geometría: 1.614 líneas, 49 constantes nombradas. |
| Menús/ajustes | [ui/menu.ts:18–30,244–345](../../app/ui/menu.ts:18), [menu-core.ts:9–74](../../app/ui/menu-core.ts:9), [metrics.ts:16–110](../../app/ui/metrics.ts:16), [dashboard/settings-panel.ts:32–192](../../app/ui/dashboard/settings-panel.ts:32) | Motor compartido; padding, grises y panel dividido dispersos. 1.321 líneas/26 constantes. |
| Lanzador | [apps/launcher/launcher-app.ts:69–87,261–308](../../app/apps/launcher/launcher-app.ts:69), [ui/icon-grid.ts:18–38](../../app/ui/icon-grid.ts:18) | Grid compartido: cinco columnas, iconos 44 px. 907 líneas/12 constantes. |
| Diálogos/notificaciones | [ui/shell/input-dialog.ts:15–32,86–125](../../app/ui/shell/input-dialog.ts:15), [ui/notifications.ts:24–51,299–311](../../app/ui/notifications.ts:24), [shell/shell.ts:295–331](../../app/ui/shell/shell.ts:295) | Dispersos; incluso interlineado fijo de 16 px. Primeros dos: 652 líneas/37 constantes. |
| Fuentes/iconos/primitivas | [graphics/ui-fonts.ts:19–41,179–209](../../app/graphics/ui-fonts.ts:19), [evenhub-font.ts:129–195](../../app/graphics/evenhub-font.ts:129), [icons.ts:14–18,190–201](../../app/graphics/icons.ts:14), [image.ts:7–9,55–60](../../app/graphics/image.ts:7) | Resolución compartida; SVG Lucide y radio predeterminado 8. Chrome conserva Terminus explícito en línea 919. |
| Movimiento | [ui/animation-speed.ts:6–26](../../app/ui/animation-speed.ts:6), [menu-highlight-motion.ts:4–40](../../app/ui/menu-highlight-motion.ts:4), [menu-scroll-motion.ts:5–50](../../app/ui/menu-scroll-motion.ts:5), [dashboard-settings.ts:484–511](../../app/ui/dashboard-settings.ts:484) | 120 ms selección, 160 rebote, smoothstep/cuadrática; fundido 280. Listas gráficas en `graphics/menu-{selection,scroll}-list.ts`. |
| Glanceboard | [apps/glanceboard/layout.ts:7–43](../../app/apps/glanceboard/layout.ts:7), [board.ts:26–119](../../app/apps/glanceboard/board.ts:26), [widgets/system-card.ts:124–151](../../app/apps/glanceboard/widgets/system-card.ts:124), [calendar-widget.ts:47–88](../../app/apps/glanceboard/widgets/calendar-widget.ts:47) | Slots centralizados; widgets independientes. Estos cuatro: 680 líneas/15 constantes. |

Los grupos medidos suman unas **6.100 líneas y 161 constantes**; incluyen lógica no visual, excluyen literales incrustados y no representan el tamaño del cambio. Estimo tocar 20–30 archivos y 800–1.600 líneas para la primera versión.

**Fuentes stock.** Sí pueden reutilizarse, pero falta adaptar `EvenHubFont` a `UiFont`: `measureLine→measureText`, métricas/glyphs e identidad, conservando su dibujo. Actualmente `UiFontSelection` admite bitmap/TTF; las fuentes instaladas son TTF/OTF ([installed-fonts.ts:1–9](../../app/graphics/installed-fonts.ts:1)). EvenHub tiene un tamaño/peso, 20 px, con línea 27; el shell pequeño garantiza máximo 21. No basta incorporarla al selector: hay que recalcular filas, barras y diálogos. Tampoco prueba que estén extraídas todas las variantes tipográficas del dashboard original.

La extracción ocurre al preparar firmware verificado, guarda JSON privado e invalida caché ([g2/firmware-builder.ts:153–194](../../app/g2/firmware-builder.ts:153)). Mantener extracción local, **sin redistribuir glifos propietarios**; el repositorio declara términos inciertos ([firmware-fonts.ts:1–7,23–34](../../app/g2/firmware-fonts.ts:1)). Sin extracción aparece Roboto; CJK utiliza Source Han Sans con OFL. Los avances y kerning proceden de `pretext` ([evenhub-font.ts:1–20](../../app/graphics/evenhub-font.ts:1)).

**Arquitectura propuesta.** Añadir `display.uiStyle = faceclaw | even-stock` en `dashboard-settings.ts` y la fila en [settings-menus.ts:243–269](../../app/ui/dashboard/settings-menus.ts:243). Crear `ui/style.ts` con geometría, tipografía, grises, selección y movimiento; resolver preferencias por estilo sin sobrescribir las del usuario. Conectar cambios a invalidación/reflujo existentes ([g2/dashboard-controller.ts:449–464](../../app/g2/dashboard-controller.ts:449)), incluidos workers.

Extraer el pintado de filas de [apps/evenhub/list-menu.ts:1–8,58–87](../../app/apps/evenhub/list-menu.ts:1): ya reproduce contorno sin relleno, texto atenuado y selección instantánea. Compartirlo con menús y un lanzador textual, conservando navegación/carpetas. Parametrizar los archivos de la tabla y el adaptador tipográfico.

Crear una ventana persistente `EvenHome`, reutilizando `GlanceBoard`, reloj/clima/batería y calendario; agregar resúmenes de notificaciones y noticias. El registro actual no contiene estos dos widgets ([widgets/index.ts:11–19](../../app/apps/glanceboard/widgets/index.ts:11)). Abrir Glanceboard hoy muestra su configurador, no un home persistente ([glanceboard-app.ts:62–68](../../app/apps/glanceboard/glanceboard-app.ts:62)). Cambiar el arranque fijado al lanzador en [launcher/index.ts:32–58](../../app/apps/launcher/index.ts:32). El preset popup, barra solo al cambiar apps y bordes desactivados permite contenido centrado de 576×288 sin chrome permanente.

| Objetivo | Tamaño | Días/persona estimados |
|---|---|---:|
| Preset exploratorio, todavía sin réplica | S | 1–2 |
| Coincidencia estilística: fuentes, espaciado, listas, home y convivencia | M | 5–9 |
| Casi pixel fiel en esas pantallas, con referencias completas | L | 15–25 total |

La última estimación exige capturas stock por estado, métricas tipográficas, iconos y medición de transiciones. La fidelidad funcional de Even AI/navegación/traducción requiere trabajo separado. El transporte seguirá usando CFW/BLE; un tema no elimina latencia ni límites de recursos/temporización ([display-list.md](../../app/graphics/display-list.md:1)). El panel entrega 640×480/16 niveles; ajustar apariencia no cambia sus propiedades ópticas.

**Iteración rápida.** Ya comprobé render headless en Mac: [runner](../../tools/headless-render/render.cjs), [PNG](../../tools/headless-render/README.md). Ejecutar:

```sh
node tools/headless-render/render.cjs bottom
node tools/headless-render/render.cjs popup
```

Usa `tests/helpers/load-typescript.cjs`, los mocks de [app-layout.test.cjs:207–251](../../tests/app-layout.test.cjs:207), `ShellChromeLayer.paint()`, `MenuLayer.paint()`, `withDrawsBaked()`, cuantización y `upng-js`. Dos PNG verificados: fuente Terminus real, datos fijos e iconos simulados. Es prueba de componentes, no arranque del shell completo ni compositor binocular. Para ampliar: cargar widgets con fixtures, rasterizar SVG/TTF mediante adaptadores, proporcionar fuentes extraídas localmente y fijar reloj para snapshots animados.

En teléfono: configurar `build_paths.sh`; compilar con `build.sh` en Mac mini mediante Crabbox. `build_and_run.sh` añade instalación/arranque y necesita acceso ADB; usa `--justlaunch`. NativeScript ofrece [ejecución con actualización al cambiar código](https://github.com/nativescript/docs/blob/main/content/guide/running.md); ese circuito no se probó aquí.

Elegir «Preview Only»: comparte compositor Android sin BLE ([preview-display.ts:42–64](../../app/native/preview-display.ts:42)). Menú del teléfono → «Take screenshot»; guarda el compuesto recortado ([dashboard-controller.ts:1021–1022](../../app/g2/dashboard-controller.ts:1021)). Con gafas conectadas: token de entrada, `adb forward tcp:8791 tcp:8791`, `node scripts/faceclaw-input.cjs input tap`. **Android exige conexión** ([dashboard-controller.ts:472–479](../../app/g2/dashboard-controller.ts:472)); Preview Only se maneja con controles del teléfono.

Para regresiones: `app-layout`, `row-metrics`, `menu-core`, `icon-grid`, `glanceboard-layout` y `evenhub-list-menu`. `npm test` compila `.test-build`; ejecutar la suite completa en Mac mini. No ejecuté build Android, suite completa ni validación física.
