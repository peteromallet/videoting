import React from "react";
import { describe, expect, it, vi } from "vitest";

globalThis.React = React as typeof React;

// Mock remotion (used by entrance/exit/continuous components)
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 0),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 300 })),
  interpolate: vi.fn((value: number) => value),
  spring: vi.fn(() => 1),
  Easing: { bezier: vi.fn(() => (t: number) => t) },
  AbsoluteFill: "absolute-fill",
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

describe("entranceEffects (legacy Record)", () => {
  it("has all expected entrance component types", () => {
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
      "meteorite",
    ];
    for (const type of expected) {
      expect(entranceEffects[type]).toBeDefined();
      expect(typeof entranceEffects[type]).toBe("function");
    }
  });

  it("has exactly 11 entrance effect components", () => {
    expect(Object.keys(entranceEffects)).toHaveLength(11);
  });
});

describe("exitEffects (legacy Record)", () => {
  it("has all expected exit component types", () => {
    const expected = ["slide-down", "zoom-out", "flip", "fade-out", "shrink", "dissolve"];
    for (const type of expected) {
      expect(exitEffects[type]).toBeDefined();
      expect(typeof exitEffects[type]).toBe("function");
    }
  });

  it("has exactly 6 exit effect components", () => {
    expect(Object.keys(exitEffects)).toHaveLength(6);
  });
});

describe("continuousEffects (legacy Record)", () => {
  it("has all expected continuous component types", () => {
    const expected = [
      "ken-burns",
      "float",
      "glitch",
      "slow-zoom",
      "drift",
      "audio-pulse",
      "audio-mask-circle",
      "audio-mask-bars",
      "audio-mask-wave",
      "audio-glow",
    ];
    for (const type of expected) {
      expect(continuousEffects[type]).toBeDefined();
      expect(typeof continuousEffects[type]).toBe("function");
    }
  });

  it("has exactly 10 continuous effect components", () => {
    expect(Object.keys(continuousEffects)).toHaveLength(10);
  });
});

describe("unified effect type lists", () => {
  it("entranceEffectTypes includes all 13 entrance-capable effects", () => {
    // 9 progress-based + 4 legacy entrance-only (meteorite, bounce, zoom-spin, pulse)
    expect(entranceEffectTypes).toHaveLength(13);
  });

  it("entranceEffectTypes includes progress-based effects", () => {
    expect(entranceEffectTypes).toContain("fade");
    expect(entranceEffectTypes).toContain("zoom");
    expect(entranceEffectTypes).toContain("slide-up");
    expect(entranceEffectTypes).toContain("shrink");
    expect(entranceEffectTypes).toContain("dissolve");
  });

  it("entranceEffectTypes includes legacy entrance-only effects", () => {
    expect(entranceEffectTypes).toContain("meteorite");
    expect(entranceEffectTypes).toContain("bounce");
    expect(entranceEffectTypes).toContain("zoom-spin");
    expect(entranceEffectTypes).toContain("pulse");
  });

  it("entranceEffectTypes does NOT include continuous-only effects", () => {
    expect(entranceEffectTypes).not.toContain("ken-burns");
    expect(entranceEffectTypes).not.toContain("audio-pulse");
  });

  it("exitEffectTypes includes all 9 exit-capable effects", () => {
    // 9 progress-based effects (all support exit)
    expect(exitEffectTypes).toHaveLength(9);
  });

  it("exitEffectTypes includes progress-based effects", () => {
    expect(exitEffectTypes).toContain("fade");
    expect(exitEffectTypes).toContain("zoom");
    expect(exitEffectTypes).toContain("flip");
    expect(exitEffectTypes).toContain("shrink");
    expect(exitEffectTypes).toContain("dissolve");
  });

  it("continuousEffectTypes includes all 19 continuous-capable effects", () => {
    // 9 progress-based + 5 legacy continuous + 5 audio-reactive
    expect(continuousEffectTypes).toHaveLength(19);
  });

  it("continuousEffectTypes includes progress-based, legacy, and audio-reactive", () => {
    expect(continuousEffectTypes).toContain("fade");
    expect(continuousEffectTypes).toContain("ken-burns");
    expect(continuousEffectTypes).toContain("audio-pulse");
    expect(continuousEffectTypes).toContain("float");
    expect(continuousEffectTypes).toContain("dissolve");
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

  it("adds an isolation wrapper when the clip has effects", () => {
    const content = "test content";
    const clip = {
      id: "clip-1",
      at: 0,
      track: "V2",
      from: 0,
      to: 5,
      continuous: { type: "glitch", intensity: 0.5 },
    } as any;
    const result = wrapWithClipEffects(content, clip, 150, 30) as any;
    expect(result.props.style).toEqual({ isolation: "isolate" });
  });

  it("passes audioTrack to continuous audio-reactive effects", () => {
    const content = "test content";
    const clip = {
      id: "clip-audio",
      at: 0,
      track: "V2",
      from: 0,
      to: 5,
      continuous: { type: "audio-pulse", intensity: 0.5, audioTrack: "A2" },
    } as any;

    const result = wrapWithClipEffects(content, clip, 150, 30) as any;

    expect(result.props.style).toEqual({ isolation: "isolate" });
    expect(result.props.children.type).toBe(continuousEffects["audio-pulse"]);
    expect(result.props.children.props.audioTrack).toBe("A2");
  });
});
