# Conversar: plan (9 oct 2026, borrador)

Objetivo: mientras hablas con alguien, las gafas muestran casi en tiempo real datos útiles sobre lo que se está diciendo (quién es alguien, qué es algo, una cifra comprobada, la respuesta a una pregunta que surgió), con búsqueda en la web. Al final quedan un resumen y las tareas.

## Qué hay hoy en Faceclaw
- Microphones guarda las conversaciones (`FaceclawConversationStore`) y permite preguntar sobre conversaciones pasadas con el Qwen local (`apps/microphones/conversation-qa.ts`). No hay nada en tiempo real ni búsqueda en la web.
- El reconocimiento local (Moonshine) solo entiende inglés.

## Arquitectura propuesta
1. **Escuchar:** Soniox en streaming (ES/EN mezclados, separando quién habla). Es el mismo cliente que Traducir; si se combinan, la conversación puede ir traducida.
2. **Detectar:** por cada frase final, un modelo rápido en Cerebras (p. ej. `gpt-oss-120b` a ~3.000 tokens/s, o `qwen-3.8-27b` con tool calling) decide si hay algo que valga la pena: nombre, empresa, lugar, cifra, afirmación dudosa o pregunta abierta. La mayoría de las frases no generan nada.
3. **Buscar:** si hace falta, una búsqueda rápida en la web: Parallel «turbo» (~350 ms de media en openbenchmarks.com), Brave (~670 ms) o Perplexity Search. Cerebras documenta la integración con Exa, que ahora está sin créditos.
4. **Redactar:** el mismo modelo devuelve una tarjeta de una línea (≤ 90 caracteres) con la fuente abreviada, en el idioma de la conversación.
5. **Mostrar:** marco terminal; la tarjeta nueva en blanco y las anteriores tenues; como mucho 2–3 a la vez; sin instrucciones. Pie «· Conversar  ES/EN  12:04».
6. **Después:** resumen y tareas guardados en el teléfono, con la búsqueda que ya existe sobre conversaciones.

Latencia objetivo: unos 1,5–2,5 s desde que termina la frase hasta que aparece el dato (estimación; no medida).

## Prototipo de latencia (9 oct, `tools/conversar-probe/latency.mjs`)
- **Decidir:** Jev de TypeSafe, un modelo de decisión que no genera texto (devuelve una probabilidad sí/no), llamado por OpenRouter (`POST https://openrouter.ai/api/alpha/decisions`, `typesafe/jev-1.13`) con la clave de OpenRouter que ya existe. Tarda unos 250 ms de mediana y separó bien los datos de la charla en 12 de 12 frases (p ≈ 0,88–0,97 contra 0,04). Su entrenamiento es sobre todo en inglés; en español funcionó en esta prueba.
- **Buscar:** arranca al mismo tiempo que Jev y su resultado se usa solo si Jev dice que sí. Parallel `fast` tarda unos 735 ms de mediana (`turbo`, de ~200 ms, solo acepta consultas en inglés y japonés). Brave tarda unos 240 ms de mediana, pero la clave actual es del plan Free (1 consulta/s, dio 429).
- **Redactar:** `openai/gpt-oss-120b` en Cerebras por OpenRouter, unos 285 ms de mediana, con un pico de 4 s en 12 llamadas.
- **Total, desde que se tiene el texto de la frase hasta la línea con el dato:** unos 1,0 s de mediana con Parallel. Con Brave como buscador serían unos 0,6 s (estimación por tramos).
- **Falta medir:** cuánto tarda Soniox en entregar la frase final, el envío a las gafas y la calidad de los datos (vienen de las fuentes y pueden estar mal).
- Ejemplos reales: «Guayaquil tiene alrededor de 3 007 696 habitantes.», «Sí, la independencia de Guayaquil se celebró el 9 de octubre de 1820.»

## Decisiones abiertas
- Dónde corre el «cerebro» (detectar, buscar, redactar): directo desde el teléfono (las claves quedan en el teléfono) o a través del daemon de Paseo en la Mac por el relay (las claves se quedan en la Mac, pero depende de la Mac).
- Qué búsqueda usar (Parallel, Brave o Perplexity) y qué modelo en Cerebras.
- Si mostrar también la traducción en la misma pantalla o dejarla solo para Traducir.
- Privacidad: avisar o tener un modo «solo notas» sin enviar audio.

## Pasos
1. Prototipo en Node con audio grabado: Soniox → Cerebras → búsqueda → tarjetas, midiendo la latencia de cada tramo.
2. Ajustar el prompt de «vale la pena o no» con conversaciones reales para que no haya ruido.
3. Diseño en el marco terminal y renders.
4. Integración en Faceclaw y prueba con las gafas.

## Necesita
Claves de Soniox, Cerebras y del buscador elegido (aprobadas por Alexander antes de ir al teléfono o a la Mac).
