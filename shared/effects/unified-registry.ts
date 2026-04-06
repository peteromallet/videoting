import React from "react";
import type { FC, ReactNode } from "react";
import type { EffectMetadata, EffectRole } from "../types";
import type { EffectComponentProps } from "./entrances";
import {
  BounceEntrance,
  MeteoriteEntrance,
  PulseEntrance,
  ZoomSpinEntrance,
} from "./entrances";
import { KenBurnsEffect, SlowZoomEffect, DriftEffect, FloatEffect, GlitchEffect } from "./continuous";
import {
  AudioPulseEffect,
  AudioMaskCircleEffect,
  AudioMaskBarsEffect,
  AudioMaskWaveEffect,
  AudioGlowEffect,
} from "./audio-reactive";
import {
  type ProgressEffectRenderFn,
  EffectTimingWrapper,
  progressEffectEntries,
} from "./progress-effects";

// --- Types ---

export type UnifiedEffectEntry = {
  progressFn?: ProgressEffectRenderFn;
  legacyComponent?: FC<EffectComponentProps>;
  metadata: EffectMetadata;
};

// --- Build the full registry ---

const registry: Record<string, UnifiedEffectEntry> = {};

// 1. Progress-based effects (9 effects, all roles)
for (const [name, entry] of Object.entries(progressEffectEntries)) {
  registry[name] = {
    progressFn: entry.renderFn,
    metadata: entry.metadata,
  };
}

// 2. Legacy entrance-only effects
const legacyEntranceOnly: Record<string, FC<EffectComponentProps>> = {
  meteorite: MeteoriteEntrance,
  bounce: BounceEntrance,
  "zoom-spin": ZoomSpinEntrance,
  pulse: PulseEntrance,
};

for (const [name, component] of Object.entries(legacyEntranceOnly)) {
  registry[name] = {
    legacyComponent: component,
    metadata: { roles: ["entrance"] },
  };
}

// 3. Legacy continuous effects
const legacyContinuous: Record<string, { component: FC<EffectComponentProps>; metadata: EffectMetadata }> = {
  "ken-burns": {
    component: KenBurnsEffect,
    metadata: { roles: ["continuous"], loop: "optional" },
  },
  "slow-zoom": {
    component: SlowZoomEffect,
    metadata: { roles: ["continuous"], loop: "optional" },
  },
  drift: {
    component: DriftEffect,
    metadata: { roles: ["continuous"], loop: "optional" },
  },
  float: {
    component: FloatEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  glitch: {
    component: GlitchEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  "audio-pulse": {
    component: AudioPulseEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  "audio-mask-circle": {
    component: AudioMaskCircleEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  "audio-mask-bars": {
    component: AudioMaskBarsEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  "audio-mask-wave": {
    component: AudioMaskWaveEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
  "audio-glow": {
    component: AudioGlowEffect,
    metadata: { roles: ["continuous"], loop: "inherent" },
  },
};

for (const [name, entry] of Object.entries(legacyContinuous)) {
  registry[name] = {
    legacyComponent: entry.component,
    metadata: entry.metadata,
  };
}

// --- Alias map ---

const aliasMap: Record<string, string> = {
  "zoom-in": "zoom",
  "zoom-out": "zoom",
  "fade-out": "fade",
  "slide-down-exit": "slide-down",
};

// --- Public API ---

export function getEntry(name: string): UnifiedEffectEntry | undefined {
  const resolved = aliasMap[name] ?? name;
  return registry[resolved];
}

export function getEffectsForRole(role: EffectRole): string[] {
  const results: string[] = [];
  for (const [name, entry] of Object.entries(registry)) {
    if (entry.metadata.roles.includes(role)) {
      results.push(name);
    }
  }
  return results;
}

export function renderEffect(
  name: string,
  role: EffectRole,
  props: {
    children: ReactNode;
    durationInFrames: number;
    effectFrames?: number;
    intensity?: number;
    audioTrack?: string;
    loop?: boolean;
    loopDuration?: number;
  },
): ReactNode {
  const entry = getEntry(name);
  if (!entry) return props.children;

  if (entry.progressFn) {
    return React.createElement(EffectTimingWrapper, {
      renderFn: entry.progressFn,
      role,
      metadata: entry.metadata,
      children: props.children,
      durationInFrames: props.durationInFrames,
      effectFrames: props.effectFrames,
      intensity: props.intensity,
      audioTrack: props.audioTrack,
      loop: props.loop,
      loopDuration: props.loopDuration,
    });
  }

  if (entry.legacyComponent) {
    return React.createElement(entry.legacyComponent, {
      children: props.children,
      durationInFrames: props.durationInFrames,
      effectFrames: props.effectFrames,
      intensity: props.intensity,
      audioTrack: props.audioTrack,
      loop: props.loop,
      loopDuration: props.loopDuration,
    });
  }

  return props.children;
}

// --- Backward-compatible type lists ---

export const entranceEffectTypes: string[] = getEffectsForRole("entrance");
export const exitEffectTypes: string[] = getEffectsForRole("exit");
export const continuousEffectTypes: string[] = getEffectsForRole("continuous");
