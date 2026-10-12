# Baraja de cards (referencia rabbitOS 2), 10 oct 2026

Dirección pedida por Alexander después de descartar las seis alternativas de [alternativas-diseno.md](alternativas-diseno.md): conservar el home con la fecha y el reloj como está, y al hacer scroll hacia abajo entrar «donde no hay nada» con cards apiladas como en el Rabbit R1. **El R1 es solo referencia**, no un estilo a copiar.

## Referencia: rabbitOS 2 / 2.1 (Rabbit R1, Teenage Engineering)

Fuentes: guía oficial [how to interact with your rabbit r1](https://www.rabbit.tech/support/article/use-rabbit-r1), [changelog](https://www.rabbit.tech/updates), anuncio de [rabbitOS 2](https://www.businesswire.com/news/home/20250904568217/en/) y las capturas de [Yanko Design](https://www.yankodesign.com/2025/09/09/rabbit-r1s-os-update-features-a-new-interface-and-speech-to-vibe-coding-abilities/) y del foro de Rabbit (rabbitOS 2.1). No existe un «Rabbit R2»: en septiembre de 2026 Rabbit dijo que no habrá R2 y su siguiente hardware es «Project Cyberdeck».

- Home = reloj y batería; nada más. Un giro de la rueda (o swipe) levanta la baraja.
- La card bajo el foco se expande en su sitio; el resto son tiras con ícono a la izquierda y nombre a la derecha, solapadas unos píxeles. Marcador de posición a la derecha.
- Tap abre la card a pantalla completa (cabecera «back · hora · batería», título con ícono, filas «etiqueta / valor ›»). Back conserva la posición en la pila. Las cards activas suben al tope; swipe a la izquierda las cierra.
- Íconos de píxel, nombres en minúscula, el color identifica cada card.

## Adaptación a la banda (render)

`node tools/headless-render/rabbit-stack.cjs` deja `out/rs-*.png` y `out/rs-*-lens.png`:

| Escena | Qué muestra |
|---|---|
| `rs-home` | Columna de producción sola; mitad derecha vacía |
| `rs-rise-1/2` | La baraja sube desde abajo al primer scroll |
| `rs-stack-paseo/calendar/translate/more` | Baraja en reposo con una card abierta en su sitio; tiras de 32 px, solape 7, radio 6, 318 de ancho en (230,14) |
| `rs-stack-calendar-filled` | Relleno tenue (51) bajo la card abierta |
| `rs-open-calendar`, `rs-open-translate` | Card a pantalla completa: cabecera hora · día, título con ícono, filas con «>» |

Anillo: en el home, scroll levanta la baraja (Paseo abierta) y doble tap apaga; en la baraja, scroll abre la anterior/siguiente en su sitio, tap abre a pantalla completa, doble tap baja la baraja; en la card abierta, scroll mueve el «>», tap entra, doble tap vuelve a la baraja en la misma card.

Se toma del R1: home vacío, baraja al girar, expansión en el sitio, tiras solapadas, ícono izquierda / nombre derecha, back que conserva posición. No se toma: color por card (se usa brillo), minúsculas, cabecera «back» (doble tap; sin instrucciones de gestos en pantalla).

## Abierto

- Baraja a la derecha (conserva la columna) o a ancho completo (dos líneas más por card, el reloj desaparece al girar).
- Si la baraja baja sola tras ~8 s sin girar.
- Contorno vs relleno tenue para la card abierta: confirmar en el lente.
- Con Text size Large (26/28 px) las tiras pasan a 38 px y la card abierta pierde una línea.
