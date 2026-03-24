import { describe, it, expect } from "vitest";
import * as mod from "./TrackPanel";

describe("TrackPanel", () => {
  it("exports TrackPanel", () => {
    expect(typeof mod.TrackPanel).toBe("function");
  });

  it("exports TrackSettingsBody", () => {
    expect(typeof mod.TrackSettingsBody).toBe("function");
  });
});
