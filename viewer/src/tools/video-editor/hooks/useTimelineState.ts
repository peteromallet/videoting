import { useTimelineData } from "./useTimelineData";
import { useTimelineEditing } from "./useTimelineEditing";
import { useTimelinePlayback } from "./useTimelinePlayback";
import { useTimelineTrackManagement } from "./useTimelineTrackManagement";

export type { SaveStatus, RenderStatus, EditorPreferences, ActionDragState } from "./useTimelineData";

export interface UseTimelineStateResult {
  data: ReturnType<typeof useTimelineData>["data"];
  resolvedConfig: ReturnType<typeof useTimelineData>["resolvedConfig"];
  currentTime: number;
  selectedClipId: ReturnType<typeof useTimelineData>["selectedClipId"];
  selectedTrackId: ReturnType<typeof useTimelineData>["selectedTrackId"];
  selectedClip: ReturnType<typeof useTimelineData>["selectedClip"];
  selectedTrack: ReturnType<typeof useTimelineData>["selectedTrack"];
  selectedClipHasPredecessor: boolean;
  compositionSize: ReturnType<typeof useTimelineData>["compositionSize"];
  trackScaleMap: ReturnType<typeof useTimelineData>["trackScaleMap"];
  saveStatus: ReturnType<typeof useTimelineData>["saveStatus"];
  renderStatus: ReturnType<typeof useTimelineData>["renderStatus"];
  renderLog: ReturnType<typeof useTimelineData>["renderLog"];
  renderDirty: ReturnType<typeof useTimelineData>["renderDirty"];
  renderProgress: ReturnType<typeof useTimelineData>["renderProgress"];
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  timelineRef: ReturnType<typeof useTimelinePlayback>["timelineRef"];
  previewRef: ReturnType<typeof useTimelinePlayback>["previewRef"];
  playerContainerRef: ReturnType<typeof useTimelinePlayback>["playerContainerRef"];
  timelineWrapperRef: ReturnType<typeof useTimelinePlayback>["timelineWrapperRef"];
  dataRef: ReturnType<typeof useTimelineData>["dataRef"];
  crossTrackActive: ReturnType<typeof useTimelineData>["crossTrackActive"];
  actionDragStateRef: ReturnType<typeof useTimelineData>["actionDragStateRef"];
  preferences: ReturnType<typeof useTimelineData>["preferences"];
  setSelectedClipId: ReturnType<typeof useTimelineData>["setSelectedClipId"];
  setSelectedTrackId: ReturnType<typeof useTimelineData>["setSelectedTrackId"];
  setScaleWidth: ReturnType<typeof useTimelineData>["setScaleWidth"];
  setClipSectionOpen: ReturnType<typeof useTimelineData>["setClipSectionOpen"];
  setAssetPanelState: ReturnType<typeof useTimelineData>["setAssetPanelState"];
  onPreviewTimeUpdate: ReturnType<typeof useTimelinePlayback>["onPreviewTimeUpdate"];
  onCursorDrag: ReturnType<typeof useTimelinePlayback>["onCursorDrag"];
  onClickTimeArea: ReturnType<typeof useTimelinePlayback>["onClickTimeArea"];
  onActionMoveStart: ReturnType<typeof useTimelineEditing>["onActionMoveStart"];
  onActionMoving: ReturnType<typeof useTimelineEditing>["onActionMoving"];
  onActionMoveEnd: ReturnType<typeof useTimelineEditing>["onActionMoveEnd"];
  onActionResizeStart: ReturnType<typeof useTimelineEditing>["onActionResizeStart"];
  onActionResizeEnd: ReturnType<typeof useTimelineEditing>["onActionResizeEnd"];
  onChange: ReturnType<typeof useTimelineEditing>["onChange"];
  onOverlayChange: ReturnType<typeof useTimelineEditing>["onOverlayChange"];
  onTimelineDragOver: ReturnType<typeof useTimelineEditing>["onTimelineDragOver"];
  onTimelineDragLeave: ReturnType<typeof useTimelineEditing>["onTimelineDragLeave"];
  onTimelineDrop: ReturnType<typeof useTimelineEditing>["onTimelineDrop"];
  handleAssetDrop: ReturnType<typeof useTimelineEditing>["handleAssetDrop"];
  handleDeleteClip: ReturnType<typeof useTimelineEditing>["handleDeleteClip"];
  handleSelectedClipChange: ReturnType<typeof useTimelineEditing>["handleSelectedClipChange"];
  handleResetClipPosition: ReturnType<typeof useTimelineEditing>["handleResetClipPosition"];
  handleSplitSelectedClip: ReturnType<typeof useTimelineEditing>["handleSplitSelectedClip"];
  handleToggleMute: ReturnType<typeof useTimelineEditing>["handleToggleMute"];
  handleAddTrack: ReturnType<typeof useTimelineTrackManagement>["handleAddTrack"];
  handleTrackPopoverChange: ReturnType<typeof useTimelineTrackManagement>["handleTrackPopoverChange"];
  handleReorderTrack: ReturnType<typeof useTimelineTrackManagement>["handleReorderTrack"];
  handleRemoveTrack: ReturnType<typeof useTimelineTrackManagement>["handleRemoveTrack"];
  handleAddText: ReturnType<typeof useTimelineEditing>["handleAddText"];
  moveSelectedClipToTrack: ReturnType<typeof useTimelineTrackManagement>["moveSelectedClipToTrack"];
  moveClipToRow: ReturnType<typeof useTimelineTrackManagement>["moveClipToRow"];
  createTrackAndMoveClip: ReturnType<typeof useTimelineTrackManagement>["createTrackAndMoveClip"];
  clearActionDragState: ReturnType<typeof useTimelineEditing>["clearActionDragState"];
  uploadFiles: ReturnType<typeof useTimelineData>["uploadFiles"];
  startRender: ReturnType<typeof useTimelineData>["startRender"];
  formatTime: ReturnType<typeof useTimelinePlayback>["formatTime"];
}

