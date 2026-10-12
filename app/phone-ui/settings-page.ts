import { Application, Frame, Observable, type EventData, type NavigatedData, type Page } from "@nativescript/core";
import { dashboardController, type DashboardSnapshot } from "../g2/dashboard-controller";
import { onAnySettingChanged } from "../ui/dashboard-settings";
import { shell } from "../ui/shell/shell";
import { wearBridge } from "../native/wear-bridge";
import { buildSection, SECTION_TITLES, type SectionId } from "./settings-sections";
import type { SettingGroup } from "./settings-rows";

class SettingsPageModel extends Observable {
  readonly title: string;
  readonly groups: SettingGroup[];
  private snapshot: DashboardSnapshot | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor(section: SectionId) {
    super();
    this.title = SECTION_TITLES[section];
    this.groups = buildSection(section, { snapshot: () => this.snapshot });
  }

  attach(): void {
    if (this.unsubscribers.length > 0) return;
    const refresh = () => this.refresh();
    this.unsubscribers.push(
      dashboardController.subscribe((snapshot) => {
        this.snapshot = snapshot;
        refresh();
      }),
      onAnySettingChanged(refresh),
      shell.onBatteryLevelsChanged(refresh),
      wearBridge.onWatchConnection(refresh),
    );
    Application.on(Application.resumeEvent, refresh);
    this.unsubscribers.push(() => Application.off(Application.resumeEvent, refresh));
    this.refresh();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }

  refresh(): void {
    for (const group of this.groups) group.refresh();
  }

  onBackTap(): void {
    Frame.topmost()?.goBack();
  }
}

export function navigatingTo(args: NavigatedData): void {
  const page = args.object as Page;
  if (args.isBackNavigation && page.bindingContext) return;
  const section = (args.context as { section?: SectionId } | undefined)?.section ?? "display";
  page.bindingContext = new SettingsPageModel(section);
}

export function loaded(args: EventData): void {
  ((args.object as Page).bindingContext as SettingsPageModel | undefined)?.attach();
}

export function unloaded(args: EventData): void {
  ((args.object as Page).bindingContext as SettingsPageModel | undefined)?.dispose();
}
