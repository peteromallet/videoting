import { describe, it, expect } from "vitest";
import * as mod from "./PreviewPanel";

describe("PreviewPanel", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.PreviewPanel).toBe("function");
  });
});
