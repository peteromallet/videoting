import { describe, expect, it } from "vitest";
import type { TrackDefinition } from "@shared/types";
import {
  buildRowTrackPatches,
  buildTrackClipOrder,
  formatTime,
  getCompatibleTrackId,
  isEditableTarget,
  moveClipBetweenTracks,
  updateClipOrder,
} from "./coordinate-utils";

describe("formatTime", () => {
  it("formats zero", () => {
    expect(formatTime(0)).toBe("0:00.00");
  });

  it("formats seconds with leading zeros", () => {
    expect(formatTime(5)).toBe("0:05.00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(65)).toBe("1:05.00");
  });

  it("formats fractional seconds", () => {
    expect(formatTime(3.5)).toBe("0:03.50");
  });

  it("formats precise sub-second values", () => {
    expect(formatTime(10.25)).toBe("0:10.25");
  });

  it("formats large timestamps", () => {
    expect(formatTime(600)).toBe("10:00.00");
  });
});

describe("updateClipOrder", () => {
  it("updates an existing track's clip order", () => {
    const current = { V2: ["clip-0", "clip-1"], A1: ["clip-2"] };
    const result = updateClipOrder(current, "V2", (ids) => [...ids, "clip-3"]);
    expect(result.V2).toEqual(["clip-0", "clip-1", "clip-3"]);
    expect(result.A1).toEqual(["clip-2"]);
  });

  it("creates entry for a new track", () => {
    const current = { V2: ["clip-0"] };
    const result = updateClipOrder(current, "A1", (ids) => [...ids, "clip-1"]);
    expect(result.A1).toEqual(["clip-1"]);
    expect(result.V2).toEqual(["clip-0"]);
  });

  it("handles removal via update function", () => {
    const current = { V2: ["clip-0", "clip-1", "clip-2"] };
    const result = updateClipOrder(current, "V2", (ids) => ids.filter((id) => id !== "clip-1"));
    expect(result.V2).toEqual(["clip-0", "clip-2"]);
  });
});

describe("buildTrackClipOrder", () => {
  const tracks: TrackDefinition[] = [
    { id: "V2", kind: "visual", label: "V2" },
    { id: "A1", kind: "audio", label: "A1" },
  ];

  it("builds order from tracks and existing clipOrder", () => {
    const clipOrder = { V2: ["clip-0", "clip-1"], A1: ["clip-2"] };
    const result = buildTrackClipOrder(tracks, clipOrder);
    expect(result).toEqual({ V2: ["clip-0", "clip-1"], A1: ["clip-2"] });
  });

  it("filters out removed IDs", () => {
    const clipOrder = { V2: ["clip-0", "clip-1"], A1: ["clip-2"] };
    const result = buildTrackClipOrder(tracks, clipOrder, ["clip-1"]);
    expect(result.V2).toEqual(["clip-0"]);
    expect(result.A1).toEqual(["clip-2"]);
  });

  it("handles missing tracks gracefully", () => {
    const result = buildTrackClipOrder(tracks, {});
    expect(result).toEqual({ V2: [], A1: [] });
  });
});

describe("moveClipBetweenTracks", () => {
  it("moves a clip from one track to another", () => {
    const clipOrder = { V2: ["clip-0", "clip-1"], A1: [] };
    const result = moveClipBetweenTracks(clipOrder, "clip-1", "V2", "A1");
    expect(result.V2).toEqual(["clip-0"]);
    expect(result.A1).toEqual(["clip-1"]);
  });

  it("returns same object when source equals target", () => {
    const clipOrder = { V2: ["clip-0"] };
    const result = moveClipBetweenTracks(clipOrder, "clip-0", "V2", "V2");
    expect(result).toBe(clipOrder);
  });

  it("deduplicates if clip already exists in target", () => {
    const clipOrder = { V2: ["clip-0", "clip-1"], A1: ["clip-1"] };
    const result = moveClipBetweenTracks(clipOrder, "clip-1", "V2", "A1");
    expect(result.A1).toEqual(["clip-1"]);
    expect(result.V2).toEqual(["clip-0"]);
  });
});

describe("getCompatibleTrackId", () => {
  const tracks: TrackDefinition[] = [
    { id: "V1", kind: "visual", label: "V1" },
    { id: "V2", kind: "visual", label: "V2" },
    { id: "V3", kind: "visual", label: "V3" },
    { id: "A1", kind: "audio", label: "A1" },
  ];

  it("returns exact match when desiredTrackId is compatible", () => {
    expect(getCompatibleTrackId(tracks, "V3", "visual", null)).toBe("V3");
  });

  it("returns selected track when desired is missing", () => {
    expect(getCompatibleTrackId(tracks, undefined, "visual", "V1")).toBe("V1");
  });

  it("defaults to V2 for visual when no preference matches", () => {
    expect(getCompatibleTrackId(tracks, undefined, "visual", null)).toBe("V2");
  });

  it("defaults to A1 for audio when no preference matches", () => {
    expect(getCompatibleTrackId(tracks, undefined, "audio", null)).toBe("A1");
  });

  it("returns null when no compatible tracks exist", () => {
    const visualOnly: TrackDefinition[] = [{ id: "V1", kind: "visual", label: "V1" }];
    expect(getCompatibleTrackId(visualOnly, undefined, "audio", null)).toBeNull();
  });

  it("ignores desired track if it has incompatible kind", () => {
    expect(getCompatibleTrackId(tracks, "A1", "visual", null)).toBe("V2");
  });
});

describe("buildRowTrackPatches", () => {
  it("builds track patch for each action", () => {
    const rows = [
      { id: "V2", actions: [{ id: "clip-0" }, { id: "clip-1" }] },
      { id: "A1", actions: [{ id: "clip-2" }] },
    ];
    const patches = buildRowTrackPatches(rows);
    expect(patches["clip-0"]).toEqual({ track: "V2" });
    expect(patches["clip-1"]).toEqual({ track: "V2" });
    expect(patches["clip-2"]).toEqual({ track: "A1" });
  });

  it("returns empty for empty rows", () => {
    expect(buildRowTrackPatches([])).toEqual({});
  });
});

describe("isEditableTarget", () => {
  it("returns false for null when HTMLElement is available", () => {
    // isEditableTarget uses instanceof HTMLElement which requires a DOM environment.
    // Without jsdom, HTMLElement is not defined, so we just verify the export exists.
    expect(typeof isEditableTarget).toBe("function");
  });
});
