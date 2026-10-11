# «Qué está pasando»: cómo funcionaría de punta a punta

10 oct 2026. Concepto derivado de la respuesta de Alexander tras tres rondas: lo que fallaba era la estructura y el concepto de fondo (home de apps); al girar quiere ver **lo que está pasando**, no apps. Renders: `tools/headless-render/now-feed.cjs` → `out/now-*`. Este documento es la especificación de comportamiento, no una implementación.

## 1. Idea en una frase

El reloj es el reposo. Girar el anillo recorre una tira de **cosas** que están pasando (una pregunta de un agente, un evento, un PR listo, un timer), una por giro, a banda completa, sin nombres de apps. Tap actúa sobre la cosa ahí mismo. Doble tap vuelve al reloj.

## 2. Qué es una «cosa»

Una cosa siempre tiene la misma anatomía, tres líneas y nada más:

| Línea | Contenido | Brillo |
|---|---|---|
| Cuándo | `now`, `in 49 min`, `4 min ago`, `Tomorrow 09:00` | 255 si es `now`, si no 153 |
| Qué | La cosa misma, 28 px, máximo dos líneas y después elipsis | 255 |
| De dónde | Agente, PR, lugar y horario | 153 |

Debajo, solo si la cosa se puede responder: las respuestas en una fila (`Yes  No  Reply`). Arriba asoma en 85 la línea «qué» de la cosa anterior y abajo la de la siguiente: continuidad sin lista.

### Tipos y de dónde salen

| Tipo | Fuente (ya existe en Faceclaw) | Qué muestra | Tap hace |
|---|---|---|---|
| Pregunta | Paseo: agente en `needs` con pregunta o permiso | La pregunta; respuestas del agente o `Yes / No / Reply` | Entra a elegir respuesta |
| En curso | Paseo `working` largo; Translate dejado escuchando; timer corriendo; evento que ya empezó | Estado vivo (`· Working 3m`, `Translating 0:42`, `12:30 left`) | Abre esa sesión (chat del agente, Translate, timer) |
| Viene | Calendar: próximos eventos de hoy y, si no queda nada, el siguiente día | Título, hora y lugar | Detalle del evento |
| Listo | Paseo `ready`: agente terminó | Última línea del agente | Abre el chat del agente en lo más nuevo |
| Fin | Siempre la última | `Nothing else for now` + `Translate` / `Converse` | Inicia la elegida |

Fuera de la tira: clima y baterías (siguen en la columna), notificaciones del teléfono (la spec lean las excluye; se pueden sumar después como tipo «Llegó»), Music, Navigate y Timers como pantallas (se crean por voz y aparecen como «En curso»).

### Orden

1. Preguntas (lo que te necesita), la más antigua primero.
2. En curso.
3. Viene, por hora.
4. Listo, lo más reciente primero.
5. Fin.

El orden se recalcula **solo al volver al reloj**, nunca mientras giras: lo que tienes bajo el anillo no se mueve. Tope de ocho cosas; si hay más, se cortan las «Listo» más viejas.

### Ciclo de vida

- **Aparece** cuando la fuente la emite. Si estás en el reloj, la columna ya enseña el contador de Paseo; no hay popup. Si estás dentro de la tira, se inserta en su sitio al volver al reloj.
- **Desaparece** cuando: la respondiste; el evento terminó; el timer sonó y lo viste; el agente volvió a trabajar; o la descartaste con tap+mantener → `Dismiss`.
- **Caduca**: «Listo» a las 2 h; «Viene» de ayer nunca se muestra.

## 3. Estados y gestos

```
                     scroll ↓                  tap                    tap
   ┌────────┐  ─────────────────▶  ┌────────┐ ──────▶ ┌─────────────┐ ──────▶ (envía / abre)
   │ Reloj  │                      │  Cosa  │         │  Actuando   │
   └────────┘  ◀─────────────────  └────────┘ ◀────── └─────────────┘
                scroll ↑ en la 1ª                    doble tap
                o doble tap
```

