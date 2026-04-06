import { useId, type FC } from "react";
import { AbsoluteFill } from "remotion";
import type { EffectComponentProps } from "./entrances";
import { useAudioReactivity } from "./useAudioReactivity";

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const withFullSize = (style: React.CSSProperties): React.CSSProperties => ({
  width: "100%",
  height: "100%",
  ...style,
});

const getIntensity = (intensity: number | undefined): number => intensity ?? 0.5;

const buildBarsClipPath = (bins: number[]): string => {
  const points = ["0% 100%"];
  const step = 100 / bins.length;

  bins.forEach((bin, index) => {
    const inset = step * 0.18;
    const left = index * step + inset;
    const right = (index + 1) * step - inset;
    const top = 100 - (12 + clamp(bin, 0, 1) * 76);
    points.push(`${left}% 100%`, `${left}% ${top}%`, `${right}% ${top}%`, `${right}% 100%`);
  });

  points.push("100% 100%");
  return `polygon(${points.join(", ")})`;
};

const buildWavePath = (bins: number[]): string => {
  const points = bins.map((bin, index) => ({
    x: bins.length === 1 ? 1 : index / (bins.length - 1),
    y: clamp(0.74 - clamp(bin, 0, 1) * 0.46, 0.16, 0.92),
  }));

  let path = `M 0 1 L 0 ${points[0]?.y ?? 0.74}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = Number(((previous.x + current.x) / 2).toFixed(4));
    path += ` C ${controlX} ${previous.y.toFixed(4)}, ${controlX} ${current.y.toFixed(4)}, ${current.x.toFixed(4)} ${current.y.toFixed(4)}`;
  }

  return `${path} L 1 1 Z`;
};

export const AudioPulseEffect: FC<EffectComponentProps> = ({ children, intensity, audioTrack }) => {
  const { amplitude } = useAudioReactivity({ audioTrack });
  const effectIntensity = getIntensity(intensity);
  const scale = 1 + amplitude * (0.08 + effectIntensity * 0.18);
  const opacity = clamp(0.84 + amplitude * (0.08 + effectIntensity * 0.18), 0.72, 1);

  return <AbsoluteFill style={withFullSize({ transform: `scale(${scale})`, opacity })}>{children}</AbsoluteFill>;
};

export const AudioMaskCircleEffect: FC<EffectComponentProps> = ({ children, intensity, audioTrack }) => {
  const { amplitude } = useAudioReactivity({ audioTrack, numberOfSamples: 16 });
  const effectIntensity = getIntensity(intensity);
  const radius = clamp(16 + amplitude * (22 + effectIntensity * 42), 14, 88);

  return <AbsoluteFill style={withFullSize({ clipPath: `circle(${radius}% at 50% 50%)` })}>{children}</AbsoluteFill>;
};

export const AudioMaskBarsEffect: FC<EffectComponentProps> = ({ children, intensity, audioTrack }) => {
  const { frequencyBins } = useAudioReactivity({ audioTrack, numberOfSamples: 16 });
  const effectIntensity = getIntensity(intensity);
  const scaledBins = frequencyBins.map((bin) => clamp(bin * (0.6 + effectIntensity * 0.8), 0, 1));

  return <AbsoluteFill style={withFullSize({ clipPath: buildBarsClipPath(scaledBins) })}>{children}</AbsoluteFill>;
};

export const AudioMaskWaveEffect: FC<EffectComponentProps> = ({ children, intensity, audioTrack }) => {
  const clipId = useId().replace(/:/g, "");
  const { frequencyBins } = useAudioReactivity({ audioTrack, numberOfSamples: 16 });
  const effectIntensity = getIntensity(intensity);
  const scaledBins = frequencyBins.map((bin) => clamp(bin * (0.65 + effectIntensity * 0.85), 0, 1));
  const path = buildWavePath(scaledBins);

  return (
    <AbsoluteFill style={withFullSize({})}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={path} />
          </clipPath>
        </defs>
      </svg>
      <AbsoluteFill style={withFullSize({ clipPath: `url(#${clipId})` })}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

export const AudioGlowEffect: FC<EffectComponentProps> = ({ children, intensity, audioTrack }) => {
  const { amplitude } = useAudioReactivity({ audioTrack });
  const effectIntensity = getIntensity(intensity);
  const glowRadius = 10 + amplitude * (20 + effectIntensity * 36);
  const glowOpacity = clamp(0.12 + amplitude * (0.22 + effectIntensity * 0.24), 0.08, 0.72);

  return (
    <AbsoluteFill
      style={withFullSize({
        filter: `drop-shadow(0 0 ${glowRadius}px rgba(255, 196, 92, ${glowOpacity})) drop-shadow(0 0 ${glowRadius * 0.45}px rgba(255, 255, 255, ${glowOpacity * 0.6}))`,
      })}
    >
      {children}
    </AbsoluteFill>
  );
};
