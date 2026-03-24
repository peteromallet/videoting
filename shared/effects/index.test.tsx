import { describe, expect, it, vi } from "vitest";

// Mock remotion (used by entrance/exit/continuous components)
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 0),
  interpolate: vi.fn((value: number) => value),
  spring: vi.fn(() => 1),
  Easing: { bezier: vi.fn(() => (t: number) => t) },
}));

import {
  entranceEffects,
  exitEffects,
  continuousEffects,
  entranceEffectTypes,
  exitEffectTypes,
  continuousEffectTypes,
  wrapWithClipEffects,
} from "./index";

describe("entranceEffects", () => {
  it("has all expected entrance types", () => {
    const expected = [
      "slide-up",
      "slide-down",
      "slide-left",
      "slide-right",
      "zoom-in",
      "zoom-spin",
      "pulse",
      "fade",
      "flip",
      "bounce",
    ];
    for (const type of expected) {
      expect(entranceEffects[type]).toBeDefined();
      expect(typeof entranceEffects[type]).toBe("function");
    }
  });

  it("entranceEffectTypes matches keys", () => {
    expect(entranceEffectTypes).toEqual(Object.keys(entranceEffects));
  });

  it("has exactly 10 entrance effects", () => {
    expect(Object.keys(entranceEffects)).toHaveLength(10);
  });
});

describe("exitEffects", () => {
  it("has all expected exit types", () => {
    const expected = ["slide-down", "zoom-out", "flip", "fade-out", "shrink", "dissolve"];
    for (const type of expected) {
      expect(exitEffects[type]).toBeDefined();
      expect(typeof exitEffects[type]).toBe("function");
    }
  });

  it("exitEffectTypes matches keys", () => {
    expect(exitEffectTypes).toEqual(Object.keys(exitEffects));
  });

  it("has exactly 6 exit effects", () => {
    expect(Object.keys(exitEffects)).toHaveLength(6);
  });
});

describe("continuousEffects", () => {
  it("has all expected continuous types", () => {
    const expected = ["ken-burns", "float", "glitch", "slow-zoom", "drift"];
    for (const type of expected) {
      expect(continuousEffects[type]).toBeDefined();
      expect(typeof continuousEffects[type]).toBe("function");
    }
  });

  it("continuousEffectTypes matches keys", () => {
    expect(continuousEffectTypes).toEqual(Object.keys(continuousEffects));
  });

  it("has exactly 5 continuous effects", () => {
    expect(Object.keys(continuousEffects)).toHaveLength(5);
  });
});

describe("wrapWithClipEffects", () => {
  it("is exported as a function", () => {
    expect(typeof wrapWithClipEffects).toBe("function");
  });

  it("returns content unchanged when clip has no effects", () => {
    const content = "test content";
    const clip = { id: "clip-0", at: 0, track: "V2", from: 0, to: 5 } as any;
    const result = wrapWithClipEffects(content, clip, 150, 30);
    expect(result).toBe(content);
  });
});
