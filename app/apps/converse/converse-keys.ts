import { braveApiKeySetting, cerebrasApiKeySetting, openRouterApiKeySetting, perplexityApiKeySetting, typesafeApiKeySetting } from "../../ui/dashboard-settings";
import type { FactKeys } from "./converse-facts";

export function converseKeys(): FactKeys {
  const get = (setting: { get(): string }) => setting.get().trim();
  return { typesafe: get(typesafeApiKeySetting), cerebras: get(cerebrasApiKeySetting), openRouter: get(openRouterApiKeySetting), perplexity: get(perplexityApiKeySetting), brave: get(braveApiKeySetting) };
}

/** The first service Converse still needs a key for, or null when it can start. */
export function missingConverseKey(sonioxKey: string, keys: FactKeys): string | null {
  if (!sonioxKey) return "Soniox";
  if (!keys.typesafe && !keys.openRouter) return "Jev (TypeSafe)";
  if (!keys.cerebras && !keys.openRouter) return "Cerebras";
  if (!keys.perplexity && !keys.brave) return "Perplexity";
  return null;
}
