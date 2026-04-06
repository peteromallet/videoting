import type { FC, ReactNode } from "react";
import { canSplitClipAtTime, getClipEndSeconds, isClipMuted, isHoldClip } from "@shared/editor-utils";
import { continuousEffectTypes, entranceEffectTypes, exitEffectTypes } from "@shared/effects";
import { transitionTypes } from "@shared/transitions";
import type { ResolvedTimelineClip, TrackDefinition } from "@shared/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Slider } from "@/shared/components/ui/slider";
import { usePlaybackContext } from "@/tools/video-editor/contexts/TimelineContext";
import type { ClipMeta } from "@/tools/video-editor/lib/timeline-data";

type NumberFieldProps = {
  disabled?: boolean;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  placeholder?: string;
  step: number;
  title?: string;
  value?: number;
};

const Field = ({ label, children, title }: { label: string; children: ReactNode; title?: string }) => (
  <label className="flex flex-col gap-2 text-xs text-muted-foreground" title={title}>
    <span className="font-medium uppercase tracking-[0.14em]">{label}</span>
    {children}
  </label>
);

const NumberField: FC<NumberFieldProps> = ({ disabled, label, max, min, onChange, placeholder, step, title, value }) => (
  <Field label={label} title={title}>
    <Input
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
    />
  </Field>
);

const SelectField: FC<{
  disabled?: boolean;
  label: string;
  onChange: (value?: string) => void;
  options: string[];
  value?: string;
}> = ({ disabled, label, onChange, options, value }) => (
  <Field label={label}>
    <Select disabled={disabled} value={value ?? ""} onValueChange={(nextValue) => onChange(nextValue || undefined)}>
      <option value="">None</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  </Field>
);

type ClipTab = "effects" | "timing" | "position" | "audio" | "text";

type ClipPanelProps = {
  clip: ResolvedTimelineClip | null;
  track: TrackDefinition | null;
  audioTrackIds?: string[];
  hasPredecessor: boolean;
  onChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  onClose: () => void;
  onResetPosition: () => void;
  onSplit: () => void;
  onToggleMute: () => void;
  compositionWidth: number;
  compositionHeight: number;
  activeTab: ClipTab;
  setActiveTab: (tab: ClipTab) => void;
};

const hasAudioContent = (clip: ResolvedTimelineClip, track: TrackDefinition | null): boolean => {
  const assetType = clip.assetEntry?.type ?? "";
  return clip.clipType !== "text" && (track?.kind === "audio" || assetType.includes("audio"));
};

const hasPositionOverride = (clip: ResolvedTimelineClip): boolean => {
  return clip.x !== undefined || clip.y !== undefined || clip.width !== undefined || clip.height !== undefined;
};

const SplitAtPlayheadButton: FC<{ clip: ResolvedTimelineClip; onSplit: () => void }> = ({ clip, onSplit }) => {
  const { currentTime } = usePlaybackContext();
  const canSplit = canSplitClipAtTime(clip, currentTime);

  return (
    <Button variant="secondary" disabled={!canSplit} onClick={onSplit} className="w-full">
      Split At Playhead (S)
    </Button>
  );
};

