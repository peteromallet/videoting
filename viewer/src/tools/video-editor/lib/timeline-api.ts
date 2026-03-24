import type { AssetRegistry, TimelineConfig } from "@shared/types";

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export function loadTimelineConfig(): Promise<TimelineConfig> {
  return fetchJson<TimelineConfig>("/api/timeline");
}

export function loadAssetRegistry(): Promise<AssetRegistry> {
  return fetchJson<AssetRegistry>("/api/asset-registry");
}

export async function saveTimelineConfig(config: TimelineConfig): Promise<void> {
  const response = await fetch("/api/save-timeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function uploadAssetFile(file: File): Promise<unknown> {
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "X-Filename": encodeURIComponent(file.name) },
    body: file,
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Upload failed");
  }

  return response.json();
}
