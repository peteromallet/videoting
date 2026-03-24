import { Plus, Type, Video, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";

const statusVariant = {
  saved: "default",
  saving: "secondary",
  dirty: "outline",
  error: "destructive",
} as const;

export function Toolbar() {
  const {
    currentTime,
    saveStatus,
    renderStatus,
    renderDirty,
    renderLog,
    scaleWidth,
    setScaleWidth,
    startRender,
    handleAddTrack,
    handleAddText,
    formatTime,
  } = useTimelineContext();

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-editor-mantle px-4 py-3">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-sm font-semibold tracking-[0.16em] text-editor-subtext1 uppercase">Timeline Editor</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAddTrack("visual")}>
            <Video className="h-4 w-4" />
            Add Visual
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAddTrack("audio")}>
            <Volume2 className="h-4 w-4" />
            Add Audio
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddText}>
            <Type className="h-4 w-4" />
            Add Text
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-editor-surface0/60 p-1">
          <Button variant="ghost" size="icon" onClick={() => setScaleWidth((value) => Math.max(value / 1.4, 40))} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="min-w-[62px] px-2 text-center text-xs text-muted-foreground">{Math.round(scaleWidth)} px</div>
          <Button variant="ghost" size="icon" onClick={() => setScaleWidth((value) => Math.min(value * 1.4, 500))} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <Badge variant={statusVariant[saveStatus]} className="capitalize">{saveStatus}</Badge>
        <div className="min-w-[78px] text-right font-mono text-lg tracking-[0.12em] text-primary">{formatTime(currentTime)}</div>
        <Button
          onClick={() => void startRender()}
          disabled={renderStatus === "rendering"}
          className={renderDirty ? "shadow-[0_0_0_1px_rgba(137,180,250,0.35)]" : undefined}
          title={renderLog || undefined}
        >
          <Plus className="h-4 w-4" />
          {renderStatus === "rendering" ? "Rendering..." : "Render"}
        </Button>
      </div>
    </div>
  );
}
