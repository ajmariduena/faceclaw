/**
 * Types and a small helper for the Faceclaw extension API.
 *
 * [Faceclaw](https://github.com/jimrandomh/faceclaw) is an alternative host for
 * EvenHub apps: it runs them on the Even Realities G2 glasses without the stock
 * Even app. An app built against the standard `@evenrealities/even_hub_sdk`
 * runs unchanged. This package lets such an app detect that it is running
 * inside Faceclaw and use a few extra, Faceclaw-only capabilities.
 *
 * The only entry point is the injected global `window.getFaceclawExtensions`,
 * which is a function inside Faceclaw and `undefined` in the stock Even app and
 * every other host. Nothing on the standard SDK, on `window`, or on any built-in
 * prototype is modified, so an app that uses these extensions still runs
 * everywhere else; it just skips the extras.
 *
 * @example
 * ```ts
 * import { getFaceclawExtensions } from "@faceclaw/evenhub-extensions";
 *
 * const fc = getFaceclawExtensions();
 * if (fc) {
 *   console.log("Running in", fc.getVersion()); // "Faceclaw/0.8.2"
 *   fc.addWindowLifecycleListener((e) => {
 *     if (e.type === "hidden") pauseExpensiveWork();
 *   });
 * }
 * ```
 *
 * @packageDocumentation
 */

/**
 * Third-party services whose API keys the user may have configured in Faceclaw.
 *
 * @group API keys
 */
export type ApiKeyService = "openai" | "anthropic" | "soniox" | "elevenlabs" | "mapbox";

/**
 * One step of a piezo-buzzer tone sequence. The G2 has a single monophonic PWM
 * buzzer, and the firmware plays a sequence's steps back to back on its own timer.
 *
 * @group Buzzer
 */
export interface BuzzerStep {
  /** Tone frequency in Hz. The piezo is loudest around 1–4 kHz and faint below about 150 Hz. */
  freq: number;
  /** Step duration in milliseconds (1–65535). */
  ms: number;
  /**
   * PWM duty cycle, 0–100. Use `duty: 0` for a rest (silence) lasting `ms`.
   * @defaultValue 50
   */
  duty?: number;
}

/**
 * A window lifecycle transition, delivered to
 * {@link FaceclawExtensions.addWindowLifecycleListener}.
 *
 * - `visible` / `hidden`: the app's glasses window became the shown surface, or
 *   stopped being it. This happens when the user switches the foreground window
 *   or the phone screen turns on or off. A hidden app keeps running (Faceclaw
 *   keeps its webview alive), but nothing it renders reaches the glasses.
 * - `focused` / `blurred`: input focus moved onto or off the app's window (for
 *   example, the user opened the app switcher). A blurred app can still be
 *   visible, but it doesn't receive taps or scrolls.
 *
 * An app can assume it starts `visible` and `focused` at launch. Events report
 * changes from there.
 *
 * @group Window lifecycle
 */
export type WindowLifecycleEventType = "visible" | "hidden" | "focused" | "blurred";

/**
 * Payload of a {@link FaceclawExtensions.addWindowLifecycleListener} callback.
 *
 * @group Window lifecycle
 */
export interface WindowLifecycleEvent {
  /** Which transition happened. */
  type: WindowLifecycleEventType;
}

/**
 * A magnetometer heading sample from {@link FaceclawExtensions.addCompassListener}.
 * All headings are in degrees clockwise, in the range [0, 360).
 *
 * Prefer `trueHeadingDegrees` when it is present, then `magneticHeadingDegrees`.
 * If `wearerCalibrated` is false, treat both as relative headings, or let the
 * user zero them.
 *
 * @group Compass
 */
export interface CompassReading {
  /**
   * Raw magnetic heading as reported by the glasses, with no correction for how
   * they sit on the wearer's head. It is kept for apps that zero it themselves.
   */
  headingDegrees: number;
  /**
   * Magnetic heading corrected by the wearer's calibration offset from
   * Faceclaw's Compass app. Equal to `headingDegrees` until the wearer calibrates.
   */
  magneticHeadingDegrees: number;
  /**
   * Whether the wearer has calibrated the compass in Faceclaw's Compass app.
   * Only trust `magneticHeadingDegrees` and `trueHeadingDegrees` as absolute
   * headings when this is true.
   */
  wearerCalibrated: boolean;
  /**
   * Local magnetic declination in degrees (east positive), computed from the
   * phone's location and the World Magnetic Model. Absent when Faceclaw has no
   * location fix or no location permission.
   */
  declinationDegrees?: number;
  /** `magneticHeadingDegrees` plus declination. Absent when `declinationDegrees` is. */
  trueHeadingDegrees?: number;
}

