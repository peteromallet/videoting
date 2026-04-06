/**
 * Built-in effects expressed as self-contained source strings.
 *
 * These are a parallel representation of the statically-imported effect components,
 * suitable for DB storage, dynamic compilation, and the LLM effect generation pipeline.
 *
 * Each source string exports a default React component conforming to EffectComponentProps.
 * Available globals: React, useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, useAudioReactivity.
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

export const dissolveSource = `
const Dissolve = ({ children, durationInFrames, effectFrames }) => {
  const frame = useCurrentFrame();
  const ef = effectFrames || 16;
  const progress = interpolate(frame, [Math.max(0, durationInFrames - ef), durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const blur = interpolate(progress, [0, 1], [0, 16]);
  const opacity = interpolate(progress, [0, 1], [1, 0]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", filter: "blur(" + blur + "px)", opacity: opacity } }, children);
};
exports.default = Dissolve;
`;

export const shrinkSource = `
const Shrink = ({ children, durationInFrames, effectFrames }) => {
  const frame = useCurrentFrame();
  const ef = effectFrames || 14;
  const progress = interpolate(frame, [Math.max(0, durationInFrames - ef), durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [1, 0.2]);
  const opacity = interpolate(progress, [0, 1], [1, 0]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")", opacity: opacity } }, children);
};
exports.default = Shrink;
`;

export const flipSource = `
const Flip = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, effectFrames || 16)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rotateY = interpolate(progress, [0, 1], [-90, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", perspective: "800px", transform: "rotateY(" + rotateY + "deg)", opacity: opacity } }, children);
};
exports.default = Flip;
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

export const audioPulseSource = `
const AudioPulse = ({ children, intensity, audioTrack }) => {
  const int = intensity !== undefined ? intensity : 0.5;
  const { amplitude } = useAudioReactivity({ audioTrack });
  const scale = 1 + amplitude * (0.08 + int * 0.18);
  const opacity = Math.min(1, 0.84 + amplitude * (0.08 + int * 0.18));
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")", opacity: opacity } }, children);
};
exports.default = AudioPulse;
`;

export const audioGlowSource = `
const AudioGlow = ({ children, intensity, audioTrack }) => {
  const int = intensity !== undefined ? intensity : 0.5;
  const { amplitude } = useAudioReactivity({ audioTrack });
  const glowRadius = 10 + amplitude * (20 + int * 36);
  const glowOpacity = Math.max(0.08, Math.min(0.72, 0.12 + amplitude * (0.22 + int * 0.24)));
  const filter = "drop-shadow(0 0 " + glowRadius + "px rgba(255, 196, 92, " + glowOpacity + ")) drop-shadow(0 0 " + (glowRadius * 0.45) + "px rgba(255, 255, 255, " + (glowOpacity * 0.6) + "))";
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", filter: filter } }, children);
};
exports.default = AudioGlow;
`;

/**
 * Map of built-in effect names to their source strings.
 * This is a subset — not every built-in has a source string representation yet.
 */
export const builtInEffectSources: Record<string, string> = {
  "slide-up": slideUpSource,
  "fade": fadeEntranceSource,
  "zoom": zoomInSource,
  "zoom-in": zoomInSource,
  "fade-out": fadeOutSource,
  "dissolve": dissolveSource,
  "shrink": shrinkSource,
  "flip": flipSource,
  "slow-zoom": slowZoomSource,
  "ken-burns": kenBurnsSource,
  "audio-pulse": audioPulseSource,
  "audio-glow": audioGlowSource,
};
