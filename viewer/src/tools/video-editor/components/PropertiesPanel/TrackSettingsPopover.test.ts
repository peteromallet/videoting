import { describe, it, expect } from "vitest";
import * as mod from "./TrackSettingsPopover";

describe("TrackSettingsPopover", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.TrackSettingsPopover).toBe("function");
  });
});
