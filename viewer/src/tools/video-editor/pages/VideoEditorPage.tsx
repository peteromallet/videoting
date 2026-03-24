import { Toolbar } from "@/tools/video-editor/components/Toolbar/Toolbar";
import { PreviewPanel } from "@/tools/video-editor/components/PreviewPanel/PreviewPanel";
import { PropertiesPanel } from "@/tools/video-editor/components/PropertiesPanel/PropertiesPanel";
import { TimelineEditor } from "@/tools/video-editor/components/TimelineEditor/TimelineEditor";
import { TimelineProvider, useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";
import { useKeyboardShortcuts } from "@/tools/video-editor/hooks/useKeyboardShortcuts";

function VideoEditorLayout() {
  const {
    previewRef,
    selectedClipId,
    moveSelectedClipToTrack,
    handleToggleMute,
    handleSplitSelectedClip,
    setSelectedClipId,
  } = useTimelineContext();

  useKeyboardShortcuts({
    hasSelectedClip: Boolean(selectedClipId),
    moveSelectedClipToTrack,
    togglePlayPause: () => previewRef.current?.togglePlayPause(),
    toggleMute: handleToggleMute,
    splitSelectedClip: handleSplitSelectedClip,
    clearSelection: () => setSelectedClipId(null),
  });

  return (
    <div className="flex h-screen flex-col bg-editor-base text-foreground">
      <Toolbar />
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)_320px] gap-3 p-3">
        <div className="min-h-0">
          <PreviewPanel />
        </div>
        <div className="min-h-0">
          <PropertiesPanel />
        </div>
        <div className="col-span-2 min-h-0">
          <TimelineEditor />
        </div>
      </main>
    </div>
  );
}

export function VideoEditorPage() {
  return (
    <TimelineProvider>
      <VideoEditorLayout />
    </TimelineProvider>
  );
}