// ---- Extended layout (a superset of the stock EvenHub page containers) ----

/**
 * Fields shared by every container in a {@link FaceclawLayout}. They match the
 * stock SDK's container-property classes, plus `preserve`.
 *
 * As in the stock SDK every field is optional, so the stock
 * `TextContainerProperty`, `ImageContainerProperty` and `ListContainerProperty`
 * classes can be passed directly. In practice you should set `containerID`,
 * `containerName` and the geometry on every container.
 *
 * @group Extended layout
 */
export interface FaceclawContainerCommon {
  /**
   * Container identity. Stock content updates (`textContainerUpgrade`,
   * `updateImageRawData`) address containers by this ID.
   */
  containerID?: number;
  /** Container name. `preserve` matches containers across layouts by name. */
  containerName?: string;
  /** Left edge in pixels on the 576×452 canvas. */
  xPosition?: number;
  /** Top edge in pixels on the 576×452 canvas. */
  yPosition?: number;
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** Stacking order: higher values draw on top. */
  zOrderIndex?: number;
  /**
   * When set to `1`/`true`, this container receives the app's tap and scroll
   * events. Exactly one text or list container per layout should capture events.
   */
  isEventCapture?: number | boolean;
  /**
   * When true, inherit content (text, image pixels, or list items and selection)
   * from the container of the same kind and `containerName` in the previous
   * layout. Otherwise the container starts blank.
   */
  preserve?: boolean;
}

/**
 * A text container. The fields match the stock SDK's `TextContainerProperty`, plus `preserve`.
 *
 * @group Extended layout
 */
export interface FaceclawTextContainer extends FaceclawContainerCommon {
  /** Text to show. Update it later with the stock `textContainerUpgrade`. */
  content?: string;
  /**
   * Text brightness level, 0–4.
   * @defaultValue 4
   */
  textColor?: number;
  /** Border width in pixels, 0–5. Wider values are clamped. */
  borderWidth?: number;
  /** Accepted for compatibility with stock payloads. Faceclaw currently ignores it. */
  borderColor?: number;
  /** Border corner radius in pixels. */
  borderRadius?: number;
  /** Padding between the border and the text, in pixels. */
  paddingLength?: number;
}

/**
 * An image container. The fields match the stock SDK's `ImageContainerProperty`,
 * plus `preserve`.
 *
 * In the extended layout an image container may be as large as the whole
 * 576×452 canvas; the stock limit is 288×144. Push pixels with the stock
 * `updateImageRawData`, which in Faceclaw accepts PNG, uncompressed BMP, or raw
 * grayscale sized to the container (8 bits per pixel, or 4 bits per pixel packed
 * two to a byte, high nibble first).
 *
 * @group Extended layout
 */
export type FaceclawImageContainer = FaceclawContainerCommon;

/**
 * The items of a {@link FaceclawListContainer}. Matches the stock `ListItemContainerProperty`.
 *
 * @group Extended layout
 */
export interface FaceclawListItems {
  /** Item labels, in display order. */
  itemName?: string[];
  /** Accepted for compatibility with stock payloads. The length of `itemName` is used instead. */
  itemCount?: number;
  /** Fixed width of each item's selection outline in pixels. `0` (the default) hugs the text. */
  itemWidth?: number;
  /** Whether the selected item is outlined. */
  isItemSelectBorderEn?: number | boolean;
}

/**
 * A list container. The fields match the stock SDK's `ListContainerProperty`, plus `preserve`.
 *
 * @group Extended layout
 */
export interface FaceclawListContainer extends FaceclawContainerCommon {
  /** The list's items and selection style. */
  itemContainer?: FaceclawListItems;
  /** Border width in pixels, 0–5. Wider values are clamped. */
  borderWidth?: number;
  /** Accepted for compatibility with stock payloads. Faceclaw currently ignores it. */
  borderColor?: number;
  /** Border corner radius in pixels. */
  borderRadius?: number;
  /** Padding between the border and the items, in pixels. */
  paddingLength?: number;
}

