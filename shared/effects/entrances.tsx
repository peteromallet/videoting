import type { FC, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type EffectComponentProps = {
  children: ReactNode;
  durationInFrames: number;
  effectFrames?: number;
  intensity?: number;
};

const getNormalizedProgress = (frame: number, durationInFrames: number): number => {
  return interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

const withTransform = (transform: string, opacity = 1): React.CSSProperties => ({
  width: "100%",
  height: "100%",
  transform,
  opacity,
});

export const SlideUpEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, durationInFrames: effectFrames, config: { damping: 14, stiffness: 120 } });
  const translateY = interpolate(progress, [0, 1], [80, 0]);
  return <AbsoluteFill style={withTransform(`translateY(${translateY}px)`, progress)}>{children}</AbsoluteFill>;
};

export const SlideDownEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 18);
  const translateY = interpolate(progress, [0, 1], [-80, 0]);
  return <AbsoluteFill style={withTransform(`translateY(${translateY}px)`, progress)}>{children}</AbsoluteFill>;
};

export const SlideLeftEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 18);
  const translateX = interpolate(progress, [0, 1], [180, 0]);
  return <AbsoluteFill style={withTransform(`translateX(${translateX}px)`, progress)}>{children}</AbsoluteFill>;
};

export const SlideRightEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 18);
  const translateX = interpolate(progress, [0, 1], [-180, 0]);
  return <AbsoluteFill style={withTransform(`translateX(${translateX}px)`, progress)}>{children}</AbsoluteFill>;
};

export const ZoomInEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 16);
  const scale = interpolate(progress, [0, 1], [0.75, 1]);
  return <AbsoluteFill style={withTransform(`scale(${scale})`, progress)}>{children}</AbsoluteFill>;
};

export const ZoomSpinEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 20);
  const scale = interpolate(progress, [0, 1], [0.35, 1]);
  const rotate = interpolate(progress, [0, 1], [-10, 0]);
  return <AbsoluteFill style={withTransform(`scale(${scale}) rotate(${rotate}deg)`, progress)}>{children}</AbsoluteFill>;
};

export const PulseEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 14);
  const scale = interpolate(progress, [0, 0.6, 1], [1.12, 0.95, 1]);
  return <AbsoluteFill style={withTransform(`scale(${scale})`, progress)}>{children}</AbsoluteFill>;
};

export const FadeEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 12);
  return <AbsoluteFill style={withTransform("none", progress)}>{children}</AbsoluteFill>;
};

export const FlipEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 18);
  const rotateY = interpolate(progress, [0, 1], [-90, 0]);
  return (
    <AbsoluteFill style={{ perspective: 1000 }}>
      <AbsoluteFill style={withTransform(`rotateY(${rotateY}deg)`, progress)}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

export const BounceEntrance: FC<EffectComponentProps> = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = getNormalizedProgress(frame, effectFrames ?? 20);
  const translateY = interpolate(progress, [0, 0.6, 0.8, 1], [120, -20, 10, 0]);
  return <AbsoluteFill style={withTransform(`translateY(${translateY}px)`, progress)}>{children}</AbsoluteFill>;
};
