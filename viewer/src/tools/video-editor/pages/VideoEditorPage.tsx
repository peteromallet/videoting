import { Download, Type, Video, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { PreviewPanel } from "@/tools/video-editor/components/PreviewPanel/PreviewPanel";
import { PropertiesPanel } from "@/tools/video-editor/components/PropertiesPanel/PropertiesPanel";
import { TimelineEditor } from "@/tools/video-editor/components/TimelineEditor/TimelineEditor";
import { TimelineProvider, useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";
import { DataProviderWrapper } from "@/tools/video-editor/contexts/DataProviderContext";
import { useKeyboardShortcuts } from "@/tools/video-editor/hooks/useKeyboardShortcuts";

function VideoEditorLayout() {
  const {
    previewRef,
    selectedClipId,
    moveSelectedClipToTrack,
    handleToggleMute,
    handleSplitSelectedClip,
    setSelectedClipId,
    renderStatus,
    renderDirty,
    renderLog,
    startRender,
    saveStatus,
    currentTime,
    formatTime,
    setScaleWidth,
    handleAddTrack,
    handleAddText,
  } = useTimelineContext();

  useKeyboardShortcuts({
    hasSelectedClip: Boolean(selectedClipId),
    moveSelectedClipToTrack,
    togglePlayPause: () => previewRef.current?.togglePlayPause(),
    toggleMute: handleToggleMute,
    splitSelectedClip: handleSplitSelectedClip,
    clearSelection: () => setSelectedClipId(null),
  });

  const statusVariant = { saved: "default", saving: "secondary", dirty: "outline", error: "destructive" } as const;

  return (
    <div className="flex h-screen flex-col bg-editor-base text-foreground">
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] grid-rows-[minmax(0,1fr)_auto] gap-1.5 p-1.5">
        {/* Preview + render button above it */}
        <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant[saveStatus]} className="h-5 px-1.5 text-[10px] capitalize">{saveStatus}</Badge>
              <span className="font-mono text-[11px] tracking-[0.08em] text-primary/80">{formatTime(currentTime)}</span>
            </div>
            <Button
              size="sm"
              className={`h-7 gap-1.5 px-3 text-[11px] ${renderDirty ? "shadow-[0_0_0_1px_rgba(137,180,250,0.35)]" : ""}`}
              onClick={() => void startRender()}
              disabled={renderStatus === "rendering"}
              title={renderLog || undefined}
            >
              <Download className="h-3 w-3" />
              {renderStatus === "rendering" ? "Rendering..." : "Render"}
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <PreviewPanel />
          </div>
        </div>

        {/* Properties sidebar */}
        <div className="h-full min-h-0 overflow-y-auto">
          <PropertiesPanel />
        </div>

        {/* Timeline with zoom controls above and add buttons below */}
        <div className="col-span-2 flex min-h-0 flex-col gap-1 overflow-hidden">
          <div className="flex items-center gap-1 px-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((v: number) => Math.max(v / 1.4, 40))} title="Zoom out">
              <ZoomOut className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((v: number) => Math.min(v * 1.4, 500))} title="Zoom in">
              <ZoomIn className="h-3 w-3" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <TimelineEditor />
          </div>
          <div className="flex items-center gap-1 px-1 pb-0.5">
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
      </main>
    </div>
  );
}

export function VideoEditorPage() {
  return (
    <DataProviderWrapper>
      <TimelineProvider>
        <VideoEditorLayout />
      </TimelineProvider>
    </DataProviderWrapper>
  );
}
