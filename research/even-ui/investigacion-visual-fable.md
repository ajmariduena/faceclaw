# ¿Puede Faceclaw verse como la UI stock del Even G2? Estudio de factibilidad visual

Fecha: 2026-10-07. Repo analizado: upstream `jimrandomh/faceclaw` (HEAD `84baee9`, GPLv3, 79 estrellas, último push hoy). Solo lectura; no se modificó nada.

## Veredicto

Sí es factible, y más de lo que parece. Faceclaw ya dibuja con la tipografía stock: extrae los tres LVGL fonts del firmware oficial al instalar (`app/g2/firmware-fonts.ts`), los compone en una cara de 20 px con línea de 27 px (igual que el stock), usa las métricas oficiales `@evenrealities/pretext` (MIT) para que los saltos de línea coincidan, y puede pedirle a las gafas que rendericen texto con su fuente nativa (op `STOCK_FONT_STRING`, modo CFW 15). Su banda por defecto es exactamente la del stock (576x288 centrada). Lo que falta es "piel": quitar el chrome propio (barra de estado y app switcher, que el stock no tiene), reemplazar los iconos Lucide por iconos pixel-art de rejilla 2x2, cambiar el highlight relleno por un contorno, y construir un dashboard con el layout stock. Nada de eso requiere firmware.

Nivel alcanzable: **match estilístico alto** en toda la UI, y **casi pixel-fiel en texto** (misma fuente, misma métrica, mismo renderizado). **No pixel-fiel** en: los dígitos del reloj (los "watchfaces" son bitmaps propios de Even, habría que redibujarlos a mano), los iconos del sistema (idem) y las pantallas que no son de Even OS sino del hardware (boot, pairing, OTA), que Faceclaw no toca.

## Cómo es la UI stock en 2026

- **Pantalla**: 640x350 en marketing (PCMag), 576x288 el canvas que expone Even OS, 640x480 el panel físico que el CFW de Faceclaw desbloquea. 16 niveles de verde, sin fondo: solo bordes y contenido.
- **Dashboard** (foto real, note.com): tercio izquierdo con fecha arriba ("Thu 11"), baterías G y R como iconos de barras, reloj grande a dos líneas en dígitos dot-matrix, y abajo clima ("21°c") y horas restantes. Dos tercios derechos: panel con borde redondeado fino que alterna widgets (noticias, bolsa, calendario, Reminders); puntos de paginación entre columnas. Desde v2.2.4 (jun 2026) es configurable: alineación, estilo de reloj ("Pixel Regular" y otros), fecha on/off, hasta 3 widgets, posición arrastrable; la vista mínima es reloj + fecha + baterías centrados.
- **Menú principal** (long-press): panel izquierdo con borde redondeado, lista vertical de icono pixel + etiqueta (Notificaciones, Dashboard, apps EvenHub con icono de cuatro cuadrados), dibujado sobre la app en curso. Ítems por defecto: Notifications, Conversate, Teleprompt, Translate, Navigate, Even AI, Dashboard, Silent Mode; reordenable.
- **Menú contextual** (tap + long-press, v2.2.9): overlay propio del OS con Display off, Brightness, ítems de la app (máx. 10) y "Close <app>".
- **Diálogos**: caja centrada con borde redondeado, título, opciones en lista con cursor `>` en la seleccionada.
- **Notificaciones**: ventana flotante en la parte superior; Even AI: caja flotante abajo con animación de "escucha"; efecto "spatial" de profundidad en estas capas.
- **Navigate**: flecha + distancia + instrucción, con mini mapa cuadrado a la derecha que se expande a pantalla completa (solo cuadrícula de calles y ruta más brillante). Teleprompt y Translate: texto plano con la fuente única.
- **Tipografía**: una sola fuente LVGL proporcional, sin tamaños, línea 27 px, ítems de lista 40 px con 12 px de padding (pretext). Nombre no publicado. FK Grotesk Neue es la tipografía de la **app de teléfono**, no de las gafas.
- **Iconos**: pixel art 1-bit en rejilla 2x2 (trazo mínimo 2 px), 24x24 en uso; 193 SVG oficiales del Figma público.
- **Animaciones**: scroll de listas con rebote, selección que salta sin deslizar, glow; sin vídeo ni GIF nativos.

