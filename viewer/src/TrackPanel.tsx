import type { FC } from "react";
import type { TrackDefinition, TrackFit } from "@shared/types";

const FIT_OPTIONS: TrackFit[] = ["cover", "contain", "manual"];
const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "hard-light"];

interface TrackPanelProps {
  track: TrackDefinition | null;
  trackCount: number;
  trackIndex: number;
  sameKindCount: number;
  onChange: (patch: Partial<TrackDefinition>) => void;
  onReorder: (direction: -1 | 1) => void;
  onRemove: () => void;
}

interface TrackSettingsBodyProps {
  track: TrackDefinition;
  onChange: (patch: Partial<TrackDefinition>) => void;
}

export const TrackSettingsBody: FC<TrackSettingsBodyProps> = ({ track, onChange }) => {
  return (
    <>
      {track.kind === "visual" && (
        <>
          <label className="track-panel-field">
            <span>Scale</span>
            <div className="track-panel-slider-row">
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={track.scale ?? 1}
                onChange={(e) => onChange({ scale: Number(e.currentTarget.value) })}
              />
              <span className="track-panel-value">{(track.scale ?? 1).toFixed(2)}</span>
            </div>
          </label>

          <label className="track-panel-field">
            <span>Fit</span>
            <select
              value={track.fit ?? "contain"}
              onChange={(e) => onChange({ fit: e.currentTarget.value as TrackFit })}
              className="clip-panel-input"
            >
              {FIT_OPTIONS.map((fit) => (
                <option key={fit} value={fit}>{fit}</option>
              ))}
            </select>
          </label>

          <label className="track-panel-field">
            <span>Blend Mode</span>
            <select
              value={track.blendMode ?? "normal"}
              onChange={(e) => onChange({ blendMode: e.currentTarget.value as TrackDefinition["blendMode"] })}
              className="clip-panel-input"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="track-panel-field">
        <span>Opacity</span>
        <div className="track-panel-slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={track.opacity ?? 1}
            onChange={(e) => onChange({ opacity: Number(e.currentTarget.value) })}
          />
          <span className="track-panel-value">{(track.opacity ?? 1).toFixed(2)}</span>
        </div>
      </label>
    </>
  );
};

export const TrackPanel: FC<TrackPanelProps> = ({
  track,
  trackCount,
  trackIndex,
  sameKindCount,
  onChange,
  onReorder,
  onRemove,
}) => {
  if (!track) {
    return (
      <div className="track-panel">
        <div className="track-panel-empty">Select a track to edit its settings</div>
      </div>
    );
  }

  return (
    <div className="track-panel">
      <div className="track-panel-header">
        <strong>{track.id}</strong>
        <span className="track-panel-kind">{track.kind}</span>
        <div className="track-panel-actions">
          <button type="button" onClick={() => onReorder(-1)} disabled={trackIndex === 0} title="Move track up">↑</button>
          <button type="button" onClick={() => onReorder(1)} disabled={trackIndex === trackCount - 1} title="Move track down">↓</button>
          <button type="button" onClick={onRemove} disabled={sameKindCount <= 1} title="Remove track">×</button>
        </div>
      </div>

      <label className="track-panel-field">
        <span>Label</span>
        <input
          type="text"
          value={track.label ?? track.id}
          onChange={(e) => onChange({ label: e.currentTarget.value })}
          className="clip-panel-input"
        />
      </label>

      <TrackSettingsBody track={track} onChange={onChange} />
    </div>
  );
};
