import type { AssetRegistry, AssetRegistryEntry, TimelineConfig } from "../types";
import type { AssetProfile, DataProvider, SilenceRegion } from "../data-provider";

export interface ApiDataProviderOptions {
  baseUrl: string;
  token?: string;
}

/**
 * Data provider that talks to a remote REST API.
 *
 * // TODO: wire to real API — this is a structural placeholder only.
 */
export class ApiDataProvider implements DataProvider {
  private baseUrl: string;
  private token?: string;

  constructor(options: ApiDataProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  loadTimeline(): Promise<TimelineConfig> {
    return this.fetchJson<TimelineConfig>("/timeline");
  }

  async saveTimeline(config: TimelineConfig): Promise<void> {
    const response = await fetch(`${this.baseUrl}/timeline`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`Save failed: ${response.status} ${response.statusText}`);
    }
  }

  loadAssetRegistry(): Promise<AssetRegistry> {
    return this.fetchJson<AssetRegistry>("/asset-registry");
  }

  /**
   * If file is already an https URL, return as-is.
   * Otherwise, construct a URL against the API base (placeholder pattern).
   */
  resolveAssetUrl(file: string): string {
    if (/^https?:\/\//.test(file)) {
      return file;
    }
    // TODO: wire to real asset CDN / signed URL endpoint
    return `${this.baseUrl}/assets/${file}`;
  }

  async uploadAsset(file: File): Promise<{ assetId: string; entry: AssetRegistryEntry }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${this.baseUrl}/assets/upload`, {
      method: "POST",
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return (await response.json()) as { assetId: string; entry: AssetRegistryEntry };
  }

  async loadWaveform(assetId: string): Promise<SilenceRegion[]> {
    return this.fetchJson<SilenceRegion[]>(`/assets/${encodeURIComponent(assetId)}/waveform`);
  }

  async loadAssetProfile(assetId: string): Promise<AssetProfile> {
    return this.fetchJson<AssetProfile>(`/assets/${encodeURIComponent(assetId)}/profile`);
  }
}
