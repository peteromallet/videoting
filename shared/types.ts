export type TimelineTrack = "video" | "audio" | "overlay";

export type TimelineEffect = {
  fade_in?: number;
  fade_out?: number;
};

export type TimelineClip = {
  id: string;
  at: number;
  track: TimelineTrack;
  asset: string;
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
  effects?: TimelineEffect[] | Record<string, number>;
};

export type TimelineOutput = {
  resolution: string;
  fps: number;
  file: string;
  background?: string | null;
  background_scale?: number | null;
};

export type TimelineConfig = {
  output: TimelineOutput;
  clips: TimelineClip[];
};

export type AssetRegistryEntry = {
  file: string;
  type?: string;
  duration?: number;
  resolution?: string;
  fps?: number;
};

export type AssetRegistry = {
  assets: Record<string, AssetRegistryEntry>;
};

export type ResolvedAssetRegistryEntry = AssetRegistryEntry & {
  src: string;
};

export type ResolvedTimelineClip = TimelineClip & {
  assetEntry: ResolvedAssetRegistryEntry;
};

export type ResolvedTimelineConfig = {
  output: TimelineOutput;
  clips: ResolvedTimelineClip[];
  registry: Record<string, ResolvedAssetRegistryEntry>;
};

export type TimelineCompositionProps = {
  config?: ResolvedTimelineConfig;
  preview?: boolean;
};
