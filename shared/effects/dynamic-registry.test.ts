import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock remotion for compileEffect
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 0),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 300 })),
  interpolate: vi.fn((value: number) => value),
  spring: vi.fn(() => 1),
  AbsoluteFill: "div",
}));

import { DynamicEffectRegistry } from "./dynamic-registry";
import { preloadSucrase } from "./compile";
import type { FC } from "react";
import type { EffectComponentProps } from "./entrances";

const FakeBuiltIn: FC<EffectComponentProps> = ({ children }) => children as any;
const AnotherBuiltIn: FC<EffectComponentProps> = ({ children }) => children as any;

describe("DynamicEffectRegistry", () => {
  beforeAll(async () => {
    await preloadSucrase();
  });

  it("returns built-in effects by name", () => {
    const registry = new DynamicEffectRegistry({ "fade": FakeBuiltIn });
    expect(registry.get("fade")).toBe(FakeBuiltIn);
  });

  it("returns undefined for unknown effects", () => {
    const registry = new DynamicEffectRegistry({ "fade": FakeBuiltIn });
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("registers and retrieves dynamic effects", () => {
    const registry = new DynamicEffectRegistry({});
    const code = `
      const MyEffect = ({ children }) => React.createElement("div", null, children);
      exports.default = MyEffect;
    `;
    registry.register("my-effect", code);
    expect(registry.get("my-effect")).toBeDefined();
    expect(typeof registry.get("my-effect")).toBe("function");
  });

  it("unregisters dynamic effects", () => {
    const registry = new DynamicEffectRegistry({});
    const code = `
      const MyEffect = ({ children }) => React.createElement("div", null, children);
      exports.default = MyEffect;
    `;
    registry.register("my-effect", code);
    expect(registry.get("my-effect")).toBeDefined();

    registry.unregister("my-effect");
    expect(registry.get("my-effect")).toBeUndefined();
  });

  it("built-in effects take priority over dynamic ones with the same name", () => {
    const registry = new DynamicEffectRegistry({ "fade": FakeBuiltIn });
    const code = `
      const Fade = ({ children }) => React.createElement("span", null, children);
      exports.default = Fade;
    `;
    registry.register("fade", code);
    // Built-in should still win
    expect(registry.get("fade")).toBe(FakeBuiltIn);
  });

  it("listAll merges built-in and dynamic names", () => {
    const registry = new DynamicEffectRegistry({
      "fade": FakeBuiltIn,
      "zoom": AnotherBuiltIn,
    });
    const code = `
      const Custom = ({ children }) => React.createElement("div", null, children);
      exports.default = Custom;
    `;
    registry.register("sparkle", code);
    const all = registry.listAll();
    expect(all).toContain("fade");
    expect(all).toContain("zoom");
    expect(all).toContain("sparkle");
  });

  it("getCode returns source for dynamic effects", () => {
    const registry = new DynamicEffectRegistry({});
    const code = `
      const MyEffect = ({ children }) => React.createElement("div", null, children);
      exports.default = MyEffect;
    `;
    registry.register("my-effect", code);
    expect(registry.getCode("my-effect")).toBe(code);
  });

  it("getCode returns undefined for built-in effects", () => {
    const registry = new DynamicEffectRegistry({ "fade": FakeBuiltIn });
    expect(registry.getCode("fade")).toBeUndefined();
  });

  it("isDynamic correctly identifies dynamic vs built-in", () => {
    const registry = new DynamicEffectRegistry({ "fade": FakeBuiltIn });
    const code = `
      const Custom = ({ children }) => React.createElement("div", null, children);
      exports.default = Custom;
    `;
    registry.register("sparkle", code);
    expect(registry.isDynamic("sparkle")).toBe(true);
    expect(registry.isDynamic("fade")).toBe(false);
    expect(registry.isDynamic("nonexistent")).toBe(false);
  });

  it("getAllDynamicCode returns all dynamic source codes", () => {
    const registry = new DynamicEffectRegistry({});
    const code1 = `exports.default = ({ children }) => React.createElement("div", null, children);`;
    const code2 = `exports.default = ({ children }) => React.createElement("span", null, children);`;
    registry.register("a", code1);
    registry.register("b", code2);
    const all = registry.getAllDynamicCode();
    expect(all["a"]).toBe(code1);
    expect(all["b"]).toBe(code2);
  });

  it("throws on invalid code during register", () => {
    const registry = new DynamicEffectRegistry({});
    expect(() => registry.register("bad", "this is not {{ valid")).toThrow();
  });
});
