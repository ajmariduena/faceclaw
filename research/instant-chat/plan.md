# Instant: propuesta de latencia y diseño (11 oct 2026)

Pedido: un asistente en las gafas lo más instantáneo posible (milisegundos), aunque el modelo sea simple, con búsqueda web, chat con historial que se compacta solo y algunas acciones. Grok Bot se queda para lo pesado.

Decidido el 11 oct: «Hey Even» abre Instant, tiene tarjeta propia junto a Grok Bot y se llama «Instant». Queda abierto si el reloj y los diálogos ofrecen «Send to Instant», «Send to Grok Bot» o los dos.

## Resultado: ~0,4 s de punta a punta sin búsqueda, ~0,7 s con búsqueda
De que terminas de hablar a ver la respuesta en las gafas (medido desde la Mac por wifi; el envío a las gafas es del Nubia en uso real):

| Tramo | Hoy (Live facts) | Instant | Cómo |
|---|---:|---:|---|
| Fin de frase (Soniox) | 361 ms | **15 ms** | `endpoint_latency_adjustment_level: 3`, sensibilidad 0,5, tope 600 ms |
| Primer token | 218 ms (p90 498) | **~180 ms (p90 ~190)** | Cerebras directo, conexión precalentada, dos pedidos en paralelo y gana el primero |
| Búsqueda (si hace falta) | — | **+~300 ms** | Perplexity Fast arranca a la vez que el modelo |
| Envío a las gafas | ~200 ms | ~200 ms | ya medido; es el piso actual |
| **Total** | ~1,1 s | **~0,4 s / ~0,7 s** | |

Grok Bot, para comparar: 3,6 s una pregunta simple en caliente y 14,3 s con web.

## Hallazgo principal
Por debajo de ~150 ms ya no manda el modelo sino la red: la Mac tarda ~170–250 ms solo en recibir el primer byte de `GET /v1/models` de Cerebras o Groq (sin modelo de por medio). Un modelo «tonto» no compra velocidad: Llama 3.1 8B en Groq (236 ms) no fue más rápido que gpt-oss-120b en Cerebras (194 ms), y Qwen 27B fue apenas más rápido pero se equivocó («una libra métrica tiene 1000 gramos», «Canbera»). Lo que sí se gana está en el fin de frase, en la cola de latencia y en no esperar la búsqueda.

## Benchmarks (11 oct, `tools/instant-chat-probe/`)

### Modelos: primer token en streaming (`llm-bench.mjs`, 10 preguntas, conexión caliente)
| Modelo y proveedor | p50 | p90 | En frío | Calidad |
|---|---:|---:|---:|---|
| Cerebras directo `qwen-3.8-27b` (sin razonamiento) | 195 ms | 634 ms | 180 ms | se equivocó 2 veces |
| Cerebras directo `gpt-oss-120b` (effort low) | 218 ms | 498 ms | 1013 ms | bien |
| OpenRouter → Llama 3.1 8B en Groq | 236 ms | 256 ms | 246 ms | bien en preguntas simples |
| OpenRouter → `gpt-oss-120b` en Cerebras | 245 ms | 368 ms | 659 ms | bien |
| OpenRouter → Nemotron 3.5 Lightning (CoreWeave) | 269 ms | 272 ms | 628 ms | bien |
| OpenRouter → `gpt-oss-120b` en Groq | 308 ms | 507 ms | 278 ms | bien |
| OpenRouter → Mercury 2.5 (Inception, difusión) | 332 ms | 381 ms | 547 ms | bien |
| OpenRouter → gpt-oss-safeguard-20b en Groq | 352 ms | 705 ms | 279 ms | bien |
| OpenRouter → Ministral 3B | 553 ms | 836 ms | 577 ms | bien |

OpenRouter suma ~30–50 ms frente a ir directo. La tabla de latencia en vivo de OpenRouter (últimos 30 min, sus servidores) da el mismo orden: Groq Llama 8B 136 ms, Groq gpt-oss-120b 178 ms, Cerebras gpt-oss-120b 206 ms.

### Cola de latencia: un pedido contra dos en paralelo (`hedge-bench.mjs`, 25 rondas)
| Estrategia | p50 | p90 | Peor |
|---|---:|---:|---:|
| Cerebras `gpt-oss-120b` solo | 194 | 330 | 421 |
| Cerebras `qwen-3.8-27b` solo | 158 | 259 | 535 |
| `gpt-oss-120b` ×2 en Cerebras | 175 | 184 | 279 |
| Cerebras `gpt-oss` + `qwen` | 165 | 195 | 357 |
| **Cerebras + Groq `gpt-oss-120b`** | 180 | 207 | **227** |

