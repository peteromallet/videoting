import type { CustomEffectEntry, TimelineConfig } from "../types";

const STORAGE_KEY = "video-editor:draft-effects";

/**
 * Load draft effects from localStorage (effects being edited that haven't
 * been saved to the timeline yet).
 */
export function loadDraftEffects(): Record<string, string> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Save a draft effect to localStorage.
 */
export function saveDraftEffect(name: string, code: string): void {
  if (typeof localStorage === "undefined") return;

  const drafts = loadDraftEffects();
  drafts[name] = code;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

/**
 * Delete a draft effect from localStorage.
 */
export function deleteDraftEffect(name: string): void {
  if (typeof localStorage === "undefined") return;

  const drafts = loadDraftEffects();
  delete drafts[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

/**
 * Promote a draft effect from localStorage into the timeline config's
 * `customEffects` field, making it persistent and available to Remotion.
 */
export function promoteDraftToTimeline(
  name: string,
  config: TimelineConfig,
  category?: CustomEffectEntry["category"],
): TimelineConfig {
  const drafts = loadDraftEffects();
  const code = drafts[name];
  if (!code) {
    throw new Error(`No draft effect found with name "${name}"`);
  }

  const updated: TimelineConfig = {
    ...config,
    customEffects: {
      ...config.customEffects,
      [name]: { code, category },
    },
  };

  // Remove from drafts now that it's in the timeline
  deleteDraftEffect(name);

  return updated;
}
