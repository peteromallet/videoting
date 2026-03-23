import type { FC } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  staticFile,
} from "remotion";

const FPS = 30;

// Fade in helper: returns opacity 0→1 over `duration` seconds starting at `startSec`
function fadeIn(frame: number, startSec: number, durationSec: number): number {
  const startFrame = Math.round(startSec * FPS);
  const durationFrames = Math.round(durationSec * FPS);
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export const CompositionVideo: FC = () => {
  const frame = useCurrentFrame();

  // Image 1: top-left, fades in at t=0 over 0.4s
  const img1Opacity = fadeIn(frame, 0, 0.4);

  // Image 2: bottom-left, fades in at t=0.5 over 0.4s
  const img2Opacity = fadeIn(frame, 0.5, 0.4);

  // Video: right side, fades in at t=1.0 over 0.4s
  const vidOpacity = fadeIn(frame, 1.0, 0.4);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Image 1: top-left */}
      <Img
        src={staticFile("inputs/example-image1.jpg")}
        style={{
          position: "absolute",
          left: 40,
          top: 54,
          width: 640,
          height: 476,
          opacity: img1Opacity,
        }}
      />

      {/* Image 2: bottom-left */}
      <Img
        src={staticFile("inputs/example-image2.jpg")}
        style={{
          position: "absolute",
          left: 40,
          top: 550,
          width: 640,
          height: 476,
          opacity: img2Opacity,
        }}
      />

      {/* Video: right side */}
      <div
        style={{
          position: "absolute",
          left: 720,
          top: 102,
          width: 1160,
          height: 876,
          opacity: vidOpacity,
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={staticFile("inputs/example-video.mp4")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          muted
        />
      </div>
    </AbsoluteFill>
  );
};
