# Bot «Glasses»: el bot de Grok por defecto para las gafas

La idea: un Grok Bot creado solo para las gafas. Es el bot por defecto de Faceclaw y su descripción (las instrucciones globales del bot) le fija el formato corto. Los demás bots (Research, Inbox…) se mantienen como están. Glasses los consulta con el handoff entre bots y te resume lo que contestan.

## Por qué encaja

- **Formato**: el chat de las gafas corta cada mensaje a 2 líneas, unos 100 caracteres (`paintChat`). Con el formato impuesto en el bot, «Full reply» pasa a ser la excepción.
- **Acuse inmediato**: cada `send-message` llega como un mensaje aparte (`api.md`). Si el bot primero dice «Busco vuelos, te aviso» y después manda el resultado, la latencia se siente mucho menor.
- **Un solo bot por defecto**: «Hey Even» siempre le habla a Glasses. Cambiar de bot queda para cuando quieres ver la conversación de otro.
- **Mismo poder que los demás**: todos los bots de la cuenta comparten la computadora, los logins y los archivos.

## Instrucciones propuestas (campo Description del bot)

```
Eres mi asistente en unas gafas Even G2. Leo tus respuestas en una pantalla de 2 líneas, unos 100 caracteres, mientras camino o hablo con alguien.

- Responde en una oración, máximo 100 caracteres. Primero la respuesta: sin saludo, sin repetir la pregunta, sin relleno.
- Solo texto plano: nada de markdown, enlaces, listas, negritas, emojis ni tablas. Si hay un sitio útil, di su nombre.
- Si hace falta más, da la oración clave y termina con «¿Detalle?». Si te digo «detalle», ahí sí responde largo.
- Si la tarea tarda más de 30 segundos, confirma primero en pocas palabras («Busco vuelos, te aviso»), trabaja y al final manda solo el resultado.
- Si otro bot es dueño del tema (Research, Inbox), pásale la tarea y resúmeme su respuesta en una oración.
- Si necesitas una aprobación, un login o un secreto, dilo en una línea: «Aprueba la reserva en la app».
- Contesta en el idioma en que te hablo.
```

## Qué cambia en Faceclaw

- El bot por defecto se llama `Glasses`, y en los ajustes se puede cambiar el nombre.
- **Creación del bot**: `POST /v0/grokbot/sessions {name:"Glasses"}` lo crea si no existe. Un comentario del SDK sugiere que la ruta acepta un campo `instructions` (*sin verificar*). Si lo acepta, Faceclaw puede crear Glasses ya configurado. Si no, se crea en la app de Grok Bot y se pega la descripción.
- **Prueba del 10 oct**: con la Description ya pegada, el bot seguía mandando 441 caracteres con lista y enlaces. Respondió corto (83 caracteres, sin enlaces) solo después de mandarle las reglas como mensaje en su chat, pidiéndole guardarlas en memoria.
- **Recordatorio de formato**: no se manda con cada mensaje. Vive en la descripción del bot, para no gastar tokens ni ensuciar su conversación.
- **Si el bot se pasa**: el chat muestra cada mensaje completo y se lee con scroll; los enlaces y el markdown se limpian en el teléfono.
- **Diseño**: Bots abre directo el chat de Glasses; no hay lista ni otros bots en las gafas.
