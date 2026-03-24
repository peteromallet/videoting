import { describe, it, expect } from "vitest";
import * as mod from "./TimelineContext";

describe("TimelineContext", () => {
  it("exports TimelineProvider", () => {
    expect(typeof mod.TimelineProvider).toBe("function");
  });

  it("exports useTimelineContext", () => {
    expect(typeof mod.useTimelineContext).toBe("function");
  });
});
