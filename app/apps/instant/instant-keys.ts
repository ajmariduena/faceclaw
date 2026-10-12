import { braveApiKeySetting, cerebrasApiKeySetting, openRouterApiKeySetting, perplexityApiKeySetting, sonioxApiKeySetting } from "../../ui/dashboard-settings";

export type InstantKeys = { soniox: string; cerebras: string; openRouter: string; perplexity: string; brave: string };

export function instantKeys(): InstantKeys {
  const get = (setting: { get(): string }) => setting.get().trim();
  return { soniox: get(sonioxApiKeySetting), cerebras: get(cerebrasApiKeySetting), openRouter: get(openRouterApiKeySetting), perplexity: get(perplexityApiKeySetting), brave: get(braveApiKeySetting) };
}

/** The first service Instant still needs a key for, or null. Search is optional: without it Instant answers from the model alone. */
export function missingInstantKey(keys: InstantKeys): string | null {
  if (!keys.soniox) return "Soniox";
  if (!keys.cerebras && !keys.openRouter) return "Cerebras";
  return null;
}
