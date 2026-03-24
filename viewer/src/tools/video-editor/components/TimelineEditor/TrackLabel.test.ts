import { describe, it, expect } from "vitest";
import * as mod from "./TrackLabel";

describe("TrackLabel", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.TrackLabel).toBe("function");
  });
});
