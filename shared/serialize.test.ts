import { describe, it, expect } from "vitest";
import { serializeForDisk, validateSerializedConfig } from "./serialize";
import type { ResolvedTimelineConfig, TimelineConfig } from "./types";

const makeConfig = (): ResolvedTimelineConfig => ({
  output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
  tracks: [
    { id: "V1", kind: "visual", label: "BG", fit: "cover" },
    { id: "V2", kind: "visual", label: "Main", scale: 0.95 },
    { id: "A1", kind: "audio", label: "Audio" },
  ],
  clips: [
    {
      id: "clip-0",
      at: 0,
      track: "V2",
      asset: "demo",
      from: 0,
      to: 5,
      speed: 1,
      volume: 0.8,
      entrance: { type: "slide-up", duration: 0.5 },
      assetEntry: { file: "inputs/demo.mp4", src: "/inputs/demo.mp4", type: "video" },
    },
    {
      id: "clip-1",
      at: 5,
      track: "V2",
      asset: "demo2",
      from: 0,
      to: 3,
      clipType: "media",
      assetEntry: { file: "inputs/demo2.mp4", src: "/inputs/demo2.mp4", type: "video" },
    },
  ],
  registry: {},
});

describe("serializeForDisk", () => {
  it("strips assetEntry from clips", () => {
    const serialized = serializeForDisk(makeConfig());
    for (const clip of serialized.clips) {
      expect(clip).not.toHaveProperty("assetEntry");
    }
  });

  it("preserves output and tracks", () => {
    const serialized = serializeForDisk(makeConfig());
    expect(serialized.output.fps).toBe(30);
    expect(serialized.tracks).toHaveLength(3);
  });

  it("preserves entrance/exit/continuous fields", () => {
    const serialized = serializeForDisk(makeConfig());
    expect(serialized.clips[0].entrance).toEqual({ type: "slide-up", duration: 0.5 });
  });
});

describe("validateSerializedConfig", () => {
  it("passes for valid config", () => {
    const serialized = serializeForDisk(makeConfig());
    expect(() => validateSerializedConfig(serialized)).not.toThrow();
  });

  it("throws for unexpected top-level keys", () => {
    const bad = { output: {}, clips: [], tracks: [], extra: true } as unknown as TimelineConfig;
    expect(() => validateSerializedConfig(bad)).toThrow();
  });
});

describe("round-trip", () => {
  it("serialize → parse → serialize produces identical output", () => {
    const config = makeConfig();
    const first = serializeForDisk(config);
    const json = JSON.parse(JSON.stringify(first));
    // Re-resolve by adding assetEntry back
    const reResolved: ResolvedTimelineConfig = {
      ...json,
      clips: json.clips.map((clip: any) => ({
        ...clip,
        assetEntry: config.registry[clip.asset] ?? { file: "", src: "" },
      })),
      registry: config.registry,
    };
    const second = serializeForDisk(reResolved);
    expect(second).toEqual(first);
  });
});
