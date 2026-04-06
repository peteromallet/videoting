import { memo } from "react";
import { useEditorContext, usePlaybackContext } from "@/tools/video-editor/contexts/TimelineContext";
import OverlayEditor from "@/tools/video-editor/components/PreviewPanel/OverlayEditor";
import RemotionPreview from "@/tools/video-editor/components/PreviewPanel/RemotionPreview";

function PreviewPanelComponent() {
  const {
    data,
    resolvedConfig,
    trackScaleMap,
    compositionSize,
    selectedClipId,
    setSelectedClipId,
    onOverlayChange,
  } = useEditorContext();
  const {
    previewRef,
    playerContainerRef,
    currentTime,
    onPreviewTimeUpdate,
  } = usePlaybackContext();

  if (!data || !resolvedConfig) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70">
      <div className="relative flex min-h-0 flex-1">
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-editor-crust"
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
      </div>
    </div>
  );
}

const MemoizedPreviewPanel = memo(PreviewPanelComponent);

export function PreviewPanel() {
  return <MemoizedPreviewPanel />;
}
