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

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
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
