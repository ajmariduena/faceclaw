import { Dialogs, Frame, Observable, type NavigatedData, type Page } from "@nativescript/core";
import * as settings from "../ui/dashboard-settings";
import { getStringSetting, setStringSetting } from "../native/settings-store";
import { API_SERVICES, apiStatusKey, resetApiStatus, statusText, type ApiService, type ApiKeyStatus } from "../ui/api-key-status";
import { loadPairing, savePairing, PASEO_PAIRING_KEY } from "../apps/paseo/paseo-store";
import { parsePairingInput } from "../apps/paseo/paseo-pairing";
import { testApiKey } from "./api-key-tests";
import { editText, group, row, type SettingGroup, type SettingRow } from "./settings-rows";

type Definition = { service: ApiService; label: string; group: string; setting: settings.ConfigSettingString; advanced?: boolean };

const definitions: Definition[] = [
  { service: "paseo", label: "Pairing link", group: "Paseo", setting: settings.paseoPairingLinkSetting },
  { service: "cursor", label: "Cursor", group: "Grok Bot", setting: settings.cursorApiKeySetting },
  { service: "soniox", label: "Soniox", group: "Listening · Translate, Converse", setting: settings.sonioxApiKeySetting },
  { service: "typesafe", label: "Jev (TypeSafe)", group: "Facts · Converse", setting: settings.typesafeApiKeySetting },
  { service: "cerebras", label: "Cerebras", group: "Facts · Converse", setting: settings.cerebrasApiKeySetting },
  { service: "openrouter", label: "OpenRouter", group: "Facts", setting: settings.openRouterApiKeySetting },
  { service: "perplexity", label: "Perplexity", group: "Search · Converse", setting: settings.perplexityApiKeySetting },
  { service: "brave", label: "Brave (fallback)", group: "Search · Converse", setting: settings.braveApiKeySetting },
  { service: "google", label: "Google Maps", group: "Navigate", setting: settings.googleMapsApiKeySetting },
  ...([
    ["parallel", "Parallel", settings.parallelApiKeySetting], ["anthropic", "Anthropic", settings.anthropicApiKeySetting],
    ["openai", "OpenAI", settings.openAiApiKeySetting],
    ["mapbox", "Mapbox", settings.mapboxApiKeySetting], ["elevenlabs", "ElevenLabs", settings.elevenLabsApiKeySetting],
  ] as const).map(([service, label, setting]) => ({ service, label, setting, group: "Advanced", advanced: true })),
];

const MASK = "••••••••";

