import { Dialogs, Observable } from "@nativescript/core";
import type { ConfigSettingBoolean, ConfigSettingEnum, ConfigSettingString } from "../ui/dashboard-settings";

type Visibility = "visible" | "collapse";

export type RowSpec = {
  label: string | (() => string);
  sublabel?: () => string;
  value?: () => string;
  checked?: () => boolean;
  onCheckedChange?: (checked: boolean) => void;
  onTap?: () => void | Promise<void>;
  chevron?: boolean;
  slider?: { min: number; max: number; value: () => number; enabled: () => boolean; onChange: (value: number) => void };
  segments?: { labels: string[]; selected: () => number; onSelect: (index: number) => void };
  visible?: () => boolean;
};

export class SettingRow extends Observable {
  first = false;

  constructor(private readonly spec: RowSpec) {
    super();
  }

  get rowClass(): string {
    return this.first ? "fc-row fc-row-first" : "fc-row";
  }

  get rowVisibility(): Visibility {
    return this.isVisible() ? "visible" : "collapse";
  }

  isVisible(): boolean {
    return this.spec.visible?.() ?? true;
  }

  get label(): string {
    return typeof this.spec.label === "function" ? this.spec.label() : this.spec.label;
  }

  get sublabel(): string {
    return this.spec.sublabel?.() ?? "";
  }

  get sublabelVisibility(): Visibility {
    return this.sublabel ? "visible" : "collapse";
  }

  get value(): string {
    return this.spec.value?.() ?? "";
  }

  get valueVisibility(): Visibility {
    return this.spec.value && !this.spec.checked ? "visible" : "collapse";
  }

  get checked(): boolean {
    return this.spec.checked?.() ?? false;
  }

  get switchVisibility(): Visibility {
    return this.spec.checked ? "visible" : "collapse";
  }

  get chevronVisibility(): Visibility {
    return this.spec.chevron ? "visible" : "collapse";
  }

  get sliderVisibility(): Visibility {
    return this.spec.slider ? "visible" : "collapse";
  }

  get sliderMin(): number {
    return this.spec.slider?.min ?? 0;
  }

  get sliderMax(): number {
    return this.spec.slider?.max ?? 100;
  }

  get sliderValue(): number {
    return this.spec.slider?.value() ?? 0;
  }

  get sliderEnabled(): boolean {
    return this.spec.slider?.enabled() ?? false;
  }

  get segmentsVisibility(): Visibility {
    return this.spec.segments ? "visible" : "collapse";
  }

  get segment0(): string { return this.spec.segments?.labels[0] ?? ""; }
  get segment1(): string { return this.spec.segments?.labels[1] ?? ""; }
  get segment2(): string { return this.spec.segments?.labels[2] ?? ""; }
  get segment0Class(): string { return this.segmentClass(0); }
  get segment1Class(): string { return this.segmentClass(1); }
  get segment2Class(): string { return this.segmentClass(2); }

  private segmentClass(index: number): string {
    const base = index === 0 ? "fc-segment fc-segment-first" : "fc-segment";
    return this.spec.segments?.selected() === index ? `${base} fc-segment-on` : base;
  }

  onSegment0Tap(): void { this.spec.segments?.onSelect(0); this.refresh(); }
  onSegment1Tap(): void { this.spec.segments?.onSelect(1); this.refresh(); }
  onSegment2Tap(): void { this.spec.segments?.onSelect(2); this.refresh(); }

  onTap(): void {
    if (this.spec.checked && this.spec.onCheckedChange) {
      this.spec.onCheckedChange(!this.checked);
      this.refresh();
      return;
    }
    void Promise.resolve(this.spec.onTap?.()).then(() => this.refresh());
  }

  // Also fires when the binding first sets `checked`; only act on a real change.
  onCheckedChange(args: { value?: boolean; object?: { checked?: boolean } }): void {
    const on = typeof args.value === "boolean" ? args.value : Boolean(args.object?.checked);
    if (on === this.checked) return;
    this.spec.onCheckedChange?.(on);
    this.refresh();
  }

  onSliderChange(args: { value?: number; object?: { value?: number } }): void {
    const raw = typeof args.value === "number" ? args.value : Number(args.object?.value ?? NaN);
    if (!Number.isFinite(raw) || !this.spec.slider?.enabled()) return;
    this.spec.slider.onChange(raw);
  }

  refresh(): void {
    for (const property of [
      "label", "sublabel", "sublabelVisibility", "value", "checked", "rowVisibility", "rowClass",
      "sliderValue", "sliderEnabled", "segment0Class", "segment1Class", "segment2Class",
    ] as const) {
      this.notifyPropertyChange(property, this[property]);
    }
  }
}

export class SettingGroup extends Observable {
  constructor(readonly title: string, readonly rows: SettingRow[]) {
    super();
  }

  get titleVisibility(): Visibility {
    return this.title ? "visible" : "collapse";
  }

  get groupClass(): string {
    return this.title ? "" : "fc-group-untitled";
  }

  get groupVisibility(): Visibility {
    return this.rows.some((candidate) => candidate.isVisible()) ? "visible" : "collapse";
  }

  refresh(): void {
    let first = true;
    for (const item of this.rows) {
      item.first = first && item.isVisible();
      if (item.first) first = false;
      item.refresh();
    }
    this.notifyPropertyChange("groupVisibility", this.groupVisibility);
  }
}

export function group(title: string, rows: (SettingRow | null | false)[]): SettingGroup {
  const result = new SettingGroup(title, rows.filter((item): item is SettingRow => !!item));
  result.refresh();
  return result;
}

export function row(spec: RowSpec): SettingRow {
  return new SettingRow(spec);
}

export function toggleRow(setting: ConfigSettingBoolean, label = setting.label): SettingRow {
  return row({ label, checked: () => setting.get(), onCheckedChange: (on) => setting.set(on) });
}

export function enumRow<T extends string>(setting: ConfigSettingEnum<T>, label = setting.label, visible?: () => boolean): SettingRow {
  return row({ label, visible, value: () => setting.displayValue(), onTap: () => pickEnum(setting, label) });
}

export async function pickEnum<T extends string>(setting: ConfigSettingEnum<T>, title: string): Promise<void> {
  const current = setting.get();
  const values = setting.values.filter((value) => !setting.isDisabled(value));
  const actions = values.map((value) => setting.displayValue(value) + (value === current ? "  ✓" : ""));
  const picked = await Dialogs.action({ title, cancelButtonText: "Cancel", actions });
  const value = values[actions.indexOf(picked)];
  if (value !== undefined && value !== current) setting.set(value);
}

export function textRow(setting: ConfigSettingString, label = setting.label): SettingRow {
  return row({
    label,
    value: () => setting.displayValue() || "Not set",
    onTap: () => editText(setting, label),
  });
}

export async function editText(setting: ConfigSettingString, title: string): Promise<void> {
  const result = await Dialogs.prompt({
    title,
    defaultText: setting.get(),
    okButtonText: "Save",
    cancelButtonText: "Cancel",
    inputType: setting.inputKind === "password" ? "password" : setting.inputKind === "email" ? "email" : "text",
  });
  if (!result.result) return;
  const error = setting.validationError(result.text);
  if (error) {
    await Dialogs.alert({ title, message: error, okButtonText: "OK" });
    return;
  }
  setting.set(result.text);
}

export function linkRow(label: string, onTap: () => void | Promise<void>, value?: () => string, sublabel?: () => string): SettingRow {
  return row({ label, onTap, value, sublabel, chevron: true });
}

export function infoRow(label: string, value: () => string, sublabel?: () => string): SettingRow {
  return row({ label, value, sublabel });
}
