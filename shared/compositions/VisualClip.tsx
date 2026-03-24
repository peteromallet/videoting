import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, Video, getRemotionEnvironment, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "@shared/config-utils";
import { wrapWithClipEffects } from "@shared/effects";
import { transitions } from "@shared/transitions";
import type { ResolvedTimelineClip, TrackDefinition } from "@shared/types";

type VisualClipProps = {
  clip: ResolvedTimelineClip;
  track: TrackDefinition;
  fps: number;
  predecessor?: ResolvedTimelineClip | null;
};

const getClipBoxStyle = (
  clip: ResolvedTimelineClip,
  track: TrackDefinition,
  compositionWidth: number,
  compositionHeight: number,
): CSSProperties => {
  const hasPositionOverride = (
    clip.x !== undefined
    || clip.y !== undefined
    || clip.width !== undefined
    || clip.height !== undefined
  );
  const fit = track.fit ?? "contain";
  if (fit === "manual" || hasPositionOverride) {
    return {
      position: "absolute",
      left: clip.x ?? 0,
      top: clip.y ?? 0,
      width: clip.width ?? compositionWidth,
      height: clip.height ?? compositionHeight,
      objectFit: "cover",
      opacity: clip.opacity ?? 1,
    };
  }

  return {
    width: "100%",
    height: "100%",
    objectFit: fit,
    opacity: clip.opacity ?? 1,
  };
};

const VisualAsset: FC<VisualClipProps> = ({ clip, track, fps }) => {
  if (!clip.assetEntry) {
    return null;
  }

  const { width: compositionWidth, height: compositionHeight } = useVideoConfig();
  const style = getClipBoxStyle(clip, track, compositionWidth, compositionHeight);
  const sharedStyle: CSSProperties = {
    ...style,
    mixBlendMode: track.blendMode && track.blendMode !== "normal" ? track.blendMode : undefined,
  };
  const clipVolume = clip.volume ?? 1;
  const isImage = clip.assetEntry.type?.startsWith("image");
  const isRendering = getRemotionEnvironment().isRendering;

  if (isImage) {
    return <Img src={clip.assetEntry.src} style={sharedStyle} crossOrigin="anonymous" />;
  }

  if (isRendering) {
    return (
      <OffthreadVideo
        src={clip.assetEntry.src}
        startFrom={secondsToFrames(clip.from ?? 0, fps)}
        playbackRate={clip.speed ?? 1}
        volume={clipVolume}
        muted={clipVolume <= 0}
        style={sharedStyle}
        transparent
        crossOrigin="anonymous"
      />
    );
  }

  return (
    <Video
      src={clip.assetEntry.src}
      startFrom={secondsToFrames(clip.from ?? 0, fps)}
      playbackRate={clip.speed ?? 1}
      volume={clipVolume}
      muted={clipVolume <= 0}
      style={sharedStyle}
      crossOrigin="anonymous"
    />
  );
};

export const VisualClip: FC<VisualClipProps> = ({ clip, track, fps }) => {
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const frame = useCurrentFrame();
  const transitionRenderer = clip.transition ? transitions[clip.transition.type] : undefined;
  const transitionProgress = interpolate(
    frame,
    [0, Math.max(1, secondsToFrames(clip.transition?.duration ?? 0.4, fps))],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const transitionStyle = transitionRenderer ? transitionRenderer(transitionProgress) : undefined;

  const content: ReactNode = (
    <AbsoluteFill style={{ overflow: "hidden", ...transitionStyle }}>
      <VisualAsset clip={clip} track={track} fps={fps} />
    </AbsoluteFill>
  );

  return <>{wrapWithClipEffects(content, clip, durationInFrames, fps)}</>;
};

export const VisualClipSequence: FC<VisualClipProps> = ({ clip, track, fps, predecessor }) => {
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const transitionFrames = predecessor && clip.transition
    ? secondsToFrames(clip.transition.duration, fps)
    : 0;
  const from = Math.max(0, secondsToFrames(clip.at, fps) - transitionFrames);

  return (
    <Sequence key={clip.id} from={from} durationInFrames={durationInFrames}>
      <VisualClip clip={clip} track={track} fps={fps} predecessor={predecessor} />
    </Sequence>
  );
};
