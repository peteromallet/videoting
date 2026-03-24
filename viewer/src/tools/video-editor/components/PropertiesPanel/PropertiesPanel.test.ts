import { describe, it, expect } from "vitest";
import * as mod from "./PropertiesPanel";

describe("PropertiesPanel", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.PropertiesPanel).toBe("function");
  });
});
