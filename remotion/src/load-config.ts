import { resolveTimelineConfig } from "@shared/config-utils";
import { staticFile } from "remotion";
import type {
  AssetRegistry,
  ResolvedTimelineConfig,
  TimelineConfig,
} from "@shared/types";

export type {
  AssetRegistry,
  AssetRegistryEntry,
  ResolvedAssetRegistryEntry,
  ResolvedTimelineClip,
  ResolvedTimelineConfig,
  TimelineClip,
  TimelineCompositionProps,
  TimelineConfig,
  TimelineEffect,
  TimelineOutput,
  TrackDefinition,
  TrackKind,
} from "@shared/types";

export {
  getClipDurationInFrames,
  getClipSourceDuration,
  getClipTimelineDuration,
  getConfigSignature,
  getEffectValue,
  getTimelineDurationInFrames,
  parseResolution,
  secondsToFrames,
} from "@shared/config-utils";

export { resolveTimelineConfig };

export const fetchJson = async <T,>(fileName: string): Promise<T> => {
  // staticFile() needs window.remotion_staticBase to be set (Studio injects it).
  // Try staticFile first; if the base isn't set yet, fall back to fetching
  // from the known /static-{hash}/ path by finding it in window.remotion_staticFiles.
  let url: string;
  try {
    url = staticFile(fileName);
  } catch {
    url = `/${fileName}`;
  }

  // If staticFile returned a bare path without the hash prefix,
  // look up the correct src from Remotion's static file index.
  if (
    typeof window !== "undefined" &&
    Array.isArray((window as unknown as Record<string, unknown>).remotion_staticFiles)
  ) {
    const files = (window as unknown as Record<string, unknown>).remotion_staticFiles as Array<{
      name: string;
      src: string;
    }>;
    const entry = files.find((f) => f.name === fileName);
    if (entry) {
      url = entry.src;
    }
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${fileName}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
};

export const loadTimelineConfig = async (): Promise<ResolvedTimelineConfig> => {
  const [timeline, registry] = await Promise.all([
    fetchJson<TimelineConfig>("timeline.json"),
    fetchJson<AssetRegistry>("asset-registry.json"),
  ]);
  return resolveTimelineConfig(timeline, registry, (file) => staticFile(file));
};
