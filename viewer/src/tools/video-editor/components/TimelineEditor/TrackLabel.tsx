import { memo } from "react";
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

function TrackLabelComponent({
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
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-semibold text-foreground/80">{track.label || track.id}</div>
        <div className="truncate text-[8px] text-muted-foreground/60">{track.id}</div>
      </div>
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

const MemoizedTrackLabel = memo(TrackLabelComponent);

export function TrackLabel(props: TrackLabelProps) {
  return <MemoizedTrackLabel {...props} />;
}
