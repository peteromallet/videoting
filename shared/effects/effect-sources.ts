/**
 * Built-in effects expressed as self-contained source strings.
 *
 * These are a parallel representation of the statically-imported effect components,
 * suitable for DB storage, dynamic compilation, and the LLM effect generation pipeline.
 *
 * Each source string exports a default React component conforming to EffectComponentProps.
 * Available globals: React, useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill.
 */

// --- Entrance effects ---

export const slideUpSource = `
const SlideUp = ({ children, effectFrames, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = React.useMemo(() => ({ fps: 30 }), []);
  const progress = spring({ frame, fps, durationInFrames: effectFrames, config: { damping: 14, stiffness: 120 } });
  const translateY = interpolate(progress, [0, 1], [80, 0]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "translateY(" + translateY + "px)", opacity: progress } }, children);
};
exports.default = SlideUp;
`;

export const fadeEntranceSource = `
const FadeEntrance = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, effectFrames || 12)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "none", opacity: progress } }, children);
};
exports.default = FadeEntrance;
`;

export const zoomInSource = `
const ZoomIn = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, effectFrames || 16)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [0.75, 1]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")", opacity: progress } }, children);
};
exports.default = ZoomIn;
`;

// --- Exit effects ---

export const fadeOutSource = `
const FadeOut = ({ children, durationInFrames, effectFrames }) => {
  const frame = useCurrentFrame();
  const ef = effectFrames || 12;
  const progress = interpolate(frame, [Math.max(0, durationInFrames - ef), durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = interpolate(progress, [0, 1], [1, 0]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", opacity: opacity } }, children);
};
exports.default = FadeOut;
`;

// --- Continuous effects ---

export const slowZoomSource = `
const SlowZoom = ({ children, durationInFrames, intensity }) => {
  const frame = useCurrentFrame();
  const int = intensity !== undefined ? intensity : 0.5;
  const progress = durationInFrames <= 1 ? 1 : frame / durationInFrames;
  const scale = interpolate(progress, [0, 1], [1, 1 + int * 0.1]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")" } }, children);
};
exports.default = SlowZoom;
`;

export const kenBurnsSource = `
const KenBurns = ({ children, durationInFrames, intensity }) => {
  const frame = useCurrentFrame();
  const int = intensity !== undefined ? intensity : 0.5;
  const progress = durationInFrames <= 1 ? 1 : frame / durationInFrames;
  const scale = interpolate(progress, [0, 1], [1, 1 + int * 0.18]);
  const translateX = interpolate(progress, [0, 1], [0, -20 * int]);
  const translateY = interpolate(progress, [0, 1], [0, -10 * int]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)" } }, children);
};
exports.default = KenBurns;
`;

/**
 * Map of built-in effect names to their source strings.
 * This is a subset — not every built-in has a source string representation yet.
 */
export const builtInEffectSources: Record<string, string> = {
  "slide-up": slideUpSource,
  "fade": fadeEntranceSource,
  "zoom-in": zoomInSource,
  "fade-out": fadeOutSource,
  "slow-zoom": slowZoomSource,
  "ken-burns": kenBurnsSource,
};
