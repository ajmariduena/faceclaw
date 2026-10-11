# Tercera ronda — Ventana, Díptico y Puerto

10 de octubre de 2026. Exploración visual, no implementación del home. Script: `tools/headless-render/astra-round3.cjs`. Doce escenas, cada una en gris 640×480 (banda en 32,96) y verde 576×288. Datos ficticios, fuente stock de 20 px, paso 27 px, primitivas `GrayImage` de producción. Sin cambios en `app/`, commits, push, APK ni teléfono.

## Referencias realmente vistas

Se buscaron referencias con Perplexity Search y se descargaron las fuentes directamente; el manual se contrastó también con `scrape`. No se usaron Exa ni Google, indicados sin crédito en el encargo. Estas imágenes se abrieron y revisaron antes de diseñar:

- **Teenage Engineering OP-1, tape editing.** [Manual oficial v1.2](https://teenage.engineering/_img/54b7f9bf8681400300255cab_original.pdf), página PDF 22; [explicación oficial](https://teenage.engineering/guides/op-1/original/tape-mode). Imagen local `out/ref-astra-op1-tape.png`, manual `out/ref-astra-op1-manual.pdf`. La ilustración muestra una cabeza fija y material que pasa bajo ella. Se toma **un punto de lectura estable** para Ventana; no se toman bobinas, pistas temporales ni color. Es una ilustración oficial de interfaz, no una foto del aparato en funcionamiento.
- **Braun T3.** [Fotografía y ficha](https://www.abetterpage.com/wt/euro/BraunT3.html), [JPEG directo](https://www.abetterpage.com/wt/photos/BraunT3_640x436.jpg). `out/ref-astra-braun.jpg`. Se observa una superficie horizontal partida en dos funciones claras por el vacío. Se toma **separación espacial y alineación**, para Díptico; no el dial, ya descartado, ni los orificios como decoración. Es una interfaz física de radio, no una pantalla: referencia de composición, no evidencia de usabilidad en G2.
- **Playdate, menú del sistema con contexto.** [Guía oficial de diseño 1.12.3](https://sdk.play.date/1.12.3/Designing%20for%20Playdate.html), [captura](https://sdk.play.date/1.12.3/Designing%20for%20Playdate/dfp-menuimage.png). `out/ref-astra-playdate-menu.png`. El contexto del juego permanece separado de los controles. Se toma **contexto persistente y controles concentrados en una zona**, rotados a la base en Puerto. No se copia su lista ni su fondo claro. Su launcher (`out/ref-astra-playdate-launcher.png`) también se miró y se descartó: marco, textura y tarjeta ilustrada se acercan a lo rechazado.
- **Playdate, ejemplo de tipografía legible.** [Captura oficial](https://sdk.play.date/1.12.3/Designing%20for%20Playdate/dfp-font-legible.png), `out/ref-astra-playdate-font.png`. Refuerza el texto con cuerpos consistentes, sin ornamentación ni mezclas de tamaños. No demuestra legibilidad óptica en G2.

Las referencias aportan patrones concretos, no son propuestas para adoptar productos o librerías. No se atribuyen al OP-1 o a Playdate gestos que no tienen: el anillo mantiene las reglas de Faceclaw.

## Base común y decisiones explícitas

Reloj **09 sobre 41** en las mismas coordenadas y con el mismo dibujo de puntos de `paintHomeColumn`: x=50/115, y=70/150, puntos 7 px, paso 10. Fecha `Sat 10` en (25,12). La columna sigue midiendo 212×288. Para cumplir el encargo de iconos de al menos 24 px, solo en el render se repintan las complicaciones: calendario (0,12), anillo (112,12), batería (138,12), gafas (164,12), batería (188,12); clima (0,248), temperatura (29,248), actividad (165,248) y contador (195,248). El clima se simplifica a nube de píxel. El reloj y fecha no cambian; los iconos difieren del painter vigente de 20 px.

En reposo, x≥212 está completamente vacío: ninguna línea, punto, título ni flecha. Primer scroll abajo revela Paseo en ese vacío, sin mover el reloj. Esto cambia deliberadamente la regla anterior de mostrar Paseo ya visible al despertar: Paseo sigue siendo el destino inicial, pero oculto hasta el giro. Tap en reposo abre Paseo directamente. Scroll arriba desde reposo revela More, haciendo explícito el otro sentido.

Una vez revelado el home: scroll abajo avanza **Paseo → Calendar → Translate → Converse → More → Paseo**, arriba retrocede. Tap abre la app marcada por `>`. **Doble tap en cualquier estado del home apaga**, como pide lean-spec; no introduce otro nivel para esconder el contenido. Doble tap desde la raíz de una app vuelve al home revelado en la selección de origen, con la protección de 700 ms. Desde un detalle vuelve primero a su lista. Al despertar se recupera el reposo vacío y el destino Paseo. No hay timeout automático.

Mantener abre el menú del sistema; tap+mantener el de la app. En Translate la salida activa conserva la confirmación `Stop and leave?`, y tap pausa/reanuda. Las listas internas se detienen en extremos. Las capturas son estados finales estáticos: no prueban transiciones, latencia ni estos gestos.

Las tres exploraciones retiran el marco exterior del **home**, una excepción visual propuesta a la regla de marco global. Las apps abiertas conservan marco terminal, línea fina, selección anidada y pie. Brillos 255/153/85, sin superficies rellenas. Los 85 se reservan para líneas y posición; iconos a 153 o 255.

## 1. Ventana — el contenido pasa por un punto fijo

El giro descubre una abertura de lectura en mitad de la zona vacía. Cuatro marcas pequeñas delimitan el área y un solo borde vertical la registra; la aplicación elegida y sus dos novedades siempre aparecen en el mismo sitio. No hay tarjetas superpuestas ni nombres vecinos: el objeto estable es la abertura, y el anillo cambia la información que pasa por ella. Se inspira en la cabeza fija de la cinta del OP-1. Es la más sobria y la más próxima al home actual de las tres; la diferencia propuesta es retirar la caja y entrar en un espacio de lectura, sin simular un objeto flotante.

**Coordenadas:** icono (250,65), `> nombre` (284,65); marcas en (238,104), (542,104), (238,228), (542,228), longitud 14; borde izquierdo x=238, y=104…228. Texto x=254, y=111/138/165/192, ancho 286. Cinco puntos desde (357,252), paso 17. La mitad alta derecha queda vacía hasta y=65.

**Estados:** reposo vacío → primer giro Paseo (agente/edad tenue, novedad blanca, repetido dos veces) → siguiente giro Calendar (dos eventos de hoy) → tap abre agenda terminal. Doble tap vuelve al Calendar revelado. Para Translate/Converse se muestra idioma y estado; More mantiene su nombre e icono, con un resumen opcional de sus cuatro destinos.

**Ventajas:** poca tinta; lectura estable; dos novedades sin desplazarse; el reloj no salta. **Costes:** las otras apps permanecen ocultas salvo los cinco puntos; las marcas pueden resultar demasiado sutiles; exige comprobar si aporta una diferencia suficiente respecto al home actual. No se propone animación continua de cinta: en una primera prueba, sustitución directa por cada paso del anillo.

## 2. Díptico — dos novedades a la misma altura

Al girar aparece una superficie editorial dividida en dos: las dos novedades de Paseo, o los dos próximos eventos, se leen lado a lado a la misma altura. El título abarca ambas mitades. La separación clara del Braun T3 se aplica dentro del vacío derecho; no hay dial, pila, cronología vertical ni una fila seleccionada. El anillo cambia la app completa: las dos mitades **no son dos opciones** ni requieren un gesto lateral.

**Coordenadas:** icono (242,60), `> nombre` (276,60); línea horizontal (244,102), ancho 306. Columna uno x=244, columna dos x=410, ancho 140 cada una; metadatos y texto en y=120/147/174. Separador vertical x=394, y=118…229. Etiqueta común (244,224); puntos desde (468,258), paso 17.

**Estados:** reposo → primer scroll Paseo (BLE a la izquierda, Review a la derecha) → scroll Calendar (10:30 y 14:00) → tap abre la agenda, enfocando el primer evento. Doble tap regresa al díptico Calendar, no al reposo ni al segundo evento. Translate y Converse usarían una sola zona de ancho completo con idioma y estado, sin divisor vacío; More, nombre e icono. Los renders de esta ronda materializan Paseo y Calendar, no esas variantes adicionales.

**Ventajas:** presenta dos asuntos con igual jerarquía sin subir la mirada para el segundo; distingue dos novedades de un bloque de chat. **Costes:** 140 px parten frases muy pronto; los títulos reales largos deben envolver y después truncar con elipsis, nunca reducir fuente. Las dos columnas pueden leerse erróneamente como dos botones. Es una hipótesis de composición que requiere más validación óptica que las otras dos.

## 3. Puerto — cinco destinos en el borde inferior

El primer giro hace aparecer cinco estaciones de pictogramas en la base de la zona vacía y, encima, el detalle de la estación activa. El reloj sigue quieto a la izquierda. El índice ocupa el área más baja; el nombre seleccionado, siempre escrito, evita depender solo del significado de cada icono. La separación entre contexto y controles se toma del menú de Playdate, no de sus tarjetas. No hay cuadrícula: el orden es una única secuencia recorrida por el anillo, aunque se dibuje horizontalmente.

**Coordenadas:** `> nombre` (242,59); contenido x=242, y=101/128/155/182, ancho 308. Separador (242,228), ancho 308. Iconos de 24×24 en x=247/308/369/430/491, y=244. Marca de selección de 34 px en y=276 bajo el icono; cinco puntos en y=282 centrados debajo de cada estación. No hay etiquetas pequeñas ni color por app.

**Estados:** reposo → primer scroll Paseo → dos scrolls adicionales Translate → tap abre Translate, con traducción blanca y original tenue. Doble tap mientras graba lleva primero a la confirmación de salida y solo después al Puerto con Translate seleccionado. La imagen abierta representa el estado posterior al arranque con clave válida, no una conexión real.

**Ventajas:** expone los cinco destinos sin cinco filas de texto; foco redundante por nombre, icono y subrayado; permite aprender ubicaciones. **Costes:** es el que más iconos mantiene iluminados; el orden horizontal puede inducir a intentar un gesto lateral; cinco pictogramas requieren aprendizaje. La ubicación baja puede favorecer el vistazo, pero solo el lente puede confirmarlo.

## Qué comprobar en las G2

1. Despertar y leer hora/fecha: confirmar que la adaptación a iconos de 24 px no produce amontonamiento en baterías.
2. Partiendo del reposo, encontrar Calendar y luego Translate solo con el anillo; observar si se entiende que abajo avanza aunque Puerto sea horizontal.
3. Leer las dos novedades de Paseo en cada propuesta, con mensajes reales cortos y largos: detectar si Díptico fragmenta demasiado o parece tener dos focos.
4. Exterior luminoso e interior: comprobar legibilidad de texto 153, separadores 85 e iconos 24; no confundir el PNG verde con contraste óptico real.
5. Mantener la vista 10 segundos en cada región: comparar esfuerzo entre cabeceras y base, sin afirmar que la altura por sí sola garantiza comodidad.
6. Abrir y volver: recordar selección, confirmar protección de 700 ms, apagar desde home y comprobar la salida de Translate con confirmación.

## Verificación y archivos

Se ejecutó `node tools/headless-render/astra-round3.cjs` localmente (~1–2 s). El script comprueba ancho de cada texto, límites verticales, dimensiones y cuantización a un máximo de 16 grises. Se abrieron los **24 PNG** generados para revisión visual, incluidos los estados repetidos y las variantes verdes; se corrigió Translate para que la traducción fuera blanca y el original tenue. No hay textos solapados o fuera de banda en estas muestras. No se ha probado el renderer nativo Android ni la legibilidad en el lente.

Cada nombre siguiente existe en `tools/headless-render/out/` tanto como `.png` como `-lens.png`:

- `astra-ventana-reposo`, `astra-ventana-primer-scroll`, `astra-ventana-navegando`, `astra-ventana-abierta`.
- `astra-diptico-reposo`, `astra-diptico-primer-scroll`, `astra-diptico-navegando`, `astra-diptico-abierta`.
- `astra-puerto-reposo`, `astra-puerto-primer-scroll`, `astra-puerto-navegando`, `astra-puerto-abierta`.

Inventario exacto: `out/astra-manifest.json`. Referencias y PNG bajo `out/` son artefactos locales ignorados por git; el script y este documento son los entregables nuevos reproducibles, con la fuente stock local ya extraída. La galería nueva `out/astra-round3.html` incluye los doce estados y permite alternar gris/verde sin subir nada.