export function useTimelineState(): UseTimelineStateResult {
  const playback = useTimelinePlayback();

  const dataHook = useTimelineData();

  const editing = useTimelineEditing({
    dataRef: dataHook.dataRef,
    resolvedConfig: dataHook.resolvedConfig,
    data: dataHook.data,
    selectedClipId: dataHook.selectedClipId,
    selectedTrackId: dataHook.selectedTrackId,
    selectedTrack: dataHook.selectedTrack,
    currentTime: playback.currentTime,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    crossTrackActive: dataHook.crossTrackActive,
    actionDragStateRef: dataHook.actionDragStateRef,
    resizeStartRef: dataHook.resizeStartRef,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
    uploadFiles: dataHook.uploadFiles,
    commitDataNoSave: dataHook.commitDataNoSave,
  });

  const trackManagement = useTimelineTrackManagement({
    dataRef: dataHook.dataRef,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
  });

  return {
    // Data
    data: dataHook.data,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    selectedTrackId: dataHook.selectedTrackId,
    selectedClip: dataHook.selectedClip,
    selectedTrack: dataHook.selectedTrack,
    selectedClipHasPredecessor: dataHook.selectedClipHasPredecessor,
    compositionSize: dataHook.compositionSize,
    trackScaleMap: dataHook.trackScaleMap,
    saveStatus: dataHook.saveStatus,
    renderStatus: dataHook.renderStatus,
    renderLog: dataHook.renderLog,
    renderDirty: dataHook.renderDirty,
    renderProgress: dataHook.renderProgress,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    isLoading: dataHook.isLoading,
    dataRef: dataHook.dataRef,
    crossTrackActive: dataHook.crossTrackActive,
    actionDragStateRef: dataHook.actionDragStateRef,
    preferences: dataHook.preferences,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    setScaleWidth: dataHook.setScaleWidth,
    setClipSectionOpen: dataHook.setClipSectionOpen,
    setAssetPanelState: dataHook.setAssetPanelState,
    uploadFiles: dataHook.uploadFiles,
    startRender: dataHook.startRender,

    // Playback
    currentTime: playback.currentTime,
    timelineRef: playback.timelineRef,
    previewRef: playback.previewRef,
    playerContainerRef: playback.playerContainerRef,
    timelineWrapperRef: playback.timelineWrapperRef,
    onPreviewTimeUpdate: playback.onPreviewTimeUpdate,
    onCursorDrag: playback.onCursorDrag,
    onClickTimeArea: playback.onClickTimeArea,
    formatTime: playback.formatTime,

    // Editing
    onActionMoveStart: editing.onActionMoveStart,
    onActionMoving: editing.onActionMoving,
    onActionMoveEnd: editing.onActionMoveEnd,
    onActionResizeStart: editing.onActionResizeStart,
    onActionResizeEnd: editing.onActionResizeEnd,
    onChange: editing.onChange,
    onOverlayChange: editing.onOverlayChange,
    onTimelineDragOver: editing.onTimelineDragOver,
    onTimelineDragLeave: editing.onTimelineDragLeave,
    onTimelineDrop: editing.onTimelineDrop,
    handleAssetDrop: editing.handleAssetDrop,
    handleDeleteClip: editing.handleDeleteClip,
    handleSelectedClipChange: editing.handleSelectedClipChange,
    handleResetClipPosition: editing.handleResetClipPosition,
    handleSplitSelectedClip: editing.handleSplitSelectedClip,
    handleToggleMute: editing.handleToggleMute,
    handleAddText: editing.handleAddText,
    clearActionDragState: editing.clearActionDragState,

    // Track management
    handleAddTrack: trackManagement.handleAddTrack,
    handleTrackPopoverChange: trackManagement.handleTrackPopoverChange,
    handleReorderTrack: trackManagement.handleReorderTrack,
    handleRemoveTrack: trackManagement.handleRemoveTrack,
    moveSelectedClipToTrack: trackManagement.moveSelectedClipToTrack,
    moveClipToRow: trackManagement.moveClipToRow,
    createTrackAndMoveClip: trackManagement.createTrackAndMoveClip,
  };
}
