# Investigación del fork

Notas de la exploración de Faceclaw hecha el 2026-10-07, sobre upstream `84baee9` (v0.8.2). Objetivo del fork: usar Faceclaw como base para una UI con aspecto stock de Even G2 e irla modificando.

| Documento | Contenido |
|---|---|
| [01-soporte-ios-android.md](01-soporte-ios-android.md) | Estado del port iOS, por qué Android, ranking de fabricantes, root, teléfono de pruebas |
| [02-mapa-arquitectura.md](02-mapa-arquitectura.md) | Qué se puede modificar por capa, con archivos y líneas |
| [03-preview-y-desarrollo-local.md](03-preview-y-desarrollo-local.md) | Modo Preview Only, adb, render en la Mac, tests |
| [04-bug-import-ajustes-bak.md](04-bug-import-ajustes-bak.md) | Bug de importación de ajustes y workaround |
| [even-ui/caminos.md](even-ui/caminos.md) | Por qué se parte de Faceclaw y no de la UI de Even |
| [even-ui/investigacion-visual-fable.md](even-ui/investigacion-visual-fable.md) | Cómo se ve la UI stock y comparación elemento por elemento |
| [even-ui/factibilidad-codigo-astra.md](even-ui/factibilidad-codigo-astra.md) | Dónde vive cada decisión visual, arquitectura propuesta y estimaciones |

Herramienta: [tools/headless-render](../tools/headless-render/README.md) pinta partes de la UI a PNG en la Mac.

## Conclusiones

- Faceclaw hizo ingeniería inversa del protocolo y del firmware, no de la UI de Even; su UI es propia. La UI stock vive cerrada en el firmware.
- Un estilo "Even stock" es factible sin tocar firmware: misma banda 576x288 y la fuente stock ya se extrae del firmware. Esfuerzo estimado: preset exploratorio 1-2 días, match estilístico 5-9, casi pixel-fiel 15-25.
- Plataforma: Android, idealmente Pixel. El port iOS es beta de desarrollador.
- No commitear fuentes ni iconos extraídos del firmware o copiados de capturas, ni usar el logo de Even.

## Upstream

`upstream` apunta a https://github.com/jimrandomh/faceclaw. Para traer cambios: `git fetch upstream && git merge upstream/main`. Todo lo propio del fork vive en `research/` y `tools/` para que las fusiones no choquen.
