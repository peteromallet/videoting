import { describe, it, expect } from "vitest";
import {
  secondsToFrames,
  getClipSourceDuration,
  getClipTimelineDuration,
  getClipDurationInFrames,
  getTimelineDurationInFrames,
  parseResolution,
  getEffectValue,
  resolveTimelineConfig,
} from "./config-utils";
import type { AssetRegistry, ResolvedTimelineClip, ResolvedTimelineConfig, TimelineConfig } from "./types";

const makeClip = (overrides: Partial<ResolvedTimelineClip> = {}): ResolvedTimelineClip => ({
  id: "clip-0",
  at: 0,
  track: "V2",
  asset: "test",
  from: 0,
  to: 5,
  assetEntry: { file: "inputs/test.mp4", src: "/inputs/test.mp4", type: "video", duration: 10 },
  ...overrides,
});

describe("secondsToFrames", () => {
  it("converts seconds to frames", () => {
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(0.5, 30)).toBe(15);
    expect(secondsToFrames(0, 30)).toBe(0);
  });

  it("rounds to nearest frame", () => {
    expect(secondsToFrames(0.1, 30)).toBe(3);
  });
});

describe("getClipSourceDuration", () => {
  it("returns to - from for media clips", () => {
    expect(getClipSourceDuration(makeClip({ from: 2, to: 7 }))).toBe(5);
  });

  it("returns hold for hold clips", () => {
    expect(getClipSourceDuration(makeClip({ hold: 3 }))).toBe(3);
  });

  it("returns 0 when from equals to", () => {
    expect(getClipSourceDuration(makeClip({ from: 5, to: 5 }))).toBe(0);
  });
});

describe("getClipTimelineDuration", () => {
  it("returns source duration at speed 1", () => {
    expect(getClipTimelineDuration(makeClip({ from: 0, to: 10, speed: 1 }))).toBe(10);
  });

  it("divides by speed", () => {
    expect(getClipTimelineDuration(makeClip({ from: 0, to: 10, speed: 2 }))).toBe(5);
  });

  it("defaults speed to 1", () => {
    expect(getClipTimelineDuration(makeClip({ from: 0, to: 6 }))).toBe(6);
  });
});

describe("getClipDurationInFrames", () => {
  it("converts timeline duration to frames", () => {
    expect(getClipDurationInFrames(makeClip({ from: 0, to: 2 }), 30)).toBe(60);
  });

  it("returns at least 1 frame", () => {
    expect(getClipDurationInFrames(makeClip({ from: 0, to: 0 }), 30)).toBe(1);
  });
});

describe("getTimelineDurationInFrames", () => {
  it("returns max end frame across all clips", () => {
    const config: ResolvedTimelineConfig = {
      output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
      clips: [
        makeClip({ at: 0, from: 0, to: 5 }),
        makeClip({ id: "clip-1", at: 10, from: 0, to: 3 }),
      ],
      tracks: [],
      registry: {},
    };
    // clip-1 ends at 10 + 3 = 13s = 390 frames
    expect(getTimelineDurationInFrames(config, 30)).toBe(390);
  });

  it("returns 1 for empty clips", () => {
    const config: ResolvedTimelineConfig = {
      output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
      clips: [],
      tracks: [],
      registry: {},
    };
    expect(getTimelineDurationInFrames(config, 30)).toBe(1);
  });
});

describe("parseResolution", () => {
  it("parses WxH string", () => {
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("parses lowercase", () => {
    expect(parseResolution("1280x720")).toEqual({ width: 1280, height: 720 });
  });
});

describe("getEffectValue", () => {
  it("returns null for no effects", () => {
    expect(getEffectValue(undefined, "fade_in")).toBeNull();
  });

  it("reads from object effects", () => {
    expect(getEffectValue({ fade_in: 0.5 }, "fade_in")).toBe(0.5);
  });

  it("reads from array effects", () => {
    expect(getEffectValue([{ fade_in: 0.3 }, { fade_out: 0.2 }], "fade_out")).toBe(0.2);
  });

  it("returns null when key not found", () => {
    expect(getEffectValue([{ fade_in: 0.3 }], "fade_out")).toBeNull();
  });
});

describe("resolveTimelineConfig", () => {
  const makeConfig = (overrides: Partial<TimelineConfig> = {}): TimelineConfig => ({
    output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
    tracks: [
      { id: "V1", kind: "visual", label: "V1" },
      { id: "A1", kind: "audio", label: "A1" },
    ],
    clips: [
      { id: "clip-0", at: 0, track: "V1", asset: "my-video", from: 0, to: 5 },
      { id: "clip-1", at: 0, track: "A1", asset: "my-audio", from: 0, to: 10 },
    ],
    ...overrides,
  });

  const makeRegistry = (): AssetRegistry => ({
    assets: {
      "my-video": { file: "inputs/video.mp4", type: "video/mp4", duration: 30 },
      "my-audio": { file: "inputs/audio.mp3", type: "audio/mpeg", duration: 60 },
    },
  });

  const identity = (file: string) => file;

  it("resolves asset entries onto clips", () => {
    const resolved = resolveTimelineConfig(makeConfig(), makeRegistry(), identity);
    expect(resolved.clips[0].assetEntry).toBeDefined();
    expect(resolved.clips[0].assetEntry!.file).toBe("inputs/video.mp4");
    expect(resolved.clips[1].assetEntry!.file).toBe("inputs/audio.mp3");
  });

  it("applies the url resolver to asset src", () => {
    const resolver = (file: string) => `/media/${file}`;
    const resolved = resolveTimelineConfig(makeConfig(), makeRegistry(), resolver);
    expect(resolved.clips[0].assetEntry!.src).toBe("/media/inputs/video.mp4");
  });

  it("populates the resolved registry", () => {
    const resolved = resolveTimelineConfig(makeConfig(), makeRegistry(), identity);
    expect(resolved.registry["my-video"]).toBeDefined();
    expect(resolved.registry["my-video"].src).toBe("inputs/video.mp4");
  });

  it("throws when clip references missing asset", () => {
    const config = makeConfig({
      clips: [{ id: "clip-0", at: 0, track: "V1", asset: "nonexistent", from: 0, to: 5 }],
    });
    expect(() => resolveTimelineConfig(config, makeRegistry(), identity)).toThrow("missing asset");
  });

  it("handles clips without an asset (text clips)", () => {
    const config = makeConfig({
      clips: [
        { id: "text-0", at: 0, track: "V1", clipType: "text", hold: 4, text: { content: "Hello" } },
      ],
    });
    const resolved = resolveTimelineConfig(config, makeRegistry(), identity);
    expect(resolved.clips[0].assetEntry).toBeUndefined();
    expect(resolved.clips[0].id).toBe("text-0");
  });

  it("preserves output and tracks from config", () => {
    const resolved = resolveTimelineConfig(makeConfig(), makeRegistry(), identity);
    expect(resolved.output.resolution).toBe("1280x720");
    expect(resolved.tracks).toHaveLength(2);
    expect(resolved.tracks[0].id).toBe("V1");
  });
});
