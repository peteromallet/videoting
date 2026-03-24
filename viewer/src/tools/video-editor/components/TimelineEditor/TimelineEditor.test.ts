import { describe, it, expect } from "vitest";
import * as mod from "./TimelineEditor";

describe("TimelineEditor", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.TimelineEditor).toBe("function");
  });
});
