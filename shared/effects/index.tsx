import { secondsToFrames } from "@shared/config-utils";
import type { ResolvedTimelineClip } from "@shared/types";
import type { FC, ReactNode } from "react";
import { BounceEntrance, FadeEntrance, FlipEntrance, PulseEntrance, SlideDownEntrance, SlideLeftEntrance, SlideRightEntrance, SlideUpEntrance, ZoomInEntrance, ZoomSpinEntrance } from "./entrances";
import { DriftEffect, FloatEffect, GlitchEffect, KenBurnsEffect, SlowZoomEffect } from "./continuous";
import type { EffectComponentProps } from "./entrances";
import { DissolveExit, FadeOutExit, FlipExit, ShrinkExit, SlideDownExit, ZoomOutExit } from "./exits";

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

export const wrapWithClipEffects = (
  content: ReactNode,
  clip: ResolvedTimelineClip,
  durationInFrames: number,
  fps: number,
): ReactNode => {
  let wrapped = content;

  const continuous = clip.continuous ? continuousEffects[clip.continuous.type] : null;
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

  const entrance = clip.entrance ? entranceEffects[clip.entrance.type] : null;
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

  const exit = clip.exit ? exitEffects[clip.exit.type] : null;
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
