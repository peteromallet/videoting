import { describe, it, expect } from "vitest";
import * as mod from "./AssetPanel";

describe("AssetPanel", () => {
  it("exports the component as default", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
