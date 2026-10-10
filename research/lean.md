# Versión lean: revisión app por app (9 oct 2026)

| App | Decisión | Dónde |
|---|---|---|
| Paseo | Se lanza: lista, chat, permisos, preguntas y planes; los resúmenes de Luna van después | `research/paseo-app/plan.md` |
| Calendario | Se queda; pasa al estilo terminal (tarjeta sin repetir el evento de la izquierda, agenda, días siguientes, evento) | `tools/headless-render/calendar-terminal.cjs` |
| Navegar | Para después; evaluar el Navigation SDK de Google contra Mapbox | `research/navigate/notas.md` |
| Traducir | Se queda; Soniox en las dos direcciones, arranca al tocar | `research/translate/plan.md` |
| Conversar | Se queda; datos en vivo con Jev → búsqueda → Cerebras (~1 s medido) | `research/conversar/plan.md` |
| AI Chat | Se queda con el agente integrado del teléfono y un modelo rápido (agregar Cerebras como proveedor compatible con OpenAI); respuestas de 1–2 líneas; mismo chat que Paseo | `tools/headless-render/aichat-terminal.cjs` |
| Música | Fuera: se quita la tarjeta del home | — |
| Notificaciones | Fuera: las G2 no tienen parlante para leerlas y la lista no le sirve; se quita la tarjeta y se apagan los avisos emergentes: el teléfono principal es un iPhone y el Android solo corre Faceclaw, así que sus notificaciones no son las reales | `tools/headless-render/notifications-terminal.cjs` |

Regla (9 oct): toda la interfaz va en inglés en todas las apps, incluidas las tarjetas del home y Calendario; el contenido queda en su idioma original.

## Falta decidir
- Teleprompter, Timers y Settings: si se quedan (no se han revisado).
- Si Conversar va como tarjeta del home o dentro de More.
- Las claves: Cerebras (AI Chat y Conversar), Soniox (Traducir y Conversar) y el buscador de Conversar (Parallel o Brave de pago).

## Orden de trabajo propuesto
1. Paseo: instalar el APK con preguntas y planes y probarlo. Los resúmenes de Luna, después.
2. Limpiar el home: quitar las tarjetas de Música y Notificaciones, apagar los avisos emergentes, pasar a inglés las etiquetas y la fecha, y aplicar el estilo terminal a Calendario.
3. More: una lista corta con el estilo terminal y solo las apps que quedan.
4. AI Chat: estilo terminal y proveedor Cerebras.
5. Traducir con Soniox.
6. Conversar: del prototipo a la app.
7. Navegar, después.
8. Prueba final con las gafas (firmware 37).
