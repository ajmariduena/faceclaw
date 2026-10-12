# Navigate mínimo (propuesta Fable, 11 oct 2026)

Pedido: la pantalla de guía tiene que ser mínima, sin marco ni pie, como el Navigate de Even, para que no estorbe en el campo de visión. La propuesta con marco (`out/navg-guiando.png`) quedó descartada.

## Qué muestra el Navigate de Even

Capturas oficiales de las gafas en el centro de soporte y una foto real a través del lente:

- Soporte oficial (capturas de los dos modos de mapa): https://support.evenrealities.com/hc/en-us/articles/14273871101071-Navigate
- Foto a través del lente (Dymesty, G2): https://dymesty.com/blogs/articles/even-realities-g2-review
- Render oficial del G1 (Wired): https://www.wired.com/review/review-even-realities-g1-smart-glasses/
- Descripciones: Gizmodo https://gizmodo.com/even-realities-even-g2-review-2000687632 · Lifehacker https://lifehacker.com/tech/even-realities-g2-smart-glasses-review · Wareable https://www.wareable.com/wearable-tech/even-realities-g2-r1-review · Wired G2 https://www.wired.com/review/even-realities-g2/

Lo que se ve, estado por estado:

- **Cuatro esquinas y el centro vacío.** Arriba a la izquierda, la hora y el ícono del modo (caminando/bici). Arriba a la derecha, distancia y tiempo restantes («7.5km 23min»; en el mapa completo también «ETA 17:06»). Abajo a la izquierda, la flecha del giro, la distancia («200m») y debajo el nombre de la calle («River Road»). Abajo a la derecha, el minimapa. Nada toca el centro del campo visual.
- **Minimapa sin borde ni fondo.** Modo «heading-up»: gira con la dirección de marcha. La ruta es una línea punteada brillante, las calles cercanas son líneas tenues sin nombres («an unlabelled grid», dice Wareable), y la posición es una flecha rellena. No hay recuadro: el negro es transparente.
- **Flecha y texto pequeños.** La flecha es pixel-art de unos 40 px; distancia y calle van en la misma fuente que el resto del sistema. Nada es grande.
- **Mapa completo** con un toque: norte arriba, toda la ruta punteada y el destino como un anillo con punto.
- **Cerca del giro** no cambia la composición: solo baja la cifra. **Al llegar** aparece un mensaje y Navigate se cierra solo a los ~4 s.
- Lo que critican las reseñas: el mapa siempre encendido distrae (Wired pide «solo flecha, distancia y calle») y las calles sin nombre no dan confianza (Wareable).

## Tres direcciones

Todas sin marco, sin pie, sin hora ni fecha, sin carriles, sin «luego», sin barra. Lente 576×288, profundidad 0. El brillo hace de barra de aproximación: lejos del giro la flecha va tenue y la cifra media; a menos de ~300 m todo sube a blanco.

**A. Esquinas (recomendada).** Las dos esquinas de abajo de Even y nada más: abajo a la izquierda flecha suavizada de 48 px, distancia en números grandes con la unidad en la línea base y la calle debajo; abajo a la derecha el esquema de la ruta con la posición. Los dos tercios superiores quedan vacíos.

**B. Línea.** Sin mapa. Una sola línea baja en el lente: flecha de 34 px, distancia y calle sobre la misma línea base, como los subtítulos de Live facts. Es lo mínimo posible; sirve como ajuste «sin mapa».

**C. Ruta.** El mapa es el protagonista a la izquierda (lo que él describió: «a la izquierda muestra la calle que voy siguiendo») y la flecha con la distancia grande y la calle quedan a la derecha. Es la propuesta anterior sin marco; más legible de lejos, pero ocupa la línea de visión.

## Recomendación: A, Esquinas

- Es la composición que él ya elogió, depurada: se quitan la fila de arriba (hora, modo, restante) y el borde; se mantiene la lectura «flecha → distancia → calle» y el minimapa a la derecha.
- Todo vive en el tercio inferior, fuera de la línea de visión; el centro sigue siendo calle real.
- Flecha vectorial suavizada y números TTF en lugar del pixel-art, con la fuente del firmware para la calle: se ve del mismo sistema que el resto de Faceclaw.
- El tiempo y la distancia restantes no van en el lente: ya los muestra la tarjeta del inicio durante el viaje. Si hacen falta, un toque puede mostrarlos dos segundos arriba a la derecha, como el mapa completo de Even.
- Cambio del 11 oct 2026: él pidió la hora de llegada en el lente y eligió, entre tres mocks, una línea tenue encima de la distancia («Llegas 18:52 · 23 min»); la distancia restante sigue fuera.

## A2 · Esquinas con calles (ajuste pedido tras elegir A)

Él eligió A y pidió «un poco más del resto del mapa, las secciones alrededor, para ver ciertos cruces; ahora solo se ve una línea y no sé qué tengo que hacer».

Qué cambia respecto de A: nada en la composición. Mismo grupo flecha → distancia → calle abajo a la izquierda, mismo tercio superior vacío, misma ruta brillante y mismo chevrón. Se añade la red de calles alrededor a bajo brillo, con jerarquía por brillo y ancho: la avenida a la que se gira es más clara y más ancha y se extiende hacia los dos lados; las calles laterales son más finas y tenues. El desvanecido pasa a ser elíptico (126 px a los lados, 152 px arriba) para que las calles se disuelvan antes del borde del lente a la derecha y antes del nombre de la calle a la izquierda. La geometría del mock es irregular a propósito: cruces oblicuos, cuadras de distinto tamaño, una calle en T a cada lado de la avenida y una diagonal.

