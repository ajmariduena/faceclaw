# Rediseño de la app del teléfono — propuesta 2

Mockup: [propuesta.html](propuesta.html). Solo HTML; no se tocó código de la app ni el teléfono.

Estado: aprobada el 11 oct 2026 («mucho mejor»), guardada para más adelante y sin implementar. Plan: quedarse en NativeScript y reescribir solo los XML/CSS de `app/phone-ui/`, porque las vistas dependen directamente de la lógica en TypeScript; pasarlas a Compose obligaría a puentear todo el estado.

La propuesta 1 se descartó: textos explicativos, gafas dibujadas a mano, acento verde y chips por todas partes, y funciones de IA que no van en una app que es solo de configuración.

## Qué muestra

Seis pantallas, una jerarquía plana de ajustes (sin barra inferior): Inicio (gafas, estado y batería, espejo del display, lista raíz), Pantalla, Mandos (reloj, anillo, teléfono), Voz y asistente, Claves API, Dispositivo (emparejamiento, firmware, permisos, desarrollador). Conversaciones queda como fila con su recuento, porque hoy existe como lista; sin búsqueda ni IA. Nombres y valores salen de `app/ui/dashboard-settings.ts`, `app/ui/dashboard/settings-menus.ts`, `app/phone-ui/api-keys-page.ts` y `app/phone-ui/permissions-view-model.ts`; la versión de `app/version.ts`.

## Referencias

- iOS 18, página de AirPods en Ajustes: render del producto arriba, nombre, grupos inset sin iconos, valor a la derecha, interruptor solo donde hay encendido/apagado.
- Pixel, Ajustes de Android 15 QPR1+: tema oscuro, grupos en tarjetas con separación, filas de dos líneas donde hay un valor que mostrar.
- Nothing X: página de dispositivo en blanco y negro, imagen del producto como foco, batería como número.
- App oficial de Even (G2): gafas con batería y vista previa del display arriba; posición y brillo como controles.
- Herramientas: `perplexity-cached` (descripciones y fuentes), `scrape` (página de producto para localizar los renders). `exa-cached` y `google-cached` sin crédito.

## Imágenes

En `assets/` (recortadas al contorno con Pillow, sin otro retoque; fondo ya transparente):

- `g2-b-grey-three-quarter.png` ← https://cdn.shopify.com/s/files/1/0600/4513/1891/files/even-g2-b-smart-glasses-three-quarter-view-grey.png
- `g2-b-grey-front.png` ← https://cdn.shopify.com/s/files/1/0600/4513/1891/files/even-g2-b-smart-glasses-front-view-closed-grey.png
- `r1-ring-top-45.png` ← https://cdn.shopify.com/s/files/1/0600/4513/1891/files/even-r1-smart-ring-top-45-degree-view.png
- `r1-ring-side-angle.png` ← https://cdn.shopify.com/s/files/1/0600/4513/1891/files/even-r1-smart-ring-side-angle-view.png

Son renders de la tienda de Even Realities (evenrealities.com/products/g2-b), con copyright de Even Realities y sin licencia de reutilización publicada. Solo para este mockup interno. **No se suben al repo**: `assets/.gitignore` los excluye; la app usaría sus propios assets o la foto de variante que ya tiene el emparejamiento.

## Paleta

Fondo `#000000`, tarjetas `#151515`, separadores `#262626`, texto `#f2f2f2` / `#9a9a9a` / `#6b6b6b`. Sin color de acento: el interruptor encendido es pista blanca con botón negro; apagado, pista `#2e2e2e`. Espejo del display en negro con contenido blanco y gris. Fuente del sistema. Esquinas 20 px en tarjetas, 36 px en el marco.
