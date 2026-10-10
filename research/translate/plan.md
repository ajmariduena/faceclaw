# Traducir: plan (9 oct 2026)

Objetivo: traducción ES ⇄ EN casi en tiempo real en las gafas, versión «lean»: tocar la tarjeta Traducir del home y que empiece a traducir, sin el menú técnico de Microphones que abre hoy.

## Decisión: Soniox real-time translation
- Se escucha y se traduce en el mismo stream: la traducción llega mientras la persona sigue hablando, en una o dos vías (ES ⇄ EN). Precio de lista: unos US$0,18 por hora en tiempo real (soniox.com/speech-translation, revisado el 9 oct).
- Faceclaw ya tiene el cliente de Soniox para el dictado (`app/native/soniox-stt.ts`, modelo `stt-rt-v5`); falta activar la traducción y conectarla a la pantalla.
- Descartado Cerebras u otro LLM rápido en cascada: tiene que esperar la frase completa del reconocimiento de voz antes de traducir, así que siempre llega después que Soniox.
- Alternativa: OpenAI `gpt-realtime-translate` (streaming de voz a voz con texto). Cuesta unos US$0,034 por minuto (≈ US$2 por hora) y está pensado para devolver voz, que en las gafas no hace falta.
- Sin conexión (más adelante): ML Kit en el teléfono (`apps/microphones/translate.ts`), que ya existe, pero el reconocimiento local Moonshine solo entiende inglés.
- Sin verificar: la latencia real. Lo de «baja latencia» es lo que dice el fabricante; hay que medirlo con las gafas.

## Interfaz (marco terminal, por diseñar)
- Al tocar Traducir arranca enseguida, bidireccional por defecto.
- Lo que dice el otro, traducido, en blanco; el original en tenue debajo o en una línea aparte. Pie «· Traduciendo  ES ⇄ EN  0:42».
- Una sola confirmación al salir grabando («¿Detener y salir?»), como dice el plan v3.
- Sin instrucciones en pantalla.

## Pasos
1. Probar la traducción de Soniox en Node con audio de 16 kHz y medir la latencia (con el script de dictado de `tools/paseo-probe/` como base).
2. Activar la traducción en `soniox-stt.ts` (una y dos vías) y exponer los segmentos original/traducción.
3. Hacer la app Traducir propia (o una variante de Microphones) con la pantalla nueva y la tarjeta del home.
4. Renders headless y aprobación del diseño.
5. Prueba con las gafas: Preview Only no usa el mic de G2.

## Necesita
- Una clave de API de Soniox (que la apruebe Alexander antes de ponerla en el teléfono).
- Las gafas G2 con el firmware de Faceclaw para la prueba real.
