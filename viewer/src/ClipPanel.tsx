import type { FC, ReactNode } from "react";
import { useState } from "react";
import { canSplitClipAtTime, getClipEndSeconds, isClipMuted, isHoldClip } from "@shared/editor-utils";
import { continuousEffectTypes, entranceEffectTypes, exitEffectTypes } from "@shared/effects";
import { transitionTypes } from "@shared/transitions";
import type { ResolvedTimelineClip, TrackDefinition } from "@shared/types";
import type { ClipMeta } from "./timeline-data";

type NumberFieldProps = {
  className?: string;
  disabled?: boolean;
  inputClassName?: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  placeholder?: string;
  step: number;
  title?: string;
  value?: number;
};

const NumberField: FC<NumberFieldProps> = ({
  className,
  disabled,
  inputClassName,
  label,
  max,
  min,
  onChange,
  placeholder,
  step,
  title,
  value,
}) => {
  return (
    <label className={`clip-panel-field${className ? ` ${className}` : ""}`} title={title}>
      <span className="clip-panel-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const rawValue = event.currentTarget.value;
          if (rawValue === "") {
            return;
          }

          const nextValue = Number(rawValue);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className={`clip-panel-input${inputClassName ? ` ${inputClassName}` : ""}`}
      />
    </label>
  );
};

type SelectFieldProps = {
  disabled?: boolean;
  label: string;
  onChange: (value?: string) => void;
  options: string[];
  value?: string;
};

const SelectField: FC<SelectFieldProps> = ({ disabled, label, onChange, options, value }) => {
  return (
    <label className="clip-panel-field">
      <span className="clip-panel-label">{label}</span>
      <select
        className="clip-panel-input"
        disabled={disabled}
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

type PanelSectionProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
};

const PanelSection: FC<PanelSectionProps> = ({ children, defaultOpen = true, title }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`clip-panel-section${isOpen ? " is-open" : ""}`}>
      <button className="clip-panel-section-header" type="button" onClick={() => setIsOpen((open) => !open)}>
        <span className="clip-panel-section-title">{title}</span>
        <span className={`clip-panel-section-chevron${isOpen ? " is-open" : ""}`}>⌄</span>
      </button>
      {isOpen ? <div className="clip-panel-section-body">{children}</div> : null}
    </section>
  );
};

type ClipPanelProps = {
  clip: ResolvedTimelineClip | null;
  track: TrackDefinition | null;
  hasPredecessor: boolean;
  onChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  onClose: () => void;
  onResetPosition: () => void;
  onSplit: () => void;
  onToggleMute: () => void;
  playheadSeconds: number;
  compositionWidth: number;
  compositionHeight: number;
};

const hasAudioContent = (clip: ResolvedTimelineClip, track: TrackDefinition | null): boolean => {
  const assetType = clip.assetEntry?.type ?? "";
  return clip.clipType !== "text" && (track?.kind === "audio" || assetType.includes("audio"));
};

const hasPositionOverride = (clip: ResolvedTimelineClip): boolean => {
  return (
    clip.x !== undefined
    || clip.y !== undefined
    || clip.width !== undefined
    || clip.height !== undefined
  );
};

