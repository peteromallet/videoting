import type { CSSProperties, FC } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "@shared/config-utils";
import type { ResolvedTimelineClip } from "@shared/types";
import { useClipOpacity } from "./Effects";

const OverlayClip: FC<{ clip: ResolvedTimelineClip; fps: number }> = ({ clip, fps }) => {
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const effectOpacity = useClipOpacity(clip, durationInFrames, fps);
  const opacity = (clip.opacity ?? 1) * effectOpacity;
  const style: CSSProperties = {
    position: "absolute",
    left: clip.x ?? 0,
    top: clip.y ?? 0,
    width: clip.width ?? 320,
    height: clip.height ?? 240,
    opacity,
    objectFit: "cover",
  };

  if (clip.assetEntry.type === "image") {
    return <Img src={clip.assetEntry.src} style={style} />;
  }

  return (
    <OffthreadVideo
      src={clip.assetEntry.src}
      trimBefore={secondsToFrames(clip.from ?? 0, fps)}
      playbackRate={clip.speed ?? 1}
      muted
      style={style}
    />
  );
};

export const OverlayTrack: FC<{
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ clips, fps }) => {
  return (
    <>
      {clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={secondsToFrames(clip.at, fps)}
          durationInFrames={getClipDurationInFrames(clip, fps)}
        >
          <AbsoluteFill>
            <OverlayClip clip={clip} fps={fps} />
          </AbsoluteFill>
        </Sequence>
      ))}
    </>
  );
};
