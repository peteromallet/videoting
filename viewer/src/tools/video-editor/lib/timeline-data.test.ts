import { describe, expect, it } from "vitest";
import type { AssetRegistry, TimelineConfig, TrackDefinition } from "@shared/types";
import {
  buildTimelineData,
  configToRows,
  getAssetColor,
  getNextClipId,
  inferTrackType,
  resolveTimelineConfig,
  rowsToConfig,
  type ClipMeta,
  type ClipOrderMap,
} from "./timeline-data";

const makeOutput = () => ({
  resolution: "1920x1080",
  fps: 30,
  file: "output.mp4",
});

const makeTracks = (): TrackDefinition[] => [
  { id: "V1", kind: "visual", label: "V1" },
  { id: "V2", kind: "visual", label: "V2" },
  { id: "A1", kind: "audio", label: "A1" },
];

const makeConfig = (clips: TimelineConfig["clips"] = []): TimelineConfig => ({
  output: makeOutput(),
  tracks: makeTracks(),
  clips,
});

const makeRegistry = (
  assets: Record<string, { file: string; duration?: number }> = {},
): AssetRegistry => ({
  assets: Object.fromEntries(
    Object.entries(assets).map(([id, entry]) => [id, { file: entry.file, duration: entry.duration }]),
  ),
});

describe("configToRows", () => {
  it("converts a config with clips into rows, meta, effects, and clipOrder", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "demo", from: 0, to: 5 },
      { id: "clip-1", at: 5, track: "A1", asset: "audio", from: 0, to: 3 },
    ]);

    const result = configToRows(config);

    expect(result.rows).toHaveLength(3);
    const v2Row = result.rows.find((r) => r.id === "V2");
    const a1Row = result.rows.find((r) => r.id === "A1");
    expect(v2Row?.actions).toHaveLength(1);
    expect(a1Row?.actions).toHaveLength(1);

    expect(v2Row!.actions[0].start).toBe(0);
    expect(v2Row!.actions[0].end).toBe(5);

    expect(result.meta["clip-0"]).toBeDefined();
    expect(result.meta["clip-0"].asset).toBe("demo");
    expect(result.meta["clip-0"].track).toBe("V2");

    expect(result.effects["effect-clip-0"]).toBeDefined();

    expect(result.clipOrder["V2"]).toEqual(["clip-0"]);
    expect(result.clipOrder["A1"]).toEqual(["clip-1"]);
  });

  it("returns empty rows when config has no clips", () => {
    const config = makeConfig([]);
    const result = configToRows(config);
    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect(row.actions).toHaveLength(0);
    }
  });

  it("handles duplicate clip ids by deduplicating", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "a", from: 0, to: 2 },
      { id: "clip-0", at: 3, track: "V2", asset: "b", from: 0, to: 2 },
    ]);

    const result = configToRows(config);
    const ids = Object.keys(result.meta);
    expect(ids).toContain("clip-0");
    expect(ids).toContain("clip-0-dup-1");
  });

  it("handles hold clips correctly", () => {
    const config = makeConfig([
      { id: "clip-0", at: 1, track: "V2", asset: "img", hold: 3 },
    ]);

    const result = configToRows(config);
    const v2Row = result.rows.find((r) => r.id === "V2")!;
    expect(v2Row.actions[0].start).toBe(1);
    expect(v2Row.actions[0].end).toBe(4);
  });

  it("applies speed to clip duration", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "vid", from: 0, to: 10, speed: 2 },
    ]);

    const result = configToRows(config);
    const v2Row = result.rows.find((r) => r.id === "V2")!;
    expect(v2Row.actions[0].end).toBe(5); // 10s source / 2x speed = 5s
  });
});

describe("rowsToConfig", () => {
  it("converts rows and meta back into a TimelineConfig", () => {
    const tracks = makeTracks();
    const meta: Record<string, ClipMeta> = {
      "clip-0": { asset: "demo", track: "V2", from: 0, to: 5 },
    };
    const clipOrder: ClipOrderMap = { V1: [], V2: ["clip-0"], A1: [] };
    const rows = [
      { id: "V1", actions: [] },
      { id: "V2", actions: [{ id: "clip-0", start: 0, end: 5, effectId: "effect-clip-0" }] },
      { id: "A1", actions: [] },
    ];

    const config = rowsToConfig(rows, meta, makeOutput(), clipOrder, tracks);

    expect(config.clips).toHaveLength(1);
    expect(config.clips[0].id).toBe("clip-0");
    expect(config.clips[0].at).toBe(0);
    expect(config.clips[0].track).toBe("V2");
    expect(config.clips[0].asset).toBe("demo");
    expect(config.output).toEqual(makeOutput());
    expect(config.tracks).toHaveLength(3);
  });

  it("preserves clip order from clipOrder map", () => {
    const tracks = makeTracks();
    const meta: Record<string, ClipMeta> = {
      "clip-0": { asset: "a", track: "V2", from: 0, to: 2 },
      "clip-1": { asset: "b", track: "V2", from: 0, to: 3 },
    };
    const clipOrder: ClipOrderMap = { V1: [], V2: ["clip-1", "clip-0"], A1: [] };
    const rows = [
      { id: "V1", actions: [] },
      {
        id: "V2",
        actions: [
          { id: "clip-0", start: 0, end: 2, effectId: "e0" },
          { id: "clip-1", start: 3, end: 6, effectId: "e1" },
        ],
      },
      { id: "A1", actions: [] },
    ];

    const config = rowsToConfig(rows, meta, makeOutput(), clipOrder, tracks);
    expect(config.clips.map((c) => c.id)).toEqual(["clip-1", "clip-0"]);
  });

  it("handles hold clips without from/to", () => {
    const tracks = makeTracks();
    const meta: Record<string, ClipMeta> = {
      "clip-0": { asset: "img", track: "V2", hold: 3 },
    };
    const clipOrder: ClipOrderMap = { V1: [], V2: ["clip-0"], A1: [] };
    const rows = [
      { id: "V1", actions: [] },
      { id: "V2", actions: [{ id: "clip-0", start: 1, end: 4, effectId: "e0" }] },
      { id: "A1", actions: [] },
    ];

    const config = rowsToConfig(rows, meta, makeOutput(), clipOrder, tracks);
    expect(config.clips[0].hold).toBe(3);
    expect(config.clips[0].from).toBeUndefined();
    expect(config.clips[0].to).toBeUndefined();
  });
});