export const ClipPanel: FC<ClipPanelProps> = ({
  clip,
  track,
  hasPredecessor,
  onChange,
  onClose,
  onResetPosition,
  onSplit,
  onToggleMute,
  playheadSeconds,
  compositionWidth,
  compositionHeight,
}) => {
  if (!clip) {
    return null;
  }

  const holdClip = isHoldClip(clip);
  const clipEnd = getClipEndSeconds(clip);
  const muted = isClipMuted(clip);
  const canSplit = canSplitClipAtTime(clip, playheadSeconds);
  const isTextClip = clip.clipType === "text";
  const supportsPositioning = track?.kind === "visual";
  const showAudioSection = hasAudioContent(clip, track);
  const positionOverrides = hasPositionOverride(clip);
  const inheritedPositionTitle = `inherits full frame: ${compositionWidth}x${compositionHeight}`;
  const textValue = {
    content: clip.text?.content ?? "",
    fontFamily: clip.text?.fontFamily,
    fontSize: clip.text?.fontSize,
    color: clip.text?.color,
    align: clip.text?.align,
    bold: clip.text?.bold,
    italic: clip.text?.italic,
  };

  const getPositionFieldProps = (value: number | undefined) => {
    const inherited = value === undefined;
    return {
      className: inherited ? "clip-panel-field--inherited" : "clip-panel-field--overridden",
      inputClassName: inherited ? "clip-panel-input--inherited" : undefined,
      placeholder: inherited ? "auto" : undefined,
      title: inherited ? inheritedPositionTitle : undefined,
    };
  };

  return (
    <div className="clip-panel">
      <div className="clip-panel-header">
        <div className="clip-panel-header-copy">
          <strong className="clip-panel-title">{clip.id}</strong>
          <div className="clip-panel-subtitle">{clip.asset ?? "Text clip"}</div>
          <div className="clip-panel-meta">
            <span>{track?.label ?? clip.track}</span>
            <span>{clip.clipType ?? "media"}</span>
          </div>
        </div>
        <button className="clip-panel-close" type="button" onClick={onClose}>
          ×
        </button>
      </div>

      <PanelSection title="Timing" defaultOpen>
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

        <NumberField
          label="Speed"
          min={0.25}
          max={4}
          step={0.25}
          disabled={holdClip}
          value={clip.speed ?? 1}
          onChange={(value) => onChange({ speed: value })}
        />
      </PanelSection>

      {supportsPositioning ? (
        <PanelSection title="Position & Size" defaultOpen>
          <div className="clip-panel-grid">
            <NumberField
              label="X"
              step={1}
              value={clip.x}
              onChange={(value) => onChange({ x: value })}
              {...getPositionFieldProps(clip.x)}
            />
            <NumberField
              label="Y"
              step={1}
              value={clip.y}
              onChange={(value) => onChange({ y: value })}
              {...getPositionFieldProps(clip.y)}
            />
          </div>
          <div className="clip-panel-grid">
            <NumberField
              label="Width"
              min={20}
              step={1}
              value={clip.width}
              onChange={(value) => onChange({ width: value })}
              {...getPositionFieldProps(clip.width)}
            />
            <NumberField
              label="Height"
              min={20}
              step={1}
              value={clip.height}
              onChange={(value) => onChange({ height: value })}
              {...getPositionFieldProps(clip.height)}
            />
          </div>
          <NumberField
            label="Opacity"
            min={0}
            max={1}
            step={0.1}
            value={clip.opacity ?? 1}
            onChange={(value) => onChange({ opacity: value })}
          />
          {positionOverrides ? (
            <button type="button" className="clip-panel-button clip-panel-button-secondary" onClick={onResetPosition}>
              Reset to Track Defaults
            </button>
          ) : null}
        </PanelSection>
      ) : null}

      <PanelSection title="Effects" defaultOpen>
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
            disabled={!clip.entrance}
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
            disabled={!clip.exit}
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
            disabled={!clip.continuous}
            value={clip.continuous?.intensity}
            onChange={(value) => onChange({ continuous: clip.continuous ? { ...clip.continuous, intensity: value } : undefined })}
          />
        </div>
      </PanelSection>

      {showAudioSection ? (
        <PanelSection title="Audio" defaultOpen={false}>
          <label className="clip-panel-field">
            <span className="clip-panel-label">Volume</span>
            <div className="clip-panel-slider-row">
              <input
                className="clip-panel-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={clip.volume ?? 1}
                onChange={(event) => onChange({ volume: Number(event.currentTarget.value) })}
              />
              <span className="clip-panel-slider-value">{Math.round((clip.volume ?? 1) * 100)}%</span>
            </div>
          </label>
          <button type="button" className={`clip-panel-button${muted ? " muted" : ""}`} onClick={onToggleMute}>
            {muted ? "Unmute (M)" : "Mute (M)"}
          </button>
        </PanelSection>
      ) : null}

      {hasPredecessor ? (
        <PanelSection title="Transitions" defaultOpen>
          <div className="clip-panel-grid">
            <SelectField
              label="Type"
              value={clip.transition?.type}
              options={transitionTypes}
              onChange={(value) => onChange({ transition: value ? { type: value, duration: clip.transition?.duration ?? 0.5 } : undefined })}
            />
            <NumberField
              label="Duration"
              min={0.1}
              max={2}
              step={0.1}
              disabled={!clip.transition}
              value={clip.transition?.duration}
              onChange={(value) => onChange({ transition: clip.transition ? { ...clip.transition, duration: value } : undefined })}
            />
          </div>
        </PanelSection>
      ) : null}

      {isTextClip ? (
        <PanelSection title="Text" defaultOpen>
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
        </PanelSection>
      ) : null}

      <div className="clip-panel-actions">
        <button type="button" className="clip-panel-button split" disabled={!canSplit} onClick={onSplit}>
          Split At Playhead (S)
        </button>
      </div>
    </div>
  );
};
