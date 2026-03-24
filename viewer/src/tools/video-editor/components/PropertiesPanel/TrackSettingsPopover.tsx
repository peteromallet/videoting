import type { TrackDefinition } from "@shared/types";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { TrackSettingsBody } from "@/tools/video-editor/components/PropertiesPanel/TrackPanel";

interface TrackSettingsPopoverProps {
  track: TrackDefinition;
  trackCount: number;
  trackIndex: number;
  sameKindCount: number;
  onChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onReorder: (trackId: string, direction: -1 | 1) => void;
  onRemove: (trackId: string) => void;
  onSelect?: (trackId: string) => void;
}

export function TrackSettingsPopover({
  track,
  trackCount,
  trackIndex,
  sameKindCount,
  onChange,
  onReorder,
  onRemove,
  onSelect,
}: TrackSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-editor-surface0/80 hover:text-foreground"
          aria-label={`Open settings for ${track.label ?? track.id}`}
          onClick={() => onSelect?.(track.id)}
        >
          <span className="text-lg leading-none">⋯</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">{track.id}</div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{track.kind}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onReorder(track.id, -1)} disabled={trackIndex === 0}>Up</Button>
            <Button variant="outline" size="sm" onClick={() => onReorder(track.id, 1)} disabled={trackIndex === trackCount - 1}>Down</Button>
            <Button variant="destructive" size="sm" onClick={() => onRemove(track.id)} disabled={sameKindCount <= 1}>Remove</Button>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-[0.14em]">Label</span>
          <input
            type="text"
            value={track.label ?? track.id}
            onChange={(event) => onChange(track.id, { label: event.currentTarget.value })}
            className="flex h-10 w-full rounded-md border border-input bg-editor-surface0/70 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <TrackSettingsBody track={track} onChange={(patch) => onChange(track.id, patch)} />
      </PopoverContent>
    </Popover>
  );
}
