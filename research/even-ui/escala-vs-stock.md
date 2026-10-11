# Por qué Faceclaw se ve más pequeño que el original (11 oct 2026)

Lo investigaron dos subagentes: uno revisó el código y el otro las fuentes de Even.

## Lo que se sabe
- **El lienzo es el mismo que el original:** 576×288 en (32,96) del panel de 640×480, con los píxeles 1:1 (`app/ui/shell/geometry.ts`; docs de Even Hub, `hub.evenrealities.com/docs/build/display`). Even también publica 640×350 y 27,5° de campo de visión; las dos cifras no se han reconciliado.
- **Fuente del original:** una sola fuente del firmware de 20 px, con 27 px entre líneas, y la jerarquía se marca solo con brillo (`referencia-stock.md`).
- **Fuente de Faceclaw:** Converse y las pantallas tipo terminal usan esa misma fuente de 20 px (`terminalFace` / `stockFace`). Los menús, el lanzador, Ajustes y el chrome usan Roboto Light 16 (`app/graphics/ui-fonts.ts:76`, unos 67 archivos): cerca de un 20 % más pequeña y de trazo fino, y en la guía de onda se ve tenue.
- **Profundidad:** el original solo desplaza entre lentes las capas de menú, IA y notificaciones, para que floten delante; el contenido de las apps queda sin desplazar (soporte de Even, artículo 17141997725455). Faceclaw desplaza toda la pantalla (48 por defecto; el usuario la tenía en -48), y eso era lo que causaba la doble imagen al mover la cabeza. Con 0 dejó de pasar.
- **Bloqueo por arranque:** `applyHomeLayout()` (`app/apps/home/home-layout.ts`) fuerza en cada arranque el modo 576x288, el selector de apps en popup y quitar el borde.
- Text size Large/Larger cambia a Roboto 26/28, pero solo en las pantallas tipo terminal; el home siempre usa `stockFace`.

## Inferencias, sin medir
- A igual tamaño en píxeles, una imagen que se percibe más lejos parece más grande. Pasar de -48 a 0 la acerca, y eso puede ser lo que hace que «se vea pequeña».
- Lo que se ve «menos pulido» probablemente viene de Roboto Light 16 en menús y Ajustes, frente a los 20 px del firmware en el original.

## Propuesta
1. Usar la fuente del firmware de 20 px en toda la interfaz, en lugar de Roboto Light 16, y avisar en vez de caer en silencio a Roboto si no está extraída.
2. Dejar el contenido de las apps en profundidad 0 y dar una profundidad pequeña solo a menús y notificaciones, como hace el original.
3. Probar en las gafas una profundidad global moderada (-16) para ver si se percibe más grande sin la doble imagen.
