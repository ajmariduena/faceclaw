# Ver la UI sin gafas

## Modo Preview Only

En la configuración inicial, en la pantalla "Custom Firmware Required", elegir **Preview Only**. La app usa un compositor en memoria (`app/native/preview-display.ts:45`, `FaceclawPreviewCompositor`) en lugar del transporte BLE, así que toda la UI (launcher, apps, menús, Glanceboard, animaciones) se dibuja igual que con gafas y se muestra a 640x480 en el teléfono.

- El recuadro inferior hace de anillo: deslizar mueve, toque selecciona, doble toque vuelve, mantener abre el menú. Los botones "Ring" y "Watch" cambian el esquema.
- Desde el launcher, el doble toque **apaga** la pantalla simulada; otro doble toque la enciende.
- Menú ⋮ del teléfono: capturas, grabación y permisos.
- La pantalla se apaga a los 30 s sin input (Settings → Display → Screen timeout, `display.screenTimeout`, por defecto `30s`). Para iterar conviene `never`.
- No prueba: micrófono y "Hey Even", brújula, vibración, sensor de luz, detección de puesta ni velocidad BLE real.

## Instalar y configurar por adb

```sh
gh release download 0.8.2 -R jimrandomh/faceclaw -p 'Faceclaw-0.8.2.apk'
adb install -r Faceclaw-0.8.2.apk
```

Poner `display.screenTimeout` en `never` en un build release (ver el bug en [04-bug-import-ajustes-bak.md](04-bug-import-ajustes-bak.md); la importación debe hacerse dos veces seguidas):

```sh
P=com.faceclaw.app; D=/sdcard/Android/data/$P/files
adb shell am broadcast -n $P/.FaceclawSettingsPortReceiver -a $P.SETTINGS_EXPORT
adb pull $D/faceclaw-settings-export.xml settings.xml && adb shell rm $D/faceclaw-settings-export.xml
# agregar dentro de <map>: <string name="display.screenTimeout">never</string>
adb shell am force-stop $P
for i in 1 2; do
  adb push settings.xml $D/faceclaw-settings-import.xml
  adb shell am broadcast -n $P/.FaceclawSettingsPortReceiver -a $P.SETTINGS_IMPORT
done
adb shell am force-stop $P
```

Los swipes inyectados con `adb shell input swipe` sobre el recuadro no los reconoce el detector de NativeScript; los toques sí. Para controlar la UI desde la Mac, crear un token de entrada y usar `scripts/faceclaw-input.cjs` con `adb forward tcp:8791 tcp:8791`.

## Render en la Mac

[`tools/headless-render`](../tools/headless-render/README.md) pinta la barra del shell y un menú a PNG con el código de producción, sin teléfono. Útil para iterar sobre estilos en segundos.

## Tests

`npm test` compila los módulos puros a `.test-build/` y corre `node --test`. Relevantes para cambios visuales: `app-layout`, `row-metrics`, `menu-core`, `icon-grid`, `glanceboard-layout`, `evenhub-list-menu`. La suite completa y los builds van por Crabbox en la Mac mini.
