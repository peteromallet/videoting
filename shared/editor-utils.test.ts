import { describe, it, expect } from "vitest";
import {
  isHoldClip,
  getClipEndSeconds,
  findClipById,
  canSplitClipAtTime,
  splitClipAtPlayhead,
  toggleClipMute,
  updateClipInConfig,
  addTrack,
  removeTrack,
  reorderTracks,
} from "./editor-utils";
import type { ResolvedTimelineClip, ResolvedTimelineConfig } from "./types";

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

const makeConfig = (clips: ResolvedTimelineClip[]): ResolvedTimelineConfig => ({
  output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
  clips,
  tracks: [{ id: "V2", kind: "visual", label: "V2" }],
  registry: {},
});

describe("isHoldClip", () => {
  it("returns true for hold clips", () => {
    expect(isHoldClip(makeClip({ hold: 3 }))).toBe(true);
  });

  it("returns false for media clips", () => {
    expect(isHoldClip(makeClip())).toBe(false);
  });
});

describe("getClipEndSeconds", () => {
  it("returns at + duration", () => {
    expect(getClipEndSeconds(makeClip({ at: 5, from: 0, to: 3 }))).toBe(8);
  });

  it("accounts for speed", () => {
    expect(getClipEndSeconds(makeClip({ at: 0, from: 0, to: 10, speed: 2 }))).toBe(5);
  });
});

describe("findClipById", () => {
  it("finds existing clip", () => {
    const config = makeConfig([makeClip({ id: "a" }), makeClip({ id: "b" })]);
    expect(findClipById(config, "b")?.id).toBe("b");
  });

  it("returns null for missing clip", () => {
    const config = makeConfig([makeClip({ id: "a" })]);
    expect(findClipById(config, "z")).toBeNull();
  });
});

describe("canSplitClipAtTime", () => {
  it("returns true when playhead is inside clip", () => {
    expect(canSplitClipAtTime(makeClip({ at: 0, from: 0, to: 5 }), 2.5)).toBe(true);
  });

  it("returns false at clip start", () => {
    expect(canSplitClipAtTime(makeClip({ at: 0, from: 0, to: 5 }), 0)).toBe(false);
  });

  it("returns false at clip end", () => {
    expect(canSplitClipAtTime(makeClip({ at: 0, from: 0, to: 5 }), 5)).toBe(false);
  });
});

describe("splitClipAtPlayhead", () => {
  it("splits media clip into two parts", () => {
    const config = makeConfig([makeClip({ id: "c1", at: 0, from: 0, to: 10 })]);
    const result = splitClipAtPlayhead(config, "c1", 5);
    expect(result.config.clips).toHaveLength(2);
    expect(result.config.clips[0].to).toBe(5);
    expect(result.config.clips[1].from).toBe(5);
    expect(result.config.clips[1].at).toBe(5);
  });

  it("splits hold clip", () => {
    const config = makeConfig([makeClip({ id: "c1", at: 0, hold: 10 })]);
    const result = splitClipAtPlayhead(config, "c1", 4);
    expect(result.config.clips).toHaveLength(2);
    expect(result.config.clips[0].hold).toBe(4);
    expect(result.config.clips[1].hold).toBe(6);
  });

  it("returns unchanged config when clip not found", () => {
    const config = makeConfig([makeClip()]);
    const result = splitClipAtPlayhead(config, "nonexistent", 2);
    expect(result.config).toBe(config);
  });
});

describe("toggleClipMute", () => {
  it("mutes an unmuted clip", () => {
    const config = makeConfig([makeClip({ id: "c1", volume: 1 })]);
    const result = toggleClipMute(config, "c1");
    expect(result.clips[0].volume).toBe(0);
  });

  it("unmutes a muted clip", () => {
    const config = makeConfig([makeClip({ id: "c1", volume: 0 })]);
    const result = toggleClipMute(config, "c1");
    expect(result.clips[0].volume).toBe(1);
  });
});

