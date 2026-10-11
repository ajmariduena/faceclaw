# Reloj del home en reposo: ocho variantes dentro del layout actual

Solo cambia el bloque del reloj (x 0–212, y 44–240 de la banda 576×288). La fila de fecha y baterías
(y 12–39), la fila de clima y agentes (y 248–275), los puntos de posición (x 218) y la tarjeta (x 230)
los pinta `paintHome` de producción y quedan tal cual. Script: `tools/headless-render/reloj-fable.cjs`.

```
cd tools/headless-render && node reloj-fable.cjs
```

Salida: `out/reloj-<n>-<nombre>-<hhmm>.png` (640×480 gris, banda en 32,96),
`out/reloj-<n>-<nombre>-<hhmm>-lens.png` (576×288 teñido de verde), `out/reloj-sheet-lens.png`
(hoja de contacto a 09:41, numerada) y `out/reloj-report.json` (medidas y cajas de tinta).
El script comprueba por aserción que ninguna variante pisa las filas de arriba y abajo, los puntos ni la
tarjeta; se ejecuta a 09:41 y 22:07 (el 1 y el 7, que son los dígitos que más cambian entre estilos).

## Referencias miradas

Todas guardadas como `tools/headless-render/out/ref-reloj-*`.

| Archivo | Qué es | URL |
|---|---|---|
| `ref-reloj-casio-f91w.jpg` | Casio F-91W, foto del LCD: horas y minutos grandes, segundos pequeños a la derecha, siete segmentos con extremos biselados | https://commons.wikimedia.org/wiki/File:Casio_F-91W.jpg |
| `ref-reloj-casio-svg.png` | Recreación vectorial del mismo LCD (todos los segmentos encendidos, útil para la geometría) | https://github.com/alexisphilip/Casio-F-91W |
| `ref-reloj-vfd-iv11.jpg` | Tubos VFD IV-11: siete segmentos gruesos con bisel a 45° y huecos de 1 unidad entre segmentos | https://commons.wikimedia.org/wiki/File:IV-11_VFD.jpg |
| `ref-reloj-nixie.gif` | Nixie: dígito como trazo continuo; no se adoptó (es un contorno curvo, muy fino para la banda) | https://commons.wikimedia.org/wiki/File:Nixie2.gif |
| `ref-reloj-splitflap-garedunord.jpg` | Tablero split-flap Solari de Gare du Nord: cada carácter en su ficha, corte horizontal por la mitad | https://commons.wikimedia.org/wiki/File:Gare_du_Nord_Fallblattanzeiger_Departure-board.JPG |
| `ref-reloj-led-station.jpg` | Tablero LED de andén (Bristol Temple Meads): «09:30:31» en matriz de puntos horizontal, segundos pequeños | https://commons.wikimedia.org/wiki/File:Bristol_Temple_Meads_-_GWR_800011_leaving_for_London.JPG |
| `ref-reloj-apple-numerals-duo.jpg` | Apple Watch Numerals Duo: HH arriba, MM abajo, relleno a la izquierda y solo contorno a la derecha | https://www.cultofmac.com/how-to/coolest-apple-watch-faces |
| `ref-reloj-apple-modular-duo.jpg` | Apple Watch Modular Duo: hora digital compacta arriba a la derecha, complicaciones debajo | misma página |
| `ref-reloj-apple-xlarge.jpg` | Apple Watch X-Large: una sola fila HH:MM muy grande | misma página; catálogo oficial en https://support.apple.com/guide/watch/faces-and-features-apde9218b440/watchos |
| `ref-reloj-nothing-ndot.jpg` | Nothing OS, pantalla de bloqueo con el reloj NDot 57: matriz 5×7 de puntos casi pegados | captura de Android Authority ya guardada en `out/` en una ronda anterior (`ref-nothing-lock.jpg`) |
| `ref-reloj-pebble-lcd.png` | Pebble (Rebble store): cara con dígitos tipo LCD de siete segmentos sobre 144×168 | https://apps.repebble.com/en_US/watchfaces (captura `screenshots/1916ad5de3554b499cc4360e`) |
| `ref-reloj-pebble-chunky.png` | Pebble: «15:03» con fuente de bloques gruesos, una fila | misma tienda (captura `screenshots/53381b17d1719b42b800028b`) |
| `ref-reloj-te-tx6.jpg` | Teenage Engineering TX-6: pantalla 1-bit diminuta con cifras de bloque | https://teenage.engineering/products/tx-6 |
| `ref-astra-op1-tape.png`, `ref-astra-playdate-launcher.png` | OP-1 y Playdate, ya guardadas: tipografía de bloques y texto 1-bit | rondas anteriores |

No se bajó captura de Game Boy ni de Braun: la fuente 3×5 de «bloques» es la de Tetris/Game Boy de
memoria, y «fino» toma de Braun/Rams solo la idea (misma retícula, menos tinta), no una imagen.

Lo que ya se había visto en rondas anteriores y no se repite: Roboto Light horizontal 80 px, los puntos
cuadrados del dashboard stock (`clock-fable-sheet.png`), y el siete segmentos hueco de `clock-astra-senal`.

## Variantes

Todas centradas en x=106 (centro de la columna) y en y=142 (centro del hueco entre las dos filas).
«Luz» es la suma de niveles de gris dentro del bloque del reloj, en equivalentes de píxel a blanco
pleno, medida a 09:41; «píxeles» es cuántos están encendidos a cualquier nivel.

