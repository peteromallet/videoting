import { describe, it, expect } from "vitest";
import * as mod from "./TimelineContext";

describe("TimelineContext", () => {
  it("exports TimelineProvider", () => {
    expect(typeof mod.TimelineProvider).toBe("function");
  });

  it("exports useEditorContext", () => {
    expect(typeof mod.useEditorContext).toBe("function");
  });

  it("exports usePlaybackContext", () => {
    expect(typeof mod.usePlaybackContext).toBe("function");
  });

  it("exports useTimelineContext", () => {
    expect(typeof mod.useTimelineContext).toBe("function");
  });
});
