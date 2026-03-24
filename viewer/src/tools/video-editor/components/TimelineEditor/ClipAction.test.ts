import { describe, it, expect } from "vitest";
import * as mod from "./ClipAction";

describe("ClipAction", () => {
  it("exports the component", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.ClipAction).toBe("function");
  });
});
