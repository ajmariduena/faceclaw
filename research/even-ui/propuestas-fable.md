# Ronda 3 (Fable): tres conceptos que conservan el reloj y usan el vacío al girar

10 oct 2026. Tras descartar las seis alternativas, la baraja estilo rabbitOS 2 y pedir «más propuestas, piensa en el Apple Watch, saca referencias de todos lados». Astra (`propuestas-astra.md`) y Opus (`propuestas-opus.md`) hicieron rondas paralelas. Renders: `node tools/headless-render/fable-round3.cjs` → `out/fable-*.png` y `out/fable-*-lens.png`. Referencias guardadas como `out/ref-*`.

## Referencias miradas (capturas reales)

| Referencia | Qué se toma |
|---|---|
| Apple Watch Smart Stack ([guía](https://support.apple.com/guide/watch/see-widgets-in-the-smart-stack-apdecf142fb9/watchos)) | Desde la esfera, girar la corona hacia arriba abre una pila: la esfera se encoge a fecha + hora pequeña y aparece **una** tarjeta al frente con las siguientes asomando debajo. Orden por relevancia (contexto), no por app. El «hint»: un icono pequeño abajo de la esfera cuando hay algo útil. |
| Pebble timeline peek ([tutorial parte 5](https://developer.repebble.com/tutorials/watchface-tutorial/part5/)) | Una franja de una línea al borde de la esfera con el próximo evento; girar entra al futuro. |
| Garmin glances ([manual fēnix 7](https://www8.garmin.com/manuals-apac/webhelp/fenix7series/EN-SG/GUID-111B714D-06FC-4CB9-BF12-8F13707D301F-6118.html)) | Tres bloques de dato a la vez, título en versalitas y una cifra grande; el loop avanza de uno en uno. |
| Nokia S40 (Wikipedia, menú 6267) | Rejilla de íconos con etiqueta debajo; el foco es un marco y el recorrido es en orden de lectura. |
| Nothing OS 3 (Android Authority) | Reloj de matriz de puntos como el que ya tenemos; widgets de un dato en píxel. |
| Apple HIG widgets watchOS | Tarjeta rectangular: hora + título + lugar en tres líneas con barra de color a la izquierda; la versión «inline» cabe en una línea («Tue 11 · 2 events at 10AM»). |

## Home común a A y B

Columna como está (fecha, baterías, reloj, clima, agentes). Mitad derecha vacía salvo un **peek** en la última fila: ícono de calendario tenue + «10:30 Daily con el equipo» a 85 de brillo (Pebble peek / hint del Smart Stack). Si Paseo necesita algo, el peek lo muestra a él. `fable-home`.

## A · Smart Stack

Scroll abajo: una tarjeta al frente (318×196 en 230,14) y las dos siguientes asomando 9 px por debajo, cada una 8 px más estrecha y más tenue. La pila se ordena por relevancia: lo que te necesita, luego el próximo evento, luego Translate, Converse, More. Pie tenue «5 up · 1/5». Scroll avanza la pila (la de atrás pasa al frente), tap abre, doble tap vuelve al home. `fable-stack-1`, `fable-stack-2`.

Frente a la baraja Rabbit: no hay tiras con nombres; una sola tarjeta con contenido y profundidad, menos tinta y lectura directa. Costo: no se ve qué hay detrás; el orden por relevancia cambia con el contexto (hay que decidir si eso es deseable; Apple sí lo hace).

## B · Rejilla de glifos

Scroll abajo: seis íconos de píxel a 48 px en 3×2 con etiqueta debajo (Paseo, Calendar, Translate, Converse, AI Chat, More); el foco es un marco redondeado de 1 px y la etiqueta en blanco. Scroll recorre en orden de lectura (1D sobre una rejilla, como el S40 con un solo eje), tap abre, doble tap vuelve. `fable-grid-1`, `fable-grid-2`.

Es un lanzador, no una tarjeta: no da datos de un vistazo (eso lo hace el peek del home), pero es el más rápido para ir a una app y el más fácil de memorizar. Costo: seis íconos encendidos a la vez.

## C · Una sola página

El reloj es la parte de arriba de una página larga; al girar, la página sube: primero desaparece el reloj y entran las secciones (Paseo, Calendar, Translate, Converse, More) a ancho completo, separadas por una línea de 1 px, cada una con ícono + nombre tenue y sus líneas. Una «línea de lectura» fija a y=150 marca con una barra de 3 px la sección activa; una barra de scroll de 2 px a la derecha dice dónde estás. Tap abre la sección activa; doble tap vuelve arriba (al reloj). `fable-page-0..3`.

Como el Playdate o el Kindle: el anillo no salta entre cosas, desplaza un lienzo continuo. Lo más literal de «entrar donde no hay nada». Costo: el reloj se va al bajar; una página de ~900 px es más BLE por giro (hay que animar por display list como v3-enter).

## Qué probar en el lente

- Si el peek a 85 de brillo se ve o se pierde (subir a 119 si hace falta).
- Si las tarjetas asomadas (A) se leen como profundidad o como ruido.
- Cuánta tinta aguanta la rejilla (B) sin molestar en la calle.
- Fluidez del desplazamiento continuo (C) por BLE.
