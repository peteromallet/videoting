import type { RefObject } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { getTimelineDurationInFrames, parseResolution } from "@shared/config-utils";
import { TimelineRenderer } from "@shared/compositions/TimelineRenderer";
import { DebugTrack } from "@shared/compositions/DebugTrack";
import type { ResolvedTimelineConfig } from "@shared/types";

// Set to true to use a minimal single-video debug player
const DEBUG_MODE = false;

const PREVIEW_SCALE = 0.5;

export interface PreviewHandle {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  readonly isPlaying: boolean;
}

interface RemotionPreviewProps {
  config: ResolvedTimelineConfig;
  onTimeUpdate: (time: number) => void;
  playerContainerRef: RefObject<HTMLDivElement | null>;
}

const RemotionPreview = forwardRef<PreviewHandle, RemotionPreviewProps>(function RemotionPreview(
  { config, onTimeUpdate, playerContainerRef },
  ref,
) {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const inputProps = useMemo(() => ({ config }), [config]);
  const metadata = useMemo(() => {
    const fps = config.output.fps;
    const { width, height } = parseResolution(config.output.resolution);

    return {
      fps,
      durationInFrames: getTimelineDurationInFrames(config, fps),
      compositionWidth: Math.max(1, Math.round(width * PREVIEW_SCALE)),
      compositionHeight: Math.max(1, Math.round(height * PREVIEW_SCALE)),
    };
  }, [config]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      onTimeUpdate(event.detail.frame / metadata.fps);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [metadata.fps, onTimeUpdate]);

  useImperativeHandle(
    ref,
    () => ({
      seek(time: number) {
        playerRef.current?.seekTo(Math.max(0, Math.round(time * metadata.fps)));
      },
      play() {
        playerRef.current?.play();
      },
      pause() {
        playerRef.current?.pause();
      },
      togglePlayPause() {
        playerRef.current?.toggle();
      },
      get isPlaying() {
        return playerRef.current?.isPlaying() ?? isPlaying;
      },
    }),
    [isPlaying, metadata.fps],
  );

  return (
    <div ref={playerContainerRef} className="live-preview remotion-preview">
      {DEBUG_MODE ? (
        <Player
          ref={playerRef}
          component={DebugTrack}
          inputProps={{ src: "/inputs/demo-one.mp4" }}
          durationInFrames={300}
          fps={30}
          compositionWidth={1280}
          compositionHeight={720}
          controls
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Player
          ref={playerRef}
          component={TimelineRenderer}
          inputProps={inputProps}
          durationInFrames={metadata.durationInFrames}
          fps={metadata.fps}
          compositionWidth={metadata.compositionWidth}
          compositionHeight={metadata.compositionHeight}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          showVolumeControls={false}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      <button className="skip-btn" onClick={() => playerRef.current?.seekTo(0)} title="Jump to beginning">
        ⏮
      </button>
      <button className="play-btn" onClick={() => playerRef.current?.toggle()}>
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );
});

export default RemotionPreview;