/**
 * The page's contextual menu. Matches the stock SDK's `MenuContainerProperty`,
 * with the same limits: at most 10 items, each `itemID` a unique non-zero
 * uint32, and each `itemName` at most 32 UTF-8 bytes. Selections arrive as the
 * stock `menuItemClickEvent`.
 *
 * @group Extended layout
 */
export interface FaceclawMenu {
  /** Menu entries, in display order. */
  menuItems?: { itemName?: string; itemID?: number }[];
}

/**
 * A page layout for {@link FaceclawExtensions.createLayout} and
 * {@link FaceclawExtensions.replaceLayout}.
 *
 * It has the same shape as the stock `CreateStartUpPageContainer` /
 * `RebuildPageContainer`, so you can build it with the stock SDK's container
 * classes, with three differences:
 *
 * - The canvas is the full 576×452 app area instead of 576×288, so image
 *   containers may be up to 576×452.
 * - There is no limit on the number of containers.
 * - Each container may set `preserve: true` to inherit its content from the
 *   same-named container in the previous layout.
 *
 * @group Extended layout
 */
export interface FaceclawLayout {
  /** Text containers. */
  textObject?: FaceclawTextContainer[];
  /** Image containers. */
  imageObject?: FaceclawImageContainer[];
  /** List containers. */
  listObject?: FaceclawListContainer[];
  /** The page's contextual menu. Omit it to clear any previous menu. */
  menuObject?: FaceclawMenu;
  /** Accepted for compatibility with stock payloads and ignored: there is no container limit. */
  containerTotalNum?: number;
}

// ---- Voice-assistant tools ----

/**
 * A JSON Schema object describing a tool's arguments.
 *
 * @group Assistant tools
 */
export type JsonSchema = Record<string, unknown>;

/**
 * A tool the app contributes to Faceclaw's voice assistant, for use with
 * {@link FaceclawExtensions.setAssistantTools}.
 *
 * The assistant sees the tool namespaced by the app's package name, as
 * `app.<packageName>.<name>`. `name` here is the bare name without that prefix.
 *
 * @typeParam Args - The arguments object the assistant passes to `handler`,
 *   as described by `parameters`.
 *
 * @group Assistant tools
 */
export interface AssistantTool<Args = any> {
  /** Bare tool name (no package prefix), for example `"set_color"`. */
  name: string;
  /** What the tool does. The assistant reads this to decide when to call it. */
  description: string;
  /**
   * JSON Schema for the arguments object the assistant will pass to `handler`.
   * @defaultValue { type: "object", properties: {} }
   */
  parameters?: JsonSchema;
  /**
   * When the tool can be called: `"foreground"` only while the app owns the
   * visible window, or `"open"` any time the app is running, including in the
   * background.
   * @defaultValue "foreground"
   */
  availability?: "open" | "foreground";
  /**
   * Called when the assistant invokes the tool. Return a string, or any
   * JSON-serializable value, to report back to the assistant. Throw (or reject)
   * to report an error. May be async.
   */
  handler: (args: Args) => unknown;
}

/**
 * The Faceclaw-only capability surface, obtained with {@link getFaceclawExtensions}.
 * Everything here is in addition to the standard EvenHub SDK.
 *
 * Calls that return a promise reject with an `Error` if the host fails to
 * carry them out.
 *
 * @group Entry point
 */
export interface FaceclawExtensions {
  /**
   * The extension API level the host implements. It is `1` for the API
   * described here, and increases by one each time members are added. Members
   * added later are documented with the level that introduced them, so an app
   * can check for them before calling:
   *
   * ```ts
   * if (fc.apiVersion >= 2) fc.someNewerMethod();
   * ```
   */
  readonly apiVersion: number;

  /**
   * The host's name and version, for example `"Faceclaw/0.8.2"`. For display
   * and logging; use {@link FaceclawExtensions.apiVersion} for feature checks.
   */
  getVersion(): string;

  /**
   * Hand input focus back to Faceclaw's app switcher without closing the app,
   * which keeps running in the background.
   */
  returnToAppSwitcher(): void;

