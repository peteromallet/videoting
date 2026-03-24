import { describe, it, expect } from "vitest";
import * as mod from "./VideoEditorPage";

describe("VideoEditorPage", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.VideoEditorPage).toBe("function");
  });
});
