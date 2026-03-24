import type { FC } from "react";
import type { TrackDefinition, TrackFit } from "@shared/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { Slider } from "@/shared/components/ui/slider";

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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-2 text-xs text-muted-foreground">
    <span className="font-medium uppercase tracking-[0.14em]">{label}</span>
    {children}
  </label>
);

export const TrackSettingsBody: FC<TrackSettingsBodyProps> = ({ track, onChange }) => {
  return (
    <div className="space-y-4">
      {track.kind === "visual" ? (
        <>
          <Field label="Scale">
            <div className="flex items-center gap-3">
              <Slider min={0.2} max={1.5} step={0.05} value={[track.scale ?? 1]} onValueChange={([value]) => onChange({ scale: value })} />
              <span className="w-10 text-right text-xs text-foreground">{(track.scale ?? 1).toFixed(2)}</span>
            </div>
          </Field>

          <Field label="Fit">
            <Select value={track.fit ?? "contain"} onValueChange={(value) => onChange({ fit: value as TrackFit })}>
              {FIT_OPTIONS.map((fit) => (
                <option key={fit} value={fit}>{fit}</option>
              ))}
            </Select>
          </Field>

          <Field label="Blend Mode">
            <Select value={track.blendMode ?? "normal"} onValueChange={(value) => onChange({ blendMode: value as TrackDefinition["blendMode"] })}>
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      <Field label="Opacity">
        <div className="flex items-center gap-3">
          <Slider min={0} max={1} step={0.05} value={[track.opacity ?? 1]} onValueChange={([value]) => onChange({ opacity: value })} />
          <span className="w-10 text-right text-xs text-foreground">{(track.opacity ?? 1).toFixed(2)}</span>
        </div>
      </Field>
    </div>
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
    return <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">Select a track to edit its settings</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{track.id}</div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{track.kind}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onReorder(-1)} disabled={trackIndex === 0}>Up</Button>
          <Button variant="outline" size="sm" onClick={() => onReorder(1)} disabled={trackIndex === trackCount - 1}>Down</Button>
          <Button variant="destructive" size="sm" onClick={onRemove} disabled={sameKindCount <= 1}>Remove</Button>
        </div>
      </div>

      <Field label="Label">
        <Input type="text" value={track.label ?? track.id} onChange={(event) => onChange({ label: event.currentTarget.value })} />
      </Field>

      <TrackSettingsBody track={track} onChange={onChange} />
    </div>
  );
};
