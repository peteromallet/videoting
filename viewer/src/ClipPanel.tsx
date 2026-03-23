import type { FC } from "react";
import { canSplitClipAtTime, getClipEndSeconds, isClipMuted, isHoldClip } from "@shared/editor-utils";
import type { ResolvedTimelineClip, TimelineClip } from "@shared/types";
import type { ClipMeta } from "./timeline-data";

type NumberFieldProps = {
  disabled?: boolean;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step: number;
  value?: number;
};

const NumberField: FC<NumberFieldProps> = ({ disabled, label, max, min, onChange, step, value }) => {
  return (
    <label className="clip-panel-field">
      <span className="clip-panel-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className="clip-panel-input"
      />
    </label>
  );
};

const getEffectValue = (effects: TimelineClip["effects"], key: "fade_in" | "fade_out"): number | undefined => {
  if (!effects) {
    return undefined;
  }

  if (Array.isArray(effects)) {
    const effect = effects.find((entry) => typeof entry[key] === "number");
    return effect?.[key];
  }

  return typeof effects[key] === "number" ? effects[key] : undefined;
};

const setEffectValue = (
  effects: TimelineClip["effects"],
  key: "fade_in" | "fade_out",
  value?: number,
): TimelineClip["effects"] | undefined => {
  const normalizedValue = value && value > 0 ? value : undefined;

  if (Array.isArray(effects)) {
    const next = effects.map((entry) => ({ ...entry }));
    const index = next.findIndex((entry) => key in entry);
    if (normalizedValue === undefined) {
      if (index >= 0) {
        next.splice(index, 1);
      }
    } else if (index >= 0) {
      next[index][key] = normalizedValue;
    } else {
      next.push({ [key]: normalizedValue });
    }
    return next.length > 0 ? next : undefined;
  }

  const record = { ...(effects && !Array.isArray(effects) ? effects : {}) };
  if (normalizedValue === undefined) {
    delete record[key];
  } else {
    record[key] = normalizedValue;
  }

  return Object.keys(record).length > 0 ? record : undefined;
};

type ClipPanelProps = {
  clip: ResolvedTimelineClip | null;
  onChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  onClose: () => void;
  onSplit: () => void;
  onToggleMute: () => void;
  playheadSeconds: number;
};

export const ClipPanel: FC<ClipPanelProps> = ({
  clip,
  onChange,
  onClose,
  onSplit,
  onToggleMute,
  playheadSeconds,
}) => {
  if (!clip) {
    return null;
  }

  const holdClip = isHoldClip(clip);
  const clipEnd = getClipEndSeconds(clip);
  const muted = isClipMuted(clip);
  const canSplit = canSplitClipAtTime(clip, playheadSeconds);
  const fadeIn = getEffectValue(clip.effects, "fade_in");
  const fadeOut = getEffectValue(clip.effects, "fade_out");

  return (
    <div className="clip-panel">
      <div className="clip-panel-header">
        <div>
          <strong>{clip.id}</strong>
          <div className="clip-panel-subtitle">
            {clip.asset} · {clip.track} · {clip.assetEntry.type ?? "asset"}
          </div>
        </div>
        <button className="clip-panel-close" type="button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="clip-panel-grid">
        <NumberField label="At" min={0} step={0.1} value={clip.at} onChange={(value) => onChange({ at: value })} />
        <NumberField label="End" disabled step={0.1} value={clipEnd} onChange={() => {}} />
      </div>

      {holdClip ? (
        <NumberField label="Hold" min={0.1} step={0.1} value={clip.hold} onChange={(value) => onChange({ hold: value })} />
      ) : (
        <div className="clip-panel-grid">
          <NumberField label="From" min={0} step={0.1} value={clip.from} onChange={(value) => onChange({ from: value })} />
          <NumberField
            label="To"
            min={0}
            max={clip.assetEntry.duration}
            step={0.1}
            value={clip.to}
            onChange={(value) => onChange({ to: value })}
          />
        </div>
      )}

      <div className="clip-panel-grid">
        <NumberField
          label="Speed"
          min={0.25}
          max={4}
          step={0.25}
          disabled={holdClip}
          value={clip.speed ?? 1}
          onChange={(value) => onChange({ speed: value })}
        />
        <NumberField label="Volume" min={0} max={1} step={0.1} value={clip.volume ?? 1} onChange={(value) => onChange({ volume: value })} />
      </div>

      <div className="clip-panel-grid">
        <NumberField label="Fade In" min={0} step={0.1} value={fadeIn} onChange={(value) => onChange({ effects: setEffectValue(clip.effects, "fade_in", value) })} />
        <NumberField label="Fade Out" min={0} step={0.1} value={fadeOut} onChange={(value) => onChange({ effects: setEffectValue(clip.effects, "fade_out", value) })} />
      </div>

      {clip.track === "overlay" ? (
        <>
          <div className="clip-panel-grid">
            <NumberField label="X" step={1} value={clip.x} onChange={(value) => onChange({ x: value })} />
            <NumberField label="Y" step={1} value={clip.y} onChange={(value) => onChange({ y: value })} />
          </div>
          <div className="clip-panel-grid">
            <NumberField label="Width" min={20} step={1} value={clip.width} onChange={(value) => onChange({ width: value })} />
            <NumberField label="Height" min={20} step={1} value={clip.height} onChange={(value) => onChange({ height: value })} />
          </div>
          <NumberField label="Opacity" min={0} max={1} step={0.1} value={clip.opacity ?? 1} onChange={(value) => onChange({ opacity: value })} />
        </>
      ) : null}

      <div className="clip-panel-actions">
        <button type="button" className={`clip-panel-button${muted ? " muted" : ""}`} onClick={onToggleMute}>
          {muted ? "Unmute (M)" : "Mute (M)"}
        </button>
        <button type="button" className="clip-panel-button split" disabled={!canSplit} onClick={onSplit}>
          Split At Playhead (S)
        </button>
      </div>
    </div>
  );
};
