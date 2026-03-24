import { secondsToFrames } from "@shared/config-utils";
import type { ResolvedTimelineClip } from "@shared/types";
import type { FC, ReactNode } from "react";
import { BounceEntrance, FadeEntrance, FlipEntrance, MeteoriteEntrance, PulseEntrance, SlideDownEntrance, SlideLeftEntrance, SlideRightEntrance, SlideUpEntrance, ZoomInEntrance, ZoomSpinEntrance } from "./entrances";
import { DriftEffect, FloatEffect, GlitchEffect, KenBurnsEffect, SlowZoomEffect } from "./continuous";
import type { EffectComponentProps } from "./entrances";
import { DissolveExit, FadeOutExit, FlipExit, ShrinkExit, SlideDownExit, ZoomOutExit } from "./exits";
import { DynamicEffectRegistry } from "./dynamic-registry";

export type ClipEffectComponent = FC<EffectComponentProps>;

export const entranceEffects: Record<string, ClipEffectComponent> = {
  "slide-up": SlideUpEntrance,
  "slide-down": SlideDownEntrance,
  "slide-left": SlideLeftEntrance,
  "slide-right": SlideRightEntrance,
  "zoom-in": ZoomInEntrance,
  "zoom-spin": ZoomSpinEntrance,
  pulse: PulseEntrance,
  fade: FadeEntrance,
  flip: FlipEntrance,
  bounce: BounceEntrance,
  meteorite: MeteoriteEntrance,
};

export const exitEffects: Record<string, ClipEffectComponent> = {
  "slide-down": SlideDownExit,
  "zoom-out": ZoomOutExit,
  flip: FlipExit,
  "fade-out": FadeOutExit,
  shrink: ShrinkExit,
  dissolve: DissolveExit,
};

export const continuousEffects: Record<string, ClipEffectComponent> = {
  "ken-burns": KenBurnsEffect,
  float: FloatEffect,
  glitch: GlitchEffect,
  "slow-zoom": SlowZoomEffect,
  drift: DriftEffect,
};

export const entranceEffectTypes = Object.keys(entranceEffects);
export const exitEffectTypes = Object.keys(exitEffects);
export const continuousEffectTypes = Object.keys(continuousEffects);

// Merge all built-in effects into a single registry for the dynamic fallback path
const allBuiltInEffects: Record<string, ClipEffectComponent> = {
  ...entranceEffects,
  ...exitEffects,
  ...continuousEffects,
};

// Module-level singleton registry. Initialized with all built-in effects.
// Dynamic effects can be registered at runtime via getEffectRegistry().register().
let _effectRegistry: DynamicEffectRegistry | null = null;

export function getEffectRegistry(): DynamicEffectRegistry {
  if (!_effectRegistry) {
    _effectRegistry = new DynamicEffectRegistry(allBuiltInEffects);
  }
  return _effectRegistry;
}

/**
 * Strip the "custom:" prefix from an effect type name, if present.
 * Custom effects use "custom:effect-name" in clip definitions to disambiguate
 * from built-in effects.
 */
const resolveEffectName = (type: string): string => {
  return type.startsWith("custom:") ? type.slice(7) : type;
};

/**
 * Look up an effect component by name, checking both built-in maps
 * and the dynamic registry.
 */
const lookupEffect = (
  builtInMap: Record<string, ClipEffectComponent>,
  type: string,
): ClipEffectComponent | null => {
  const name = resolveEffectName(type);
  // Built-in map first (fast path)
  if (builtInMap[name]) {
    return builtInMap[name];
  }
  // Fall back to dynamic registry
  return getEffectRegistry().get(name) ?? null;
};

export const wrapWithClipEffects = (
  content: ReactNode,
  clip: ResolvedTimelineClip,
  durationInFrames: number,
  fps: number,
): ReactNode => {
  let wrapped = content;

  const continuous = clip.continuous ? lookupEffect(continuousEffects, clip.continuous.type) : null;
  if (continuous) {
    const Continuous = continuous;
    wrapped = (
      <Continuous
        durationInFrames={durationInFrames}
        intensity={clip.continuous?.intensity ?? 0.5}
      >
        {wrapped}
      </Continuous>
    );
  }

  const entrance = clip.entrance ? lookupEffect(entranceEffects, clip.entrance.type) : null;
  if (entrance) {
    const Entrance = entrance;
    wrapped = (
      <Entrance
        durationInFrames={durationInFrames}
        effectFrames={secondsToFrames(clip.entrance?.duration ?? 0.4, fps)}
      >
        {wrapped}
      </Entrance>
    );
  }

  const exit = clip.exit ? lookupEffect(exitEffects, clip.exit.type) : null;
  if (exit) {
    const Exit = exit;
    wrapped = (
      <Exit
        durationInFrames={durationInFrames}
        effectFrames={secondsToFrames(clip.exit?.duration ?? 0.4, fps)}
      >
        {wrapped}
      </Exit>
    );
  }

  return wrapped;
};
