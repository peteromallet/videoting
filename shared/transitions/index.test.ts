import { describe, expect, it, vi } from "vitest";

// Mock remotion's interpolate
vi.mock("remotion", () => ({
  interpolate: vi.fn((value: number, inputRange: number[], outputRange: number[]) => {
    // Simple linear interpolation for testing
    const t = (value - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return outputRange[0] + t * (outputRange[1] - outputRange[0]);
  }),
}));

const { transitions, transitionTypes } = await import("./index");

describe("transitionTypes", () => {
  it("has expected transition entries", () => {
    const expected = ["crossfade", "wipe", "slide-push", "zoom-through"];
    expect(transitionTypes).toEqual(expected);
  });

  it("matches the keys of transitions record", () => {
    expect(transitionTypes).toEqual(Object.keys(transitions));
  });
});

describe("transitions", () => {
  it("crossfade returns opacity style", () => {
    const style = transitions.crossfade(0.5);
    expect(style).toHaveProperty("opacity");
    expect(typeof style.opacity).toBe("number");
  });

  it("crossfade at 0 has opacity 0", () => {
    const style = transitions.crossfade(0);
    expect(style.opacity).toBe(0);
  });

  it("crossfade at 1 has opacity 1", () => {
    const style = transitions.crossfade(1);
    expect(style.opacity).toBe(1);
  });

  it("wipe returns clipPath style", () => {
    const style = transitions.wipe(0.5);
    expect(style).toHaveProperty("clipPath");
    expect(typeof style.clipPath).toBe("string");
  });

  it("wipe at 1 has no clipping", () => {
    const style = transitions.wipe(1);
    expect(style.clipPath).toBe("inset(0 0% 0 0)");
  });

  it("slide-push returns transform style", () => {
    const style = transitions["slide-push"](0.5);
    expect(style).toHaveProperty("transform");
    expect(typeof style.transform).toBe("string");
    expect(style.transform).toContain("translateX");
  });

  it("zoom-through returns opacity and transform", () => {
    const style = transitions["zoom-through"](0.5);
    expect(style).toHaveProperty("opacity");
    expect(style).toHaveProperty("transform");
    expect(style.transform).toContain("scale");
  });

  it("all transitions are functions", () => {
    for (const [key, fn] of Object.entries(transitions)) {
      expect(typeof fn).toBe("function");
      const result = fn(0.5);
      expect(typeof result).toBe("object");
    }
  });
});
