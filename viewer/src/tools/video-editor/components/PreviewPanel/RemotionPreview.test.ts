import { describe, it, expect } from "vitest";
import * as mod from "./RemotionPreview";

describe("RemotionPreview", () => {
  it("exports the component as default", () => {
    expect(mod).toBeDefined();
    expect(typeof mod.default).toBe("object"); // forwardRef returns an object
  });
});