## Comparación elemento a elemento

| Elemento stock | Cómo se ve (fuente) | Equivalente actual en Faceclaw | Brecha |
|---|---|---|---|
| Área de dibujo | Banda 576x288 ([hub display](https://hub.evenrealities.com/docs/build/display)) | Modo "Band" 576x288 en y=78, marco 1 px gris 40 (`ui/shell/geometry.ts`) | Ninguna; quitar el marco |
| Tipografía | Fuente LVGL única, línea 27 px, listas 40 px ([pretext skill](https://github.com/even-realities/everything-evenhub)) | UI en Roboto Light 16; fuente firmware solo para apps EvenHub (`apps/evenhub/fonts.ts`) | Pequeña: exponer la cara "EvenHub" como fuente de toda la UI en el picker |
| Barra de estado | No existe; fecha y baterías viven en el dashboard ([PCMag](https://uk.pcmag.com/smart-glasses/164322/even-realities-g2)) | Barra con reloj, iconos de notificación, 4 baterías "dense" (`chrome-layer.ts`) | Media: añadir opción "oculta" |
| App switcher | No existe; se vuelve al dashboard con un ítem "Dashboard" del menú ([9to5Google](https://9to5google.com/review-even-realities-g2-smart-glasses/)) | Fila inferior de iconos 32 px con pestaña de selección | Media: ocultar y mover la navegación al menú |
| Launcher | Lista vertical en panel izquierdo, icono pixel + texto ([foto](https://assets.st-note.com/img/1781186809-Oxu0vA7a3oE9MBcVtnyTmir6.png)) | Rejilla 5 columnas, iconos Lucide 44 px, highlight relleno 15 + contorno 45 (`icon-grid.ts`) | Alta en forma: convertir a lista; iconos nuevos |
| Menús | Panel con borde redondeado, selección por contorno sin relleno, salto instantáneo | `MenuLayer` 272 px, relleno + contorno, slide 120 ms (`menu.ts`, `menu-core.ts`) | Pequeña: ya existe el estilo stock en `apps/evenhub/list-menu.ts` (0.8.1); generalizarlo |
| Diálogos | Caja centrada, cursor `>` ([foto](https://assets.st-note.com/img/1781186793-vo2H7UiZeCrhzy3BTqflJEu8.png)) | Modal inset 14 px, borde 110 (`modal-layer.ts`) | Pequeña |
| Dashboard | Reloj dot-matrix izquierda + panel de widgets derecha; desde v2.2.4 configurable ([note.com](https://note.com/gpsnmeajp/n/n572bf62c9e97), [X v2.2.4](https://x.com/EvenRealities/status/2063953310101516553)) | Glanceboard: 4 cuadrantes 288x144, apagado por defecto, tarjeta de sistema (`apps/glanceboard/`) | Alta: nuevo layout y dígitos pixel propios; las primitivas (rect redondeado, texto, 4 bits) alcanzan |
| Notificaciones | Flotante arriba | Modal centrado | Pequeña: reposicionar |
| Even AI | Caja flotante abajo con animación | Alerta de asistente x40 w560 h96 (`shell.ts`) | Pequeña: estilo y animación en display list |
| Navigate | Flecha + distancia + mini mapa expandible | App Navigate y Compass propias | Media: estilo |
| Iconos | Pixel 2x2, 1-bit ([design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines)) | Lucide vectorial trazo 2 | Alta: redibujar set |
| Animaciones / profundidad | Rebote, glow, capas "spatial" | Display lists con easing, profundidad por capa ±62 | Ninguna técnica |

## Activos y licencias

- **Fuente del firmware**: ya la extrae en el teléfono porque "sus términos de redistribución no están claros" (comentario en `firmware-fonts.ts`). Puede usarse en toda la UI, pero nunca commitear los glifos ni el JSON cacheado. Las direcciones de los descriptores cambian con cada firmware base; los scripts que menciona el código (`find-firmware-fonts.py`, `build-evenhub-font.mjs`) no están en el repo.
- **Métricas**: `@evenrealities/pretext` MIT, ya es dependencia. Source Han Sans OFL ya va bundled.
- **Iconos y Figma**: "Design guidelines and icon artwork © Even Realities", publicados como recurso para desarrolladores sin licencia explícita. Los SVG del Figma son para la app de teléfono; para las gafas conviene redibujar iconos propios en el mismo estilo de rejilla 2x2 (hay generador en `JustinasLa/evenhub-app-ui`, MIT).
- **Watchfaces**: los dígitos dot-matrix son diseño de Even; recrearlos estilísticamente es seguro, copiarlos pixel a pixel de capturas es zona gris.
- **Marcas**: "Even", "Even G2", "Even Realities" son marcas registradas (Even Realities GmbH). Faceclaw ya incluye `EvenRealitiesLogo.png` para la tienda EvenHub; una UI lookalike no debería usar el logo ni presentarse como oficial. El verde #3CFA44 lo pone el hardware, no aplica en el render.
- **FK Grotesk Neue**: comercial (desde 60 EUR, Florian Karsten); solo relevante si también se quiere imitar la app de teléfono.
- **Firmware base**: Faceclaw descarga `cdn.evenreal.co/.../1dbdf37b....bin` (2.3.0.24) y verifica el hash; el stock de hoy ya va por app 2.3.2 con firmware nuevo, así que el "look" seguirá moviéndose (QuickNote, Reminders, atajos long-press).

## Lo imposible o difícil

- Mezclar con apps stock reales (Conversate, Even AI de Even, EvenHub tienda): Faceclaw reemplaza toda la UI; el propio autor lo dice en Reddit.
- Pantallas de hardware (boot, pairing, OTA, batería crítica): no están en el repo ni documentadas; requieren firmware.
- Pixel-fidelidad de reloj e iconos: solo redibujando a mano.
- La fuente LVGL tiene huecos (glifos ausentes se omiten, sin tofu); Faceclaw ya lo replica.

## Referencias visuales

- Dashboard stock antes y después de v2.2.4, menú y diálogo: https://note.com/gpsnmeajp/n/n572bf62c9e97
- Guías de diseño y Figma público: https://hub.evenrealities.com/docs/build/design-guidelines ; https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/
- Display y contenedores: https://hub.evenrealities.com/docs/build/display ; menú contextual: https://hub.evenrealities.com/docs/build/contextual-menu
- Vídeo oficial "Designing for a 576x288 Green Screen": https://hub.evenrealities.com/docs/learn/videos (EP 11)
- Reviews con fotos del display: PCMag https://uk.pcmag.com/smart-glasses/164322/even-realities-g2 ; 9to5Google https://9to5google.com/review-even-realities-g2-smart-glasses/
- YouTube: https://www.youtube.com/watch?v=NHtSaZ7wDEk (dashboard desde 4:14) ; https://www.youtube.com/watch?v=iC7tf06dUV8 ; https://www.youtube.com/watch?v=lZIRecUKeCE
- Glifos y notas comunitarias: https://github.com/nickustinov/even-g2-notes/blob/main/docs/display.md
- Changelog stock: https://x.com/EvenRealities/status/2063953310101516553 (v2.2.4) ; https://x.com/EvenRealities/status/2090732816397201572 (v2.2.9) ; https://mixed-news.com/en/even-realities-app-2-3-2-firmware-g2-glasses-r1-ring/ (v2.3.2)
- Reddit "New Modular Dashboard": https://www.reddit.com/r/EvenRealities/comments/1t34kln/new_modular_dashboard/
- Firmware mods: https://github.com/jimrandomh/g2flash
