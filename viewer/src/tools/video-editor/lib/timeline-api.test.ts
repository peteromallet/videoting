import { describe, it, expect } from "vitest";
import * as mod from "./timeline-api";

describe("timeline-api", () => {
  it("exports fetchJson", () => {
    expect(typeof mod.fetchJson).toBe("function");
  });

  it("exports loadTimelineConfig", () => {
    expect(typeof mod.loadTimelineConfig).toBe("function");
  });

  it("exports loadAssetRegistry", () => {
    expect(typeof mod.loadAssetRegistry).toBe("function");
  });

  it("exports saveTimelineConfig", () => {
    expect(typeof mod.saveTimelineConfig).toBe("function");
  });

  it("exports uploadAssetFile", () => {
    expect(typeof mod.uploadAssetFile).toBe("function");
  });
});
