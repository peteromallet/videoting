import { describe, it, expect } from "vitest";
import * as mod from "./useEditorSettings";

describe("useEditorSettings", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useEditorSettings).toBe("function");
  });
});