| n | Nombre | Píxeles | Luz | vs. actual |
|---|---|---|---|---|
| 0 | actual | 2520 | 2520 | 1.00× |
| 1 | tupido | 3864 | 3312 | 1.31× |
| 2 | fino | 1176 | 1176 | 0.47× |
| 3 | segmentos | 3555 | 3555 | 1.41× |
| 4 | hueco | 3398 | 3398 | 1.35× |
| 5 | bloques | 4961 | 4961 | 1.97× |
| 6 | fichas | 3969 | 3180 | 1.26× |
| 7 | tablero | 2056 | 1901 | 0.75× |
| 8 | horas-grandes | 2424 | 2424 | 0.96× |

A 22:07 los números cambian poco (segmentos sube a 4019 porque el 2 y el 0 encienden cinco y seis barras).

### 0 · actual
El reloj de producción sin tocar, como comparación. Dígitos 5×7 propios, punto 7 px, paso 10, dígito 47×67,
HH en y 70 y MM en y 150, bloque en x 50–161.

### 1 · tupido (Nothing NDot)
La misma retícula 5×7 con los puntos casi pegados, como el reloj NDot de la pantalla de bloqueo de Nothing:
los dígitos se leen como formas sólidas y no como constelaciones. Minutos a 153 para que las horas manden.
Punto 9 px, paso 11, dígito 53×73, paso entre dígitos 66, hueco entre filas 12; bloque x 46–164, y 61–222.

### 2 · fino (Braun / Rams)
Misma retícula, mitad de tinta: puntos de 5 px a paso 9, bloque más pequeño y aire alrededor. Es la opción
de menos luz de todas y la que más depende de que la óptica no se coma los puntos.
Dígito 37×59, paso 56, hueco 14; bloque x 58–153, y 77–206.

### 3 · segmentos (Casio F-91W, VFD IV-11)
Siete segmentos rellenos de 8 px con extremos biselados a 45° y 1 px de separación entre segmentos, como
el LCD del F-91W y los tubos IV-11; el 1 queda a la derecha de su caja como en Casio. HH y MM apilados sin
dos puntos. Dígito 44×72, paso 60, hueco 14; bloque x 54–157, y 63–220.

### 4 · hueco (Apple Watch Numerals Duo, versión de contorno)
Montserrat Bold a 100 px rasterizada y luego vaciada hasta un contorno de 3 px, igual que la variante de
contorno de Numerals Duo. Es el dígito más grande de la serie (cuerpo de 70 px) con luz parecida a
«tupido». Bloque x 44–167, y 62–221.

### 5 · bloques (Game Boy, OP-1, Playdate)
Fuente 3×5 de celdas macizas de 11 px, sin huecos entre celdas, como las cifras de Tetris y de la pantalla
del OP-1. Es la más contundente y la que más luz pone: casi el doble que la actual.
Dígito 33×55, paso 45, hueco 14; bloque x 67–144, y 80–203.

### 6 · fichas (split-flap Solari)
Cuatro fichas en 2×2 con borde redondeado a 85, cada una con su dígito en Roboto Bold 62 px y el corte
horizontal de 2 px negro que parte el dígito por la mitad, como el tablero de Gare du Nord. Ficha 74×84,
separación 8; bloque x 28–183, y 54–229. Es la que más se acerca a los bordes del hueco.

### 7 · tablero (tablero LED de andén, Apple Modular)
Una sola fila HH:MM en puntos de 6 px a paso 8 (dígito 38×55), dos puntos a 153, y debajo una barra de
2 px a 85 que avanza con los segundos del minuto, como el «09:30:31» del tablero de andén pero sin cifras
de segundos. Menos luz que la actual. Bloque x 9–202, y 107–176.

### 8 · horas-grandes (Casio F-91W, Apple X-Large)
Horas grandes (punto 8, paso 11, 52×73) y minutos a la mitad (punto 5, paso 7, 33×47) alineados por la
base a su derecha, con la jerarquía del F-91W, donde los segundos van pequeños al lado. Misma luz que la
actual. Bloque x 6–204, y 105–178: toca casi ambos bordes de la columna.

## Qué conviene comprobar en el lente

- **Niveles a 153 y 85** (tupido, fichas, tablero): si los minutos a 153 siguen leyéndose de reojo con luz de
  día, y si los bordes de ficha y la barra a 85 se ven o son ruido. Si 85 no se ve, fichas pierde el marco.
- **Puntos de 5 px** (fino) y **contorno de 3 px** (hueco): la óptica difumina; hay que ver si los puntos
  chicos se apagan y si el contorno se lee como forma o como alambre.
- **Separación de 1 px entre segmentos** (segmentos): puede cerrarse en el lente y entonces el 0 y el 8 se
  parecen; si pasa, subir el hueco a 2 px.
- **Bloques**: casi el doble de luz; mirar si deslumbra o deja halo sobre la tarjeta.
- **Tablero**: la barra cambia cada segundo, o sea un frame BLE por segundo en reposo. Si eso cuesta
  batería, pasos de 10 s o quitar la barra (queda a 0.6× de luz).
- **Horas-grandes y tablero** llegan a 14–16 px de los puntos de posición (x 218); comprobar que el ojo no
  los junte con la tarjeta.
- Las cinco variantes de puntos (0, 1, 2, 7, 8) usan los dígitos 5×7 de producción, así que el 1 y el 7 se
  ven igual que hoy; en segmentos, hueco, bloques y fichas el 1 y el 7 cambian de forma y conviene mirar
  22:07 y 09:41 en el lente antes de decidir.
