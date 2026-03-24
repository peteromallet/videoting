import type { TrackDefinition } from "@shared/types";
import { TrackSettingsPopover } from "@/tools/video-editor/components/PropertiesPanel/TrackSettingsPopover";

interface TrackLabelProps {
  track: TrackDefinition;
  isSelected: boolean;
  trackCount: number;
  trackIndex: number;
  sameKindCount: number;
  onSelect: (trackId: string) => void;
  onChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onReorder: (trackId: string, direction: -1 | 1) => void;
  onRemove: (trackId: string) => void;
}

export function TrackLabel({
  track,
  isSelected,
  trackCount,
  trackIndex,
  sameKindCount,
  onSelect,
  onChange,
  onReorder,
  onRemove,
}: TrackLabelProps) {
  return (
    <div
      className={`flex h-14 cursor-pointer items-center rounded-xl border px-3 ${isSelected ? "border-primary/50 bg-editor-surface0/85" : "border-border/70 bg-editor-surface0/35 hover:bg-editor-surface0/55"}`}
      onClick={() => onSelect(track.id)}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{track.id}</div>
        <div className="truncate text-xs text-muted-foreground">{track.label}</div>
      </div>
      <TrackSettingsPopover
        track={track}
        trackCount={trackCount}
        trackIndex={trackIndex}
        sameKindCount={sameKindCount}
        onChange={onChange}
        onReorder={onReorder}
        onRemove={onRemove}
        onSelect={onSelect}
      />
    </div>
  );
}
