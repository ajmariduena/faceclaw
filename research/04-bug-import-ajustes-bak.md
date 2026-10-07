# Bug: la importación de ajustes se revierte sola en builds release

## Síntoma

`scripts/push_config.sh` (y el broadcast `SETTINGS_IMPORT`) responde `imported: ...` pero, al abrir la app, los ajustes vuelven a los anteriores. Reproducido el 2026-10-07 con v0.8.2 en un Infinix Hot 60i (Android 15).

## Causa

`FaceclawSettingsPortReceiver.importSettings()` guarda la copia previa como `shared_prefs/faceclaw_settings.xml.bak` antes de escribir el archivo importado.

Android usa exactamente ese nombre (`<archivo>.bak`) como respaldo interno de `SharedPreferencesImpl`. Al cargar preferencias, si existe el `.bak` asume que la escritura anterior falló: borra el archivo principal y renombra el `.bak` en su lugar. Resultado: en la siguiente carga se restauran los ajustes viejos.

## Workaround

Importar dos veces seguidas, antes de que el proceso termine (el receiver hace `System.exit(0)` a los 500 ms). En la segunda importación el `.bak` pasa a ser una copia del archivo ya importado, así que la restauración de Android deja los valores nuevos. Comandos en [03-preview-y-desarrollo-local.md](03-preview-y-desarrollo-local.md).

## Arreglo propuesto

Usar otro nombre para la copia, por ejemplo `faceclaw_settings.xml.import-backup`, en `FaceclawSettingsPortReceiver.kt` y en los mensajes de `scripts/push_config.sh`. Se arregla solo en este fork: no se mandan PRs a upstream (regla en CLAUDE.md).