Con dos pedidos, el que llega segundo se cancela. El costo es el doble de tokens de entrada, centavos al mes. Cerebras + Groq además cubre la caída de un proveedor.

### Fin de frase con Soniox (`stt-bench.mjs`, 8 preguntas ES/EN con voces de macOS)
| Configuración | Texto completo (parcial) | Frase final | Peor |
|---|---:|---:|---:|
| Live facts (sensibilidad −0,5, tope 3000 ms) | 331 ms | 361 ms | 485 ms |
| **Agresiva (nivel 3, sensibilidad 0,5, tope 600 ms)** | 9 ms | **15 ms** | 126 ms |
| Manual (`finalize` 200 ms después de la voz) | 287 ms | 290 ms | 336 ms |

Transcribió bien las 8 en todos los modos. Ojo: audio sintético y limpio; con voz real, pausas y ruido, el modo agresivo cortará frases antes de tiempo (ver «Si sigues hablando»). La investigación de proveedores (`vendors.md`) dice que el fin de frase automático de Soniox no baja de 500 ms; esta medición lo contradice con voces sintéticas, que terminan con una entonación muy marcada. Hay que repetirla con voz real. Si no se sostiene, el plan B es mandar `finalize` al soltar el clic (~90 ms después del `finalize`). Deepgram Flux Multilingual (cierre en ~110 ms según Cekura, con aviso temprano de fin de turno) es la alternativa a probar; no hay clave.

### Conexión fría contra precalentada (`/tmp`, Cerebras)
Primer pedido de un proceso nuevo: 220–240 ms. Con una conexión abierta antes (`GET /v1/models` al abrir el micrófono): 155–180 ms. Se ahorran ~60 ms.

### Búsqueda (`search-bench.mjs`, 6 preguntas que necesitan la web, respuesta completa)
| Modo | Mediana |
|---|---:|
| En orden: el modelo pide buscar → Perplexity Fast → responde | 739 ms |
| **Especulativa: Perplexity Fast arranca junto con el modelo** | **518 ms** |

Perplexity Fast tardó 200–430 ms con resultados de hoy (F1, dólar en Colombia, Barcelona). Parallel `turbo` tardó ~700 ms y devolvió una carrera de 2020.

## Arquitectura de latencia
1. **Al abrir el micrófono** («Hey Even» o clic): abrir el WebSocket de Soniox y precalentar HTTPS a Cerebras, Groq y Perplexity en paralelo. Mientras hablas, eso ya está listo.
2. **Fin de frase agresivo** en Soniox. El texto parcial se pinta en blanco mientras hablas, sin borrador ni botón de enviar.
3. **Al cerrar la frase**, a la vez:
   - Cerebras `gpt-oss-120b` y Groq `gpt-oss-120b` en streaming; el primer token gana y el otro se cancela.
   - Perplexity Fast con la pregunta tal cual (país = región del teléfono). Si el modelo pide `web_search`, usa esos resultados; si pide otra consulta, busca esa.
4. **Si sigues hablando** después del cierre (pausa larga a mitad de frase): se cancela lo que va en camino y se vuelve a mandar la frase completa. Cuesta ~200 ms, no un error.
5. **Atajos sin modelo** para órdenes exactas («pon un timer de N minutos», «qué hora es», «para la música»): se reconocen en el teléfono y responden en ~0 ms de red. El modelo solo entra si no hay coincidencia.
6. **Al pintar**: la primera frase sale en cuanto llega su punto; los frames se combinan (el último gana) para no encolar envíos de ~200 ms.
7. **Prompt corto y en orden fijo** (sistema + herramientas → resumen → últimos turnos → pregunta) para la caché automática de Cerebras por prefijo; `max_tokens` 200.
8. **Compactación fuera del camino crítico**: después de responder, si el historial pasa de ~4.000 tokens, una llamada aparte resume lo viejo en ≤ 300 tokens y quedan los últimos 6 turnos. Tras 30 min sin uso, tema nuevo con el resumen.
9. **Medición siempre encendida**: cada pregunta escribe en JSONL fin de frase, primer token, búsqueda, primera línea en gafas.

## Herramientas
**Rol (decidido el 11 oct):** Instant responde rápido, recuerda cosas (`memory.save`) y hace acciones pequeñas. Todo lo complejo lo delega a Grok Bot. Lo único que Instant sabe de Grok Bot es qué tipo de cosas le tiene que pasar; el resto lo responde él.

Regla de velocidad: **lo que se puede saber antes, va en el prompt; lo que hace algo, es herramienta; lo pesado, a Grok Bot.** Cada llamada a herramienta suma una vuelta (~200 ms), así que se evitan para preguntas.

