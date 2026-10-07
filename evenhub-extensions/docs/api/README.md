# @faceclaw/evenhub-extensions

Types and a small helper for the Faceclaw extension API.

[Faceclaw](https://github.com/jimrandomh/faceclaw) is an alternative host for
EvenHub apps: it runs them on the Even Realities G2 glasses without the stock
Even app. An app built against the standard `@evenrealities/even_hub_sdk`
runs unchanged. This package lets such an app detect that it is running
inside Faceclaw and use a few extra, Faceclaw-only capabilities.

The only entry point is the injected global `window.getFaceclawExtensions`,
which is a function inside Faceclaw and `undefined` in the stock Even app and
every other host. Nothing on the standard SDK, on `window`, or on any built-in
prototype is modified, so an app that uses these extensions still runs
everywhere else; it just skips the extras.

## Example

```ts
import { getFaceclawExtensions } from "@faceclaw/evenhub-extensions";

const fc = getFaceclawExtensions();
if (fc) {
  console.log("Running in", fc.getVersion()); // "Faceclaw/0.8.2"
  fc.addWindowLifecycleListener((e) => {
    if (e.type === "hidden") pauseExpensiveWork();
  });
}
```

## Entry point

### FaceclawExtensions

The Faceclaw-only capability surface, obtained with [getFaceclawExtensions](#getfaceclawextensions).
Everything here is in addition to the standard EvenHub SDK.

Calls that return a promise reject with an `Error` if the host fails to
carry them out.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-apiversion"></a> `apiVersion` | `readonly` | `number` | The extension API level the host implements. It is `1` for the API described here, and increases by one each time members are added. Members added later are documented with the level that introduced them, so an app can check for them before calling: `if (fc.apiVersion >= 2) fc.someNewerMethod();` |

#### Methods

##### getVersion()

```ts
getVersion(): string;
```

The host's name and version, for example `"Faceclaw/0.8.2"`. For display
and logging; use [FaceclawExtensions.apiVersion](#property-apiversion) for feature checks.

###### Returns

`string`

##### returnToAppSwitcher()

```ts
returnToAppSwitcher(): void;
```

Hand input focus back to Faceclaw's app switcher without closing the app,
which keeps running in the background.

###### Returns

`void`

##### quit()

```ts
quit(): void;
```

Close this app and tear down its window.

Faceclaw treats the stock `shutDownPageContainer(1)` as "return to the app
switcher", so apps that quit on double-tap stay alive. This method always
quits.

###### Returns

`void`

##### addWindowLifecycleListener()

```ts
addWindowLifecycleListener(listener): () => void;
```

Subscribe to window lifecycle changes (see [WindowLifecycleEventType](#windowlifecycleeventtype)).

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | (`event`) => `void` | Called on each transition. |

###### Returns

A function that unsubscribes `listener`.

() => `void`

##### getConfiguredApiKeys()

```ts
getConfiguredApiKeys(): Promise<ApiKeyService[]>;
```

List the services whose API keys the user has configured in Faceclaw. This
returns only the service names, never the keys, and doesn't prompt the user.
Use [FaceclawExtensions.requestApiKeyAccess](#requestapikeyaccess) to obtain the keys.

###### Returns

`Promise`\<[`ApiKeyService`](#apikeyservice)[]\>

##### requestApiKeyAccess()

```ts
requestApiKeyAccess(services): Promise<Partial<Record<ApiKeyService, string>>>;
```

Ask the user to share one or more configured API keys with this app. This
opens a consent prompt on the glasses, unless the user already granted
these services to this app earlier in the session.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `services` | [`ApiKeyService`](#apikeyservice)[] | The services whose keys the app wants. |

###### Returns

`Promise`\<`Partial`\<`Record`\<[`ApiKeyService`](#apikeyservice), `string`\>\>\>

A map from service to key, containing only the services that were
  both requested and configured. It is empty if the user declines.

##### playBuzzer()

```ts
playBuzzer(steps): Promise<void>;
```

Play a tone sequence on the glasses' piezo buzzer. Sequences longer than the
firmware's per-message limit of 48 steps are split and paced automatically.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `steps` | [`BuzzerStep`](#buzzerstep)[] |

###### Returns

`Promise`\<`void`\>

A promise that resolves once every part of the sequence has been
  queued on the glasses, which can be before it finishes playing.

##### addCompassListener()

```ts
addCompassListener(listener): () => void;
```

Turn on the glasses' magnetometer and receive heading samples. The sensor
stays on while at least one listener is registered, and readings are only
delivered while the app is the foreground window.

The magnetometer sits inside the right arm, which rests against the wearer's
head at an angle that differs between wearers (and between wears), so the
raw heading is only relative. See [CompassReading](#compassreading) for the corrected
headings and when to trust them.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | (`reading`) => `void` | Called with each sample. |

###### Returns

A function that unsubscribes `listener`.

() => `void`

##### createLayout()

```ts
createLayout(layout): Promise<boolean>;
```

Build the app's page from an extended layout. This is a superset of the
stock `createStartUpPageContainer`; see [FaceclawLayout](#faceclawlayout) for the
differences.

Unlike the stock call it may be called more than once. Once an app uses an
extended layout, its window stays at the full 576×452 size for the rest of
the session, including for later stock `rebuildPageContainer` calls.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `layout` | [`FaceclawLayout`](#faceclawlayout) |

###### Returns

`Promise`\<`boolean`\>

A promise that resolves to true on success.

##### replaceLayout()

```ts
replaceLayout(layout): Promise<boolean>;
```

Replace the current page with a new extended layout. This is a superset of
the stock `rebuildPageContainer`. Containers marked `preserve` inherit
their content from the same-named container in the outgoing layout.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `layout` | [`FaceclawLayout`](#faceclawlayout) |

###### Returns

`Promise`\<`boolean`\>

A promise that resolves to true on success.

##### setAssistantTools()

```ts
setAssistantTools(tools): void;
```

Declare the app's voice-assistant tools, replacing any set earlier. Each
tool's `handler` runs in the app when the assistant calls it.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tools` | [`AssistantTool`](#assistanttool)\<`any`\>[] | The tools to offer. Pass `[]` to remove them all. |

###### Returns

`void`

***

### getFaceclawExtensions()

```ts
function getFaceclawExtensions(): FaceclawExtensions | null;
```

Return the Faceclaw extension API if the app is running inside Faceclaw, or
`null` otherwise (in the stock Even app, a browser, a simulator, or Node).
Safe to call anywhere, at any time; Faceclaw installs the API before any page
script runs.

#### Returns

[`FaceclawExtensions`](#faceclawextensions) \| `null`

## Window lifecycle

### WindowLifecycleEventType

```ts
type WindowLifecycleEventType = "visible" | "hidden" | "focused" | "blurred";
```

A window lifecycle transition, delivered to
[FaceclawExtensions.addWindowLifecycleListener](#addwindowlifecyclelistener).

- `visible` / `hidden`: the app's glasses window became the shown surface, or
  stopped being it. This happens when the user switches the foreground window
  or the phone screen turns on or off. A hidden app keeps running (Faceclaw
  keeps its webview alive), but nothing it renders reaches the glasses.
- `focused` / `blurred`: input focus moved onto or off the app's window (for
  example, the user opened the app switcher). A blurred app can still be
  visible, but it doesn't receive taps or scrolls.

An app can assume it starts `visible` and `focused` at launch. Events report
changes from there.

***

### WindowLifecycleEvent

Payload of a [FaceclawExtensions.addWindowLifecycleListener](#addwindowlifecyclelistener) callback.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-type"></a> `type` | [`WindowLifecycleEventType`](#windowlifecycleeventtype) | Which transition happened. |

## API keys

### ApiKeyService

```ts
type ApiKeyService = "openai" | "anthropic" | "soniox" | "elevenlabs" | "mapbox";
```

Third-party services whose API keys the user may have configured in Faceclaw.

## Buzzer

### BuzzerStep

One step of a piezo-buzzer tone sequence. The G2 has a single monophonic PWM
buzzer, and the firmware plays a sequence's steps back to back on its own timer.

#### Properties

| Property | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-freq"></a> `freq` | `number` | `undefined` | Tone frequency in Hz. The piezo is loudest around 1–4 kHz and faint below about 150 Hz. |
| <a id="property-ms"></a> `ms` | `number` | `undefined` | Step duration in milliseconds (1–65535). |
| <a id="property-duty"></a> `duty?` | `number` | `50` | PWM duty cycle, 0–100. Use `duty: 0` for a rest (silence) lasting `ms`. |

## Compass

### CompassReading

A magnetometer heading sample from [FaceclawExtensions.addCompassListener](#addcompasslistener).
All headings are in degrees clockwise, in the range [0, 360).

Prefer `trueHeadingDegrees` when it is present, then `magneticHeadingDegrees`.
If `wearerCalibrated` is false, treat both as relative headings, or let the
user zero them.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-headingdegrees"></a> `headingDegrees` | `number` | Raw magnetic heading as reported by the glasses, with no correction for how they sit on the wearer's head. It is kept for apps that zero it themselves. |
| <a id="property-magneticheadingdegrees"></a> `magneticHeadingDegrees` | `number` | Magnetic heading corrected by the wearer's calibration offset from Faceclaw's Compass app. Equal to `headingDegrees` until the wearer calibrates. |
| <a id="property-wearercalibrated"></a> `wearerCalibrated` | `boolean` | Whether the wearer has calibrated the compass in Faceclaw's Compass app. Only trust `magneticHeadingDegrees` and `trueHeadingDegrees` as absolute headings when this is true. |
| <a id="property-declinationdegrees"></a> `declinationDegrees?` | `number` | Local magnetic declination in degrees (east positive), computed from the phone's location and the World Magnetic Model. Absent when Faceclaw has no location fix or no location permission. |
| <a id="property-trueheadingdegrees"></a> `trueHeadingDegrees?` | `number` | `magneticHeadingDegrees` plus declination. Absent when `declinationDegrees` is. |

## Extended layout

### FaceclawContainerCommon

Fields shared by every container in a [FaceclawLayout](#faceclawlayout). They match the
stock SDK's container-property classes, plus `preserve`.

As in the stock SDK every field is optional, so the stock
`TextContainerProperty`, `ImageContainerProperty` and `ListContainerProperty`
classes can be passed directly. In practice you should set `containerID`,
`containerName` and the geometry on every container.

#### Extended by

- [`FaceclawTextContainer`](#faceclawtextcontainer)
- [`FaceclawListContainer`](#faceclawlistcontainer)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-containerid"></a> `containerID?` | `number` | Container identity. Stock content updates (`textContainerUpgrade`, `updateImageRawData`) address containers by this ID. |
| <a id="property-containername"></a> `containerName?` | `string` | Container name. `preserve` matches containers across layouts by name. |
| <a id="property-xposition"></a> `xPosition?` | `number` | Left edge in pixels on the 576×452 canvas. |
| <a id="property-yposition"></a> `yPosition?` | `number` | Top edge in pixels on the 576×452 canvas. |
| <a id="property-width"></a> `width?` | `number` | Width in pixels. |
| <a id="property-height"></a> `height?` | `number` | Height in pixels. |
| <a id="property-zorderindex"></a> `zOrderIndex?` | `number` | Stacking order: higher values draw on top. |
| <a id="property-iseventcapture"></a> `isEventCapture?` | `number` \| `boolean` | When set to `1`/`true`, this container receives the app's tap and scroll events. Exactly one text or list container per layout should capture events. |
| <a id="property-preserve"></a> `preserve?` | `boolean` | When true, inherit content (text, image pixels, or list items and selection) from the container of the same kind and `containerName` in the previous layout. Otherwise the container starts blank. |

***

### FaceclawTextContainer

A text container. The fields match the stock SDK's `TextContainerProperty`, plus `preserve`.

#### Extends

- [`FaceclawContainerCommon`](#faceclawcontainercommon)

#### Properties

| Property | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-containerid-1"></a> `containerID?` | `number` | `undefined` | Container identity. Stock content updates (`textContainerUpgrade`, `updateImageRawData`) address containers by this ID. |
| <a id="property-containername-1"></a> `containerName?` | `string` | `undefined` | Container name. `preserve` matches containers across layouts by name. |
| <a id="property-xposition-1"></a> `xPosition?` | `number` | `undefined` | Left edge in pixels on the 576×452 canvas. |
| <a id="property-yposition-1"></a> `yPosition?` | `number` | `undefined` | Top edge in pixels on the 576×452 canvas. |
| <a id="property-width-1"></a> `width?` | `number` | `undefined` | Width in pixels. |
| <a id="property-height-1"></a> `height?` | `number` | `undefined` | Height in pixels. |
| <a id="property-zorderindex-1"></a> `zOrderIndex?` | `number` | `undefined` | Stacking order: higher values draw on top. |
| <a id="property-iseventcapture-1"></a> `isEventCapture?` | `number` \| `boolean` | `undefined` | When set to `1`/`true`, this container receives the app's tap and scroll events. Exactly one text or list container per layout should capture events. |
| <a id="property-preserve-1"></a> `preserve?` | `boolean` | `undefined` | When true, inherit content (text, image pixels, or list items and selection) from the container of the same kind and `containerName` in the previous layout. Otherwise the container starts blank. |
| <a id="property-content"></a> `content?` | `string` | `undefined` | Text to show. Update it later with the stock `textContainerUpgrade`. |
| <a id="property-textcolor"></a> `textColor?` | `number` | `4` | Text brightness level, 0–4. |
| <a id="property-borderwidth"></a> `borderWidth?` | `number` | `undefined` | Border width in pixels, 0–5. Wider values are clamped. |
| <a id="property-bordercolor"></a> `borderColor?` | `number` | `undefined` | Accepted for compatibility with stock payloads. Faceclaw currently ignores it. |
| <a id="property-borderradius"></a> `borderRadius?` | `number` | `undefined` | Border corner radius in pixels. |
| <a id="property-paddinglength"></a> `paddingLength?` | `number` | `undefined` | Padding between the border and the text, in pixels. |

***

### FaceclawImageContainer

```ts
type FaceclawImageContainer = FaceclawContainerCommon;
```

An image container. The fields match the stock SDK's `ImageContainerProperty`,
plus `preserve`.

In the extended layout an image container may be as large as the whole
576×452 canvas; the stock limit is 288×144. Push pixels with the stock
`updateImageRawData`, which in Faceclaw accepts PNG, uncompressed BMP, or raw
grayscale sized to the container (8 bits per pixel, or 4 bits per pixel packed
two to a byte, high nibble first).

***

### FaceclawListItems

The items of a [FaceclawListContainer](#faceclawlistcontainer). Matches the stock `ListItemContainerProperty`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-itemname"></a> `itemName?` | `string`[] | Item labels, in display order. |
| <a id="property-itemcount"></a> `itemCount?` | `number` | Accepted for compatibility with stock payloads. The length of `itemName` is used instead. |
| <a id="property-itemwidth"></a> `itemWidth?` | `number` | Fixed width of each item's selection outline in pixels. `0` (the default) hugs the text. |
| <a id="property-isitemselectborderen"></a> `isItemSelectBorderEn?` | `number` \| `boolean` | Whether the selected item is outlined. |

***

### FaceclawListContainer

A list container. The fields match the stock SDK's `ListContainerProperty`, plus `preserve`.

#### Extends

- [`FaceclawContainerCommon`](#faceclawcontainercommon)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-containerid-2"></a> `containerID?` | `number` | Container identity. Stock content updates (`textContainerUpgrade`, `updateImageRawData`) address containers by this ID. |
| <a id="property-containername-2"></a> `containerName?` | `string` | Container name. `preserve` matches containers across layouts by name. |
| <a id="property-xposition-2"></a> `xPosition?` | `number` | Left edge in pixels on the 576×452 canvas. |
| <a id="property-yposition-2"></a> `yPosition?` | `number` | Top edge in pixels on the 576×452 canvas. |
| <a id="property-width-2"></a> `width?` | `number` | Width in pixels. |
| <a id="property-height-2"></a> `height?` | `number` | Height in pixels. |
| <a id="property-zorderindex-2"></a> `zOrderIndex?` | `number` | Stacking order: higher values draw on top. |
| <a id="property-iseventcapture-2"></a> `isEventCapture?` | `number` \| `boolean` | When set to `1`/`true`, this container receives the app's tap and scroll events. Exactly one text or list container per layout should capture events. |
| <a id="property-preserve-2"></a> `preserve?` | `boolean` | When true, inherit content (text, image pixels, or list items and selection) from the container of the same kind and `containerName` in the previous layout. Otherwise the container starts blank. |
| <a id="property-itemcontainer"></a> `itemContainer?` | [`FaceclawListItems`](#faceclawlistitems) | The list's items and selection style. |
| <a id="property-borderwidth-1"></a> `borderWidth?` | `number` | Border width in pixels, 0–5. Wider values are clamped. |
| <a id="property-bordercolor-1"></a> `borderColor?` | `number` | Accepted for compatibility with stock payloads. Faceclaw currently ignores it. |
| <a id="property-borderradius-1"></a> `borderRadius?` | `number` | Border corner radius in pixels. |
| <a id="property-paddinglength-1"></a> `paddingLength?` | `number` | Padding between the border and the items, in pixels. |

***

### FaceclawMenu

The page's contextual menu. Matches the stock SDK's `MenuContainerProperty`,
with the same limits: at most 10 items, each `itemID` a unique non-zero
uint32, and each `itemName` at most 32 UTF-8 bytes. Selections arrive as the
stock `menuItemClickEvent`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-menuitems"></a> `menuItems?` | `object`[] | Menu entries, in display order. |

***

### FaceclawLayout

A page layout for [FaceclawExtensions.createLayout](#createlayout) and
[FaceclawExtensions.replaceLayout](#replacelayout).

It has the same shape as the stock `CreateStartUpPageContainer` /
`RebuildPageContainer`, so you can build it with the stock SDK's container
classes, with three differences:

- The canvas is the full 576×452 app area instead of 576×288, so image
  containers may be up to 576×452.
- There is no limit on the number of containers.
- Each container may set `preserve: true` to inherit its content from the
  same-named container in the previous layout.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-textobject"></a> `textObject?` | [`FaceclawTextContainer`](#faceclawtextcontainer)[] | Text containers. |
| <a id="property-imageobject"></a> `imageObject?` | [`FaceclawContainerCommon`](#faceclawcontainercommon)[] | Image containers. |
| <a id="property-listobject"></a> `listObject?` | [`FaceclawListContainer`](#faceclawlistcontainer)[] | List containers. |
| <a id="property-menuobject"></a> `menuObject?` | [`FaceclawMenu`](#faceclawmenu) | The page's contextual menu. Omit it to clear any previous menu. |
| <a id="property-containertotalnum"></a> `containerTotalNum?` | `number` | Accepted for compatibility with stock payloads and ignored: there is no container limit. |

## Assistant tools

### JsonSchema

```ts
type JsonSchema = Record<string, unknown>;
```

A JSON Schema object describing a tool's arguments.

***

### AssistantTool

A tool the app contributes to Faceclaw's voice assistant, for use with
[FaceclawExtensions.setAssistantTools](#setassistanttools).

The assistant sees the tool namespaced by the app's package name, as
`app.<packageName>.<name>`. `name` here is the bare name without that prefix.

#### Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| `Args` | `any` | The arguments object the assistant passes to `handler`, as described by `parameters`. |

#### Properties

| Property | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `string` | `undefined` | Bare tool name (no package prefix), for example `"set_color"`. |
| <a id="property-description"></a> `description` | `string` | `undefined` | What the tool does. The assistant reads this to decide when to call it. |
| <a id="property-parameters"></a> `parameters?` | [`JsonSchema`](#jsonschema) | `{ type: "object", properties: {} }` | JSON Schema for the arguments object the assistant will pass to `handler`. |
| <a id="property-availability"></a> `availability?` | `"open"` \| `"foreground"` | `"foreground"` | When the tool can be called: `"foreground"` only while the app owns the visible window, or `"open"` any time the app is running, including in the background. |
| <a id="property-handler"></a> `handler` | (`args`) => `unknown` | `undefined` | Called when the assistant invokes the tool. Return a string, or any JSON-serializable value, to report back to the assistant. Throw (or reject) to report an error. May be async. |
