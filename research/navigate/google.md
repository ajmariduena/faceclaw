# Navigate con Google (propuesta, 11 oct 2026)

Pedido: reemplazar Mapbox, poder buscar cualquier dirección o lugar y rediseñar la interfaz con un acabado premium. Pagar por Google no es problema.

## Recomendación: Google Places (New) + Navigation SDK + Maps Static
Todo lo de abajo se verificó el 11 oct en la documentación y los términos de Google.

- **Búsqueda: Places API (New) Autocomplete.** Es la mejor cobertura de lugares y direcciones en Ecuador. Las sugerencias se pueden mostrar sin mapa, con la atribución «Google Maps». El `placeId` elegido va directo al SDK, así que no hace falta pedir Place Details.
- **Guía: Navigation SDK for Android, sin vista de mapa.** Se obtiene con `NavigationApi.getNavigator(Application, …)` y el feed «turn-by-turn» (`TurnByTurnManager` / `NavInfo`), unas 1 vez por segundo. Ese feed es para pantallas pequeñas: Google pone de ejemplo a los motociclistas.
  - Trae la maniobra (enum con rotondas y número de salida), la instrucción ya en español, la calle, la distancia al giro, el tiempo y la distancia al destino, los carriles (con el recomendado marcado) y los estados ENROUTE/REROUTING/STOPPED.
  - Recalcula solo, con tráfico real.
  - Los términos 12.1 permiten usarlo sin mapa de Google.
- **Mapa del panel izquierdo: Maps Static API, con estilo oscuro y la ruta encima.** Sigue siendo un mapa de Google, así que no rompe la regla «no usar con un mapa que no sea de Google» (12.2 y 14.2). Su logo aparece pequeño en la esquina.
- **La clave puede ir en el teléfono.** `NavigationApi.setApiKey(key)` acepta la clave en tiempo de ejecución, una vez por proceso, así que se puede guardar en Claves API como las demás. Cambiarla requiere reiniciar la app.

### Lo que no sirve
- **Routes/Directions REST + GPS propio:** los términos 3.2.3 prohíben armar navegación en tiempo real con eso.
- **Google para buscar + Mapbox o HERE para la ruta:** viola «no usar con un mapa que no sea de Google» (14.2 y 6.2).

### Costo para un solo usuario: en la práctica $0
| SKU | Gratis al mes | Después |
|---|---|---|
| Navigation Request (por destino; recalcular no cobra) | 1.000 | US$25 por 1.000 |
| Autocomplete Requests | 10.000 | US$2,83 por 1.000 |
| Static Maps | 10.000 | US$2 por 1.000 |

Conviene poner un tope diario de cuota en Cloud Console.

### Requisitos técnicos
- Dependencia `com.google.android.libraries.navigation:navigation`:
  - 6.x funciona con el `targetSdkVersion 35` actual.
  - 7.x exige target 36.
- El SDK reemplaza al Maps SDK, que Faceclaw no usa.
- El usuario acepta una vez el diálogo de términos de Google Navigation en el teléfono (`showTermsAndConditionsDialog`).
- Necesita permiso de ubicación precisa y un foreground service, que el SDK ya trae (`ForegroundServiceManager`).

## Entradas para el destino
1. **En las gafas: «Buscar un lugar».** Escucha por voz, muestra las sugerencias de Google con su distancia y abre la vista previa de la ruta.
2. **En el teléfono: escribir.** Mientras escribes, las sugerencias aparecen en vivo en las gafas, con el mismo borrador de texto que ya usa Navigate.
3. **Compartir desde Google Maps o WhatsApp.** «Compartir → Faceclaw» con un lugar o una ubicación arranca la ruta en las gafas.
4. **Lista inicial:** Casa, Trabajo, el próximo evento del calendario que tenga ubicación (solo lectura) y los recientes. La distancia es en línea recta y se calcula en el teléfono, sin costo.

Se perdió «navega a…» por voz con el asistente, porque el asistente ya no existe. Grok Bot no puede llamar herramientas de Faceclaw, así que la voz entra por «Buscar un lugar».