Estados: `crucero` (cruces cercanos y una avenida más adelante), `giro` (las cuadras alrededor de la esquina, lo que más importa), `rotonda` (se ven las otras salidas), `recalculando` (solo calles y posición, sin ruta: dicen dónde estás) y `llegada` (el destino sobre el acceso lateral). Densidad alternativa para `giro`: `giro-pocas-calles` (avenida, un cruce y una paralela por lado) y `giro-mas-calles` (más cuadras y una diagonal). Recomendación: la media, que es `giro`.

**Fuente de las calles: Map Tiles API, teselas 2D «roadmap» solo con vías.** Los términos 12.2 prohíben mostrar contenido del Navigation SDK junto a un mapa que no sea de Google, así que OpenStreetMap queda fuera. Entre las dos opciones de Google:

- **Map Tiles API 2D (elegida).** Se abre una sesión (`createSession`, `mapType: roadmap`) con un estilo que apaga etiquetas, POI, edificios y relleno y deja solo las vías; se bajan una vez las teselas del área por la que pasa la ruta (nivel 16–17) y se guardan durante el viaje. El teléfono rota y desvanece ese raster cada segundo; no se pide nada por segundo. Precio verificado el 11 oct 2026: US$0,60 por 1.000 teselas con **100.000 gratis al mes**. Un viaje urbano de 10 km a nivel 17 son unas 60–120 teselas; un usuario con dos viajes diarios no sale de la franja gratuita. Documentación: https://developers.google.com/maps/documentation/tile/2d-tiles-overview · sesiones https://developers.google.com/maps/documentation/tile/session_tokens · precios https://developers.google.com/maps/billing-and-pricing/pricing
- **Static Maps (descartada).** Un recorte por cada movimiento: sin parámetro de rumbo, hay que rotar y recortar el raster, y cada petición cuenta. US$2 por 1.000 con 10.000 gratis al mes; un tile cada 5 s en un viaje de 20 min son 240 peticiones, dos viajes diarios ≈ 14.000 al mes, ya fuera de la franja gratuita. Sirve solo para una vista general de toda la ruta, una vez por viaje.

**Atribución.** La política de Map Tiles exige el logo de Google o, donde no hay espacio, el texto «Google Maps», más la cadena de copyright que devuelve `/tile/v1/viewport` («Map data ©2026»). En el lente va «Google Maps» en 12 px tenue, abajo a la derecha (ya está en los renders); la cadena de copyright cabe en el mismo rincón si se alterna con la marca, o se muestra en la pantalla del teléfono y en la vista general. Confirmar con https://developers.google.com/maps/documentation/tile/policies antes de publicar.

Renders: `out/navf-esquinas2-crucero.png`, `navf-esquinas2-giro.png`, `navf-esquinas2-giro-pocas-calles.png`, `navf-esquinas2-giro-mas-calles.png`, `navf-esquinas2-rotonda.png`, `navf-esquinas2-recalculando.png`, `navf-esquinas2-llegada.png`.

## Mapa de A: esquema propio desde la polilínea, no Static Maps

- **Sin borde.** Se dibuja solo la ruta y se desvanece con la distancia a la posición, así no hay recorte visible. Un tile de Static Maps es un rectángulo con rellenos grises que obliga a ponerle marco.
- **Heading-up gratis.** Girar la polilínea cada segundo es local. Static Maps no tiene rumbo: habría que rotar el bitmap y recortarlo en círculo, otra vez un borde.
- **Sin logo ni red.** Static Maps exige el logo de Google en el lente y un tile por segundo revienta la cuota gratuita; el esquema no cuesta nada ni tiene latencia.
- **Honesto con los datos.** La ruta brillante por delante, lo recorrido tenue por detrás, la calle a la que se gira cruzando el punto del giro (la maniobra garantiza que existe) y el destino como anillo con punto. No se inventan calles laterales; la cuadrícula sin nombres de Even es justo lo que Wareable criticó.
- Pendiente si se quiere un «mapa completo» con un toque: ahí sí vale un tile oscuro de Static Maps de toda la ruta, una sola vez por viaje.

## Render

Script `tools/headless-render/nav-fable-mock.cjs` (`cd tools/headless-render && EVEN_FONT=1 node nav-fable-mock.cjs`). PNG de 640×480 con la banda 576×288 en (32,96), 16 niveles. La fuente del firmware no tiene «ª», por eso «Tercera salida».

- `out/navf-esquinas-crucero.png`, `navf-esquinas-giro.png`, `navf-esquinas-rotonda.png`, `navf-esquinas-recalculando.png`, `navf-esquinas-llegada.png`
- `out/navf-linea-crucero.png`, `navf-linea-giro.png`, `navf-linea-rotonda.png`, `navf-linea-recalculando.png`, `navf-linea-llegada.png`
- `out/navf-ruta-crucero.png`, `navf-ruta-giro.png`, `navf-ruta-rotonda.png`, `navf-ruta-recalculando.png`, `navf-ruta-llegada.png`