export const ClipPanel: FC<ClipPanelProps> = ({
  clip,
  track,
  audioTrackIds,
  hasPredecessor,
  onChange,
  onClose,
  onResetPosition,
  onSplit,
  onToggleMute,
  compositionWidth,
  compositionHeight,
  activeTab,
  setActiveTab,
}) => {
  if (!clip) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Select a clip to edit timing, effects, and track-level overrides.
      </div>
    );
  }

  const holdClip = isHoldClip(clip);
  const clipEnd = getClipEndSeconds(clip);
  const muted = isClipMuted(clip);
  const isTextClip = clip.clipType === "text";
  const supportsPositioning = track?.kind === "visual";
  const showAudioSection = hasAudioContent(clip, track);
  const showAudioTrackSelector = clip.continuous?.type?.startsWith("audio-") ?? false;
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
      placeholder: inherited ? "auto" : undefined,
      title: inherited ? inheritedPositionTitle : undefined,
    };
  };

  const handlePositionChange = (patch: Partial<ClipMeta>) => {
    if (positionOverrides) {
      onChange(patch);
      return;
    }

    if (clip.clipType === "text") {
      onChange({
        x: clip.x ?? 0,
        y: clip.y ?? 0,
        width: clip.width ?? 640,
        height: clip.height ?? 160,
        ...patch,
      });
      return;
    }

    const trackScale = Math.max(track?.scale ?? 1, 0.01);
    onChange({
      x: clip.x ?? Math.round(compositionWidth * (1 - trackScale) / 2),
      y: clip.y ?? Math.round(compositionHeight * (1 - trackScale) / 2),
      width: clip.width ?? Math.round(compositionWidth * trackScale),
      height: clip.height ?? Math.round(compositionHeight * trackScale),
      ...patch,
    });
  };

  const tabs: { id: ClipTab; label: string }[] = [
    ...(isTextClip ? [{ id: "text" as const, label: "Text" }] : []),
    { id: "effects", label: "Effects" },
    { id: "timing", label: "Timing" },
    ...(supportsPositioning ? [{ id: "position" as const, label: "Position" }] : []),
    ...(showAudioSection ? [{ id: "audio" as const, label: "Audio" }] : []),
  ];

  // If the active tab isn't available for this clip type, fall back to effects
  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : "effects";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{clip.asset ?? clip.text?.content?.slice(0, 28) ?? clip.id}</div>
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={onClose}>×</Button>
      </div>

      <div className="flex gap-1 rounded-lg bg-editor-crust/60 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              resolvedTab === tab.id
                ? "bg-editor-surface0/80 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground/70"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {resolvedTab === "effects" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Entrance" value={clip.entrance?.type} options={entranceEffectTypes} onChange={(value) => onChange({ entrance: value ? { type: value, duration: clip.entrance?.duration ?? 0.5 } : undefined })} />
              <NumberField label="In Dur" min={0.1} max={2} step={0.1} disabled={!clip.entrance} value={clip.entrance?.duration} onChange={(value) => onChange({ entrance: clip.entrance ? { ...clip.entrance, duration: value } : undefined })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Exit" value={clip.exit?.type} options={exitEffectTypes} onChange={(value) => onChange({ exit: value ? { type: value, duration: clip.exit?.duration ?? 0.5 } : undefined })} />
              <NumberField label="Out Dur" min={0.1} max={2} step={0.1} disabled={!clip.exit} value={clip.exit?.duration} onChange={(value) => onChange({ exit: clip.exit ? { ...clip.exit, duration: value } : undefined })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Continuous"
                value={clip.continuous?.type}
                options={continuousEffectTypes}
                onChange={(value) => onChange({
                  continuous: value
                    ? {
                      type: value,
                      intensity: clip.continuous?.intensity ?? 0.5,
                      audioTrack: value.startsWith("audio-") ? clip.continuous?.audioTrack : undefined,
                    }
                    : undefined,
                })}
              />
              <NumberField label="Intensity" min={0} max={1} step={0.1} disabled={!clip.continuous} value={clip.continuous?.intensity} onChange={(value) => onChange({ continuous: clip.continuous ? { ...clip.continuous, intensity: value } : undefined })} />
            </div>
            {showAudioTrackSelector ? (
              <Field label="Audio Track">
                <Select
                  value={clip.continuous?.audioTrack ?? ""}
                  onValueChange={(value) => onChange({
                    continuous: clip.continuous
                      ? {
                        ...clip.continuous,
                        audioTrack: value || undefined,
                      }
                      : undefined,
                  })}
                >
                  <option value="">Default (first audio track)</option>
                  {(audioTrackIds ?? []).map((trackId) => (
                    <option key={trackId} value={trackId}>
                      {trackId}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {clip.continuous && !(/^audio-/.test(clip.continuous.type) || clip.continuous.type === "float" || clip.continuous.type === "glitch") ? (
              <>
                <label className="flex items-center gap-3 rounded-md border border-border/70 bg-editor-surface0/40 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={clip.continuous.loop ?? false}
                    onChange={(event) => onChange({
                      continuous: {
                        ...clip.continuous!,
                        loop: event.currentTarget.checked || undefined,
                        loopDuration: event.currentTarget.checked ? clip.continuous!.loopDuration : undefined,
                      },
                    })}
                  />
                  Loop
                </label>
                {clip.continuous.loop ? (
                  <NumberField
                    label="Period (s)"
                    min={0.1}
                    max={30}
                    step={0.1}
                    value={clip.continuous.loopDuration}
                    placeholder="auto"
                    onChange={(value) => onChange({
                      continuous: { ...clip.continuous!, loopDuration: value },
                    })}
                  />
                ) : null}
              </>
            ) : null}

            {hasPredecessor ? (
              <>
                <div className="border-t border-border/60 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Transitions</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="Type" value={clip.transition?.type} options={transitionTypes} onChange={(value) => onChange({ transition: value ? { type: value, duration: clip.transition?.duration ?? 0.5 } : undefined })} />
                  <NumberField label="Duration" min={0.1} max={2} step={0.1} disabled={!clip.transition} value={clip.transition?.duration} onChange={(value) => onChange({ transition: clip.transition ? { ...clip.transition, duration: value } : undefined })} />
                </div>
              </>
            ) : null}
          </>
        )}

        {resolvedTab === "timing" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="At" min={0} step={0.1} value={clip.at} onChange={(value) => onChange({ at: value })} />
              <NumberField label="End" disabled step={0.1} value={clipEnd} onChange={() => {}} />
            </div>

            {holdClip ? (
              <NumberField label="Hold" min={0.1} step={0.1} value={clip.hold} onChange={(value) => onChange({ hold: value })} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="From" min={0} step={0.1} value={clip.from} onChange={(value) => onChange({ from: value })} />
                <NumberField label="To" min={0} max={clip.assetEntry?.duration} step={0.1} value={clip.to} onChange={(value) => onChange({ to: value })} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <span>Speed</span>
                <span className="text-foreground">{(clip.speed ?? 1).toFixed(2)}x</span>
              </div>
              <Slider min={0.25} max={4} step={0.25} disabled={holdClip} value={[clip.speed ?? 1]} onValueChange={([value]) => onChange({ speed: value })} />
            </div>
          </>
        )}

        {resolvedTab === "position" && supportsPositioning && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X" step={1} value={clip.x} onChange={(value) => handlePositionChange({ x: value })} {...getPositionFieldProps(clip.x)} />
              <NumberField label="Y" step={1} value={clip.y} onChange={(value) => handlePositionChange({ y: value })} {...getPositionFieldProps(clip.y)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Width" min={20} step={1} value={clip.width} onChange={(value) => handlePositionChange({ width: value })} {...getPositionFieldProps(clip.width)} />
              <NumberField label="Height" min={20} step={1} value={clip.height} onChange={(value) => handlePositionChange({ height: value })} {...getPositionFieldProps(clip.height)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <span>Opacity</span>
                <span className="text-foreground">{Math.round((clip.opacity ?? 1) * 100)}%</span>
              </div>
              <Slider min={0} max={1} step={0.05} value={[clip.opacity ?? 1]} onValueChange={([value]) => onChange({ opacity: value })} />
            </div>
            {positionOverrides ? <Button variant="outline" onClick={onResetPosition}>Reset to Track Defaults</Button> : null}
          </>
        )}

        {resolvedTab === "audio" && showAudioSection && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <span>Volume</span>
                <span className="text-foreground">{Math.round((clip.volume ?? 1) * 100)}%</span>
              </div>
              <Slider min={0} max={1} step={0.05} value={[clip.volume ?? 1]} onValueChange={([value]) => onChange({ volume: value })} />
            </div>
            <Button variant={muted ? "secondary" : "outline"} onClick={onToggleMute}>{muted ? "Unmute (M)" : "Mute (M)"}</Button>
          </>
        )}

        {resolvedTab === "text" && isTextClip && (
          <>
            <Field label="Content">
              <textarea
                className="min-h-[92px] w-full rounded-md border border-input bg-editor-surface0/70 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={textValue.content}
                onChange={(event) => onChange({ text: { ...textValue, content: event.currentTarget.value } })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Font">
                <Input type="text" value={textValue.fontFamily ?? ""} onChange={(event) => onChange({ text: { ...textValue, fontFamily: event.currentTarget.value } })} />
              </Field>
              <NumberField label="Size" min={12} max={200} step={1} value={textValue.fontSize ?? 64} onChange={(value) => onChange({ text: { ...textValue, fontSize: value } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Color">
                <Input type="color" value={textValue.color ?? "#ffffff"} onChange={(event) => onChange({ text: { ...textValue, color: event.currentTarget.value } })} />
              </Field>
              <SelectField label="Align" value={textValue.align} options={["left", "center", "right"]} onChange={(value) => onChange({ text: { ...textValue, align: (value ?? "center") as "left" | "center" | "right" } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 rounded-md border border-border/70 bg-editor-surface0/40 px-3 py-2 text-sm text-foreground">
                <input type="checkbox" checked={textValue.bold ?? false} onChange={(event) => onChange({ text: { ...textValue, bold: event.currentTarget.checked } })} />
                Bold
              </label>
              <label className="flex items-center gap-3 rounded-md border border-border/70 bg-editor-surface0/40 px-3 py-2 text-sm text-foreground">
                <input type="checkbox" checked={textValue.italic ?? false} onChange={(event) => onChange({ text: { ...textValue, italic: event.currentTarget.checked } })} />
                Italic
              </label>
            </div>
          </>
        )}
      </div>

      <SplitAtPlayheadButton clip={clip} onSplit={onSplit} />
    </div>
  );
};