## Pantallas (renders en `tools/headless-render/out/navg-*.png`, script `nav-google-mock.cjs`)
- **Destino:** lista con íconos. «Buscar un lugar» va arriba, con micrófono. La distancia va a la derecha y el modo en el pie.
- **Escuchando:** micrófono con ondas y la transcripción en vivo. El pie dice «Google Maps».
- **Resultados:** nombre en blanco, dirección en tenue y distancia. La consulta queda en el pie.
- **Vista previa:** mapa general con la ruta y el pin, destino, «14 min» grande, distancia y hora de llegada, estado del tráfico y el modo (Carro / A pie / Moto). Girar cambia el modo y tocar inicia.
- **Guiando:**
  - Flecha gruesa suavizada, distancia grande con la unidad en la misma línea base y una barra que se llena al acercarte al giro.
  - Debajo, la calle, los carriles (el recomendado en blanco) y la pastilla «luego» con el giro siguiente.
  - El pie muestra el tiempo y la distancia restantes, y «llegas 18:52».
- **Rotonda:** el anillo con el recorrido en blanco y las salidas que no tomas en tenue, más «Tercera salida».
- **Solo flecha:** variante sin marco y sin mapa, como las capas en vivo. Se elegiría en el modo de pantalla.
- **Recalculando:** puntos girando y «Te saliste de la ruta». El mapa sigue visible.
- **Llegada:** pin, «Llegaste» y de qué lado está el destino (sale de la maniobra DESTINATION_LEFT/RIGHT del SDK).
- **Inicio:** durante el viaje, la tarjeta del inicio muestra el giro, la distancia, la calle y la hora de llegada, igual que la tarjeta de Grok Bot.

## Lo que el usuario tiene que hacer
Crear un proyecto en Google Cloud con facturación y habilitar Navigation SDK, Places API (New) y Map Tiles API. Después, crear una clave restringida a esas APIs y pegarla en Claves API › Google Maps. La primera vez que se abre Navigate, el teléfono muestra los términos de Google Navigation.

## Implementado (11 oct 2026)
Se implementó la dirección A2 de `minimal-fable.md` («Esquinas con calles»), no las pantallas con marco de arriba.

- **Guía:** `app/apps/navigate/nav-render.ts` pinta la flecha, la distancia y la calle abajo a la izquierda, y las calles de Google Map Tiles (solo vías) que se desvanecen alrededor del chevrón. Un nombre largo de calle pasa a una segunda línea. Hay render de la pantalla real en `tools/headless-render/nav-app.cjs` (`out/nav-app-*.png`).
- **Navegación:** Navigation SDK 7.6.1 sin vista de mapa (`FaceclawGoogleNav.kt`, `FaceclawNavInfoService.kt`). La clave llega en tiempo de ejecución con `NavigationApi.setApiKey`, que solo existe desde 7.6 y solo se puede llamar una vez por proceso: cambiar la clave pide reiniciar Faceclaw. 7.7+ exige un AGP más nuevo que el de NativeScript. compileSdk sube a 36; targetSdk se queda en 35.
- **Búsqueda:** Places Autocomplete (New), con el borrador de texto del teléfono en vivo o la voz. Casa y Trabajo se resuelven con la primera sugerencia de su dirección.
- **Modo:** Carro, A pie o Moto (`navigate.travelMode`). El zoom de las calles es 17 a pie y 16 en carro o moto.
- **Asistente:** `start_route`, `stop_route` y `route_status` siguen registradas y ahora usan Google.
- **Recientes:** guardan el placeId; las coordenadas se borran a los 30 días (términos 12.3).
- **Se borró:** `native/mapbox.ts`, `route-follower.ts`, `maneuver-icons.ts` y `nav-scenes.cjs`. La clave de Mapbox se queda porque EvenHub la usa.

Sin probar en el teléfono: la guía real necesita la clave de Google. El APK se instaló en el Nubia y arranca sin errores.
