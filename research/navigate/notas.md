# Navigate: notas (9 oct 2026, pendiente)

## Cómo está hoy
- App propia de Faceclaw (`app/apps/navigate/`): búsqueda y rutas con Mapbox (Search Box, Directions en carro, a pie y bici), mapa estático de Mapbox, GPS del teléfono y recálculo si te sales 50 m de la ruta durante 3 lecturas seguidas.
- Necesita un token público de Mapbox (Ajustes > API Keys); no está configurado.
- La interfaz está en inglés, con pies, millas y AM/PM, gestos escritos en pantalla y sin el marco terminal. Hay renders de cómo está y de la propuesta en `tools/headless-render/nav-scenes.cjs`.

## Propuesta de interfaz
Marco terminal, en español, con metros y hora de 24 h. El giro va con flecha y distancia grande, la instrucción en blanco y el giro siguiente en tenue; el pie muestra distancia, tiempo y «llegas 18:52». No hay instrucciones en pantalla.

## Google Maps en vez de Mapbox (verificado el 9 oct en los términos y la documentación de Google)
- La API normal (Directions/Routes + Geolocation) no sirve: los términos de Google Maps Platform (3.2.3(d)(iv)) prohíben combinarlas para crear navegación en tiempo real parecida a Google Maps, y sus rutas no se pueden mostrar sobre un mapa que no sea de Google (Service Specific Terms 4.2).
- El camino permitido es el **Navigation SDK for Android**, que tiene un «turn-by-turn data feed» para pantallas sin mapa (íconos, distancias, nombres de calles). Se puede usar sin mostrar un mapa de Google (términos 12.1).
- Precio: pago por destino; los primeros 1.000 destinos al mes son gratis (developers.google.com/maps/documentation/navigation/android-sdk/pricing).
- Cobertura en Ecuador: tráfico, carro, a pie, moto e incidencias en tiempo real; sin bici ni límites de velocidad.
- Costo: integrar el SDK nativo en Kotlin dentro de NativeScript, y una clave de Google Cloud con facturación (la tiene que aprobar Alexander).
- Alternativa sin clave, sin explorar: leer las notificaciones de navegación de Google Maps (Faceclaw ya lee notificaciones).
