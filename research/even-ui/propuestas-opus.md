# Home, ronda 3 (Opus), 10 oct 2026

Tres conceptos nuevos para el home de las G2. Los tres parten de lo que Alexander pidió conservar: la columna de producción (fecha, baterías, reloj de matriz de puntos, clima, agentes que esperan) intacta a la izquierda, y la mitad derecha vacía en reposo. El primer scroll hacia abajo «entra donde no hay nada». Son distintos de lo ya rechazado ([alternativas-diseno.md](alternativas-diseno.md), [baraja-cards.md](baraja-cards.md)) y de la ronda paralela de Astra (sintonizador, díptico, fila de pictogramas).

Renders: `cd tools/headless-render && node opus-round3.cjs` deja `out/opus-<concepto>-<estado>.png` (640×480 gris, banda en 32,96) y `out/opus-<concepto>-<estado>-lens.png` (576×288 teñido de verde). Todo está pintado con `paintHomeColumn`, la fuente stock, Roboto Light 26, los íconos de píxel de `stock-art.ts` y `GrayImage`. Nada toca `app/`.

## Referencias (capturas en `tools/headless-render/out/ref-opus-*`)

| Referencia | Qué se toma | Archivo |
|---|---|---|
| **Light Phone II / III** ([lightiii](https://www.thelightphone.com/lightiii), [reseña de Engadget](https://www.engadget.com/mobile/smartphones/light-phone-iii-review-minimalism-stretched-to-the-point-of-frustration-141559294.html), [Wikimedia](https://commons.wikimedia.org/wiki/File:LightPhone2interface.png)) | Solo palabras: sin íconos, sin cajas, texto mediano sobre negro. La pantalla de reposo es fecha y hora y nada más. → **Frase** | `ref-opus-lightphone2-interface.png`, `ref-opus-lightphone3-home.jpg` |
| **Nothing Phone (3), Glyph Matrix** ([hands-on de Engadget](https://www.engadget.com/mobile/smartphones/nothing-phone-3-hands-on-dot-matrix-glyph-flagship-phone-173019742.html)) | Un solo dato a la vez en matriz de puntos, grande, sin marco; números y pictogramas en la misma rejilla. → **Gemelo** | `ref-opus-nothing-glyph-matrix.jpg` |
| **BERG Little Printer** ([Core77](https://www.core77.com/posts/21228/big-idea-little-printer-exclusive-qa-with-matt-webb-principal-ceo-of-berg-21228)) | El resumen del día como tira de papel que sale de una ranura: secciones separadas por perforación y lo leído queda arriba. → **Rollo** | `ref-opus-littleprinter-34.jpg`, `ref-opus-littleprinter-todo.jpg` |
| **Pebble timeline** ([Core experience](https://developer.rebble.io/guides/design-and-interaction/core-experience/), [pebble tool](https://developer.rebble.io/guides/tools-and-resources/pebble-tool/)) | Esfera de reloj como reposo y un botón de una dimensión: abajo avanza y arriba retrocede, y volver deja la esfera limpia. → mapeo del anillo de los tres | `ref-opus-pebble-system-navigation.png`, `ref-opus-pebble-timeline*.png` |

Teenage Engineering, Playdate, Smart Stack, Garmin, split-flap y Kindle los revisé y no los usé: o caen en tarjetas apiladas (Smart Stack, Garmin glances, ya rechazadas con el Rabbit), en una escala de sintonía (OP-1/TP-7, que es lo de Astra) o en un teletipo (split-flap, rechazado).

## Mapeo común del anillo

| Estado | Scroll abajo / arriba | Tap | Doble tap |
|---|---|---|---|
| Reposo (`opus-rest`) | Entra al primer elemento (Paseo) / al último (More) | — | Apaga la pantalla |
| Navegando | Siguiente / anterior. Después de More, un scroll más vuelve al reposo (el home sigue siendo circular) | Abre el elemento | Vuelve al reposo |
| App abierta | Mueve el «>» | Entra | Vuelve al home, en el mismo elemento |

Las apps abiertas usan el marco terminal de la spec (caja de 1 px, regla, pie «· Calendar  1/3»). Cada concepto cambia solo cómo se lee su contenido.

## 1. Frase

**Idea.** El home te habla en una frase. Al girar, la mitad derecha escribe una oración corta en Roboto Light 26, pegada abajo: «2 agents need you. Daily con el equipo at 10:30. Translate is ready. Converse is coming. More.». Cada cláusula es una tarjeta. El anillo mueve un subrayado de cláusula en cláusula: la enfocada va en 255 con una línea de 2 px y el resto en 153. No hay íconos, cajas ni puntos de posición: el orden de la frase dice dónde estás. Si no hay nada urgente, la frase se acorta sola («Nothing needs you. Daily at 10:30.»).

**Layout.** Bloque de texto en x 236–552, con la última línea a y 238 (base 272). El paso es 34 y caben 5 líneas (y 102–272). Subrayado a `y + lineHeight + 1`. Al abrir Calendar, la agenda también se lee como prosa: el evento enfocado subrayado, «10:30 – 11:00, in 49 min.», luego «Then … at 14:00.» y mañana en 85.

**Renders.** `opus-frase-scroll` (Paseo subrayado), `opus-frase-nav` (Calendar), `opus-frase-nav-more`, `opus-frase-open`.

**Ventajas.** Es lo más sobrio de los tres y lo que menos luz pone en el ojo. Se lee de un vistazo como una oración, sin decodificar íconos, y el contenido queda en la zona baja del campo, la que menos cansa. Es barato: un painter de flujo de texto con cortes por palabra.

**Costes.** El texto se reacomoda cuando cambian los datos (una cláusula más larga empuja las demás), así que el subrayado puede saltar de línea. La regla de «chrome en inglés, contenido en su idioma» da frases mixtas («Daily con el equipo at 10:30»). Con Text size Large no entra toda la frase: habría que recortar a las cláusulas con datos.

## 2. Gemelo

**Idea.** La mitad derecha se vuelve el gemelo del reloj. Al girar aparece una lectura en la misma matriz de puntos del reloj (punto de 7 px, paso de 10, dígito de 47×67): un pictograma de puntos y un número grande, alineados con la fila de las horas. Debajo, en la fila de los minutos, dos líneas stock con el detalle. Paseo es «2 need you», Calendar es «49 min» hasta el próximo evento, y Translate, Converse y More muestran solo el pictograma y sus líneas. Al cambiar de lectura, los puntos ruedan fila por fila de arriba abajo (unos 120 ms), como en un tablero de matriz.

**Layout.** Pictograma de puntos (12×12, punto de 3, paso de 5, 60 px) en (252, 74). Número en x 334, y 70 (misma `CLOCK_TOP`), con la unidad en stock 153 a su derecha, alineada con el pie del dígito. Líneas stock en x 252, y 156 y 183 (fila de los minutos). Los cinco puntos de posición de producción siguen en x 218. Al abrir Calendar, el panel de puntos de la izquierda muestra en 153 la hora del evento enfocado (10 sobre 30), para no confundirla con el reloj, con «in 49 min» arriba. La lista va a la derecha con «>».

**Renders.** `opus-gemelo-scroll` (Paseo), `opus-gemelo-roll` (fotograma intermedio Paseo → Calendar), `opus-gemelo-nav` (Calendar), `opus-gemelo-nav-translate`, `opus-gemelo-open`.

**Ventajas.** Es el más coherente con lo que Alexander ya aprobó: amplía el lenguaje del reloj en lugar de agregar otro. El número grande se lee sin enfocar, incluso con la mirada periférica. La rueda de puntos da una respuesta clara a cada clic del anillo.

**Costes.** Es el que más luz suma: dos bloques de puntos a 255. Solo algunas tarjetas tienen un número natural, y Translate, Converse y More se ven más pobres. En la app abierta, la hora en puntos puede leerse como el reloj aunque vaya en 153. Hay que confirmar en el lente si los puntos de 3 px del pictograma aguantan.

## 3. Rollo

**Idea.** Una impresora en la esquina. En reposo solo hay una ranura: una línea de 2 px en 85 al pie de la mitad derecha. Cada scroll imprime la siguiente tarjeta: la tira sube desde la ranura con un borde dentado arriba, y la tarjeta impresa queda siempre abajo, junto a la ranura, en la zona cómoda del campo. Lo ya leído sube, se comprime a una línea tenue («Paseo · 2 need you») separada por una perforación, y se ven como mucho dos de esas líneas. El cursor no se mueve: se mueve el papel. Scroll arriba rebobina. Después de More, el siguiente scroll arranca el papel y el home queda limpio.

**Layout.** Ranura en y 282, de x 230 a 558 (85 en reposo, 153 con papel). La tarjeta actual tiene una cabecera con ícono de píxel de 24 y nombre en 255, y debajo líneas stock con paso 27, la última a y ~250. Perforación de 4 px encendidos y 4 apagados en 85. El resumen anterior va en 119 y el más viejo en 85. La tira mide 316 px de ancho (x 236–552). Al abrir Calendar, la sección «arrancada» se lee como recibo: hora, puntos guía, título, y el cambio de día marcado con perforación y «Sun 11».

**Renders.** `opus-rollo-rest` (solo la ranura), `opus-rollo-printing` (fotograma a medio imprimir), `opus-rollo-scroll` (Paseo impreso), `opus-rollo-nav` (Calendar con Paseo arriba), `opus-rollo-nav-more`, `opus-rollo-open`.

**Ventajas.** Lo importante siempre está en el mismo sitio y abajo, así que el ojo no persigue un cursor. La metáfora explica sola el scroll arriba (rebobinar) y la vuelta al reposo (arrancar). Da contexto sin pedirlo: ves lo que acabas de pasar.

**Costes.** Necesita animación de alimentación para entenderse (2 o 3 fotogramas por clic), lo que cuesta BLE. La ranura en reposo agrega una línea a un home que se pidió vacío, aunque puede omitirse. Se parece a la baraja en que algo «sube desde abajo»: la diferencia es que no hay tarjetas con contorno ni tiras apiladas, solo texto sobre papel.

## Qué probar en el lente

1. **Frase:** si el subrayado de 2 px se distingue del texto en 153 sin el contraste del PNG, y si Roboto 26 a esa altura se lee sin subir la mirada.
2. **Gemelo:** si los puntos de 3 px del pictograma se ven o se funden. Si dos bloques de puntos a 255 molestan (probar el gemelo en 153). Si la rueda de 120 ms se percibe o parece parpadeo.
3. **Rollo:** si la perforación y el borde dentado en 85 se ven o desaparecen. Cuántos fotogramas de alimentación aguanta el enlace sin que el clic del anillo se sienta lento. Si la ranura en reposo molesta.
4. **Los tres:** tiempo para volver al reposo sin girar (¿8 s?) y si al despertar debería mostrarse sola la primera tarjeta cuando Paseo necesita algo (la spec actual despierta en Paseo; el pedido de hoy pide reposo vacío).
