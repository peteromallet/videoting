import { describe, it, expect } from "vitest";
import * as mod from "./useCrossTrackDrag";

describe("useCrossTrackDrag", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useCrossTrackDrag).toBe("function");
  });
});
