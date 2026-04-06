import { memo, useCallback, useRef, useState } from "react";
import { Download, Type, Video, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { PreviewPanel } from "@/tools/video-editor/components/PreviewPanel/PreviewPanel";
import { PropertiesPanel } from "@/tools/video-editor/components/PropertiesPanel/PropertiesPanel";
import { TimelineEditor } from "@/tools/video-editor/components/TimelineEditor/TimelineEditor";
import { TimelineProvider, useChromeContext, useEditorContext, usePlaybackContext } from "@/tools/video-editor/contexts/TimelineContext";
import { DataProviderWrapper } from "@/tools/video-editor/contexts/DataProviderContext";
import { useKeyboardShortcuts } from "@/tools/video-editor/hooks/useKeyboardShortcuts";

const MIN_TIMELINE_HEIGHT = 120;
const MIN_PREVIEW_HEIGHT = 160;
const STATUS_VARIANT = { saved: "default", saving: "secondary", dirty: "outline", error: "destructive" } as const;

const StatusBar = memo(function StatusBar() {
  const {
    saveStatus,
    renderStatus,
    renderDirty,
    renderLog,
    renderProgress,
    startRender,
  } = useChromeContext();
  const { currentTime, formatTime } = usePlaybackContext();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2 py-1.5">
      <div className="pointer-events-auto flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[saveStatus]} className="h-5 px-1.5 text-[10px] capitalize">{saveStatus}</Badge>
        <span className="font-mono text-[11px] tracking-[0.08em] text-primary/80">{formatTime(currentTime)}</span>
      </div>
      <Button
        size="sm"
        className={`pointer-events-auto relative h-7 gap-1.5 overflow-hidden px-3 text-[11px] ${renderDirty ? "shadow-[0_0_0_1px_rgba(137,180,250,0.35)]" : ""}`}
        onClick={() => void startRender()}
        disabled={renderStatus === "rendering"}
        title={renderLog || undefined}
      >
        {renderStatus === "rendering" && renderProgress ? (
          <>
            <div
              className="absolute inset-0 bg-primary/20 transition-all duration-300"
              style={{ width: `${renderProgress.percent}%` }}
            />
            <span className="relative z-10">
              {renderProgress.phase} {renderProgress.percent}%
              {renderProgress.total > 0 && ` (${renderProgress.current}/${renderProgress.total})`}
            </span>
          </>
        ) : (
          <>
            <Download className="h-3 w-3" />
            {renderStatus === "rendering" ? "Starting..." : "Render"}
          </>
        )}
      </Button>
    </div>
  );
});

const PreviewOverlayControls = memo(function PreviewOverlayControls() {
  const { handleAddText } = useChromeContext();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-end px-2 py-1.5">
      <Button variant="ghost" size="icon" className="pointer-events-auto h-6 w-6 rounded-md bg-editor-base/70 backdrop-blur-sm" onClick={handleAddText} title="Add text at playhead">
        <Type className="h-3 w-3" />
      </Button>
    </div>
  );
});

const TimelineControls = memo(function TimelineControls() {
  const {
    handleAddTrack,
    handleClearUnusedTracks,
    unusedTrackCount,
    setScaleWidth,
  } = useChromeContext();

  return (
    <div className="flex items-center justify-between px-1 pb-0.5">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground/60">+ Track</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAddTrack("visual")} title="Add visual track">
          <Video className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAddTrack("audio")} title="Add audio track">
          <Volume2 className="h-3 w-3" />
        </Button>
        {unusedTrackCount > 0 && (
          <Button variant="ghost" size="sm" className="ml-2 h-6 px-2 text-[10px] text-muted-foreground/60 hover:text-foreground" onClick={handleClearUnusedTracks}>
            Clear {unusedTrackCount} unused track{unusedTrackCount !== 1 ? "s" : ""}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((v: number) => Math.max(v / 1.4, 40))} title="Zoom out">
          <ZoomOut className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setScaleWidth((v: number) => Math.min(v * 1.4, 500))} title="Zoom in">
          <ZoomIn className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});

function VideoEditorLayout() {
  const {
    selectedClipId,
    moveSelectedClipToTrack,
    handleToggleMute,
    handleSplitSelectedClip,
    handleDeleteClip,
    setSelectedClipId,
  } = useEditorContext();
  const { previewRef, playerContainerRef } = usePlaybackContext();

  useKeyboardShortcuts({
    hasSelectedClip: Boolean(selectedClipId),
    moveSelectedClipToTrack,
    togglePlayPause: () => previewRef.current?.togglePlayPause(),
    toggleMute: handleToggleMute,
    splitSelectedClip: handleSplitSelectedClip,
    deleteSelectedClip: () => { if (selectedClipId) { handleDeleteClip(selectedClipId); } },
    clearSelection: () => setSelectedClipId(null),
  });

  // Resizable divider state
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);

  // Use native window-level listeners during drag to avoid losing events when
  // React re-renders (polling, player updates) recreate the divider DOM node.
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    const divider = dividerRef.current;
    const playerContainer = playerContainerRef.current;
    if (!container || !divider) return;

    divider.classList.add("is-dragging");
    playerContainer?.classList.add("pointer-events-none");
    // Prevent text selection and iframe pointer stealing during drag
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const h = Math.max(MIN_TIMELINE_HEIGHT, rect.bottom - ev.clientY);
      if (rect.height - h < MIN_PREVIEW_HEIGHT) return;
      container.style.gridTemplateRows = `minmax(0,1fr) auto ${h}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      divider.classList.remove("is-dragging");
      playerContainer?.classList.remove("pointer-events-none");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Commit final height to React state (single re-render)
      const match = container.style.gridTemplateRows.match(/(\d+)px$/);
      container.style.gridTemplateRows = "";
      if (match) {
        setTimelineHeight(parseInt(match[1], 10));
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [playerContainerRef]);

  return (
    <div className="flex h-screen flex-col bg-editor-base text-foreground">
      <main ref={containerRef} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-1.5 p-1.5"
        style={{ gridTemplateRows: timelineHeight ? `minmax(0,1fr) auto ${timelineHeight}px` : "minmax(0,1fr) auto minmax(180px,35%)" }}
      >
        {/* Preview with overlaid controls */}
        <div className="relative z-20 flex h-full min-h-0 flex-col overflow-hidden">
          <StatusBar />
          <PreviewOverlayControls />
          <div className="min-h-0 flex-1">
            <PreviewPanel />
          </div>
        </div>

        {/* Properties sidebar — spans preview + divider rows */}
        <div className="row-span-2 h-full min-h-0 overflow-y-auto">
          <PropertiesPanel />
        </div>

        {/* Resize handle — full width, tall hit target, thin visual indicator */}
        <div
          ref={dividerRef}
          className="divider-handle col-span-1 flex cursor-row-resize items-center justify-center hover:bg-primary/8 [&.is-dragging]:bg-primary/15"
          style={{ height: 8, marginBlock: -2, position: "relative", zIndex: 10 }}
          onMouseDown={onDividerMouseDown}
        >
          <div className="h-0.5 w-12 rounded-full bg-border/60 transition-colors [.is-dragging_&]:bg-primary/50" />
        </div>

        {/* Timeline with +Track below — spans full width under sidebar */}
        <div className="col-span-2 flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <TimelineEditor />
          </div>
          <TimelineControls />
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
