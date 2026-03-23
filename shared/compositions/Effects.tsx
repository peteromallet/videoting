import { interpolate, useCurrentFrame } from "remotion";
import { getEffectValue } from "@shared/config-utils";
import type { TimelineClip } from "@shared/types";

export const useClipOpacity = (
  clip: TimelineClip,
  durationInFrames: number,
  fps: number,
): number => {
  const frame = useCurrentFrame();
  let opacity = 1;

  const fadeIn = getEffectValue(clip.effects, "fade_in");
  if (fadeIn && fadeIn > 0) {
    opacity *= interpolate(frame, [0, fadeIn * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  const fadeOut = getEffectValue(clip.effects, "fade_out");
  if (fadeOut && fadeOut > 0) {
    opacity *= interpolate(
      frame,
      [Math.max(0, durationInFrames - fadeOut * fps), durationInFrames],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  }

  return opacity;
};