### Contexto que va en el prompt, sin herramienta (respuesta en una sola vuelta)
Se arma al abrir el micrófono y va después del historial, para no romper la caché del prefijo:
- Fecha, hora, zona y ciudad.
- Clima actual y lluvia próxima (lo que ya muestra el inicio).
- Próximas 3 reuniones de hoy y la primera de mañana (solo lectura).
- Timers y alarmas activos.
- Lo que suena en la música.
- Últimas 5 notificaciones (app y título).
- Estado de las gafas (batería) y de Paseo (agentes trabajando o esperando).
- Ruta de Navigate si hay una activa.

Así «¿qué hora es?», «¿va a llover?», «¿qué tengo después?», «¿cuánto le queda al timer?» o «¿cómo van mis agentes?» responden sin herramienta.

### Herramientas (~12, las del registro que ya existen)
| Herramienta | Ejemplo | Respuesta |
|---|---|---|
| `web_search` | «¿quién ganó el partido?» | el modelo resume (búsqueda especulativa) |
| `timer.set` / `timer.cancel` | «pon un timer de 5 minutos» | **plantilla**, sin segunda vuelta: «Listo, timer de 5 minutos.» |
| `alarm.set` / `alarm.delete` | «despiértame a las 6» | plantilla |
| `media.play_pause` / `media.next` | «pausa la música» | plantilla |
| `notifications.dismiss` | «borra las notificaciones» | plantilla |
| `nav.start_navigation` / `nav.stop_navigation` | «llévame a Riocentro Ceibos» | abre Navigate |
| `roam.add_todo` / `roam.read_todos` | «anota comprar canela» | plantilla |
| `apps.launch` | «abre Translate» | abre la app |
| `memory.save` (nueva) | «recuerda que vivo en Los Ceibos» | plantilla; las notas van fijas en el prefijo del prompt |
| `ask_grok_bot` | «resérvame el vuelo más barato» | «Se lo pasé a Grok Bot.» |

- **Plantilla** = el teléfono confirma con una frase fija apenas la herramienta responde. No hay segunda llamada al modelo y se ahorran ~200 ms.
- **Atajos sin modelo** (regex en el teléfono, ~0 ms de red): timer de N minutos, pausa/siguiente canción, qué hora es.
- **Se dejan fuera**: las de carpetas y ventanas (`apps.move_to_folder` y similares), `glasses.show_alert` y crear o editar eventos (el calendario es solo lectura).
- **A Grok Bot va**: correo, reservas, compras, código, finanzas, todo lo que use su memoria o sus cuentas, y lo que pida «investiga a fondo». Grok Bot sigue con su chat y su tarjeta, e Instant solo avisa.
- Tope: 3 vueltas de herramientas y 6 s.

### Prompt
- Responde en el idioma de la pregunta, en texto plano y sin markdown.
- Primero la respuesta, en una o dos frases de ≤ 100 caracteres, cada una en su línea.
- Si no lo sabe y no hay búsqueda, lo dice en una frase. No inventa cifras.
- Fechas relativas («mañana», «el jueves») resueltas con la fecha del contexto.

### Memoria e historial
- Un solo chat. Últimos 6 turnos tal cual, más un resumen de ≤ 300 tokens que se compacta después de responder.
- Tras 30 min sin uso, tema nuevo: el historial se archiva y quedan el resumen y las notas de `memory.save`.
- En el teléfono, «Nuevo chat» y la lista de notas guardadas (borrar una); sin más ajustes.

### Errores
- Sin clave de Cerebras: «Add a Cerebras key on the phone» (igual que Grok Bot con Cursor).
- Sin red: «Sin conexión»; los atajos sin modelo siguen funcionando.
- Si Cerebras y Groq fallan, OpenRouter como tercer intento.

### Costo estimado
~1.500 tokens de entrada por pregunta, por dos (pedidos en paralelo), más la búsqueda: menos de $0,003 por pregunta. Con 50 preguntas al día son unos $3–4 al mes.

## Diseño en las gafas
Renders con el motor real del repo: `tools/headless-render/instant.cjs` → `out/instant-*-lens.png`. Estilo Live facts: sin marco ni pie, una frase por línea, profundidad 0.
- **Escuchando:** tus palabras en blanco mientras hablas y una marca tenue «● Instant» abajo.
- **Respuesta:** tu pregunta en tenue arriba, la respuesta en blanco debajo, completa (sin «más»).
- **Seguimiento:** el turno anterior sube y se atenúa; lo nuevo queda abajo.
- **Acción:** responde con lo que hizo («Listo, timer de 5 minutos»).
- **A Grok Bot:** «Se lo pasé a Grok Bot; te aviso cuando responda.»
- **Tarjeta del inicio:** un rayo, la última respuesta centrada y su edad, como la de Grok Bot.
- Gestos: clic habla de nuevo; doble toque cierra; desplazar recorre el historial; pulsación larga abre el menú con «Nuevo chat».
- Sin estado «pensando»: a ~0,4 s no le da tiempo a verse. Si pasa 1 s sin respuesta, aparece una línea tenue «buscando…».

