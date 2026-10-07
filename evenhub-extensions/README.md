# @faceclaw/evenhub-extensions

Types and a small helper for EvenHub apps that want to use
[Faceclaw](https://github.com/jimrandomh/faceclaw)'s extension APIs.

Faceclaw is an alternative host for EvenHub apps on the Even Realities G2
glasses. An app built against the standard
[`@evenrealities/even_hub_sdk`](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
runs in Faceclaw unchanged. This package lets the app detect that it is
running in Faceclaw and use some extra capabilities there: a taller canvas, the
glasses' compass and buzzer, window lifecycle events, voice-assistant tools, and
the user's API keys (with their consent). In the stock Even app the extensions
are absent, and the app runs as usual.

- [API reference](docs/api/README.md)

## Install

```sh
npm install @faceclaw/evenhub-extensions
```

The package has no dependencies. It contains TypeScript types and one small
function, and ships as both an ES module and CommonJS.

## Quick start

```ts
import { getFaceclawExtensions } from "@faceclaw/evenhub-extensions";

const fc = getFaceclawExtensions();
if (!fc) {
  // Not running in Faceclaw: use only the standard EvenHub SDK.
} else {
  console.log("host:", fc.getVersion()); // e.g. "Faceclaw/0.8.2"

  // Pause work while the app isn't on screen.
  fc.addWindowLifecycleListener((e) => {
    if (e.type === "hidden") pause();
    if (e.type === "visible") resume();
  });

  // Beep.
  await fc.playBuzzer([
    { freq: 880, ms: 90 },
    { freq: 0, duty: 0, ms: 40 }, // a rest
    { freq: 1320, ms: 160 },
  ]);
}
```

`getFaceclawExtensions()` returns `null` everywhere except inside Faceclaw:
in the stock Even app, in the EvenHub simulator, in a browser, and in Node.
Faceclaw installs the API before any page script runs, so you can call it at
startup. You don't need to wait for the bridge first.

## How it works

Faceclaw injects one global function, `window.getFaceclawExtensions`, into the
app's webview. Every extension lives behind it. Faceclaw doesn't modify the
standard SDK, other globals, or any built-in prototype, so an app that uses
the extensions keeps working in any other host. `getFaceclawExtensions()` in
this package checks whether that global exists and calls it.

## Checking for features

New members will be added over time, and an app may run in a Faceclaw build
that is older than the version of this package it was built against. Use
`apiVersion` to check before calling anything newer than level 1:

```ts
const fc = getFaceclawExtensions();
if (fc && fc.apiVersion >= 2) {
  // Safe to use members marked "@since apiVersion 2" in the reference.
}
```

Everything in this release is API level 1.

## TypeScript

The types are bundled; there is no separate `@types` package. Importing
anything from the package also adds the global to `Window`, so
`window.getFaceclawExtensions` is typed throughout your program.

If you use the global directly and never import the package, add it to
`compilerOptions.types` in your `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@faceclaw/evenhub-extensions"] } }
```

## API overview

The [API reference](docs/api/README.md) documents every member in full.

| Member | What it does |
| --- | --- |
| `apiVersion` | The extension API level the host implements, for feature checks. |
| `getVersion()` | The host's name and version, e.g. `"Faceclaw/0.8.2"`. |
| `returnToAppSwitcher()` | Give focus back to the app switcher, and keep running. |
| `quit()` | Close the app. Faceclaw treats the stock `shutDownPageContainer(1)` as "return to the switcher", so use this to really quit. |
| `addWindowLifecycleListener(fn)` | `visible` / `hidden` and `focused` / `blurred` events. |
| `getConfiguredApiKeys()` | Which services the user has keys for (names only). |
| `requestApiKeyAccess(services)` | Ask the user, on the glasses, to share those keys with the app. |
| `playBuzzer(steps)` | Play a tone sequence on the glasses' buzzer. |
| `addCompassListener(fn)` | Turn on the magnetometer and receive headings. |
| `createLayout(layout)` / `replaceLayout(layout)` | Build the page on the full 576×452 canvas, with no container limit, and optionally keep content across layouts. |
| `setAssistantTools(tools)` | Offer tools to Faceclaw's voice assistant. |

### Extended layout

`createLayout` and `replaceLayout` take the same `textObject` / `imageObject` /
`listObject` / `menuObject` shape as the stock `createStartUpPageContainer` and
`rebuildPageContainer`, so you can keep using the stock SDK's container
classes. The differences:

- The canvas is the full 576×452 app area instead of 576×288, and an image
  container can fill it (the stock limit is 288×144).
- There is no limit on the number of containers.
- A container with `preserve: true` keeps the content (text, pixels, or list
  items and selection) of the same-named container in the previous layout.
  Without it, the container starts blank.

```ts
import { ImageContainerProperty, TextContainerProperty } from "@evenrealities/even_hub_sdk";

await fc.createLayout({
  imageObject: [new ImageContainerProperty({ containerID: 1, containerName: "map", xPosition: 0, yPosition: 0, width: 576, height: 452 })],
  textObject: [new TextContainerProperty({ containerID: 2, containerName: "hud", xPosition: 16, yPosition: 16, width: 300, height: 40, content: "Ready", isEventCapture: 1 })],
});

// Later: move the HUD, keeping the map's pixels.
await fc.replaceLayout({
  imageObject: [{ containerID: 1, containerName: "map", xPosition: 0, yPosition: 0, width: 576, height: 452, preserve: true }],
  textObject: [{ containerID: 2, containerName: "hud", xPosition: 16, yPosition: 396, width: 300, height: 40, content: "Ready", isEventCapture: 1 }],
});
```

Keep using the stock `updateImageRawData` and `textContainerUpgrade` to update
content; they address containers by `containerID`. Once an app has used an
extended layout, its window stays at 576×452 for the rest of the session.

### Compass

Each `CompassReading` has several headings, all in degrees clockwise from north:

- `headingDegrees` is the raw reading. The magnetometer is in the right arm,
  which sits at a slightly different angle on every wearer, so this heading is
  only relative.
- `magneticHeadingDegrees` adds the wearer's calibration from Faceclaw's
  Compass app. `wearerCalibrated` says whether they have calibrated.
- `trueHeadingDegrees` also corrects for local magnetic declination. It is
  absent when Faceclaw doesn't know the phone's location.

Use `trueHeadingDegrees` when it is present, and otherwise
`magneticHeadingDegrees`. If `wearerCalibrated` is false, treat the heading as
relative, or let the user set their own zero.

Readings arrive only while the app is in the foreground. The sensor turns off
when the last listener unsubscribes.

### Voice-assistant tools

```ts
fc.setAssistantTools([
  {
    name: "set_bpm",
    description: "Set the metronome tempo.",
    parameters: { type: "object", properties: { bpm: { type: "number" } }, required: ["bpm"] },
    availability: "open", // or "foreground" (the default)
    handler: ({ bpm }: { bpm: number }) => {
      setTempo(bpm);
      return `Tempo is now ${bpm}.`;
    },
  },
]);
```

The assistant sees each tool under your package name, as
`app.<packageName>.set_bpm`. Whatever the handler returns is reported back to
the assistant. If it throws, the assistant gets the error message. Tools are
removed when the app closes; call `setAssistantTools([])` to remove them
sooner.

### API keys

`getConfiguredApiKeys()` tells you which services (`openai`, `anthropic`,
`soniox`, `elevenlabs`, `mapbox`) the user has keys for, without revealing the
keys. `requestApiKeyAccess(services)` shows a consent prompt on the glasses and
resolves with the keys the user agreed to share. If the user declines, it
resolves to `{}`. A grant lasts until the app closes.

## Stability

This package is pre-1.0. Until 1.0 the API may still change. After that, changes
will only add new members, gated by `apiVersion`.

## License

MIT. Faceclaw itself is GPL-3.0, but this package is MIT-licensed so that apps
under any license can use it.
