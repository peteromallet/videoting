import { AbsoluteFill } from "remotion";
import type { FC } from "react";
import type { ResolvedTimelineClip, ResolvedTimelineConfig } from "@shared/types";
import { AudioTrack } from "./AudioTrack";
import { Background } from "./Background";
import { OverlayTrack } from "./OverlayTrack";
import { VideoTrack } from "./VideoTrack";

export const TimelineRenderer: FC<{ config: ResolvedTimelineConfig }> = ({ config }) => {
  const fps = config.output.fps;
  const scale = config.output.background_scale ?? 1;
  const videoClips = config.clips.filter((clip) => clip.track === "video");
  const audioClips = config.clips.filter((clip) => clip.track === "audio");
  const overlayClips = config.clips.filter((clip) => clip.track === "overlay");

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <Background config={config} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <VideoTrack clips={videoClips as ResolvedTimelineClip[]} fps={fps} />
          <OverlayTrack clips={overlayClips as ResolvedTimelineClip[]} fps={fps} />
        </div>
      </AbsoluteFill>
      <AudioTrack clips={audioClips as ResolvedTimelineClip[]} fps={fps} />
    </AbsoluteFill>
  );
};
