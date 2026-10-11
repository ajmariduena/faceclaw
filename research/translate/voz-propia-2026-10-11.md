# Traducir: pantalla tipo Live facts y sin la voz propia (11 oct 2026)

Pedido: que Traducir se vea como Live facts (original más traducción) y que no muestre lo que dice Alexander, solo a los demás. El 10 oct se había descartado el filtro de voz propia por complejo; ahora lo pidió.

## Pantalla
- Arriba, en tenue (153), lo que dijo el otro: sus dos últimas líneas mientras habla.
- Debajo, en blanco, la traducción: sus tres últimas líneas, con la cola no final en gris (187).
- Más abajo, más tenue (70 el original y 120 la traducción), el intercambio anterior si cabe antes del pie.
- El habla fuera del par ES/EN se muestra tal cual, en blanco.

## Filtro de voz propia por volumen (`app/apps/translate/wearer-voice.ts`)
- Los micrófonos del G2 están a pocos centímetros de la boca de quien los lleva y a un metro o más del otro, así que su voz llega mucho más fuerte (unos 20 dB por la ley del cuadrado inverso, sin medir aún).
- `SonioxSttClient` con `measureLoudness` guarda la potencia del audio enviado en tramos de 10 ms, con el reloj de cada sesión de Soniox, y anota cada token con su `loudness` (dBFS) según `start_ms`/`end_ms`.
- Soniox ya trae la diarización (`speaker`). Por sesión y hablante se guarda la mediana de los últimos 40 tokens. Un hablante es quien lleva los lentes si su mediana supera en 10 dB o más a la del otro hablante más bajo.
- Cuando una sesión logra separar a los dos, se guardan los dos niveles. En sesiones nuevas (pausa, reconexión), si solo se ha oído una voz, se la compara con el punto medio. Esto vive en memoria mientras corre Faceclaw.
- Un segmento también se cierra cuando cambia el hablante, y los segmentos de quien lleva los lentes se ocultan, incluso de forma retroactiva.
- No hace falta enrolar la voz: la tabla `speakers` del teléfono está vacía, así que la huella de voz de Microphones no estaba disponible.

## Límites conocidos
- La primera frase de quien lleva los lentes, si habla antes que nadie y Faceclaw no se ha calibrado desde que arrancó, se ve hasta que habla el otro.
- Si los dos hablan el mismo idioma, una traducción que llega tarde para la frase de quien lleva los lentes puede pegarse al segmento abierto del otro: `translationTarget` solo distingue por idioma.
- Si Soniox junta a los dos en una sola etiqueta, no hay nada que comparar y se muestra todo.
- El margen de 10 dB es una estimación. Falta medirlo con los lentes puestos.

## Calibrar
Cada segmento cerrado deja en logcat (etiqueta JS) una línea `Translate: speaker N said W words at X dBFS (speaker Y dBFS, wearer true|false)`. Tras una conversación real, `adb logcat -d | grep "Translate: speaker"` muestra los niveles de cada voz, y con eso se ajustan `WEARER_MARGIN_DB` y, si conviene, un umbral absoluto que se guarde entre arranques.
