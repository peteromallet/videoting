import type { FC } from "react";
import { Audio, Sequence } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "@shared/config-utils";
import type { ResolvedTimelineClip } from "@shared/types";

export const AudioTrack: FC<{
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
          <Audio
            src={clip.assetEntry.src}
            startFrom={secondsToFrames(clip.from ?? 0, fps)}
            playbackRate={clip.speed ?? 1}
            volume={clip.volume ?? 1}
          />
        </Sequence>
      ))}
    </>
  );
};
