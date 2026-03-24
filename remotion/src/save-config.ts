import { getRemotionEnvironment } from "remotion";
import { serializeForDisk } from "../../shared/serialize";
import type { ResolvedTimelineConfig } from "../../shared/types";

const SAVE_ENDPOINT = "http://localhost:3111/api/timeline";

export const saveTimeline = async (config: ResolvedTimelineConfig): Promise<void> => {
  const serialized = serializeForDisk(config);
  const response = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(serialized),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to save timeline: ${response.status} ${message}`);
  }

  if (getRemotionEnvironment().isStudio) {
    const studio = await import("@remotion/studio");
    studio.reevaluateComposition();
  }
};

export const createDebouncedTimelineSaver = (delayMs = 300) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (config: ResolvedTimelineConfig) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      void saveTimeline(config).catch((error: unknown) => {
        console.error("Failed to persist timeline edits.", error);
      });
    }, delayMs);
  };
};
