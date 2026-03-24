import { describe, it, expect } from "vitest";
import type { TrackDefinition } from "@shared/types";
import { resolveDropTarget } from "@/tools/video-editor/lib/coordinate-utils";
import * as mod from "./useCrossTrackDrag";

describe("useCrossTrackDrag", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useCrossTrackDrag).toBe("function");
  });
});

describe("resolveDropTarget (cross-track targeting)", () => {
  const tracks: TrackDefinition[] = [
    { id: "V1", kind: "visual", label: "V1" },
    { id: "V2", kind: "visual", label: "V2" },
    { id: "A1", kind: "audio", label: "A1" },
  ];

  it("returns track when rowIndex matches and kind is compatible", () => {
    expect(resolveDropTarget(tracks, 1, 3, "visual")).toEqual({ kind: "track", trackId: "V2" });
  });

  it("rejects when kind is mismatched", () => {
    expect(resolveDropTarget(tracks, 0, 3, "audio")).toEqual({ kind: "reject" });
  });

  it("returns create when rowIndex >= rowCount", () => {
    expect(resolveDropTarget(tracks, 3, 3, "visual")).toEqual({ kind: "create" });
  });

  it("returns create when rowIndex is exactly one past end", () => {
    expect(resolveDropTarget(tracks, 3, 3, "audio")).toEqual({ kind: "create" });
  });

  it("rejects with empty tracks array (rowIndex 0 >= rowCount 0)", () => {
    expect(resolveDropTarget([], 0, 0, "visual")).toEqual({ kind: "create" });
  });
});
