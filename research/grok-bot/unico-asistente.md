# Grok Bot como único asistente (11 oct 2026)

Pedido: Bots ya no elige entre varios bots, así que pasa a llamarse Grok Bot y reemplaza al asistente de IA. AI Chat desaparece. La decisión fue «Todo a Grok Bot».

## En las gafas
- La tarjeta del inicio y la ventana se llaman «Grok Bot». La línea tenue de la tarjeta muestra solo la edad («1 h», «working 4 min») y ya no el nombre de la sesión.
- El chat dice «· Grok Bot» en el pie, «Ask Grok Bot anything» cuando está vacío y «> Stopped» al detenerlo.
- More queda con Timers, Navigate y Settings.
- «Hey Even» siempre abre Grok Bot escuchando. Sin clave de Cursor, Grok Bot avisa «Add a Cursor key on the phone».
- Los diálogos de voz y de teclado ofrecen «Send to Grok Bot»: traen Grok Bot al frente y envían desde su chat. Si el envío falla, el texto queda en el borrador.
- El aviso breve del shell se titula «Faceclaw» en vez de «Assistant».

## Reloj y API remota
- Una pregunta desde el reloj va a Grok Bot. El reloj recibe «thinking» y luego la respuesta en texto plano como «done» (con el mismo evento `assistant` del protocolo, así el reloj no cambia).
- `close-assistant` se mantiene por compatibilidad y solo confirma.
- La acción `assistant` de la API local (puerto 8791) también envía a Grok Bot.

## Teléfono
- La sección «Assistant» de ajustes desapareció. El modelo en el teléfono (Qwen), que usa Microphones, pasó a «Voice».
- En Claves API, el grupo de OpenRouter se llama «Facts». El nombre de la sesión de Grok Bot («Glasses») solo aparece en Advanced, como «Grok Bot session».

## Código eliminado
- `app/apps/ai-chat/` (`voice-draft.ts` pasó a `app/apps/bots/`).
- `app/ui/shell/assistant.ts`.
- `app/assistant/{session,conversations,direct-backend,bridge-client,mcp-server,types}.ts`.
- El prompt del asistente en `app/prompts.ts`.
- Los ajustes `assistant.*` y el borrador `aiChat.draft`.

## Lo que se perdió
- Ya no se pueden crear timers por voz: la herramienta `timer.set` existía para el asistente. Timers solo muestra y cancela.
- Se perdió el puente a un agente externo (OpenClaw).
- Calculator usa el primer modelo con clave («auto»), ya que no hay un ajuste de modelo.

## Queda para después
- El registro de herramientas (`tool-registry`, `*-tools.ts`, las herramientas de los workers y EvenHub) sigue en el código, pero nadie lo llama. Se puede borrar en otra pasada.
- Las cadenas de la app del reloj (`wear/`) todavía dicen «assistant».

## Verificación
- En la Mac mini: `tsc --noEmit` y `./lint.sh` sin errores.
- `npm test`: 887 de 889. El que falla compila Kotlin y la mini no tiene Java en ese shell. No tiene que ver con este cambio.
- El APK se compiló en la mini con el JDK de Homebrew (openjdk@21), porque `build_paths.sh` de la mini está vacío. Se instaló en el Nubia con `adb install -r` y las gafas reconectaron sin errores JS.
- Renders en `tools/headless-render/out/bots-*.png` y `lean-core-more.png`.
