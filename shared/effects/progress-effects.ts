import type { ReactNode } from "react";
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { EffectMetadata, EffectRole } from "../types";
import type { EffectComponentProps } from "./entrances";

/**
 * A pure render function that maps a progress value (0-1) to styled output.
 * progress=0: hidden state (faded out, scaled down, translated away)
 * progress=1: visible state (normal, fully visible)
 */
export type ProgressEffectRenderFn = (
  progress: number,
  children: ReactNode,
  opts: { intensity?: number; fps: number },
) => ReactNode;

/**
 * EffectTimingWrapper computes the appropriate progress value based on the
 * effect's role (entrance/exit/continuous) and delegates rendering to a
 * ProgressEffectRenderFn.
 */
export const EffectTimingWrapper: React.FC<{
  renderFn: ProgressEffectRenderFn;
  role: EffectRole;
  metadata: EffectMetadata;
  children: ReactNode;
  durationInFrames: number;
  effectFrames?: number;
  intensity?: number;
  audioTrack?: string;
  loop?: boolean;
  loopDuration?: number;
}> = ({
  renderFn,
  role,
  metadata,
  children,
  durationInFrames,
  effectFrames,
  intensity,
  audioTrack: _audioTrack,
  loop,
  loopDuration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let progress: number;

  if (role === "entrance") {
    const ef = effectFrames ?? 18;
    const rawProgress = interpolate(frame, [0, Math.max(1, ef)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    // Apply timing (spring) if specified
    const timing = metadata.timing?.entrance;
    if (timing?.type === "spring") {
      progress = spring({
        frame,
        fps,
        durationInFrames: ef,
        config: {
          damping: timing.damping ?? 14,
          stiffness: timing.stiffness ?? 120,
          mass: timing.mass,
        },
      });
    } else {
      progress = rawProgress;
    }
  } else if (role === "exit") {
    const ef = effectFrames ?? 18;
    const exitStart = Math.max(0, durationInFrames - ef);
    const rawProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    // For exit: reverse progress so renderFn goes from visible (1) to hidden (0)
    progress = 1 - rawProgress;
  } else {
    // continuous
    if (loop) {
      const loopPeriodFrames = loopDuration
        ? Math.round(loopDuration * fps)
        : durationInFrames;
      const rawProgress = (frame % loopPeriodFrames) / loopPeriodFrames;
      progress = 1 - Math.abs(2 * rawProgress - 1); // ping-pong
    } else {
      progress = durationInFrames <= 1 ? 1 : frame / durationInFrames;
    }
  }

  return renderFn(progress, children, { intensity, fps }) as React.ReactElement;
};

// --- Progress-based effect render functions ---

export const fadeRenderFn: ProgressEffectRenderFn = (progress, children) => {
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", opacity: progress } },
    children,
  );
};

export const zoomRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const scale = interpolate(progress, [0, 1], [0.75, 1]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `scale(${scale})`, opacity: progress } },
    children,
  );
};

export const flipRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const rotateY = interpolate(progress, [0, 1], [-90, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { perspective: 1000 } },
    React.createElement(
      AbsoluteFill,
      { style: { width: "100%", height: "100%", transform: `rotateY(${rotateY}deg)`, opacity: progress } },
      children,
    ),
  );
};

export const slideUpRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const translateY = interpolate(progress, [0, 1], [80, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `translateY(${translateY}px)`, opacity: progress } },
    children,
  );
};

export const slideDownRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const translateY = interpolate(progress, [0, 1], [-80, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `translateY(${translateY}px)`, opacity: progress } },
    children,
  );
};

export const slideLeftRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const translateX = interpolate(progress, [0, 1], [180, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `translateX(${translateX}px)`, opacity: progress } },
    children,
  );
};

export const slideRightRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const translateX = interpolate(progress, [0, 1], [-180, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `translateX(${translateX}px)`, opacity: progress } },
    children,
  );
};

export const shrinkRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const scale = interpolate(progress, [0, 1], [0.2, 1]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", transform: `scale(${scale})`, opacity: progress } },
    children,
  );
};

export const dissolveRenderFn: ProgressEffectRenderFn = (progress, children) => {
  const blur = interpolate(progress, [0, 1], [16, 0]);
  return React.createElement(
    AbsoluteFill,
    { style: { width: "100%", height: "100%", filter: `blur(${blur}px)`, opacity: progress } },
    children,
  );
};

// --- Effect metadata for each progress-based effect ---

const allThreeRoles: EffectMetadata = {
  roles: ["entrance", "exit", "continuous"],
};

export const progressEffectEntries: Record<
  string,
  { renderFn: ProgressEffectRenderFn; metadata: EffectMetadata }
> = {
  fade: { renderFn: fadeRenderFn, metadata: allThreeRoles },
  zoom: { renderFn: zoomRenderFn, metadata: allThreeRoles },
  flip: { renderFn: flipRenderFn, metadata: allThreeRoles },
  "slide-up": {
    renderFn: slideUpRenderFn,
    metadata: {
      roles: ["entrance", "exit", "continuous"],
      timing: { entrance: { type: "spring", damping: 14, stiffness: 120 } },
    },
  },
  "slide-down": { renderFn: slideDownRenderFn, metadata: allThreeRoles },
  "slide-left": { renderFn: slideLeftRenderFn, metadata: allThreeRoles },
  "slide-right": { renderFn: slideRightRenderFn, metadata: allThreeRoles },
  shrink: { renderFn: shrinkRenderFn, metadata: allThreeRoles },
  dissolve: { renderFn: dissolveRenderFn, metadata: allThreeRoles },
};
