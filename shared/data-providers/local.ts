import type { AssetRegistry, AssetRegistryEntry, TimelineConfig } from "../types";
import type { AssetProfile, DataProvider, SilenceRegion } from "../data-provider";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * Data provider that talks to the local Vite dev-server middleware.
 *
 * This replicates the existing fetch logic from `timeline-api.ts` and
 * the URL resolution logic from `timeline-data.ts`.
 */
export class LocalDataProvider implements DataProvider {
  loadTimeline(): Promise<TimelineConfig> {
    return fetchJson<TimelineConfig>("/api/timeline");
  }

  saveTimeline(config: TimelineConfig): Promise<void> {
    return fetch("/api/save-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          throw new Error(text);
        });
      }
    });
  }

  loadAssetRegistry(): Promise<AssetRegistry> {
    return fetchJson<AssetRegistry>("/api/asset-registry");
  }

  /**
   * Resolve an asset file path to an absolute URL for the local dev server.
   * Registry entries already include `inputs/` (e.g. `inputs/demo.mp4`),
   * so this yields `/inputs/demo.mp4` — not `/inputs/inputs/demo.mp4`.
   */
  resolveAssetUrl(file: string): string {
    if (/^https?:\/\//.test(file)) {
      return file;
    }
    const normalized = file.replace(/\\/g, "/").replace(/^\/+/, "");
    return `/${normalized}`;
  }

  async uploadAsset(file: File): Promise<{ assetId: string; entry: AssetRegistryEntry }> {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "X-Filename": encodeURIComponent(file.name) },
      body: file,
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Upload failed");
    }

    return (await response.json()) as { assetId: string; entry: AssetRegistryEntry };
  }

  async loadWaveform(assetId: string): Promise<SilenceRegion[]> {
    return fetchJson<SilenceRegion[]>(`/api/waveform?asset=${encodeURIComponent(assetId)}`);
  }

  async loadAssetProfile(assetId: string): Promise<AssetProfile> {
    return fetchJson<AssetProfile>(`/api/asset-profile?asset=${encodeURIComponent(assetId)}`);
  }
}
