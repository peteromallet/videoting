import { migrateToFlatTracks } from "@shared/migrate";
import type {
  AssetRegistry,
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineClip,
  TimelineConfig,
} from "@shared/types";

export const parseResolution = (resolution: string): { width: number; height: number } => {
  const [width, height] = resolution.toLowerCase().split("x");
  return {
    width: Number(width),
    height: Number(height),
  };
};

export const getClipSourceDuration = (clip: TimelineClip): number => {
  if (typeof clip.hold === "number") {
    return clip.hold;
  }

  return (clip.to ?? 0) - (clip.from ?? 0);
};

export const getClipTimelineDuration = (clip: TimelineClip): number => {
  const speed = clip.speed ?? 1;
  return getClipSourceDuration(clip) / speed;
};

export const secondsToFrames = (seconds: number, fps: number): number => {
  return Math.round(seconds * fps);
};

export const getClipDurationInFrames = (clip: TimelineClip, fps: number): number => {
  return Math.max(1, secondsToFrames(getClipTimelineDuration(clip), fps));
};

export const getTimelineDurationInFrames = (config: ResolvedTimelineConfig, fps: number): number => {
  return Math.max(
    1,
    ...config.clips.map((clip) => {
      return secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps);
    }),
  );
};

export const getEffectValue = (
  effects: TimelineClip["effects"],
  name: "fade_in" | "fade_out",
): number | null => {
  if (!effects) {
    return null;
  }

  if (!Array.isArray(effects)) {
    return typeof effects[name] === "number" ? effects[name] : null;
  }

  for (const effect of effects) {
    if (typeof effect[name] === "number") {
      return effect[name] ?? null;
    }
  }

  return null;
};

export const getConfigSignature = (config: ResolvedTimelineConfig): string => {
  return JSON.stringify(config);
};

export type UrlResolver = (file: string) => string;

/**
 * Returns true if the given string is an absolute remote URL (http:// or https://).
 */
export const isRemoteUrl = (url: string): boolean => /^https?:\/\//.test(url);

export const resolveTimelineConfig = (
  config: TimelineConfig,
  registry: AssetRegistry,
  resolveUrl: UrlResolver,
): ResolvedTimelineConfig => {
  const migratedConfig = migrateToFlatTracks(config);
  const resolvedRegistry: Record<string, ResolvedAssetRegistryEntry> = {};
  for (const [assetId, entry] of Object.entries(registry.assets ?? {})) {
    resolvedRegistry[assetId] = {
      ...entry,
      src: isRemoteUrl(entry.file) ? entry.file : resolveUrl(entry.file),
    };
  }

  const clips = migratedConfig.clips.map((clip) => {
    if (!clip.asset) {
      return {
        ...clip,
        assetEntry: undefined,
      };
    }

    const assetEntry = resolvedRegistry[clip.asset];
    if (!assetEntry) {
      throw new Error(`Clip '${clip.id}' references missing asset '${clip.asset}'`);
    }

    return {
      ...clip,
      assetEntry,
    };
  });

  return {
    output: { ...migratedConfig.output },
    tracks: migratedConfig.tracks ?? [],
    clips,
    registry: resolvedRegistry,
  };
};