class ApiKey {
  readonly row: SettingRow;
  private testing = false;
  private revision = 0;
  private detail = "";
  constructor(readonly definition: Definition, visible: () => boolean) {
    this.row = row({ label: definition.label, value: () => this.value, sublabel: () => this.status, visible, onTap: () => this.onTap() });
  }
  private get key(): string { return this.definition.setting.get(); }
  private get paired(): boolean { return this.definition.service === "paseo" && Boolean(loadPairing()); }
  private get value(): string { return this.key.trim() ? MASK : this.paired ? "Paired" : "Not set"; }
  private get testLabel(): string { return this.definition.service === "paseo" ? "Test connection" : "Test"; }
  private get status(): string {
    if (this.testing) return "Testing…";
    let status: ApiKeyStatus;
    try { status = JSON.parse(getStringSetting(apiStatusKey(this.definition.service), "")); } catch { status = resetApiStatus(this.present()); }
    if (!status || !["ok", "failed", "missing", "untested"].includes(status.state)) status = resetApiStatus(this.present());
    if (status.state === "missing") return "";
    return [this.detail, statusText(status)].filter(Boolean).join(" · ");
  }
  private present(): boolean { return this.definition.service === "paseo" ? Boolean(loadPairing()) : Boolean(this.key.trim()); }
  private set(value: string): void {
    if (value === this.key) return;
    ++this.revision; this.detail = ""; this.definition.setting.set(value);
  }
  private async onTap(): Promise<void> {
    if (this.testing) return;
    if (!this.key.trim() && !this.paired) { await this.edit(); return; }
    const actions = [this.testLabel, "Change…", ...(this.key.trim() ? ["Remove"] : [])];
    const picked = await Dialogs.action({ title: this.definition.label, cancelButtonText: "Cancel", actions });
    if (picked === this.testLabel) await this.test();
    else if (picked === "Change…") await this.edit();
    else if (picked === "Remove") this.set("");
  }
  // Empty defaultText: the stored key never enters an editable field; pasting replaces it outright.
  private async edit(): Promise<void> {
    const result = await Dialogs.prompt({
      title: this.definition.label, defaultText: "", okButtonText: "Save", cancelButtonText: "Cancel",
      inputType: this.definition.setting.inputKind === "password" ? "password" : "text",
    });
    if (!result.result || !result.text.trim()) return;
    this.set(result.text);
    await this.test();
  }
  async test(): Promise<void> {
    if (this.testing) return;
    const revision = this.revision;
    if (this.definition.service === "paseo" && this.key.trim()) {
      const parsed = parsePairingInput(this.key);
      if (!parsed.ok) {
        this.detail = "";
        setStringSetting(apiStatusKey("paseo"), JSON.stringify({ state: "failed", at: Date.now(), ms: 0, error: "Invalid pairing link" }));
        this.row.refresh(); return;
      }
      savePairing(parsed.pairing); this.definition.setting.set("");
    }
    const value = this.key;
    const pairing = getStringSetting(PASEO_PAIRING_KEY, "");
    this.testing = true; this.row.refresh();
    try {
      const result = await testApiKey(this.definition.service, value);
      if (revision !== this.revision || value !== this.key || pairing !== getStringSetting(PASEO_PAIRING_KEY, "")) return;
      setStringSetting(apiStatusKey(this.definition.service), JSON.stringify(result.status));
      this.detail = result.detail ?? "";
    } finally { this.testing = false; this.row.refresh(); }
  }
}

class ApiKeysViewModel extends Observable {
  advanced = false;
  testing = false;
  private readonly keys = definitions.map(d => new ApiKey(d, () => this.advanced || !d.advanced));
  readonly groups: SettingGroup[];
  constructor() {
    super();
    const rowsByGroup = new Map<string, SettingRow[]>();
    for (const key of this.keys) rowsByGroup.set(key.definition.group, [...(rowsByGroup.get(key.definition.group) ?? []), key.row]);
    const advanced = () => this.advanced;
    rowsByGroup.get("Advanced")!.push(row({
      label: settings.grokBotNamesSetting.label, visible: advanced,
      value: () => settings.grokBotNamesSetting.displayValue() || "Not set",
      onTap: () => editText(settings.grokBotNamesSetting, settings.grokBotNamesSetting.label),
    }));
    const groups = [...rowsByGroup].map(([title, rows]) => group(title, rows));
    const toggle = group("", [row({ label: "Advanced", checked: advanced, onCheckedChange: on => { this.advanced = on; this.refresh(); } })]);
    groups.splice(groups.length - 1, 0, toggle);
    this.groups = groups;
  }
  get testAllLabel(): string { return this.testing ? "Testing…" : "Test all"; }
  onBackTap(): void { Frame.topmost()?.goBack(); }
  refresh(): void { for (const g of this.groups) g.refresh(); }
  async testAll(): Promise<void> {
    if (this.testing) return;
    this.testing = true; this.notifyPropertyChange("testAllLabel", this.testAllLabel);
    try { for (const service of API_SERVICES) await this.keys.find(key => key.definition.service === service)!.test(); }
    finally { this.testing = false; this.notifyPropertyChange("testAllLabel", this.testAllLabel); }
  }
}
export function navigatingTo(args: NavigatedData): void { (args.object as Page).bindingContext = new ApiKeysViewModel(); }
