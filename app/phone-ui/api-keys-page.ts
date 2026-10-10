import { Observable, ObservableArray, type NavigatedData, type Page } from "@nativescript/core";
import * as settings from "../ui/dashboard-settings";
import { getStringSetting, setStringSetting } from "../native/settings-store";
import { API_SERVICES, apiStatusKey, resetApiStatus, statusText, type ApiService, type ApiKeyStatus } from "../ui/api-key-status";
import { loadPairing, savePairing, PASEO_PAIRING_KEY } from "../apps/paseo/paseo-store";
import { parsePairingInput } from "../apps/paseo/paseo-pairing";
import { testApiKey } from "./api-key-tests";

const definitions: { service: ApiService; label: string; group: string; setting: settings.ConfigSettingString; advanced?: boolean }[] = [
  { service: "paseo", label: "Pairing link", group: "Paseo", setting: settings.paseoPairingLinkSetting },
  { service: "soniox", label: "Soniox", group: "Listening · Translate, Converse", setting: settings.sonioxApiKeySetting },
  { service: "openrouter", label: "OpenRouter", group: "Facts & AI Chat", setting: settings.openRouterApiKeySetting },
  { service: "parallel", label: "Parallel", group: "Search · Converse", setting: settings.parallelApiKeySetting },
  ...([
    ["cerebras", "Cerebras direct", settings.cerebrasApiKeySetting], ["anthropic", "Anthropic", settings.anthropicApiKeySetting],
    ["openai", "OpenAI", settings.openAiApiKeySetting], ["brave", "Brave", settings.braveApiKeySetting],
    ["mapbox", "Mapbox", settings.mapboxApiKeySetting], ["elevenlabs", "ElevenLabs", settings.elevenLabsApiKeySetting],
  ] as const).map(([service, label, setting]) => ({ service, label, setting, group: "Advanced", advanced: true })),
];

class ApiKeyRow extends Observable {
  testing = false;
  private revision = 0;
  private detail = "";
  constructor(readonly definition: typeof definitions[number]) { super(); }
  get label(): string { return this.definition.label; }
  get group(): string { return this.definition.group; }
  get value(): string { return this.definition.setting.get(); }
  set value(value: string) {
    if (value === this.value) return;
    ++this.revision; this.detail = ""; this.definition.setting.set(value); this.notifyPropertyChange("status", this.status);
  }
  get testLabel(): string { return this.definition.service === "paseo" ? "Test connection" : "Test"; }
  get placeholder(): string { return this.definition.service === "paseo" && loadPairing() ? "Paired" : "Not set"; }
  get enabled(): boolean { return !this.testing; }
  get status(): string {
    let status: ApiKeyStatus;
    try { status = JSON.parse(getStringSetting(apiStatusKey(this.definition.service), "")); } catch { status = resetApiStatus(this.present()); }
    if (!status || !["ok", "failed", "missing", "untested"].includes(status.state)) status = resetApiStatus(this.present());
    return [this.detail, statusText(status)].filter(Boolean).join(" · ");
  }
  private present(): boolean { return this.definition.service === "paseo" ? Boolean(loadPairing()) : Boolean(this.value.trim()); }
  onEdit(args: { object: { text: string } }): void {
    this.value = args.object.text;
  }
  async onTest(): Promise<void> {
    if (this.testing) return;
    const revision = this.revision;
    if (this.definition.service === "paseo" && this.value.trim()) {
      const parsed = parsePairingInput(this.value);
      if (!parsed.ok) {
        this.detail = "";
        setStringSetting(apiStatusKey("paseo"), JSON.stringify({ state: "failed", at: Date.now(), ms: 0, error: "Invalid pairing link" }));
        this.notifyPropertyChange("status", this.status); return;
      }
      savePairing(parsed.pairing); this.definition.setting.set(""); this.notifyPropertyChange("value", "");
    }
    const value = this.value;
    const pairing = getStringSetting(PASEO_PAIRING_KEY, "");
    this.testing = true; this.notifyPropertyChange("enabled", false); this.notifyPropertyChange("status", "Testing…");
    try {
      const result = await testApiKey(this.definition.service, value);
      if (revision !== this.revision || value !== this.value || pairing !== getStringSetting(PASEO_PAIRING_KEY, "")) return;
      setStringSetting(apiStatusKey(this.definition.service), JSON.stringify(result.status));
      this.detail = result.detail ?? "";
      this.notifyPropertyChange("status", this.status);
      this.notifyPropertyChange("placeholder", this.placeholder);
    } finally { this.testing = false; this.notifyPropertyChange("enabled", true); }
  }
}
class ApiKeysViewModel extends Observable {
  readonly allRows = definitions.map(d => new ApiKeyRow(d));
  readonly rows = new ObservableArray(this.allRows.filter(row => !row.definition.advanced));
  advanced = false;
  testing = false;
  get testAllEnabled(): boolean { return !this.testing; }
  get advancedLabel(): string { return this.advanced ? "Advanced ▴" : "Advanced ▾"; }
  toggleAdvanced(): void {
    this.advanced = !this.advanced;
    this.rows.splice(0, this.rows.length, ...this.allRows.filter(row => this.advanced || !row.definition.advanced));
    this.notifyPropertyChange("advancedLabel", this.advancedLabel);
  }
  async testAll(): Promise<void> {
    if (this.testing) return;
    this.testing = true; this.notifyPropertyChange("testAllEnabled", false);
    try { for (const service of API_SERVICES) await this.allRows.find(row => row.definition.service === service)!.onTest(); }
    finally { this.testing = false; this.notifyPropertyChange("testAllEnabled", true); }
  }
}
export function navigatingTo(args: NavigatedData): void { (args.object as Page).bindingContext = new ApiKeysViewModel(); }
