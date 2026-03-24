import { describe, it, expect } from "vitest";
import * as mod from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  it("exports the hook function", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.useKeyboardShortcuts).toBe("function");
  });
});
