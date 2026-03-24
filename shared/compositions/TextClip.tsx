import type { FC } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "@shared/config-utils";
import { wrapWithClipEffects } from "@shared/effects";
import type { ResolvedTimelineClip, TrackDefinition } from "@shared/types";

type TextClipProps = {
  clip: ResolvedTimelineClip;
  track: TrackDefinition;
  fps: number;
};

const hasPositionOverride = (clip: ResolvedTimelineClip): boolean => {
  return (
    clip.x !== undefined
    || clip.y !== undefined
    || clip.width !== undefined
    || clip.height !== undefined
  );
};

export const TextClip: FC<TextClipProps> = ({ clip, track, fps }) => {
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const text = clip.text;
  if (!text) {
    return null;
  }

  const trackScale = Math.max(track.scale ?? 1, 0.01);
  const shouldBypassTrackScale = hasPositionOverride(clip);
  const clipScale = shouldBypassTrackScale ? trackScale : 1;

  const content = (
    <AbsoluteFill
      style={{
        left: (clip.x ?? 0) / clipScale,
        top: (clip.y ?? 0) / clipScale,
        width: (clip.width ?? 640) / clipScale,
        height: (clip.height ?? 160) / clipScale,
        position: "absolute",
        justifyContent: "center",
        color: text.color ?? "#ffffff",
        fontFamily: text.fontFamily ?? "Georgia, serif",
        fontSize: text.fontSize ?? 64,
        fontWeight: text.bold ? 700 : 400,
        fontStyle: text.italic ? "italic" : "normal",
        textAlign: text.align ?? "center",
        whiteSpace: "pre-wrap",
        lineHeight: 1.1,
        textShadow: "0 2px 18px rgba(0, 0, 0, 0.35)",
        opacity: clip.opacity ?? 1,
      }}
    >
      {text.content}
    </AbsoluteFill>
  );

  return <>{wrapWithClipEffects(content, clip, durationInFrames, fps)}</>;
};

export const TextClipSequence: FC<TextClipProps> = ({ clip, track, fps }) => {
  return (
    <Sequence
      key={clip.id}
      from={secondsToFrames(clip.at, fps)}
      durationInFrames={getClipDurationInFrames(clip, fps)}
    >
      <TextClip clip={clip} track={track} fps={fps} />
    </Sequence>
  );
};
