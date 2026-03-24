import type { RefObject } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { getTimelineDurationInFrames, parseResolution } from "@shared/config-utils";
import { TimelineRenderer } from "@shared/compositions/TimelineRenderer";
import type { ResolvedTimelineConfig } from "@shared/types";
import { Button } from "@/shared/components/ui/button";

const PREVIEW_SCALE = 1;

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
    <div ref={playerContainerRef} className="relative flex h-full min-h-[320px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#05060a]">
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
      <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full border-white/20 bg-black/35 text-white backdrop-blur hover:bg-black/60"
          onClick={() => playerRef.current?.seekTo(0)}
          title="Jump to beginning"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full border-white/20 bg-black/35 text-white backdrop-blur hover:bg-black/60"
          onClick={() => playerRef.current?.toggle()}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
        </Button>
      </div>
    </div>
  );
});

export default RemotionPreview;
