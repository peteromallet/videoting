import { describe, it, expect } from "vitest";
import * as mod from "./Toolbar";

describe("Toolbar", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.Toolbar).toBe("function");
  });
});
