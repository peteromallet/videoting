import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import AssetPanel from "@/tools/video-editor/components/PropertiesPanel/AssetPanel";
import { ClipPanel } from "@/tools/video-editor/components/PropertiesPanel/ClipPanel";
import { useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";

export function PropertiesPanel() {
  const {
    data,
    selectedClip,
    selectedTrack,
    selectedClipHasPredecessor,
    currentTime,
    compositionSize,
    setSelectedClipId,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleSplitSelectedClip,
    handleToggleMute,
    preferences,
    setClipSectionOpen,
    setAssetPanelState,
    uploadFiles,
  } = useTimelineContext();

  const [assetsExpanded, setAssetsExpanded] = useState(true);

  // Auto-collapse assets when a clip is selected, auto-expand when deselected
  useEffect(() => {
    setAssetsExpanded(!selectedClip);
  }, [selectedClip]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex flex-col overflow-hidden rounded-lg border border-border/70 bg-editor-surface0/50">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setAssetsExpanded((v) => !v)}
        >
          {assetsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Assets
        </button>
        {assetsExpanded && (
          <div className="max-h-[40vh] overflow-auto border-t border-border/40 px-1 pb-1">
            <AssetPanel
              assetMap={data.assetMap}
              rows={data.rows}
              meta={data.meta}
              backgroundAsset={data.output.background ?? undefined}
              showAll={preferences.assetPanel.showAll}
              showHidden={preferences.assetPanel.showHidden}
              hidden={preferences.assetPanel.hidden}
              setPanelState={setAssetPanelState}
              onUploadFiles={uploadFiles}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ClipPanel
          clip={selectedClip}
          track={selectedTrack}
          hasPredecessor={selectedClipHasPredecessor}
          onChange={handleSelectedClipChange}
          onResetPosition={handleResetClipPosition}
          onClose={() => setSelectedClipId(null)}
          onSplit={handleSplitSelectedClip}
          onToggleMute={handleToggleMute}
          playheadSeconds={currentTime}
          compositionWidth={compositionSize.width}
          compositionHeight={compositionSize.height}
          sectionState={preferences.clipSections}
          setSectionOpen={setClipSectionOpen}
        />
      </div>
    </div>
  );
}
