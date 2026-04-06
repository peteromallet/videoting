import { describe, expect, it, vi } from "vitest";

// Mock remotion
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 0),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 300 })),
  interpolate: vi.fn((value: number) => value),
  spring: vi.fn(() => 1),
  Easing: { bezier: vi.fn(() => (t: number) => t) },
  AbsoluteFill: "absolute-fill",
}));

import { getEntry, getEffectsForRole } from "./unified-registry";

describe("getEntry", () => {
  it("returns an entry with progressFn for 'fade'", () => {
    const entry = getEntry("fade");
    expect(entry).toBeDefined();
    expect(entry!.progressFn).toBeDefined();
    expect(typeof entry!.progressFn).toBe("function");
  });

  it("resolves alias 'zoom-in' to 'zoom'", () => {
    const entry = getEntry("zoom-in");
    expect(entry).toBeDefined();
    expect(entry!.progressFn).toBeDefined();
    // Should be the same entry as 'zoom'
    expect(entry).toBe(getEntry("zoom"));
  });

  it("resolves alias 'fade-out' to 'fade'", () => {
    const entry = getEntry("fade-out");
    expect(entry).toBeDefined();
    expect(entry).toBe(getEntry("fade"));
  });

  it("returns an entry with legacyComponent and roles: ['entrance'] for 'meteorite'", () => {
    const entry = getEntry("meteorite");
    expect(entry).toBeDefined();
    expect(entry!.legacyComponent).toBeDefined();
    expect(entry!.progressFn).toBeUndefined();
    expect(entry!.metadata.roles).toEqual(["entrance"]);
  });

  it("returns undefined for unknown effect", () => {
    expect(getEntry("nonexistent-effect")).toBeUndefined();
  });
});

describe("getEffectsForRole", () => {
  it("'entrance' includes 'fade'", () => {
    const effects = getEffectsForRole("entrance");
    expect(effects).toContain("fade");
  });

  it("'exit' includes 'fade'", () => {
    const effects = getEffectsForRole("exit");
    expect(effects).toContain("fade");
  });

  it("'entrance' does NOT include 'ken-burns'", () => {
    const effects = getEffectsForRole("entrance");
    expect(effects).not.toContain("ken-burns");
  });

  it("'continuous' includes 'ken-burns', 'fade', and 'audio-pulse'", () => {
    const effects = getEffectsForRole("continuous");
    expect(effects).toContain("ken-burns");
    expect(effects).toContain("fade");
    expect(effects).toContain("audio-pulse");
  });
});
