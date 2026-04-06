import { secondsToFrames } from "../config-utils";
import type { ResolvedTimelineClip } from "../types";
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import type { EffectComponentProps } from "./entrances";
import {
  BounceEntrance,
  FadeEntrance,
  FlipEntrance,
  MeteoriteEntrance,
  PulseEntrance,
  SlideDownEntrance,
  SlideLeftEntrance,
  SlideRightEntrance,
  SlideUpEntrance,
  ZoomInEntrance,
  ZoomSpinEntrance,
} from "./entrances";
import {
  DissolveExit,
  FadeOutExit,
  FlipExit,
  ShrinkExit,
  SlideDownExit,
  ZoomOutExit,
} from "./exits";
import {
  DriftEffect,
  FloatEffect,
  GlitchEffect,
  KenBurnsEffect,
  SlowZoomEffect,
} from "./continuous";
import {
  AudioGlowEffect,
  AudioMaskBarsEffect,
  AudioMaskCircleEffect,
  AudioMaskWaveEffect,
  AudioPulseEffect,
} from "./audio-reactive";
import { DynamicEffectRegistry } from "./dynamic-registry";
import {
  getEntry,
  renderEffect,
} from "./unified-registry";

export type ClipEffectComponent = React.FC<EffectComponentProps>;
export type { EffectComponentProps };

// Backward-compatible Record exports used by tests and other consumers.
// These map effect names to their legacy component implementations.
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
  "audio-pulse": AudioPulseEffect,
  "audio-mask-circle": AudioMaskCircleEffect,
  "audio-mask-bars": AudioMaskBarsEffect,
  "audio-mask-wave": AudioMaskWaveEffect,
  "audio-glow": AudioGlowEffect,
};

// Type lists now come from the unified registry so they include progress-based
// effects alongside legacy components.
export { entranceEffectTypes, exitEffectTypes, continuousEffectTypes } from "./unified-registry";

// Build a flat map of all built-in effects for the dynamic registry fallback.
const allBuiltInEffects: Record<string, ClipEffectComponent> = {
  ...entranceEffects,
  ...exitEffects,
  ...continuousEffects,
};

// Module-level singleton registry for dynamic effects.
let _effectRegistry: DynamicEffectRegistry | null = null;

export function getEffectRegistry(): DynamicEffectRegistry {
  if (!_effectRegistry) {
    _effectRegistry = new DynamicEffectRegistry(allBuiltInEffects);
  }
  return _effectRegistry;
}

/**
 * Strip the "custom:" prefix from an effect type name, if present.
 */
const resolveEffectName = (type: string): string => {
  return type.startsWith("custom:") ? type.slice(7) : type;
};

/**
 * Look up an effect. First checks the unified registry, then falls back
 * to the dynamic registry for custom effects.
 */
const lookupEffectForRole = (
  type: string,
  role: "entrance" | "exit" | "continuous",
): { unified: true; name: string } | { unified: false; legacy: ClipEffectComponent } | null => {
  const name = resolveEffectName(type);
  const entry = getEntry(name);
  if (entry && entry.metadata.roles.includes(role)) {
    return { unified: true, name };
  }
  // Fall back to dynamic registry
  const dynamic = getEffectRegistry().get(name);
  if (dynamic) {
    return { unified: false, legacy: dynamic };
  }
  return null;
};

export const wrapWithClipEffects = (
  content: ReactNode,
  clip: ResolvedTimelineClip,
  durationInFrames: number,
  fps: number,
): ReactNode => {
  let wrapped = content;
  let hasEffect = false;

  // Continuous effect
  if (clip.continuous) {
    const result = lookupEffectForRole(clip.continuous.type, "continuous");
    if (result) {
      hasEffect = true;
      if (result.unified) {
        wrapped = renderEffect(result.name, "continuous", {
          children: wrapped,
          durationInFrames,
          intensity: clip.continuous.intensity ?? 0.5,
          audioTrack: clip.continuous.audioTrack,
          loop: clip.continuous.loop,
          loopDuration: clip.continuous.loopDuration,
        });
      } else {
        const Legacy = result.legacy;
        wrapped = (
          <Legacy
            durationInFrames={durationInFrames}
            intensity={clip.continuous.intensity ?? 0.5}
            audioTrack={clip.continuous.audioTrack}
            loop={clip.continuous.loop}
            loopDuration={clip.continuous.loopDuration}
          >
            {wrapped}
          </Legacy>
        );
      }
    }
  }

  // Entrance effect
  if (clip.entrance) {
    const result = lookupEffectForRole(clip.entrance.type, "entrance");
    if (result) {
      hasEffect = true;
      const effectFrames = secondsToFrames(clip.entrance.duration ?? 0.4, fps);
      if (result.unified) {
        wrapped = renderEffect(result.name, "entrance", {
          children: wrapped,
          durationInFrames,
          effectFrames,
        });
      } else {
        const Legacy = result.legacy;
        wrapped = (
          <Legacy durationInFrames={durationInFrames} effectFrames={effectFrames}>
            {wrapped}
          </Legacy>
        );
      }
    }
  }

  // Exit effect
  if (clip.exit) {
    const result = lookupEffectForRole(clip.exit.type, "exit");
    if (result) {
      hasEffect = true;
      const effectFrames = secondsToFrames(clip.exit.duration ?? 0.4, fps);
      if (result.unified) {
        wrapped = renderEffect(result.name, "exit", {
          children: wrapped,
          durationInFrames,
          effectFrames,
        });
      } else {
        const Legacy = result.legacy;
        wrapped = (
          <Legacy durationInFrames={durationInFrames} effectFrames={effectFrames}>
            {wrapped}
          </Legacy>
        );
      }
    }
  }

  if (!hasEffect) {
    return wrapped;
  }

  return <AbsoluteFill style={{ isolation: "isolate" }}>{wrapped}</AbsoluteFill>;
};