describe("updateClipInConfig", () => {
  it("updates matching clip", () => {
    const config = makeConfig([makeClip({ id: "c1", at: 0 })]);
    const result = updateClipInConfig(config, "c1", (clip) => ({ ...clip, at: 5 }));
    expect(result.clips[0].at).toBe(5);
  });

  it("returns same config when no match", () => {
    const config = makeConfig([makeClip()]);
    const result = updateClipInConfig(config, "nonexistent", (clip) => clip);
    expect(result).toBe(config);
  });
});

describe("addTrack", () => {
  it("adds a visual track with incrementing id", () => {
    const config = makeConfig([]);
    const result = addTrack(config, "visual");
    expect(result.tracks).toHaveLength(2);
    const newTrack = result.tracks[result.tracks.length - 1];
    expect(newTrack.kind).toBe("visual");
    expect(newTrack.id).toBe("V3");
    expect(newTrack.label).toBe("V3");
  });

  it("adds an audio track", () => {
    const config = makeConfig([]);
    const result = addTrack(config, "audio");
    const newTrack = result.tracks[result.tracks.length - 1];
    expect(newTrack.kind).toBe("audio");
    expect(newTrack.id).toMatch(/^A/);
  });

  it("inserts at specified index", () => {
    const config = makeConfig([]);
    const result = addTrack(config, "visual", 0);
    expect(result.tracks[0].id).toMatch(/^V/);
    expect(result.tracks[0].kind).toBe("visual");
  });

  it("does not mutate original config", () => {
    const config = makeConfig([]);
    const originalLength = config.tracks.length;
    addTrack(config, "visual");
    expect(config.tracks).toHaveLength(originalLength);
  });
});

describe("removeTrack", () => {
  it("removes the track and its clips", () => {
    const clip1 = makeClip({ id: "c1", track: "V2" });
    const clip2 = makeClip({ id: "c2", track: "V2" });
    const config = makeConfig([clip1, clip2]);
    const result = removeTrack(config, "V2");
    expect(result.tracks.find((t) => t.id === "V2")).toBeUndefined();
    expect(result.clips).toHaveLength(0);
  });

  it("preserves clips on other tracks", () => {
    const config: ResolvedTimelineConfig = {
      output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
      tracks: [
        { id: "V1", kind: "visual", label: "V1" },
        { id: "V2", kind: "visual", label: "V2" },
      ],
      clips: [
        makeClip({ id: "c1", track: "V1" }),
        makeClip({ id: "c2", track: "V2" }),
      ],
      registry: {},
    };
    const result = removeTrack(config, "V2");
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].id).toBe("c1");
  });

  it("does not mutate original config", () => {
    const config = makeConfig([makeClip()]);
    const originalTrackCount = config.tracks.length;
    removeTrack(config, "V2");
    expect(config.tracks).toHaveLength(originalTrackCount);
  });
});

describe("reorderTracks", () => {
  it("swaps two tracks", () => {
    const config: ResolvedTimelineConfig = {
      output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
      tracks: [
        { id: "V1", kind: "visual", label: "V1" },
        { id: "V2", kind: "visual", label: "V2" },
        { id: "A1", kind: "audio", label: "A1" },
      ],
      clips: [],
      registry: {},
    };
    const result = reorderTracks(config, 0, 2);
    expect(result.tracks[0].id).toBe("V2");
    expect(result.tracks[2].id).toBe("V1");
  });

  it("returns same config for same index", () => {
    const config = makeConfig([]);
    const result = reorderTracks(config, 0, 0);
    expect(result).toBe(config);
  });

  it("returns same config for out-of-bounds index", () => {
    const config = makeConfig([]);
    const result = reorderTracks(config, 0, 99);
    expect(result).toBe(config);
  });

  it("returns same config for negative index", () => {
    const config = makeConfig([]);
    const result = reorderTracks(config, -1, 0);
    expect(result).toBe(config);
  });
});