describe("resolveTimelineConfig", () => {
  it("resolves asset entries from registry", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "demo", from: 0, to: 5 },
    ]);
    const registry = makeRegistry({ demo: { file: "inputs/demo.mp4", duration: 10 } });

    const resolved = resolveTimelineConfig(config, registry);

    expect(resolved.clips).toHaveLength(1);
    expect(resolved.clips[0].assetEntry).toBeDefined();
    expect(resolved.clips[0].assetEntry!.src).toBe("/inputs/demo.mp4");
    expect(resolved.registry["demo"].src).toBe("/inputs/demo.mp4");
  });

  it("resolves http URLs without modification", () => {
    const registry: AssetRegistry = {
      assets: { remote: { file: "https://example.com/video.mp4" } },
    };
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "remote", from: 0, to: 5 },
    ]);

    const resolved = resolveTimelineConfig(config, registry);
    expect(resolved.clips[0].assetEntry!.src).toBe("https://example.com/video.mp4");
  });

  it("throws for missing asset", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "nonexistent", from: 0, to: 5 },
    ]);
    const registry = makeRegistry({});

    expect(() => resolveTimelineConfig(config, registry)).toThrow("missing asset");
  });
});

describe("buildTimelineData", () => {
  it("produces a complete TimelineData object", () => {
    const config = makeConfig([
      { id: "clip-0", at: 0, track: "V2", asset: "demo", from: 0, to: 5 },
    ]);
    const registry = makeRegistry({ demo: { file: "inputs/demo.mp4", duration: 10 } });

    const data = buildTimelineData(config, registry);

    expect(data.config).toBeDefined();
    expect(data.registry).toBe(registry);
    expect(data.resolvedConfig).toBeDefined();
    expect(data.rows).toHaveLength(3);
    expect(data.meta).toBeDefined();
    expect(data.effects).toBeDefined();
    expect(data.assetMap).toEqual({ demo: "inputs/demo.mp4" });
    expect(data.output).toEqual(makeOutput());
    expect(data.tracks).toHaveLength(3);
    expect(data.clipOrder).toBeDefined();
    expect(typeof data.signature).toBe("string");
    expect(data.signature.length).toBeGreaterThan(0);
  });
});

describe("getAssetColor", () => {
  it("returns known color for known assets", () => {
    expect(getAssetColor("demo-one")).toBe("#98c379");
    expect(getAssetColor("venn-diagram")).toBe("#61afef");
    expect(getAssetColor("output-composition")).toBe("#e06c75");
  });

  it("returns fallback for unknown assets", () => {
    expect(getAssetColor("unknown-asset")).toBe("#abb2bf");
    expect(getAssetColor("")).toBe("#abb2bf");
  });
});

describe("inferTrackType", () => {
  it("returns visual for video extensions", () => {
    expect(inferTrackType("file.mp4")).toBe("visual");
    expect(inferTrackType("file.webm")).toBe("visual");
    expect(inferTrackType("file.mov")).toBe("visual");
    expect(inferTrackType("path/to/file.MP4")).toBe("visual");
  });

  it("returns audio for audio extensions", () => {
    expect(inferTrackType("file.mp3")).toBe("audio");
    expect(inferTrackType("file.wav")).toBe("audio");
    expect(inferTrackType("file.aac")).toBe("audio");
    expect(inferTrackType("file.m4a")).toBe("audio");
    expect(inferTrackType("path/to/file.MP3")).toBe("audio");
  });

  it("returns visual for image and other extensions", () => {
    expect(inferTrackType("file.jpg")).toBe("visual");
    expect(inferTrackType("file.png")).toBe("visual");
  });
});

describe("getNextClipId", () => {
  it("returns clip-0 when meta is empty", () => {
    expect(getNextClipId({})).toBe("clip-0");
  });

  it("increments past the highest numbered clip", () => {
    const meta: Record<string, ClipMeta> = {
      "clip-0": { track: "V2" },
      "clip-3": { track: "V2" },
      "clip-1": { track: "A1" },
    };
    expect(getNextClipId(meta)).toBe("clip-4");
  });

  it("ignores non-matching id patterns", () => {
    const meta: Record<string, ClipMeta> = {
      "clip-background": { track: "V1" },
      "custom-id": { track: "V2" },
      "clip-2": { track: "V2" },
    };
    expect(getNextClipId(meta)).toBe("clip-3");
  });
});
