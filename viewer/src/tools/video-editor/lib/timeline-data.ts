import type { TimelineAction, TimelineEffect as EditorTimelineEffect, TimelineRow } from "@xzdarcy/timeline-engine";
import { getClipSourceDuration, getConfigSignature, resolveTimelineConfig as resolveTimelineConfigShared, type UrlResolver } from "@shared/config-utils";
import { migrateToFlatTracks } from "@shared/migrate";
import { TIMELINE_CLIP_FIELDS, validateSerializedConfig } from "@shared/serialize";
import type {
  AssetRegistry,
  ClipType,
  ResolvedTimelineConfig,
  TimelineClip,
  TimelineConfig,
  TimelineOutput,
  TrackDefinition,
  TrackKind,
} from "@shared/types";
import type { DataProvider } from "@shared/data-provider";
import { loadAssetRegistry, loadTimelineConfig } from "@/tools/video-editor/lib/timeline-api";

export interface ClipMeta {
  asset?: string;
  track: string;
  clipType?: ClipType;
  from?: number;
  to?: number;
  speed?: number;
  hold?: number;
  volume?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  text?: TimelineClip["text"];
  entrance?: TimelineClip["entrance"];
  exit?: TimelineClip["exit"];
  continuous?: TimelineClip["continuous"];
  transition?: TimelineClip["transition"];
  effects?: TimelineClip["effects"];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export type ClipOrderMap = Record<string, string[]>;

export interface TimelineData {
  config: TimelineConfig;
  registry: AssetRegistry;
  resolvedConfig: ResolvedTimelineConfig;
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  effects: Record<string, EditorTimelineEffect>;
  assetMap: Record<string, string>;
  output: TimelineOutput;
  tracks: TrackDefinition[];
  clipOrder: ClipOrderMap;
  signature: string;
}

const ASSET_COLORS: Record<string, string> = {
  "output-composition": "#e06c75",
  "venn-diagram": "#61afef",
  "demo-one": "#98c379",
  "demo-two": "#c678dd",
  "example-video": "#56b6c2",
  "example-image1": "#d19a66",
  "example-image2": "#e5c07b",
  input: "#61afef",
};

const round = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const effectIdForClip = (clipId: string): string => {
  return `effect-${clipId}`;
};

const getUniqueClipId = (clipId: string, usedIds: Set<string>): string => {
  let duplicateIndex = 1;
  let candidate = clipId;

  while (usedIds.has(candidate)) {
    candidate = `${clipId}-dup-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  return candidate;
};

const getClipDurationSeconds = (clip: TimelineClip): number => {
  return getClipSourceDuration(clip) / (clip.speed ?? 1);
};

const getDefaultClipMeta = (clip: TimelineClip): ClipMeta => {
  return {
    asset: clip.asset,
    track: clip.track,
    clipType: clip.clipType,
    from: clip.from,
    to: clip.to,
    speed: clip.speed,
    hold: clip.hold,
    volume: clip.volume,
    x: clip.x,
    y: clip.y,
    width: clip.width,
    height: clip.height,
    opacity: clip.opacity,
    text: clip.text,
    entrance: clip.entrance,
    exit: clip.exit,
    continuous: clip.continuous,
    transition: clip.transition,
    effects: clip.effects,
  };
};

const resolveAssetUrl = (file: string): string => {
  if (/^https?:\/\//.test(file)) {
    return file;
  }

  const normalized = file.replace(/\\/g, "/").replace(/^\/+/, "");
  return `/${normalized}`;
};

const buildAssetMap = (registry: AssetRegistry): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(registry.assets ?? {}).map(([assetId, entry]) => [assetId, entry.file]),
  );
};

export const resolveTimelineConfig = (
  config: TimelineConfig,
  registry: AssetRegistry,
  urlResolver?: UrlResolver,
): ResolvedTimelineConfig => {
  return resolveTimelineConfigShared(config, registry, urlResolver ?? resolveAssetUrl);
};

export const configToRows = (
  config: TimelineConfig,
): Pick<TimelineData, "rows" | "meta" | "effects" | "clipOrder"> => {
  const migratedConfig = migrateToFlatTracks(config);
  const clipOrder: ClipOrderMap = Object.fromEntries(
    (migratedConfig.tracks ?? []).map((track) => [track.id, []]),
  );
  const effects: Record<string, EditorTimelineEffect> = {};
  const meta: Record<string, ClipMeta> = {};
  const rowsByTrack = new Map<string, TimelineAction[]>();
  const usedClipIds = new Set<string>();

  for (const track of migratedConfig.tracks ?? []) {
    rowsByTrack.set(track.id, []);
  }

  for (const clip of migratedConfig.clips) {
    const clipId = getUniqueClipId(clip.id, usedClipIds);
    if (clipId !== clip.id) {
      console.warn(`[timeline] Duplicate clip id "${clip.id}" on track "${clip.track}" detected; using "${clipId}" in editor state.`);
    }
    usedClipIds.add(clipId);

    clipOrder[clip.track] ??= [];
    clipOrder[clip.track].push(clipId);
    effects[effectIdForClip(clipId)] = { id: effectIdForClip(clipId) };
    meta[clipId] = getDefaultClipMeta(clip);

    const action: TimelineAction = {
      id: clipId,
      start: clip.at,
      end: clip.at + getClipDurationSeconds(clip),
      effectId: effectIdForClip(clipId),
    };

    rowsByTrack.get(clip.track)?.push(action);
  }

  return {
    rows: (migratedConfig.tracks ?? []).map((track) => ({
      id: track.id,
      actions: rowsByTrack.get(track.id) ?? [],
    })),
    meta,
    effects,
    clipOrder,
  };
};

export const rowsToConfig = (
  rows: TimelineRow[],
  meta: Record<string, ClipMeta>,
  output: TimelineOutput,
  clipOrder: ClipOrderMap,
  tracks: TrackDefinition[],
  customEffects?: TimelineConfig["customEffects"],
): TimelineConfig => {
  const actionMap = new Map<string, TimelineAction>();
  const trackActionIds: Record<string, string[]> = Object.fromEntries(tracks.map((track) => [track.id, []]));

  for (const row of rows) {
    for (const action of row.actions) {
      if (action.id.startsWith("uploading-")) continue;
      const clipMeta = meta[action.id];
      if (!clipMeta) {
        continue;
      }

      actionMap.set(action.id, action);
      trackActionIds[row.id] ??= [];
      trackActionIds[row.id].push(action.id);
    }
  }

  const clips: TimelineClip[] = [];
  for (const track of tracks) {
    const baseOrder = (clipOrder[track.id] ?? []).filter((clipId) => actionMap.has(clipId));
    const appendedIds = (trackActionIds[track.id] ?? []).filter((clipId) => !baseOrder.includes(clipId));

    for (const clipId of [...baseOrder, ...appendedIds]) {
      const action = actionMap.get(clipId);
      const clipMeta = meta[clipId];
      if (!action || !clipMeta) {
        continue;
      }

      const nextClip: Partial<TimelineClip> = {
        id: clipId,
        at: round(action.start),
        track: track.id,
        clipType: clipMeta.clipType,
        asset: clipMeta.asset,
        from: clipMeta.from,
        to: clipMeta.to,
        speed: clipMeta.speed,
        hold: clipMeta.hold,
        volume: clipMeta.volume,
        x: clipMeta.x,
        y: clipMeta.y,
        width: clipMeta.width,
        height: clipMeta.height,
        opacity: clipMeta.opacity,
        text: clipMeta.text,
        entrance: clipMeta.entrance,
        exit: clipMeta.exit,
        continuous: clipMeta.continuous,
        transition: clipMeta.transition,
        effects: clipMeta.effects,
      };

      if (typeof clipMeta.hold === "number") {
        nextClip.hold = round(action.end - action.start);
        delete nextClip.from;
        delete nextClip.to;
        delete nextClip.speed;
      } else {
        const speed = clipMeta.speed ?? 1;
        const from = clipMeta.from ?? 0;
        nextClip.from = round(from);
        nextClip.to = round(getSourceTime({ from, start: action.start, speed }, action.end));
      }

      const serializedClip: Partial<TimelineClip> = {
        id: nextClip.id,
        at: nextClip.at,
        track: nextClip.track,
      };
      if (nextClip.asset !== undefined) {
        serializedClip.asset = nextClip.asset;
      }

      for (const field of TIMELINE_CLIP_FIELDS) {
        if (field in serializedClip) {
          continue;
        }

        const value = nextClip[field];
        if (value !== undefined) {
          serializedClip[field] = value as never;
        }
      }

      clips.push(serializedClip as TimelineClip);
    }
  }

  const config: TimelineConfig = {
    output: { ...output },
    tracks: tracks.map((track) => ({ ...track })),
    clips,
  };
  if (customEffects && Object.keys(customEffects).length > 0) {
    config.customEffects = customEffects;
  }
  validateSerializedConfig(config);
  return config;
};

export const buildTimelineData = (
  config: TimelineConfig,
  registry: AssetRegistry,
  urlResolver?: UrlResolver,
): TimelineData => {
  const migratedConfig = migrateToFlatTracks(config);
  const resolvedConfig = resolveTimelineConfig(migratedConfig, registry, urlResolver);
  const rowData = configToRows(migratedConfig);

  return {
    config: migratedConfig,
    registry,
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: buildAssetMap(registry),
    output: { ...migratedConfig.output },
    tracks: migratedConfig.tracks ?? [],
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
  };
};

export const loadTimelineJson = async (): Promise<TimelineData> => {
  const [config, registry] = await Promise.all([loadTimelineConfig(), loadAssetRegistry()]);
  return buildTimelineData(config, registry);
};

/**
 * Load timeline data using a DataProvider instead of hardcoded fetch calls.
 */
export const loadTimelineJsonFromProvider = async (provider: DataProvider): Promise<TimelineData> => {
  const [config, registry] = await Promise.all([
    provider.loadTimeline(),
    provider.loadAssetRegistry(),
  ]);
  return buildTimelineData(config, registry, (file) => provider.resolveAssetUrl(file));
};

export async function loadTranscript(assetKey: string, assetPath: string): Promise<TranscriptSegment[]> {
  const filename = assetPath.split("/").pop() ?? "";
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";

  for (const name of [filename, `${assetKey}${ext}`]) {
    const response = await fetch(`/api/asset-profile?asset=${encodeURIComponent(name)}`);
    if (!response.ok) {
      continue;
    }

    const profile = (await response.json()) as { transcript?: { segments?: TranscriptSegment[] } };
    const segments = profile?.transcript?.segments;
    if (segments?.length) {
      return segments;
    }
  }

  return [];
}

export function getAssetColor(asset: string): string {
  return ASSET_COLORS[asset] ?? "#abb2bf";
}

export function getSourceTime(clip: { from: number; start: number; speed: number }, time: number): number {
  return clip.from + (time - clip.start) * clip.speed;
}

export function inferTrackType(filePath: string): TrackKind {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if ([".mp4", ".webm", ".mov"].includes(ext)) {
    return "visual";
  }

  if ([".mp3", ".wav", ".aac", ".m4a"].includes(ext)) {
    return "audio";
  }

  return "visual";
}

export function preserveUploadingClips(source: TimelineData, target: TimelineData): TimelineData {
  const uploadingMeta: Record<string, ClipMeta> = {};
  const uploadingActions: Record<string, TimelineAction[]> = {};
  let found = false;
  for (const row of source.rows) {
    for (const action of row.actions) {
      if (action.id.startsWith("uploading-") && source.meta[action.id]) {
        uploadingActions[row.id] ??= [];
        uploadingActions[row.id].push(action);
        uploadingMeta[action.id] = source.meta[action.id];
        found = true;
      }
    }
  }
  if (!found) return target;

  const nextRows = target.rows.map(row => {
    const extras = uploadingActions[row.id];
    return extras ? { ...row, actions: [...row.actions, ...extras] } : row;
  });
  return { ...target, rows: nextRows, meta: { ...target.meta, ...uploadingMeta } };
}

export function getNextClipId(meta: Record<string, ClipMeta>): string {
  let max = -1;
  for (const id of Object.keys(meta)) {
    const match = id.match(/^clip-(\d+)$/);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `clip-${max + 1}`;
}
