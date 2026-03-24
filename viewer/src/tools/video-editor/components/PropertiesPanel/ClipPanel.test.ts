import { describe, it, expect } from "vitest";
import * as mod from "./ClipPanel";

describe("ClipPanel", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.ClipPanel).toBe("function");
  });
});
