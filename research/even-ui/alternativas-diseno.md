# Alternativas de diseño para el home y las listas (10 oct 2026)

Exploración visual sobre el home lean ([lean-spec.md](../lean-spec.md)): seis direcciones pintadas con los painters de producción y la fuente stock, más una comparación de marcas de foco y tamaños de texto. Renders: `node tools/headless-render/design-alts.cjs` deja `out/alt-*.png` (640×480 gris, banda en 32,96) y `out/alt-*-lens.png` (576×288 teñido de verde) y `out/alt-design.html` se arma aparte con los renders embebidos. Nada de esto toca `app/`.

## Límites que guían las decisiones

- **El display está en la parte alta del campo visual** (guías de Even; ensayo de Upfrontier sobre G2). Cada fila más baja del canvas pide menos elevar la mirada; mantener la vista arriba cansa. Diseños con lo importante abajo (teletipo, tipo grande) fatigan menos.
- **Solo se suma luz.** Sin fondos; la jerarquía se construye con brillo (255 / 153 / 85), aire y líneas de 1 px. Un relleno tenue (68) es posible en el CFW de Faceclaw porque pinta raster; en el SDK oficial no existe.
- **Iconos a 24×24, trazos ≥ 2 px, formas rellenas.** Los Lucide a 20 px con brillo 85 se ven en el PNG pero en el lente casi desaparecen. Preferir los píxel propios (`stock-art.ts`) o Lucide a 24 px y nunca por debajo de 153.
- **El anillo R1 es un mando de una dimensión**: scroll arriba/abajo, tap, doble tap, mantener. Las guías de Apple para la Digital Crown y la comparación de ruedas (iPod, iDrive, Kindle) coinciden: lista vertical corta, foco siempre visible, distinguir foco de selección, «atrás» consistente, jerarquía plana.
- **Texto:** 20 px stock (paso 27) o Roboto Light 26/28 (paso 34/37) ya soportados por Settings → Text size. Meta recomienda 20–24 px para contenido primario en su display de 600×600; a 28 px caben cinco filas en la banda.

## Las seis direcciones

| # | Nombre | Idea | Anillo | Descubribilidad | Vistazo | Fatiga | Costo |
|---|---|---|---|---|---|---|---|
| 0 | Hoy (columna + tarjeta) | Reloj de puntos y una tarjeta; cuatro ocultas | scroll cambia tarjeta, tap entra | Baja | Alta/Media | Media | Hecho |
| 1 | **Pila** | Cinco filas, una por app, con su dato inline; cabecera de una línea con reloj y complicaciones | scroll mueve «>», tap abre, doble tap apaga | **Alta** | Alta (5 datos) | Media | Bajo |
| 2 | Teletipo | Banda vacía arriba; abajo reloj 56 px y un titular a 28 px que el anillo rota | scroll rota titular, tap abre | Baja | Alta (1 dato grande) | **Baja** | Bajo |
| 3 | Tipo grande | Una app por pantalla a 28 px, lo siguiente en tenue; estado «abierto» natural de cualquier fila | scroll pasa página, doble tap vuelve | Baja | **Máxima** | Media | Bajo |
| 4 | Línea de tiempo | Navegar por «qué sigue»: Paseo y Calendar intercalados por urgencia, riel de 1 px, pie con Translate/Converse/AI Chat/More | scroll recorre el día y luego el pie | Media | Alta para tiempo | Media | Alto |
| 5 | Dial | Rueda circular de cinco nombres a la izquierda, tarjeta actual a la derecha | scroll gira la rueda, tap entra | Alta | Media | Media | Bajo |

## Marcas de foco

Chevron «>» (stock Even, menos tinta), barra tenue (relleno 68, como el menú del OS), borde de 1 px (patrón del SDK) y zoom (el elegido a 26 px, el resto a 20 tenue, como el selector de iOS). El brillo solo no basta: con un ítem no se nota el cambio.

## Recomendación

- **Home = Pila (1) con chevron; tap abre Tipo grande (3).** La pila elimina el estado oculto, que es el problema real de un carrusel con un mando de una dimensión; el tipo grande da la lectura máxima una vez decidido qué mirar. Dos painters pequeños; el shell no cambia más que en v3.
- **Teletipo (2) como modo opcional** («Quiet home»): mismo modelo de navegación, otra pintura; la mejor para llevarlas todo el día.
- **Iconos:** píxel propios o Lucide a 24 px, nunca bajo 153 de brillo.
- **Línea de tiempo (4)** queda como idea fuerte para después de Converse, cuando haya más fuentes de «qué sigue».

## Pendiente de probar en las gafas

Si el reloj a 20 px basta como reloj; si la barra tenue de foco se ve o se pierde en el lente; cuántas filas a 26 px son cómodas con la mirada elevada; y si los puntos horizontales del teletipo se leen.

## Fuentes

- Even Realities, [Design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines) y [Display](https://hub.evenrealities.com/docs/build/display): 576×288, 4 bits, sin fondo, iconos píxel, patrones «>» y borde.
- Meta, [Build web apps for display glasses](https://wearables.developer.meta.com/docs/develop/webapps/build): 16 px mínimo, 20–24 primario, fondos oscuros, foco visible, sin scroll.
- Vuzix, [UI best design practices](https://support.vuzix.com/docs/ui-best-design-practices-4): solo lo relevante a la tarea, flujos lineales, orden de foco explícito.
- Apple HIG, [Digital Crown](https://developer.apple.com/design/human-interface-guidelines/digital-crown) y [Designing for watchOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-watchos): listas verticales, respuesta visual al giro, jerarquía plana.
- Upfrontier, [Thinking about AI Glass UI Design (Even G2)](https://note.com/upfrontier/n/n27f3d46c9367): display arriba del campo visual, fatiga al sostener la mirada, jerarquía por brillo, iconos a píxel.
- Reseñas G2/Meta/Rokid/Halliday (PCMag, Wired, Android Police, Tom's Guide): elogian texto grande y legible, critican tener que mirar hacia arriba de forma sostenida y las listas largas.
