import { getClipTimelineDuration } from "@shared/config-utils";
import type { ResolvedTimelineClip, ResolvedTimelineConfig, TimelineTrack } from "@shared/types";

const SPLIT_EPSILON = 0.0001;

export const TRACK_ORDER: TimelineTrack[] = ["video", "audio", "overlay"];

export const roundTimelineValue = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const isHoldClip = (clip: ResolvedTimelineClip): boolean => {
  return typeof clip.hold === "number";
};

export const getClipEndSeconds = (clip: ResolvedTimelineClip): number => {
  return clip.at + getClipTimelineDuration(clip);
};

export const findClipById = (
  config: ResolvedTimelineConfig,
  clipId: string,
): ResolvedTimelineClip | null => {
  return config.clips.find((clip) => clip.id === clipId) ?? null;
};

export const updateClipInConfig = (
  config: ResolvedTimelineConfig,
  clipId: string,
  updater: (clip: ResolvedTimelineClip) => ResolvedTimelineClip,
): ResolvedTimelineConfig => {
  let didUpdate = false;
  const clips = config.clips.map((clip) => {
    if (clip.id !== clipId) {
      return clip;
    }

    didUpdate = true;
    return updater(clip);
  });

  return didUpdate ? { ...config, clips } : config;
};

export const getClipVolume = (clip: ResolvedTimelineClip): number => {
  return clip.volume ?? 1;
};

export const isClipMuted = (clip: ResolvedTimelineClip): boolean => {
  return getClipVolume(clip) <= 0;
};

export const toggleClipMute = (
  config: ResolvedTimelineConfig,
  clipId: string,
): ResolvedTimelineConfig => {
  return updateClipInConfig(config, clipId, (clip) => ({
    ...clip,
    volume: isClipMuted(clip) ? 1 : 0,
  }));
};

export const canSplitClipAtTime = (clip: ResolvedTimelineClip, playheadSeconds: number): boolean => {
  return playheadSeconds > clip.at + SPLIT_EPSILON && playheadSeconds < getClipEndSeconds(clip) - SPLIT_EPSILON;
};

export const createSplitClipId = (
  existingIds: string[],
  originalId: string,
  timestamp = Date.now(),
): string => {
  const used = new Set(existingIds);
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? `${originalId}-${timestamp}` : `${originalId}-${timestamp}-${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }

    suffix += 1;
  }
};

export const splitClipAtPlayhead = (
  config: ResolvedTimelineConfig,
  clipId: string,
  playheadSeconds: number,
): { config: ResolvedTimelineConfig; nextSelectedClipId: string | null } => {
  const clipIndex = config.clips.findIndex((clip) => clip.id === clipId);
  if (clipIndex < 0) {
    return { config, nextSelectedClipId: null };
  }

  const clip = config.clips[clipIndex];
  if (!canSplitClipAtTime(clip, playheadSeconds)) {
    return { config, nextSelectedClipId: null };
  }

  const nextSelectedClipId = createSplitClipId(
    config.clips.map((entry) => entry.id),
    clip.id,
  );

  let leftClip: ResolvedTimelineClip;
  let rightClip: ResolvedTimelineClip;

  if (isHoldClip(clip)) {
    const elapsed = roundTimelineValue(playheadSeconds - clip.at);
    const remaining = roundTimelineValue((clip.hold ?? 0) - elapsed);

    leftClip = {
      ...clip,
      hold: elapsed,
    };
    rightClip = {
      ...clip,
      id: nextSelectedClipId,
      at: roundTimelineValue(playheadSeconds),
      hold: remaining,
    };
  } else {
    const speed = clip.speed ?? 1;
    const clipFrom = clip.from ?? 0;
    const splitSource = roundTimelineValue(clipFrom + (playheadSeconds - clip.at) * speed);

    leftClip = {
      ...clip,
      to: splitSource,
    };
    rightClip = {
      ...clip,
      id: nextSelectedClipId,
      at: roundTimelineValue(playheadSeconds),
      from: splitSource,
    };
  }

  const clips = [...config.clips];
  clips.splice(clipIndex, 1, leftClip, rightClip);
  return {
    config: {
      ...config,
      clips,
    },
    nextSelectedClipId,
  };
};
