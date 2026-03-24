import type { TimelineAction } from "@xzdarcy/timeline-engine";
import { Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { getAssetColor, getSourceTime, type ClipMeta } from "@/tools/video-editor/lib/timeline-data";

interface ClipActionProps {
  action: TimelineAction;
  clipMeta: ClipMeta;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function ClipAction({ action, clipMeta, isSelected, onSelect, onDelete }: ClipActionProps) {
  const isUploading = action.id.startsWith("uploading-");
  const label = isUploading
    ? (clipMeta.asset?.replace(/^uploading:/, "") ?? "File")
    : clipMeta.clipType === "text" ? clipMeta.text?.content?.slice(0, 28) || "Text" : clipMeta.asset ?? "Clip";
  const color = isUploading ? "#6c7086" : getAssetColor(clipMeta.asset ?? `${clipMeta.clipType ?? "clip"}-${clipMeta.track}`);
  const sourceEnd = typeof clipMeta.hold === "number"
    ? action.end - action.start
    : getSourceTime({ from: clipMeta.from ?? 0, start: action.start, speed: clipMeta.speed ?? 1 }, action.end);
  const isMuted = (clipMeta.volume ?? 1) <= 0;
  const transitionWidth = clipMeta.transition
    ? `${Math.min(50, ((clipMeta.transition.duration ?? 0.5) / Math.max(0.1, action.end - action.start)) * 100)}%`
    : undefined;

  if (isUploading) {
    return (
      <div
        className="clip-action relative flex h-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2 text-[11px] text-white shadow-sm pointer-events-none animate-pulse"
        data-clip-id={action.id}
        data-row-id={clipMeta.track}
        style={{ backgroundColor: color, borderColor: "rgba(255,255,255,0.12)", backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.06) 6px, rgba(255,255,255,0.06) 12px)" }}
      >
        <div className="relative z-10 min-w-0 flex-1">
          <div className="truncate font-semibold">{label}</div>
          <div className="truncate text-[10px] text-white/85">Uploading...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`clip-action relative flex h-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2 text-[11px] text-white shadow-sm ${isSelected ? "ring-2 ring-white/50" : ""} ${isMuted ? "opacity-75 saturate-50" : ""}`}
      data-clip-id={action.id}
      data-row-id={clipMeta.track}
      style={{ backgroundColor: color, borderColor: "rgba(255,255,255,0.12)" }}
      onMouseDown={onSelect}
    >
      {clipMeta.entrance ? <span className="absolute inset-y-0 left-0 w-4 bg-white/12 [clip-path:polygon(0_0,100%_50%,0_100%)]" /> : null}
      {clipMeta.exit ? <span className="absolute inset-y-0 right-0 w-4 bg-black/18 [clip-path:polygon(100%_0,100%_100%,0_50%)]" /> : null}
      {clipMeta.transition ? <span className="pointer-events-none absolute inset-y-0 left-0 bg-black/20" style={{ width: transitionWidth }} /> : null}
      <div className="relative z-10 min-w-0 flex-1">
        <div className="truncate font-semibold">{label}</div>
        <div className="truncate text-[10px] text-white/85">
          {clipMeta.clipType === "text"
            ? `${(action.end - action.start).toFixed(1)}s`
            : `src ${(clipMeta.from ?? 0).toFixed(1)}s - ${sourceEnd.toFixed(1)}s`}
        </div>
      </div>
      {clipMeta.transition ? <span className="relative z-10 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]">{clipMeta.transition.type}</span> : null}
      {isMuted ? <span className="relative z-10 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]">Muted</span> : null}
      <Button
        variant="ghost"
        size="icon"
        className="relative z-10 h-6 w-6 rounded-full bg-black/15 text-white opacity-0 transition-opacity hover:bg-black/30 group-hover:opacity-100"
        data-delete-clip="true"
        title="Delete clip"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
