import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock remotion — compileEffect imports these at the module level
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 0),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 300 })),
  interpolate: vi.fn((value: number, inputRange: number[], outputRange: number[]) => {
    if (inputRange.length < 2 || outputRange.length < 2) return value;
    const t = (value - inputRange[0]) / (inputRange[inputRange.length - 1] - inputRange[0]);
    return outputRange[0] + t * (outputRange[outputRange.length - 1] - outputRange[0]);
  }),
  spring: vi.fn(() => 1),
  AbsoluteFill: "div",
}));

import { compileEffectAsync, preloadSucrase, compileEffect } from "./compile";

describe("compileEffect", () => {
  // Preload sucrase so synchronous compileEffect works
  beforeAll(async () => {
    await preloadSucrase();
  });

  it("compiles a valid effect source and returns a function", () => {
    const code = `
      const MyEffect = ({ children }) => {
        return React.createElement("div", null, children);
      };
      exports.default = MyEffect;
    `;
    const component = compileEffect(code);
    expect(typeof component).toBe("function");
  });

  it("compiled component is callable", () => {
    const code = `
      const MyEffect = ({ children, durationInFrames }) => {
        return React.createElement("div", { "data-duration": durationInFrames }, children);
      };
      exports.default = MyEffect;
    `;
    const Component = compileEffect(code);
    expect(typeof Component).toBe("function");
  });

  it("throws on invalid JavaScript", () => {
    expect(() => compileEffect("this is not {{ valid code")).toThrow("compilation failed");
  });

  it("throws when code does not export a function", () => {
    const code = `
      exports.default = "not a function";
    `;
    expect(() => compileEffect(code)).toThrow("did not produce a valid component");
  });

  it("throws when code exports nothing", () => {
    const code = `
      const x = 42;
    `;
    expect(() => compileEffect(code)).toThrow("did not produce a valid component");
  });

  it("provides interpolate to the compiled code", () => {
    const code = `
      const MyEffect = ({ children }) => {
        const val = interpolate(0.5, [0, 1], [0, 100]);
        return React.createElement("div", { "data-val": val }, children);
      };
      exports.default = MyEffect;
    `;
    const component = compileEffect(code);
    expect(typeof component).toBe("function");
  });

  it("provides useCurrentFrame to the compiled code", () => {
    const code = `
      const MyEffect = ({ children }) => {
        const frame = useCurrentFrame();
        return React.createElement("div", null, children);
      };
      exports.default = MyEffect;
    `;
    const component = compileEffect(code);
    expect(typeof component).toBe("function");
  });

  it("compiles module.exports style", () => {
    const code = `
      module.exports.default = function({ children }) {
        return React.createElement("div", null, children);
      };
    `;
    const component = compileEffect(code);
    expect(typeof component).toBe("function");
  });
});

describe("compileEffectAsync", () => {
  it("compiles a valid effect source asynchronously", async () => {
    const code = `
      const MyEffect = ({ children }) => {
        return React.createElement("div", null, children);
      };
      exports.default = MyEffect;
    `;
    const component = await compileEffectAsync(code);
    expect(typeof component).toBe("function");
  });
});
