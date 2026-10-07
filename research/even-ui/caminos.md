# ¿Partir de la UI de Even o de Faceclaw?

Faceclaw es ingeniería inversa del **protocolo BLE y del firmware** de las G2, no de la **interfaz** de Even. Su UI es un diseño propio escrito desde cero.

- El dashboard, los menús y las notificaciones stock los dibuja el firmware de Even en las gafas (LVGL). Ese código es cerrado.
- Faceclaw apaga esa UI y la reemplaza por una que se dibuja en el teléfono y viaja por BLE como display lists.
- Lo único que Faceclaw reutiliza del stock visual es la fuente, que extrae del firmware al instalar (`app/g2/firmware-fonts.ts`).

| Camino | Qué se obtiene | Límite |
|---|---|---|
| 1. Firmware stock + apps EvenHub | La UI de Even intacta, más apps propias | No se puede cambiar la base (dashboard, menús, navegación). Las apps viven en un contenedor de 576x288 |
| 2. Faceclaw con estilo Even | Control total, con aspecto parecido al stock | Hay que reconstruir el aspecto, no el código: ~5-9 días para un match estilístico convincente |
| 3. Parchear la UI dentro del firmware stock | La UI real de Even, modificada | Ingeniería inversa del binario; muy difícil y con riesgo de brickear. Ni el autor de Faceclaw lo hace |

Este fork existe para explorar el camino 2. Plan y estimaciones en [factibilidad-codigo-astra.md](factibilidad-codigo-astra.md); referencias visuales en [investigacion-visual-fable.md](investigacion-visual-fable.md).