Investigación de proveedores con fuentes: `research/instant-chat/vendors.md`.

## Lo que falta medir
- Desde el teléfono con datos móviles (suma RTT; no medido).
- Voz real con ruido y pausas: cuántas veces corta antes de tiempo el fin de frase agresivo.
- El tramo de envío a las gafas con frames pequeños (solo la línea nueva).

## Claves
Cerebras, Perplexity, Brave, Soniox y OpenRouter ya están en el teléfono. Groq directo ahorraría ~40 ms frente a OpenRouter, pero necesita una clave nueva de Groq.

## Pasos
1. Cliente de streaming con pedidos en paralelo, precalentado, búsqueda especulativa y herramientas (`app/assistant/instant/`), con pruebas.
2. Soniox agresivo con reenvío si sigues hablando, y atajos sin modelo.
3. App y tarjeta (`app/apps/instant/`), «Hey Even» a Instant.
4. APK en el Nubia con `origin/main` al día; medir en la calle con datos móviles.

## Trucos para adelantarse (ideas, sin medir)
En orden de lo que creo que más rinde:
1. **Pre-responder las preguntas de seguimiento.** Después de cada respuesta, Cerebras genera en segundo plano las 3 preguntas siguientes más probables y sus respuestas. Si la siguiente pregunta coincide con una, la respuesta sale de inmediato y solo queda el envío a las gafas. Hay que medir cuántas veces acierta; si no coincide con claridad, no se muestra.
2. **Pre-responder según el contexto.** Al abrir Instant ya se calcula lo probable: la próxima reunión si falta poco, el clima por la mañana, la última notificación o el tema de Live facts.
3. **Arrancar con el texto parcial.** El modelo y la búsqueda arrancan con lo que Soniox ya entendió mientras sigues hablando; si el texto cambia, se cancela y se vuelve a pedir. Rinde mucho si con voz real el cierre de frase tarda más que en la prueba.
4. **Precalentar con «Hey Even».** Las conexiones se abren en cuanto se detecta la palabra, antes de que hagas la pregunta.
5. **Caché de respuestas.** Si repites una pregunta del día y la respuesta no depende de la hora, se muestra la guardada.
6. **Atacar el envío a las gafas.** Ya es el tramo más largo (~200 ms): mandar solo la línea nueva en vez del frame entero y no encolar frames viejos.

## ¿Se puede adivinar la siguiente pregunta? (medido el 11 oct, `predict-bench.mjs`)
Con tus 39 preguntas reales a Grok Bot (sesión «Glasses», solo lectura, sin las pruebas de formato), después de cada respuesta Cerebras propuso las 5 o 10 preguntas siguientes más probables. Un juez estricto (`gpt-oss-120b`, effort medium) contó un acierto solo si la respuesta preparada contestaba por completo la pregunta real.
- Con 5 predicciones: 6 de 39 (15 %), todas preguntas de seguimiento. 1 de 39 acertó en la primera.
- Con 10 predicciones: 2 de 39. Más predicciones no ayudan; el juez varía bastante entre corridas.
- Predecir tarda ~300 ms, pero es en segundo plano.
- Las preguntas nuevas (13 de 39) nunca se adivinaron. En las de seguimiento casi siempre preguntas un detalle concreto («¿por persona o por los dos?», «¿qué tipo de Airbnb?») que no se puede anticipar.

Conclusión: no vale la pena como truco principal. Ahorraría ~200 ms en 1 de cada 7 preguntas a cambio de 5 llamadas más por turno y del riesgo de mostrar una respuesta a otra pregunta. Es mejor arrancar con el texto parcial mientras hablas (punto 3) y achicar el envío a las gafas (punto 6).

## Modelos «realtime» de voz (investigado el 11 oct, sin medir: no hay claves)
OpenAI gpt-realtime y realtime-mini, Gemini Live, xAI Grok Voice, Ultravox, Nova Sonic y Deepgram Voice Agent tardan unos 630–1.140 ms desde el fin de la voz hasta la primera respuesta. Las cifras vienen de Artificial Analysis y de una prueba independiente, y cuentan desde que ya se sabe que terminaste de hablar. Instant mide ~200 ms en ese mismo tramo (fin de frase de Soniox + primer token de Cerebras). Además, estos modelos están hechos para responder con voz, y en las gafas se muestra texto. No convienen para Instant. Kyutai Moshi (~200 ms) no tiene API hospedada ni español.
