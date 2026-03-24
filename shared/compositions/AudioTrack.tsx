import type { FC } from "react";
import { Audio, Sequence } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "../config-utils";
import type { ResolvedTimelineClip } from "../types";

export const AudioTrack: FC<{
  trackId: string;
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
          {clip.assetEntry ? (
            <Audio
              src={clip.assetEntry.src}
              startFrom={secondsToFrames(clip.from ?? 0, fps)}
              playbackRate={clip.speed ?? 1}
              volume={clip.volume ?? 1}
              crossOrigin="anonymous"
            />
          ) : null}
        </Sequence>
      ))}
    </>
  );
};