  /**
   * Close this app and tear down its window.
   *
   * Faceclaw treats the stock `shutDownPageContainer(1)` as "return to the app
   * switcher", so apps that quit on double-tap stay alive. This method always
   * quits.
   */
  quit(): void;

  /**
   * Subscribe to window lifecycle changes (see {@link WindowLifecycleEventType}).
   *
   * @param listener - Called on each transition.
   * @returns A function that unsubscribes `listener`.
   */
  addWindowLifecycleListener(listener: (event: WindowLifecycleEvent) => void): () => void;

  /**
   * List the services whose API keys the user has configured in Faceclaw. This
   * returns only the service names, never the keys, and doesn't prompt the user.
   * Use {@link FaceclawExtensions.requestApiKeyAccess} to obtain the keys.
   */
  getConfiguredApiKeys(): Promise<ApiKeyService[]>;

  /**
   * Ask the user to share one or more configured API keys with this app. This
   * opens a consent prompt on the glasses, unless the user already granted
   * these services to this app earlier in the session.
   *
   * @param services - The services whose keys the app wants.
   * @returns A map from service to key, containing only the services that were
   *   both requested and configured. It is empty if the user declines.
   */
  requestApiKeyAccess(services: ApiKeyService[]): Promise<Partial<Record<ApiKeyService, string>>>;

  /**
   * Play a tone sequence on the glasses' piezo buzzer. Sequences longer than the
   * firmware's per-message limit of 48 steps are split and paced automatically.
   *
   * @returns A promise that resolves once every part of the sequence has been
   *   queued on the glasses, which can be before it finishes playing.
   */
  playBuzzer(steps: BuzzerStep[]): Promise<void>;

  /**
   * Turn on the glasses' magnetometer and receive heading samples. The sensor
   * stays on while at least one listener is registered, and readings are only
   * delivered while the app is the foreground window.
   *
   * The magnetometer sits inside the right arm, which rests against the wearer's
   * head at an angle that differs between wearers (and between wears), so the
   * raw heading is only relative. See {@link CompassReading} for the corrected
   * headings and when to trust them.
   *
   * @param listener - Called with each sample.
   * @returns A function that unsubscribes `listener`.
   */
  addCompassListener(listener: (reading: CompassReading) => void): () => void;

  /**
   * Build the app's page from an extended layout. This is a superset of the
   * stock `createStartUpPageContainer`; see {@link FaceclawLayout} for the
   * differences.
   *
   * Unlike the stock call it may be called more than once. Once an app uses an
   * extended layout, its window stays at the full 576×452 size for the rest of
   * the session, including for later stock `rebuildPageContainer` calls.
   *
   * @returns A promise that resolves to true on success.
   */
  createLayout(layout: FaceclawLayout): Promise<boolean>;

  /**
   * Replace the current page with a new extended layout. This is a superset of
   * the stock `rebuildPageContainer`. Containers marked `preserve` inherit
   * their content from the same-named container in the outgoing layout.
   *
   * @returns A promise that resolves to true on success.
   */
  replaceLayout(layout: FaceclawLayout): Promise<boolean>;

  /**
   * Declare the app's voice-assistant tools, replacing any set earlier. Each
   * tool's `handler` runs in the app when the assistant calls it.
   *
   * @param tools - The tools to offer. Pass `[]` to remove them all.
   */
  setAssistantTools(tools: AssistantTool[]): void;
}

declare global {
  interface Window {
    /**
     * Injected by Faceclaw before any page script runs. `undefined` in the
     * stock Even app and other hosts. Prefer {@link getFaceclawExtensions},
     * which checks for it.
     */
    getFaceclawExtensions?: (() => FaceclawExtensions) | null;
  }
}

/**
 * Return the Faceclaw extension API if the app is running inside Faceclaw, or
 * `null` otherwise (in the stock Even app, a browser, a simulator, or Node).
 * Safe to call anywhere, at any time; Faceclaw installs the API before any page
 * script runs.
 *
 * @group Entry point
 */
export function getFaceclawExtensions(): FaceclawExtensions | null {
  const getter = typeof window !== "undefined" ? window.getFaceclawExtensions : null;
  return typeof getter === "function" ? getter() : null;
}
