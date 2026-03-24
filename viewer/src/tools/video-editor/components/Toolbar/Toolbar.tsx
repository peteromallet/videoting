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
    <div className="flex h-9 items-center justify-between border-b border-border/70 bg-editor-mantle px-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-[0.16em] text-editor-subtext1/60 uppercase">Editor</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => handleAddTrack("visual")}>
            <Video className="h-3 w-3" /> Visual
          </Button>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => handleAddTrack("audio")}>
            <Volume2 className="h-3 w-3" /> Audio
          </Button>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleAddText}>
            <Type className="h-3 w-3" /> Text
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((value) => Math.max(value / 1.4, 40))} title="Zoom out">
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((value) => Math.min(value * 1.4, 500))} title="Zoom in">
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
        <Badge variant={statusVariant[saveStatus]} className="h-5 px-1.5 text-[10px] capitalize">{saveStatus}</Badge>
        <span className="font-mono text-xs tracking-[0.08em] text-primary/80">{formatTime(currentTime)}</span>
        <Button
          size="sm"
          className={`h-6 px-2 text-[11px] ${renderDirty ? "shadow-[0_0_0_1px_rgba(137,180,250,0.35)]" : ""}`}
          onClick={() => void startRender()}
          disabled={renderStatus === "rendering"}
          title={renderLog || undefined}
        >
          {renderStatus === "rendering" ? "Rendering..." : "Render"}
        </Button>
      </div>
    </div>
  );
}
