import { AbsoluteFill } from "remotion";
import { memo, useMemo, type FC } from "react";
import { getAudioTracks, getVisualTracks } from "../editor-utils";
import type { ResolvedTimelineClip, ResolvedTimelineConfig, TrackDefinition } from "../types";
import { AudioTrack } from "./AudioTrack";
import { AudioDataProvider } from "./AudioDataProvider";
import { TextClipSequence } from "./TextClip";
import { VisualClipSequence } from "./VisualClip";

const sortClipsByAt = (clips: ResolvedTimelineClip[]): ResolvedTimelineClip[] => {
  return [...clips].sort((left, right) => left.at - right.at);
};

const renderVisualTrack = (
  track: TrackDefinition,
  clips: ResolvedTimelineClip[],
  fps: number,
) => {
  const sortedClips = sortClipsByAt(clips);
  const scale = track.scale ?? 1;
  const clipWrapperStyle = scale !== 1
    ? {
      transform: `scale(${scale})`,
      transformOrigin: "center center",
      overflow: "hidden" as const,
    }
    : {
      overflow: "hidden" as const,
    };

  return (
    <AbsoluteFill
      key={track.id}
      style={{
        opacity: track.opacity ?? 1,
        mixBlendMode: track.blendMode && track.blendMode !== "normal" ? track.blendMode : undefined,
      }}
    >
      {sortedClips.map((clip, index) => {
        if (clip.clipType === "text") {
          return <TextClipSequence key={clip.id} clip={clip} track={track} fps={fps} />;
        }

        const predecessor = index > 0 ? sortedClips[index - 1] : null;
        const hasPositionOverride = (
          clip.x !== undefined
          || clip.y !== undefined
          || clip.width !== undefined
          || clip.height !== undefined
        );
        if (hasPositionOverride) {
          return (
            <VisualClipSequence
              key={clip.id}
              clip={clip}
              track={track}
              fps={fps}
              predecessor={predecessor}
            />
          );
        }

        return (
          <AbsoluteFill
            key={clip.id}
            style={clipWrapperStyle}
          >
            <VisualClipSequence
              clip={clip}
              track={track}
              fps={fps}
              predecessor={predecessor}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

export const TimelineRenderer: FC<{ config: ResolvedTimelineConfig }> = memo(({ config }) => {
  const fps = config.output.fps;
  const visualTracks = useMemo(() => [...getVisualTracks(config)].reverse(), [config]);
  const audioTracks = useMemo(() => getAudioTracks(config), [config]);
  const clipsByTrack = useMemo(() => {
    return config.clips.reduce<Record<string, ResolvedTimelineClip[]>>((groups, clip) => {
      groups[clip.track] ??= [];
      groups[clip.track].push(clip);
      return groups;
    }, {});
  }, [config]);

  return (
    <AudioDataProvider config={config} fps={fps}>
      <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <AbsoluteFill style={{ position: "relative", overflow: "hidden" }}>
            {/* Render in reverse so the first track (top of timeline UI) is visually in front */}
            {visualTracks.map((track) => {
              const trackClips = clipsByTrack[track.id] ?? [];
              return renderVisualTrack(track, trackClips, fps);
            })}
          </AbsoluteFill>
        </AbsoluteFill>
        {audioTracks.map((track) => (
          <AudioTrack
            key={track.id}
            trackId={track.id}
            clips={clipsByTrack[track.id] ?? []}
            fps={fps}
          />
        ))}
      </AbsoluteFill>
    </AudioDataProvider>
  );
});
