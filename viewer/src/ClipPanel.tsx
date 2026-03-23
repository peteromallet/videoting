import type { FC } from "react";
import { canSplitClipAtTime, getClipEndSeconds, isClipMuted, isHoldClip } from "@shared/editor-utils";
import { continuousEffectTypes, entranceEffectTypes, exitEffectTypes } from "@shared/effects";
import { transitionTypes } from "@shared/transitions";
import type { ResolvedTimelineClip, TrackDefinition } from "@shared/types";
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

type SelectFieldProps = {
  label: string;
  value?: string;
  options: string[];
  onChange: (value?: string) => void;
};

const SelectField: FC<SelectFieldProps> = ({ label, onChange, options, value }) => {
  return (
    <label className="clip-panel-field">
      <span className="clip-panel-label">{label}</span>
      <select
        className="clip-panel-input"
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      >
        <option value="">None</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
};

type ClipPanelProps = {
  clip: ResolvedTimelineClip | null;
  track: TrackDefinition | null;
  hasPredecessor: boolean;
  onChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  onClose: () => void;
  onSplit: () => void;
  onToggleMute: () => void;
  playheadSeconds: number;
};

export const ClipPanel: FC<ClipPanelProps> = ({
  clip,
  track,
  hasPredecessor,
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
  const isTextClip = clip.clipType === "text";
  const supportsPositioning = track?.kind === "visual" && (track.fit === "manual" || isTextClip);
  const textValue = {
    content: clip.text?.content ?? "",
    fontFamily: clip.text?.fontFamily,
    fontSize: clip.text?.fontSize,
    color: clip.text?.color,
    align: clip.text?.align,
    bold: clip.text?.bold,
    italic: clip.text?.italic,
  };

  return (
    <div className="clip-panel">
      <div className="clip-panel-header">
        <div>
          <strong>{clip.id}</strong>
          <div className="clip-panel-subtitle">
            {clip.asset ?? "text"} · {clip.track} · {clip.clipType ?? "media"}
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
            max={clip.assetEntry?.duration}
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
        <SelectField
          label="Entrance"
          value={clip.entrance?.type}
          options={entranceEffectTypes}
          onChange={(value) => onChange({ entrance: value ? { type: value, duration: clip.entrance?.duration ?? 0.5 } : undefined })}
        />
        <NumberField
          label="In Dur"
          min={0.1}
          max={2}
          step={0.1}
          value={clip.entrance?.duration}
          onChange={(value) => onChange({ entrance: clip.entrance ? { ...clip.entrance, duration: value } : undefined })}
        />
      </div>

      <div className="clip-panel-grid">
        <SelectField
          label="Exit"
          value={clip.exit?.type}
          options={exitEffectTypes}
          onChange={(value) => onChange({ exit: value ? { type: value, duration: clip.exit?.duration ?? 0.5 } : undefined })}
        />
        <NumberField
          label="Out Dur"
          min={0.1}
          max={2}
          step={0.1}
          value={clip.exit?.duration}
          onChange={(value) => onChange({ exit: clip.exit ? { ...clip.exit, duration: value } : undefined })}
        />
      </div>

      <div className="clip-panel-grid">
        <SelectField
          label="Continuous"
          value={clip.continuous?.type}
          options={continuousEffectTypes}
          onChange={(value) => onChange({ continuous: value ? { type: value, intensity: clip.continuous?.intensity ?? 0.5 } : undefined })}
        />
        <NumberField
          label="Intensity"
          min={0}
          max={1}
          step={0.1}
          value={clip.continuous?.intensity ?? 0.5}
          onChange={(value) => onChange({ continuous: clip.continuous ? { ...clip.continuous, intensity: value } : undefined })}
        />
      </div>

      {hasPredecessor ? (
        <div className="clip-panel-grid">
          <SelectField
            label="Transition"
            value={clip.transition?.type}
            options={transitionTypes}
            onChange={(value) => onChange({ transition: value ? { type: value, duration: clip.transition?.duration ?? 0.5 } : undefined })}
          />
          <NumberField
            label="Trans Dur"
            min={0.1}
            max={2}
            step={0.1}
            value={clip.transition?.duration}
            onChange={(value) => onChange({ transition: clip.transition ? { ...clip.transition, duration: value } : undefined })}
          />
        </div>
      ) : null}

      {supportsPositioning ? (
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

      {isTextClip ? (
        <>
          <label className="clip-panel-field">
            <span className="clip-panel-label">Content</span>
            <textarea
              className="clip-panel-input clip-panel-textarea"
              value={textValue.content}
              onChange={(event) => onChange({ text: { ...textValue, content: event.currentTarget.value } })}
            />
          </label>
          <div className="clip-panel-grid">
            <label className="clip-panel-field">
              <span className="clip-panel-label">Font</span>
              <input
                className="clip-panel-input"
                type="text"
                value={textValue.fontFamily ?? ""}
                onChange={(event) => onChange({ text: { ...textValue, fontFamily: event.currentTarget.value } })}
              />
            </label>
            <NumberField
              label="Size"
              min={12}
              max={200}
              step={1}
              value={textValue.fontSize ?? 64}
              onChange={(value) => onChange({ text: { ...textValue, fontSize: value } })}
            />
          </div>
          <div className="clip-panel-grid">
            <label className="clip-panel-field">
              <span className="clip-panel-label">Color</span>
              <input
                className="clip-panel-input"
                type="color"
                value={textValue.color ?? "#ffffff"}
                onChange={(event) => onChange({ text: { ...textValue, color: event.currentTarget.value } })}
              />
            </label>
            <SelectField
              label="Align"
              value={textValue.align}
              options={["left", "center", "right"]}
              onChange={(value) => onChange({ text: { ...textValue, align: (value ?? "center") as "left" | "center" | "right" } })}
            />
          </div>
          <div className="clip-panel-grid">
            <label className="clip-panel-field clip-panel-toggle">
              <span className="clip-panel-label">Bold</span>
              <input
                type="checkbox"
                checked={textValue.bold ?? false}
                onChange={(event) => onChange({ text: { ...textValue, bold: event.currentTarget.checked } })}
              />
            </label>
            <label className="clip-panel-field clip-panel-toggle">
              <span className="clip-panel-label">Italic</span>
              <input
                type="checkbox"
                checked={textValue.italic ?? false}
                onChange={(event) => onChange({ text: { ...textValue, italic: event.currentTarget.checked } })}
              />
            </label>
          </div>
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
