/**
 * Prompt template for generating custom effects via an LLM.
 *
 * This is just a string template — no LLM integration is included.
 * The caller (future UI or agent) passes the returned prompt to an LLM.
 */

export function getEffectPromptTemplate(description: string): string {
  return `You are a Remotion video effect developer. Write a single React component that implements the following visual effect:

"${description}"

## Component Interface

The component receives these props:
\`\`\`typescript
type EffectComponentProps = {
  children: ReactNode;       // The wrapped content to apply the effect to
  durationInFrames: number;  // Total duration of the clip in frames
  effectFrames?: number;     // Duration of the effect itself (for entrance/exit)
  intensity?: number;        // 0-1 intensity value (for continuous effects)
  audioTrack?: string;       // Optional audio track ID for audio-reactive effects
  loop?: boolean;            // If true, the effect should loop continuously
  loopDuration?: number;     // Duration of one loop cycle in frames (use with loop)
};
\`\`\`

> **FYI:** Built-in effects use a progress-based pattern internally where a single render
> function receives a normalized 0-1 progress value per role (entrance, exit, continuous).
> You do NOT need to use this pattern. Continue using the EffectComponentProps interface
> above — the runtime handles generated effects through the legacy component path.

## Available Globals

These are provided at runtime — do NOT import them:
- \`React\` — the React library (use React.createElement for JSX)
- \`useCurrentFrame()\` — returns the current frame number
- \`useVideoConfig()\` — returns { fps, width, height, durationInFrames }
- \`interpolate(value, inputRange, outputRange, options?)\` — maps a value from one range to another
- \`spring({ frame, fps, durationInFrames?, config? })\` — spring physics animation
- \`AbsoluteFill\` — full-size absolutely positioned container
- \`useAudioReactivity({ audioTrack?, numberOfSamples?, smoothing? })\` — returns { amplitude, frequencyBins, bass, mid, treble }

## Output Format

Write the component and set it as the default export using \`exports.default = ComponentName;\`

Do NOT use import/export statements. Do NOT use JSX syntax — use \`React.createElement()\` instead.

## Examples

### Slide-up entrance:
\`\`\`javascript
const SlideUp = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, effectFrames || 18)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const translateY = interpolate(progress, [0, 1], [100, 0]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "translateY(" + translateY + "%)", opacity: progress } }, children);
};
exports.default = SlideUp;
\`\`\`

### Zoom-in entrance:
\`\`\`javascript
const ZoomIn = ({ children, effectFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, effectFrames || 16)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [0.75, 1]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")", opacity: progress } }, children);
};
exports.default = ZoomIn;
\`\`\`

### Slow-zoom continuous:
\`\`\`javascript
const SlowZoom = ({ children, durationInFrames, intensity }) => {
  const frame = useCurrentFrame();
  const int = intensity !== undefined ? intensity : 0.5;
  const progress = durationInFrames <= 1 ? 1 : frame / durationInFrames;
  const scale = interpolate(progress, [0, 1], [1, 1 + int * 0.1]);
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")" } }, children);
};
exports.default = SlowZoom;
\`\`\`

### Looping pulse continuous (uses loop + loopDuration):
\`\`\`javascript
const LoopPulse = ({ children, durationInFrames, intensity, loop, loopDuration }) => {
  const frame = useCurrentFrame();
  const int = intensity !== undefined ? intensity : 0.5;
  const cycleDuration = loop && loopDuration ? loopDuration : durationInFrames;
  const cycleFrame = loop ? frame % Math.max(1, cycleDuration) : frame;
  const progress = cycleDuration <= 1 ? 1 : cycleFrame / cycleDuration;
  const pulse = Math.sin(progress * Math.PI * 2) * int * 0.05;
  const scale = 1 + pulse;
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")" } }, children);
};
exports.default = LoopPulse;
\`\`\`

### Audio-pulse continuous:
\`\`\`javascript
const AudioPulse = ({ children, intensity, audioTrack }) => {
  const int = intensity !== undefined ? intensity : 0.5;
  const { amplitude } = useAudioReactivity({ audioTrack });
  const scale = 1 + amplitude * (0.08 + int * 0.18);
  const opacity = Math.min(1, 0.84 + amplitude * (0.08 + int * 0.18));
  return React.createElement(AbsoluteFill, { style: { width: "100%", height: "100%", transform: "scale(" + scale + ")", opacity: opacity } }, children);
};
exports.default = AudioPulse;
\`\`\`

Now write the component for: "${description}"
`;
}
