import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";
import OverlayEditor from "@/tools/video-editor/components/PreviewPanel/OverlayEditor";
import RemotionPreview from "@/tools/video-editor/components/PreviewPanel/RemotionPreview";

export function PreviewPanel() {
  const {
    data,
    resolvedConfig,
    previewRef,
    playerContainerRef,
    currentTime,
    trackScaleMap,
    compositionSize,
    selectedClipId,
    setSelectedClipId,
    onPreviewTimeUpdate,
    onOverlayChange,
  } = useTimelineContext();

  if (!data || !resolvedConfig) {
    return null;
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="border-b border-border/70 pb-3">
        <CardTitle className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Preview</CardTitle>
      </CardHeader>
      <CardContent className="relative flex min-h-0 flex-1 p-3">
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-editor-crust"
          onMouseDownCapture={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
              return;
            }

            if (target.closest("[data-overlay-hit='true'], [data-inline-text-editor='true']")) {
              return;
            }

            setSelectedClipId(null);
          }}
        >
          <RemotionPreview
            ref={previewRef}
            config={resolvedConfig}
            onTimeUpdate={onPreviewTimeUpdate}
            playerContainerRef={playerContainerRef}
          />
          <OverlayEditor
            rows={data.rows}
            meta={data.meta}
            currentTime={currentTime}
            playerContainerRef={playerContainerRef}
            trackScaleMap={trackScaleMap}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onOverlayChange={onOverlayChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
