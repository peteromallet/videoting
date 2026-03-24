import type { AssetRegistry, AssetRegistryEntry, TimelineConfig } from "./types";

export interface SilenceRegion {
  start: number;
  end: number;
}

export interface AssetProfile {
  transcript?: { segments?: Array<{ start: number; end: number; text: string }> };
  [key: string]: unknown;
}

/**
 * Abstraction over the data layer used by the timeline editor.
 *
 * Implementations handle loading/saving the timeline, resolving asset URLs,
 * and optionally uploading assets or loading auxiliary data.
 *
 * - `LocalDataProvider` (default) talks to the Vite dev-server middleware.
 * - `ApiDataProvider` (stub) talks to a remote REST API.
 */
export interface DataProvider {
  loadTimeline(): Promise<TimelineConfig>;
  saveTimeline(config: TimelineConfig): Promise<void>;
  loadAssetRegistry(): Promise<AssetRegistry>;

  /**
   * Convert an `AssetRegistryEntry.file` value into an absolute URL.
   * Registry entries already include the `inputs/` prefix (e.g. `inputs/demo.mp4`).
   * If `file` is already an http(s) URL, return it as-is.
   */
  resolveAssetUrl(file: string): string;

  /** Upload an asset file. Not all backends support this. */
  uploadAsset?(file: File): Promise<{ assetId: string; entry: AssetRegistryEntry }>;

  /** Load silence/waveform data for an asset. */
  loadWaveform?(assetId: string): Promise<SilenceRegion[]>;

  /** Load the full ingested profile for an asset. */
  loadAssetProfile?(assetId: string): Promise<AssetProfile>;
}
