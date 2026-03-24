import { describe, it, expect } from "vitest";
import * as mod from "./useTimelinePlayback";

describe("useTimelinePlayback", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useTimelinePlayback).toBe("function");
  });
});
