# Plan: UI estilo Even

Estado al 2026-10-07. Detalle técnico, medidas y evidencia en [propuesta-home.md](propuesta-home.md). Nada de esto está implementado en `app/` todavía; los renders salen de `node tools/headless-render/render.cjs <modo>`.

## Decisiones

- **Home:** widget a la izquierda (hora, fecha, batería de las gafas, clima, próximo evento) y lista de apps fijadas a la derecha, sin barra de estado ni switcher permanentes. Variante base de 5 filas (`home`, `home-scrolled`).
- **Apps fijadas, solo las que se usan:** AI Chat, Notifications, Calendar, Music, Timers, Navigate, Teleprompter, Settings, más **Traducir** y **Conversar** cuando existan. "Más…" abre el launcher actual con el resto; juegos y herramientas de desarrollo quedan ahí.
- **Input:** swipe mueve la selección, tap abre, doble tap vuelve al home desde cualquier app.
- **Abrir una app:** deslizamiento horizontal de 180 ms con smoothstep, ejecutado por el firmware como display list (`transition-even-0..4`).
- **Calendar:** misma agenda de hoy, reestilizada al lenguaje del home (`calendar-even`). Sin vista de detalle por ahora.

## Fases

| # | Fase | Días/persona |
|---|---|---:|
| 1 | Home funcional en Preview Only (ventana, arranque, datos, abrir/volver, scroll) | 3–4 |
| 2 | Pulido visual del home | 1–2 |
| 3 | Apps fijadas editables desde Settings (se puede posponer fijando la lista en código) | 1–2 |
| 4 | Calendar reestilizado | 1–2 |
| 5 | Transición home → app | 1–2 |
| 6 | Traducir: subtítulos con Soniox (español ↔ inglés, dos vías) y pantalla propia | 3–5 |
| 7 | Conversar: pistas de IA en vivo, notas previas, resumen y tareas al final | 5–10 |
| | **Home + Calendar + transición (1–5)** | **7–12** |
| | **Con Traducir y Conversar (1–7)** | **15–27** |

Las fases 6 y 7 son estimación inicial, sin render ni análisis detallado.

## Traducción y Conversate

Conversate de Even muestra subtítulos y pistas de IA breves durante la charla (términos, personas mencionadas, posibles respuestas, notas preparadas antes) y guarda resumen y tareas en el teléfono; requiere internet. Translate de Even usa la nube, ~33 idiomas, eligiendo idioma de entrada y salida ([evenrealities.com/conversate](https://www.evenrealities.com/conversate), [evenrealities.com/translation-glasses](https://www.evenrealities.com/translation-glasses)).

Lo que ya hay en Faceclaw, en la app Microphones (`app/apps/microphones/`):

- Subtítulos en vivo con los micrófonos de las gafas (`mic_control` del CFW), con nombre de quien habla.
- Traducción en el teléfono con ML Kit al idioma del teléfono (`translate.ts`, ajuste `microphones.translate-enabled`).
- Conversaciones guardadas con transcripción, hablantes y tono; preguntas sobre ellas con Qwen local (`conversation-qa.ts`).

Límites:

- El reconocimiento de los subtítulos usa solo Moonshine base **en inglés** (`mic-session.ts:733`): traduce a quien habla inglés, no a quien habla español.
- Soniox ya está integrado para el dictado (`app/native/soniox-stt.ts`, modelo `stt-rt-v5`) y soporta traducción en vivo en una o dos vías, ~US$0,12–0,18 por hora de audio. Falta conectarlo a los subtítulos.
- Las pistas de IA en vivo necesitan un modelo en la nube (API key); Qwen local es lento para eso.
- Preview Only no usa el micrófono de las gafas: Traducir y Conversar solo se prueban con G2 y firmware Faceclaw.

## Pendiente de decidir

- Si se empieza por la versión mínima (fases 1, 2 y 5 con lista fija en código).
- Proveedor de clima: el actual usa `api.weather.gov` (solo EE. UU.) y Fahrenheit, así que en Ecuador probablemente no traiga datos.
- API key para AI Chat, Traducir y Conversar.
