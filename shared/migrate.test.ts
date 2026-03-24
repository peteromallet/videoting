import { describe, it, expect } from "vitest";
import { migrateToFlatTracks } from "./migrate";
import type { TimelineConfig } from "./types";

const makeLegacyConfig = (): TimelineConfig => ({
  output: {
    resolution: "1280x720",
    fps: 30,
    file: "output/render.mp4",
    background: "bg-image",
    background_scale: 0.95,
  },
  clips: [
    { id: "clip-0", at: 0, track: "video", asset: "demo-one", from: 0, to: 10 },
    { id: "clip-1", at: 5, track: "overlay", asset: "venn-diagram", hold: 3 },
    { id: "clip-2", at: 0, track: "audio", asset: "narration", from: 0, to: 20 },
  ],
});

const makeModernConfig = (): TimelineConfig => ({
  output: {
    resolution: "1280x720",
    fps: 30,
    file: "output/render.mp4",
  },
  tracks: [
    { id: "V1", kind: "visual", label: "V1", scale: 1, fit: "cover", opacity: 1, blendMode: "normal" },
    { id: "V2", kind: "visual", label: "V2", scale: 0.95, fit: "contain", opacity: 1, blendMode: "normal" },
    { id: "A1", kind: "audio", label: "A1", scale: 1, fit: "contain", opacity: 1, blendMode: "normal" },
  ],
  clips: [
    { id: "clip-0", at: 0, track: "V2", clipType: "media", asset: "demo-one", from: 0, to: 10 },
    { id: "clip-1", at: 0, track: "A1", clipType: "media", asset: "narration", from: 0, to: 20 },
  ],
});

describe("migrateToFlatTracks", () => {
  describe("legacy format conversion", () => {
    it("converts old track names to new format", () => {
      const result = migrateToFlatTracks(makeLegacyConfig());
      const trackIds = new Set(result.clips.map((c) => c.track));
      expect(trackIds.has("video")).toBe(false);
      expect(trackIds.has("overlay")).toBe(false);
      expect(trackIds.has("audio")).toBe(false);
      expect(trackIds.has("V2")).toBe(true);
      expect(trackIds.has("V3")).toBe(true);
      expect(trackIds.has("A1")).toBe(true);
    });

    it("creates default tracks when none are defined", () => {
      const result = migrateToFlatTracks(makeLegacyConfig());
      expect(result.tracks).toBeDefined();
      expect(result.tracks!.length).toBeGreaterThanOrEqual(4);
      const trackIds = result.tracks!.map((t) => t.id);
      expect(trackIds).toContain("V1");
      expect(trackIds).toContain("V2");
      expect(trackIds).toContain("V3");
      expect(trackIds).toContain("A1");
    });

    it("creates a background clip on V1 when background is specified", () => {
      const result = migrateToFlatTracks(makeLegacyConfig());
      const bgClip = result.clips.find((c) => c.track === "V1");
      expect(bgClip).toBeDefined();
      expect(bgClip!.asset).toBe("bg-image");
      expect(bgClip!.clipType).toBe("hold");
    });

    it("assigns clipType based on clip properties", () => {
      const result = migrateToFlatTracks(makeLegacyConfig());
      const holdClip = result.clips.find((c) => c.id === "clip-1");
      expect(holdClip!.clipType).toBe("hold");

      const mediaClip = result.clips.find((c) => c.id === "clip-0");
      expect(mediaClip!.clipType).toBe("media");
    });

    it("preserves output settings", () => {
      const result = migrateToFlatTracks(makeLegacyConfig());
      expect(result.output.resolution).toBe("1280x720");
      expect(result.output.fps).toBe(30);
    });
  });

  describe("already-migrated config", () => {
    it("passes through config with existing tracks unchanged", () => {
      const modern = makeModernConfig();
      const result = migrateToFlatTracks(modern);
      expect(result.tracks).toHaveLength(modern.tracks!.length);
      expect(result.clips).toHaveLength(modern.clips.length);
      expect(result.tracks!.map((t) => t.id)).toEqual(modern.tracks!.map((t) => t.id));
    });

    it("preserves track properties", () => {
      const result = migrateToFlatTracks(makeModernConfig());
      const v2 = result.tracks!.find((t) => t.id === "V2");
      expect(v2!.scale).toBe(0.95);
      expect(v2!.fit).toBe("contain");
    });

    it("infers clipType when missing on modern config", () => {
      const config: TimelineConfig = {
        output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
        tracks: [{ id: "V1", kind: "visual", label: "V1" }],
        clips: [
          { id: "c1", at: 0, track: "V1", asset: "img", hold: 5 },
          { id: "c2", at: 5, track: "V1", asset: "vid", from: 0, to: 10 },
          { id: "c3", at: 15, track: "V1", hold: 3, text: { content: "Title" } },
        ],
      };
      const result = migrateToFlatTracks(config);
      expect(result.clips[0].clipType).toBe("hold");
      expect(result.clips[1].clipType).toBe("media");
      expect(result.clips[2].clipType).toBe("text");
    });

    it("does not mutate the input config", () => {
      const modern = makeModernConfig();
      const originalClipCount = modern.clips.length;
      const originalTrackCount = modern.tracks!.length;
      migrateToFlatTracks(modern);
      expect(modern.clips).toHaveLength(originalClipCount);
      expect(modern.tracks).toHaveLength(originalTrackCount);
    });
  });
});