| Estado | Scroll abajo | Scroll arriba | Tap | Doble tap | Mantener | Tap + mantener |
|---|---|---|---|---|---|---|
| **Reloj** | Primera cosa | Nada | Nada | Apaga pantalla (ignorado 700 ms tras llegar) | Menú sistema: Home · Screen off · Disconnect | Nada |
| **Cosa** | Siguiente cosa | Anterior; en la primera, Reloj | Actúa según tipo | Reloj | Menú sistema | Menú de la cosa: Dismiss · Snooze 1 h · Open |
| **Eligiendo respuesta** | Siguiente respuesta (se detiene al final) | Anterior | Confirma y envía; la cosa muestra `Sent · Yes` 1 s y pasa a la siguiente | Cancela, vuelve a la cosa | Menú sistema | Nada |
| **Reply (dictando)** | — | — | Termina el dictado → borrador `> Send / Edit / Discard` | Cancela sin enviar | — | — |
| **Detalle / chat / Translate** | Como hoy en esa pantalla (mueve `>`, historial) | Igual | Como hoy | Vuelve a la **misma cosa** | Menú sistema | Menú de la app |
| **Fin** | Nada (se detiene) | Cosa anterior | Inicia Translate o Converse (lo marcado con `>`) | Reloj | Menú sistema | Nada |

Reglas transversales:

- **«Hey Even»** desde cualquier estado abre AI Chat escuchando, salvo mientras Translate o Converse graban. Al cerrar AI Chat vuelve a donde estabas.
- **Despertar** (pantalla encendida por HeadUp o doble tap) muestra siempre el reloj; la tira se reconstruye.
- **Vuelta sola**: 20 s sin girar dentro de una cosa → vuelve al reloj. Mientras eliges una respuesta no vuelve sola.
- **Doble tap mientras Translate/Converse graban** mantiene la confirmación `Stop and leave?` de la spec; solo esa.
- **Reloj / watch**: el crown es scroll; swipe derecha = tap, izquierda = doble tap (fallback direccional actual).

## 4. Cómo se siente un giro

Un detent del anillo = una cosa. Transición de 200 ms: la cosa actual sube y la siguiente entra desde abajo, por display list (como `v3-enter`), dos recursos de 576×144. La línea del reloj (`09:41 Sat 10 · 2 of 4`) no se mueve: es el ancla. Scroll rápido (varios detents en <150 ms) salta de cosa en cosa sin animar cada una.

## 5. Escenarios

- **Mañana tranquila**: reloj. Giro: `in 49 min · Daily con el equipo`. Giro: `Tomorrow 09:00 · Dentista`. Giro: `Nothing else for now`. Doble tap: reloj.
- **Un agente pregunta**: la columna muestra `2`. Giro: `now · ¿Apruebas correr los tests de BLE?` con `Yes No Reply`. Tap, giro a `Yes`, tap: `Sent · Yes`, y entra la siguiente cosa. El contador de la columna baja a 1.
- **Respuesta larga**: en vez de `Yes`, giro a `Reply`, tap: dictado por el micrófono de las gafas; tap termina; aparece `> Send / Edit / Discard`; tap en Send.
- **Traducción en segundo plano**: inicias Translate desde Fin; doble tap → `Stop and leave?` → `Keep listening`; vuelves al reloj y la tira ahora empieza con `now · Translating ES/EN 0:42`; tap vuelve a la traducción.
- **Nada**: giro desde el reloj → `Nothing for now` + Translate/Converse. Es el único momento en que ves nombres.

## 6. Qué cambia en el código (estimación, no medida)

| Pieza | Qué | Días |
|---|---|---:|
| Modelo de la tira | Nuevo `app/apps/home/now-feed-model.ts`: junta `PaseoGlanceSnapshot`, calendario, timers y sesión de Translate en «cosas» con orden, tope y caducidad | 2 |
| Painter | `now-painter.ts`: reloj en línea, tres líneas, respuestas, asomos; reutiliza fuente stock y Roboto 28 | 1–2 |
| Shell | El home gestiona scroll como índice sobre la tira; tap enruta por tipo; doble tap vuelve a la misma cosa desde chat/detalle (ya requerido por la spec); vuelta sola a 20 s | 2–3 |
| Responder | Enviar la respuesta elegida al agente por el bridge de Paseo; `Reply` reutiliza el dictado y el borrador Send/Edit/Discard | 1–2 |
| Transición | Deslizamiento vertical por display list | 1 |
| **Total** | | **7–10** |

No incluye Converse ni cambios en el teléfono. Música y Notificaciones quedan fuera como hasta ahora.

## 7. Qué probar en el lente

- Lectura del «qué» a 28 px y de los asomos a 85 (si se pierden, subir a 119 o quitarlos).
- Si un detent por cosa se siente lento con 6–8 cosas; alternativa: scroll rápido salta.
- Si la vuelta sola a 20 s molesta cuando lees un evento.
- Si `Yes No Reply` en una fila se entiende con el `>`, o conviene una respuesta por línea.
