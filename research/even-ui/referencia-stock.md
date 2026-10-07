# Referencia consolidada: Even G2 stock

2026-10-07. **C** = confirmado en documentación, render oficial o frame; **I** = medida aproximada, inferencia o decisión del prototipo. Prioridad: renders oficiales 1:1 y tokens Figma; después fotografías por el lente. Las medidas de fotos normalizadas no sustituyen las del render. No se atribuye una versión de firmware a un vídeo solo por su fecha.

## Tokens

| Token | Valor / certeza |
|---|---|
| Banda | **C** 576×288; **C local** panel Faceclaw 640×480, banda en (32,96) |
| Color | **C** monocromo, 16 niveles; PNG neutral, sin simular glow ni profundidad binocular |
| Bordes | **C** 1 px en las referencias; radio **6 px** en las guidelines |
| Ítem / tarjeta | **C** márgenes laterales/verticales **16/8** y **20/16** px |
| Texto | **C** fuente firmware de 20 px; pitch 27; jerarquía por brillo, no peso |
| Brillo | **C** primario/secundario; **I** 255/153 (~60 %), fila activa 68 (~27 %), fondo bajo overlay 25–30 % |
| Iconos | **C** artboard 24×24, rejilla de píxel; trazo 2 px admitido; sin suavizado |
| Paginación | **C** columna de puntos; **I** 2–4 px, paso 11, cantidad según páginas, activo brillante |
| Scroll | **C** barra fina de 2 px, tramo activo más brillante |

