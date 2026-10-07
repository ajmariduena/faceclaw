# Soporte de plataformas: iOS, Android y qué teléfono usar

Investigado el 2026-10-07 sobre upstream `84baee9` (v0.8.2).

## iOS

- Existe un port real: `App_Resources/iOS/` (Objective-C para BLE, voz, cripto, QR, calendario, webview EvenHub), ~35 archivos `app/native/*.ios.ts`, scripts `build:ios` / `run:ios`, y cada vez más lógica compartida en Kotlin Multiplatform (`native/kotlin/shared`).
- Estado: **beta para desarrolladores**. Las releases solo publican APK; no hay IPA, TestFlight ni App Store. Hay que compilar con Xcode y una cuenta de desarrollador.
- CHANGELOG 0.7.1: flasheo de firmware probado; voz solo con dictado de Siri; agente IA solo con proveedores en la nube; notificaciones sin íconos y solo descartables; EvenHub a medias. 0.8.0 agregó calendario y apps EvenHub en segundo plano. No hay código iOS de control de música.
- Documentación contradictoria: `website/install.html` dice que "no hay versión iOS y no la habrá"; el README enlaza `notes/ios-development.md`, que no existe.

## Por qué Android es mejor para esto

Las gafas no ejecutan UI propia: el teléfono dibuja cada frame, procesa los gestos del anillo, recibe el audio del micrófono, reenvía notificaciones y música, mantiene vivas las apps EvenHub y maneja energía y bloqueo. Si el sistema suspende la app, las gafas se congelan. Y el uso normal es con el teléfono bloqueado en el bolsillo.

| | Android | iOS |
|---|---|---|
| Segundo plano | Servicio en primer plano | Solo `bluetooth-central` y `location` (`Info.plist`); el resto puede suspenderse |
| Notificaciones | Lee todas, con íconos y acciones | Solo ANCS, más limitado |
| Música | Controla casi cualquier reproductor | Apple no permite controlar reproductores de terceros |
| Distribución | APK firmado | Compilar uno mismo; certificado gratuito caduca cada 7 días |
| Reloj | App Wear OS incluida | No hay app de Apple Watch |

## Qué Android conviene

El README advierte que el ahorro de batería de cada fabricante puede pausar o limitar la app. Ranking de [dontkillmyapp.com](https://dontkillmyapp.com) (octubre 2026; #1 es el peor):

| Marca | Puesto |
|---|---|
| Huawei | #1 (y sin servicios de Google: el reloj Wear OS no funciona) |
| Xiaomi / Redmi / Poco | #2 |
| OnePlus | #3 |
| Samsung | #4 |
| Meizu | #5 |
| Oppo | #8 |
| Lenovo | #10 |
| Vivo | #11 |
| realme | #12 |
| Motorola | #13 |
| Tecno (Transsion, misma capa que Infinix) | #15 |
| Sony | #16 |
| Pixel, Android One, Nokia, HTC | Sin problemas |

Recomendación: **Google Pixel** (respeta la excepción de batería y trae Google Play Services). Requisitos de Faceclaw: arm64 (`abiFilters "arm64-v8a"`) y Android 7+ (`minSdkVersion 24`). Para modelos locales (Whisper, Qwen3 4B) conviene gama alta con bastante RAM.

## Root

Faceclaw no usa root para nada (sin llamadas a `su` ni detección de root en el código). Lo único que aportaría es más control sobre el ahorro de batería del fabricante (congelar sus apps o instalar una ROM limpia), a cambio de borrar el teléfono, perder Google Wallet y algunas apps de banco, y en Xiaomi las actualizaciones.

Desbloqueo de bootloader en 2026: Motorola sí (portal oficial); OnePlus sí en modelos globales; Xiaomi solo globales con permiso y cupos; Oppo y realme limitado; Huawei, Honor y Vivo prácticamente no.

Casi todo lo útil se puede hacer **sin root por adb**:

```sh
adb shell cmd deviceidle whitelist +com.faceclaw.app
adb shell cmd appops set com.faceclaw.app RUN_ANY_IN_BACKGROUND allow
adb shell am set-standby-bucket com.faceclaw.app active
# Último recurso, de a una app y probando; se revierte con: cmd package install-existing <pkg>
adb shell pm disable-user --user 0 <paquete-del-fabricante>
```

## Teléfono de pruebas: Infinix Hot 60i (X6728)

Inspeccionado por adb sobre Tailscale el 2026-10-07.

| | Valor |
|---|---|
| Sistema | Android 15, XOS 15.1.2, parche 2026-08-01 |
| SoC | MediaTek MT6769, `arm64-v8a` |
| RAM | ~4 GB (sirve para IA en la nube, no para Qwen3 4B local) |
| Bluetooth LE | Sí |
| Google Play Services | Sí |
| Bootloader | Bloqueado (`ro.boot.flash.locked=1`, verified boot `green`); "Desbloqueo OEM" no aparece en opciones de desarrollador |

Ajustes de XOS para que no congele la app (de la página de Tecno en dontkillmyapp; los nombres pueden variar):

1. Ajustes → Batería → desactivar la gestión de ahorro para Faceclaw / "Sin restricciones".
2. Phone Master → Toolbox → Auto-start management → permitir Faceclaw.
3. Phone Master → Power Marathon → desactivar "Power Boost".
4. Bloquear Faceclaw con el candado en recientes.
5. Aceptar la excepción de optimización de batería dentro de Faceclaw.
