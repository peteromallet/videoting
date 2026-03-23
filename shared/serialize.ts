import type { ResolvedTimelineConfig, TimelineClip, TimelineConfig } from "@shared/types";

export const TIMELINE_CLIP_FIELDS = [
  "id",
  "at",
  "track",
  "asset",
  "from",
  "to",
  "speed",
  "hold",
  "volume",
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "effects",
] as const;

export type TimelineClipField = (typeof TIMELINE_CLIP_FIELDS)[number];

export const serializeClipForDisk = (clip: ResolvedTimelineConfig["clips"][number]): TimelineClip => {
  const serializedClip: Partial<Record<TimelineClipField, TimelineClip[TimelineClipField]>> = {
    id: clip.id,
    at: clip.at,
    track: clip.track,
    asset: clip.asset,
  };

  for (const field of TIMELINE_CLIP_FIELDS) {
    if (field in serializedClip) {
      continue;
    }

    const value = clip[field];
    if (value !== undefined) {
      serializedClip[field] = value;
    }
  }

  return serializedClip as TimelineClip;
};

export const validateSerializedConfig = (config: TimelineConfig): void => {
  const topLevelKeys = Object.keys(config).sort();
  if (topLevelKeys.join(",") !== "clips,output") {
    throw new Error(`Serialized timeline has unexpected top-level keys: ${topLevelKeys.join(", ")}`);
  }

  const allowedClipKeys = new Set<string>(TIMELINE_CLIP_FIELDS);
  for (const clip of config.clips) {
    const invalidClipKeys = Object.keys(clip).filter((key) => !allowedClipKeys.has(key));
    if (invalidClipKeys.length > 0) {
      throw new Error(`Serialized clip '${clip.id}' has unexpected keys: ${invalidClipKeys.join(", ")}`);
    }
  }
};

export const serializeForDisk = (resolved: ResolvedTimelineConfig): TimelineConfig => {
  const serialized: TimelineConfig = {
    output: { ...resolved.output },
    clips: resolved.clips.map(serializeClipForDisk),
  };

  validateSerializedConfig(serialized);
  return serialized;
};
