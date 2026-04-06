import { memo, useEffect, useRef, useState } from "react";
import { getAudioTracks } from "@shared/editor-utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import AssetPanel from "@/tools/video-editor/components/PropertiesPanel/AssetPanel";
import { ClipPanel } from "@/tools/video-editor/components/PropertiesPanel/ClipPanel";
import { useEditorContext } from "@/tools/video-editor/contexts/TimelineContext";

function PropertiesPanelComponent() {
  const {
    data,
    selectedClip,
    selectedTrack,
    selectedClipHasPredecessor,
    compositionSize,
    setSelectedClipId,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleSplitSelectedClip,
    handleToggleMute,
    preferences,
    setActiveClipTab,
    setAssetPanelState,
    uploadFiles,
  } = useEditorContext();

  const [assetsExpanded, setAssetsExpanded] = useState(false);
  const prevClipIdRef = useRef(selectedClip?.id);

  // Auto-switch to "text" tab when selecting a text clip
  useEffect(() => {
    if (selectedClip && selectedClip.id !== prevClipIdRef.current && selectedClip.clipType === "text") {
      setActiveClipTab("text");
    }
    prevClipIdRef.current = selectedClip?.id;
  }, [selectedClip, setActiveClipTab]);

  if (!data) {
    return null;
  }

  const audioTrackIds = getAudioTracks({ tracks: data.config.tracks ?? [] }).map((track) => track.id);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 pt-2">
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
      <div className="min-h-0 flex-1 overflow-auto px-2 pt-2">
        <ClipPanel
          clip={selectedClip}
          track={selectedTrack}
          hasPredecessor={selectedClipHasPredecessor}
          onChange={handleSelectedClipChange}
          onResetPosition={handleResetClipPosition}
          onClose={() => setSelectedClipId(null)}
          onSplit={handleSplitSelectedClip}
          onToggleMute={handleToggleMute}
          compositionWidth={compositionSize.width}
          compositionHeight={compositionSize.height}
          audioTrackIds={audioTrackIds}
          activeTab={preferences.activeClipTab}
          setActiveTab={setActiveClipTab}
        />
      </div>
    </div>
  );
}

const MemoizedPropertiesPanel = memo(PropertiesPanelComponent);

export function PropertiesPanel() {
  return <MemoizedPropertiesPanel />;
}