Fuentes: [Display](https://hub.evenrealities.com/docs/build/display), [Design guidelines](https://hub.evenrealities.com/docs/build/design-guidelines), [Figma OS Guidelines](https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/), [pretext 0.1.4](https://www.npmjs.com/package/@evenrealities/pretext/v/0.1.4).

Los rectángulos amarillos y badges numerados de Support son anotaciones editoriales: **no se reproducen como fondo de tarjeta**. Hay evidencia de selección tenue en otras listas, pero su brillo exacto no se obtiene de esos resaltados amarillos. Las discrepancias de radios 8–10 y pitch 34–40 en fotos reducidas no prevalecen sobre radio 6 y filas de menú 50–54 en renders 1:1. El ítem genérico SDK de 40 px tampoco equivale al menú del OS.

## Dashboard clásico

**C** Estado a la izquierda, widget a la derecha; el menú no es permanente. **I medida** estado x≈22–216, fecha y batería y≈20; reloj HH/MM en x≈58–182, filas y≈69 y 149, dígitos propios 56×68, puntos de 2×2 separados por 1 px. Clima y campana y≈248–272. Fecha, clima en °C y hora usan arte propio; batería de gafas ficticia 82 %, 3 no leídas, miércoles 7 de octubre de 2026, 09:41.

**C medida** tarjeta x≈230–547, y≈14–273 (318×260), borde 1, radio 6, padding 20/16. Puntos x≈218–222. Calendario: icono+título, lugar/hora secundarios, pitch 27; los eventos que no caben continúan al hacer scroll. El prototipo evita líneas partidas verticalmente; el segundo fixture no tiene lugar. Música y recientes conservan estos tokens, pero **son contenido propio**, no pantallas stock observadas.

**C** Swipe cambia widget; tap expande; doble tap colapsa/vuelve. Dashboard apagado: doble tap o HeadUp despiertan; política de autoapagado fuera del render. **C** Widget expandido elimina el reloj y ocupa x≈18–558, y≈14–273; puntos a la derecha y scrollbar de 2 px. **I local** barra x=544 y puntos exteriores x=564 para evitar colisión.

Fuentes: [Dashboard](https://support.evenrealities.com/hc/en-us/articles/14269247458319-Dashboard), [referencia oficial Calendario](https://support.evenrealities.com/hc/article_attachments/14597332006799), [tutorial Dashboard](https://www.youtube.com/watch?v=4hLvWcYTGnU).

## Menú

**C** El reloj desaparece; entra un panel izquierdo y la tarjeta permanece atenuada. **C medida** ancho ~195 px: x=8–202 en la referencia Plugins, otras versiones x≈36–211. **I local** x=8, y=14, 196×260, alineado con la tarjeta; cinco filas de 52 px. Iconos propios 24×24; fila activa plena con relleno tenue, resto secundario. Puntos x=212. El texto «Notificaciones» obliga a reducir el margen lateral local a 12 px y dejar 8 px entre icono y etiqueta; esto es una adaptación del token ideal de 16 px, sin reducir la fuente.

**C** Lista circular; swipe mueve foco, tap abre, doble tap vuelve. **C stock** tap+long-press (~1 s). **Decisión Faceclaw:** conservar el gesto ya enrutado por el shell (long-press para menú del sistema, con sus excepciones); no añadir un gesto nuevo en este render.

Orden solicitado: Notificaciones, Conversar, Traducir, Teleprompter, Navegar, AI Chat, Calendario, Música, Timers, Ajustes, Más…. «Más…» se conectará al launcher existente; aquí solo se representa el catálogo. En el estado desplazado se ven AI Chat, Calendario activo, Música, Timers y Ajustes.

**I adaptación** `stock-menu-right`: lista x=364–559, puntos x=350, widget izquierdo x=18–335, y=64–273; hora/fecha/clima compactos encima. Esta distribución conserva estado y widget en el espacio restante, pero **no es una variante stock confirmada**. Izquierda/derecha queda pendiente de elección.

Fuentes: [Menu](https://support.evenrealities.com/hc/en-us/articles/14269160297999-Menu), [menú Plugins 1:1](https://support.evenrealities.com/hc/article_attachments/15721842018831), [How to Control, 0:23–0:26](https://www.youtube.com/watch?v=cxqpCVx4nNs&t=23s).

## Apertura, función y salida

- **C visual / I temporal:** menú entra desde la izquierda en ~500 ms; el reloj se desvanece y el widget conserva posición. Muestras locales 0/125/250/375/500 ms. Smoothstep es una elección, no una curva medida del firmware.
- **C visual / I temporal:** al elegir una función, menú y fondo se atenúan durante ~300 ms; después aparece la función. Muestras 0/100/200/300 ms; brillo 100/65/30 % y destino pleno. No se infiere la latencia de carga de una función a partir de esta secuencia.
- **I adaptación:** Calendario como función ocupa la banda completa, con título, hora y agenda. Es distinto del widget expandido y del `CalendarLayer` actual; no se inventa detalle de evento.
- **C:** doble tap de salida en funciones muestra confirmación centrada sobre contenido atenuado. Título «¿Terminar esta función?», «No» secundario y «> Sí» activo. **I local:** caja x=143, y=76, 290×142 para acomodar el español. Sin separador: la toma del diálogo de salida no lo muestra; el diálogo Terminal es otro caso.
- **I pendiente:** confirmar «Sí» vuelve al dashboard; curva exacta de retorno, interrupciones y prioridad de modales aún requieren integración/prueba.

Fuentes: [tutorial Conversate, 0:06](https://www.youtube.com/watch?v=gRzR46Fq9R8&t=6s), [diálogo por el lente, AfterNow 5:51](https://www.youtube.com/watch?v=sEDTmvGg-QY&t=351s), [ciclo de páginas](https://hub.evenrealities.com/docs/build/page-lifecycle), [Figma](https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/).

## Capa del sistema

**C medida** Notificación superior x≈46–539, y≈28–178, radio 6: icono+app, tiempo alineado a la derecha, remitente, dos líneas a pitch 27. Puntos fuera del borde izquierdo (x≈36 en el render consultado). Fondo atenuado, conservado alrededor de la caja; interior despejado para lectura. **C** Tap marca leída y cierra; doble tap descarta sin marcar. El fixture usa Mensajes/Lucía Andrade.

**C medida** Even AI escuchando: caja inferior x≈36–539, y≈196–259, indicador bajo el centro; la respuesta crece hacia arriba. Fondo atenuado. No se añade un modo AI en este alcance. Perspectiva y profundidad del foreground observadas en vídeos tampoco se simulan.

Fuentes: [Notifications](https://support.evenrealities.com/hc/en-us/articles/14274501482639-Notifications), [Even AI](https://support.evenrealities.com/hc/en-us/articles/14274515708559-Even-AI), [capas Figma](https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/).

## V1 propuesta vs stock

| V1 propuesta | Stock / decisión nueva |
|---|---|
| Widget izquierdo y apps derechas permanentes | Dashboard con estado izquierdo y tarjeta derecha; menú temporal |
| Roboto Light y reloj horizontal | Fuente stock local 20 px/pitch 27; HH/MM dot-matrix propio |
| Iconos Lucide | Iconos ASCII propios; 24×24, trazo 2 px |
| Radio 16/8; cinco filas de 44 px | Radio 6; cinco filas de 52 px |
| Selección con contorno, contador «1/9» | Brillo + relleno tenue, puntos verticales, lista circular |
| Swipe selecciona apps desde home | Swipe pagina widgets; con menú abierto mueve foco |
| Doble tap directo al home | Colapsa widget / cierra menú / diálogo de salida según estado |
| Deslizamiento home→app de 180 ms | Menú entra ~500 ms; abrir función usa fundido ~300 ms |
| Sin modelo de foreground | Notificación/diálogo preservan fondo atenuado |

## Alcance comprobado

Render local con `GrayImage`, fuente `EvenHubFont` y encoder/decoder/painter de display lists de producción. Fuente extraída exclusivamente a `tools/headless-render/out/local-fonts/` ignorado, de EVENOTA 2.3.0.24 validado contra el SHA-256 del fork; no se distribuye el archivo. Reloj e iconos son autoría propia, sin leer capturas desde los painters.

El panel animado se empaqueta en un recurso de 25.485 bytes; el desplazamiento se reproduce por display list. Atenuación y fundido son muestras raster con `dimmed()`: no prueban una animación autónoma de brillo en firmware. Comparativos solo en `out/`; los de vídeos usan fases aproximadas, los widgets propios y Calendario-función se comparan con la referencia más próxima, indicada en cada imagen.

No hay integración de navegación/datos, APK, teléfono, validación óptica ni medición BLE. Los modos anteriores conservan su implementación.

Validación local: 6/6 pruebas stock (banda, extremos, fundido, overlays, wrap y arte) y 33/33 pruebas de producción (geometría, display lists y animación de menú). Los 17 PNG anteriores regenerados conservan su SHA-256. No hubo cambios en `app/`, commits ni escrituras remotas.
