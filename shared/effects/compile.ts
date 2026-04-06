import type { FC } from "react";
import type { EffectComponentProps } from "./entrances";
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";
import { useAudioReactivity } from "./useAudioReactivity";

// Sucrase is loaded lazily to avoid bundling issues in environments (e.g. Remotion CLI)
// that don't have it installed. It's only needed when compileEffect() is actually called.
let _transform: typeof import("sucrase").transform | null = null;
async function getTransform() {
  if (!_transform) {
    const sucrase = await import("sucrase");
    _transform = sucrase.transform;
  }
  return _transform;
}

// Synchronous cache — after the first async call, subsequent calls are sync.
let _transformSync: typeof import("sucrase").transform | null = null;

function getTransformSync(): typeof import("sucrase").transform {
  if (!_transformSync) {
    throw new Error("compileEffect requires sucrase to be loaded first. Call compileEffectAsync() or ensure sucrase is preloaded.");
  }
  return _transformSync;
}

/**
 * Preload sucrase for synchronous use. Call this once at startup if you need
 * synchronous compileEffect(). Otherwise use compileEffectAsync().
 */
export async function preloadSucrase(): Promise<void> {
  const t = await getTransform();
  _transformSync = t;
}

/**
 * Compile a JSX/TypeScript effect source string into a React component at runtime.
 * Synchronous version — requires sucrase to be preloaded via preloadSucrase() or
 * a prior call to compileEffectAsync().
 *
 * The source string should export a default component conforming to `EffectComponentProps`.
 * Available globals inside the code: React, useCurrentFrame, useVideoConfig, interpolate,
 * spring, AbsoluteFill, useAudioReactivity.
 *
 * Security note: This executes arbitrary code in the browser with full DOM access.
 * Acceptable for local/trusted editor use. For production deployments, consider
 * adding CSP headers or running in a sandboxed iframe.
 */
export function compileEffect(code: string): FC<EffectComponentProps> {
  return _compileWithTransform(code, getTransformSync());
}

/**
 * Async version of compileEffect that auto-loads sucrase on first call.
 */
export async function compileEffectAsync(code: string): Promise<FC<EffectComponentProps>> {
  const t = await getTransform();
  _transformSync = t;
  return _compileWithTransform(code, t);
}

function _compileWithTransform(code: string, transform: typeof import("sucrase").transform): FC<EffectComponentProps> {
  // Transpile JSX + TypeScript to plain JS
  let transpiled: string;
  try {
    const result = transform(code, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      production: true,
    });
    transpiled = result.code;
  } catch (err) {
    throw new Error(`Effect compilation failed during transpilation: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Wrap in a module-like function that provides the runtime dependencies
  // and captures the default export
  const wrappedCode = `
    var exports = {};
    var module = { exports: exports };
    ${transpiled}
    return exports.default || module.exports.default || module.exports;
  `;

  let factory: (...args: unknown[]) => unknown;
  try {
    factory = new Function("React", "useCurrentFrame", "useVideoConfig", "interpolate", "spring", "AbsoluteFill", "useAudioReactivity", wrappedCode) as (
      ...args: unknown[]
    ) => unknown;
  } catch (err) {
    throw new Error(`Effect compilation failed during function creation: ${err instanceof Error ? err.message : String(err)}`);
  }

  let component: unknown;
  try {
    component = factory(React, useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, useAudioReactivity);
  } catch (err) {
    throw new Error(`Effect compilation failed during execution: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof component !== "function") {
    throw new Error("Effect code did not produce a valid component (expected a function as default export)");
  }

  return component as FC<EffectComponentProps>;
}
