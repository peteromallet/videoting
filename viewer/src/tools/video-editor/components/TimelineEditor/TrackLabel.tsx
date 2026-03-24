import type { TrackDefinition } from "@shared/types";
import { ROW_HEIGHT } from "@/tools/video-editor/lib/coordinate-utils";
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
      className={`group flex cursor-pointer items-center justify-between border-b border-border/20 px-1.5 ${isSelected ? "bg-primary/10" : "hover:bg-editor-surface0/40"}`}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(track.id)}
    >
      <span className="truncate text-[10px] font-semibold text-muted-foreground">{track.id}</span>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
  );
}
