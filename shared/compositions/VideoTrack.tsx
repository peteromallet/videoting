import type { CSSProperties, FC } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Video, Sequence, getRemotionEnvironment, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { getClipDurationInFrames, secondsToFrames } from "@shared/config-utils";
import type { ResolvedTimelineClip } from "@shared/types";
import { useClipOpacity } from "./Effects";

const isImageAsset = (clip: ResolvedTimelineClip): boolean => {
  return clip.assetEntry.type === "image";
};

const VideoClip: FC<{ clip: ResolvedTimelineClip; fps: number }> = ({ clip, fps }) => {
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const opacity = useClipOpacity(clip, durationInFrames, fps);
  const env = getRemotionEnvironment();
  const sharedStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    opacity,
  };

  if (isImageAsset(clip)) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Img
          src={clip.assetEntry.src}
          style={{
            ...sharedStyle,
            objectFit: "contain",
          }}
        />
      </AbsoluteFill>
    );
  }

  const clipVolume = clip.volume ?? 1;
  const isMuted = clipVolume <= 0;

  // Use <Video> for live playback (Player/Studio), <OffthreadVideo> for rendering
  if (env.isRendering) {
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={clip.assetEntry.src}
          startFrom={secondsToFrames(clip.from ?? 0, fps)}
          playbackRate={clip.speed ?? 1}
          volume={clipVolume}
          muted={isMuted}
          style={{
            ...sharedStyle,
            objectFit: "contain",
          }}
          transparent
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Video
        src={clip.assetEntry.src}
        startFrom={secondsToFrames(clip.from ?? 0, fps)}
        playbackRate={clip.speed ?? 1}
        volume={clipVolume}
        muted={isMuted}
        style={{
          ...sharedStyle,
          objectFit: "contain",
        }}
      />
    </AbsoluteFill>
  );
};

// Slide up with a bounce
const SlideUpEntrance: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(progress, [0, 1], [80, 0]);
  const scale = interpolate(progress, [0, 1], [0.92, 1]);
  return (
    <AbsoluteFill style={{ transform: `translateY(${translateY}px) scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

// Zoom in from small with rotation
const ZoomSpinEntrance: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 18, stiffness: 80, mass: 1.2 } });
  const scale = interpolate(progress, [0, 1], [0.3, 1]);
  const rotate = interpolate(progress, [0, 1], [-8, 0]);
  const opacity = interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) rotate(${rotate}deg)`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// Slide in from the right
const SlideRightEntrance: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 20, stiffness: 100, mass: 0.6 } });
  const translateX = interpolate(progress, [0, 1], [300, 0]);
  const opacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `translateX(${translateX}px)`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// Fade in with a gentle scale pulse
const PulseEntrance: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 10, stiffness: 200, mass: 0.5 } });
  const scale = interpolate(progress, [0, 1], [1.15, 1]);
  const opacity = interpolate(progress, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// === EXIT ANIMATIONS ===

// Slide down and fade out
const SlideDownExit: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitDuration = Math.min(15, durationInFrames);
  const exitStart = durationInFrames - exitDuration;
  const progress = spring({ frame: Math.max(0, frame - exitStart), fps, config: { damping: 20, stiffness: 150 }, durationInFrames: exitDuration });
  const translateY = interpolate(progress, [0, 1], [0, 120]);
  const opacity = interpolate(progress, [0, 1], [1, 0]);
  return (
    <AbsoluteFill style={{ transform: `translateY(${translateY}px)`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// Zoom out and vanish
const ZoomOutExit: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitDuration = Math.min(12, durationInFrames);
  const exitStart = durationInFrames - exitDuration;
  const progress = spring({ frame: Math.max(0, frame - exitStart), fps, config: { damping: 25, stiffness: 200 }, durationInFrames: exitDuration });
  const scale = interpolate(progress, [0, 1], [1, 0.4]);
  const opacity = interpolate(progress, [0, 1], [1, 0]);
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// Flip out like a card
const FlipExit: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitDuration = Math.min(15, durationInFrames);
  const exitStart = durationInFrames - exitDuration;
  const progress = spring({ frame: Math.max(0, frame - exitStart), fps, config: { damping: 30, stiffness: 100 }, durationInFrames: exitDuration });
  const rotateX = interpolate(progress, [0, 1], [0, 90]);
  const opacity = interpolate(progress, [0, 0.8, 1], [1, 1, 0]);
  return (
    <AbsoluteFill style={{ perspective: 800 }}>
      <AbsoluteFill style={{ transform: `rotateX(${rotateX}deg)`, opacity, transformOrigin: "center bottom" }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// === CONTINUOUS EFFECTS (run throughout the clip) ===

// Gentle floating/breathing motion
const FloatingEffect: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const translateY = Math.sin(frame * 0.08) * 6;
  const scale = 1 + Math.sin(frame * 0.05) * 0.008;
  return (
    <AbsoluteFill style={{ transform: `translateY(${translateY}px) scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

// Slow Ken Burns zoom
const KenBurnsEffect: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;
  const scale = interpolate(progress, [0, 1], [1, 1.15]);
  const translateX = interpolate(progress, [0, 1], [0, -20]);
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${translateX}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

// Glitch effect — periodic offset/color shift
const GlitchEffect: FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  // Glitch every ~45 frames for 3 frames
  const glitchCycle = frame % 45;
  const isGlitching = glitchCycle < 3;
  const offsetX = isGlitching ? (Math.sin(frame * 17) * 8) : 0;
  const offsetY = isGlitching ? (Math.cos(frame * 13) * 3) : 0;
  const skew = isGlitching ? Math.sin(frame * 23) * 2 : 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${offsetX}px, ${offsetY}px) skewX(${skew}deg)` }}>
      {children}
    </AbsoluteFill>
  );
};

// === COMBINED ENTRANCE + EXIT ===

const combineEffects = (
  Entrance: FC<{ children: React.ReactNode }>,
  Exit: FC<{ children: React.ReactNode }>,
  Continuous?: FC<{ children: React.ReactNode }>,
): FC<{ children: React.ReactNode }> => {
  const Combined: FC<{ children: React.ReactNode }> = ({ children }) => {
    let content = children;
    if (Continuous) content = <Continuous>{content}</Continuous>;
    return <Entrance><Exit>{content}</Exit></Entrance>;
  };
  return Combined;
};

// Identity wrapper (no effect)
const NoEffect: FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

const EFFECT_BY_ASSET: Record<string, FC<{ children: React.ReactNode }>> = {
  // Slide up in, flip out, with a gentle float throughout
  "output-composition": combineEffects(SlideUpEntrance, FlipExit, FloatingEffect),
  // Zoom-spin in, zoom out exit, with Ken Burns pan
  "venn-diagram": combineEffects(ZoomSpinEntrance, ZoomOutExit, KenBurnsEffect),
  // Slide right in, slide down out, with glitch effect
  "demo-one": combineEffects(SlideRightEntrance, SlideDownExit, GlitchEffect),
  // Pulse in, flip out
  "demo-two": combineEffects(PulseEntrance, FlipExit),
};

export const VideoTrack: FC<{
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ clips, fps }) => {
  return (
    <>
      {clips.map((clip) => {
        const Effect = EFFECT_BY_ASSET[clip.asset] ?? NoEffect;
        return (
          <Sequence
            key={clip.id}
            from={secondsToFrames(clip.at, fps)}
            durationInFrames={getClipDurationInFrames(clip, fps)}
          >
            <Effect>
              <VideoClip clip={clip} fps={fps} />
            </Effect>
          </Sequence>
        );
      })}
    </>
  );
};
