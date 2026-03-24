import { describe, it, expect } from "vitest";
import * as mod from "./useTimelineEditing";

describe("useTimelineEditing", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useTimelineEditing).toBe("function");
  });
});
