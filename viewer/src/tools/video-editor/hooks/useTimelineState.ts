import { useMemo } from "react";
import { useTimelineData } from "./useTimelineData";
import { useTimelineEditing } from "./useTimelineEditing";
import { useTimelinePlayback } from "./useTimelinePlayback";
import { useTimelineTrackManagement } from "./useTimelineTrackManagement";

export type { SaveStatus, RenderStatus, EditorPreferences, ActionDragState } from "./useTimelineData";

export interface TimelineEditorContextValue {
  data: ReturnType<typeof useTimelineData>["data"];
  resolvedConfig: ReturnType<typeof useTimelineData>["resolvedConfig"];
  selectedClipId: ReturnType<typeof useTimelineData>["selectedClipId"];
  selectedTrackId: ReturnType<typeof useTimelineData>["selectedTrackId"];
  selectedClip: ReturnType<typeof useTimelineData>["selectedClip"];
  selectedTrack: ReturnType<typeof useTimelineData>["selectedTrack"];
  selectedClipHasPredecessor: boolean;
  compositionSize: ReturnType<typeof useTimelineData>["compositionSize"];
  trackScaleMap: ReturnType<typeof useTimelineData>["trackScaleMap"];
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: ReturnType<typeof useTimelineData>["dataRef"];
  crossTrackActive: ReturnType<typeof useTimelineData>["crossTrackActive"];
  actionDragStateRef: ReturnType<typeof useTimelineData>["actionDragStateRef"];
  preferences: ReturnType<typeof useTimelineData>["preferences"];
  timelineRef: ReturnType<typeof useTimelinePlayback>["timelineRef"];
  timelineWrapperRef: ReturnType<typeof useTimelinePlayback>["timelineWrapperRef"];
  setSelectedClipId: ReturnType<typeof useTimelineData>["setSelectedClipId"];
  setSelectedTrackId: ReturnType<typeof useTimelineData>["setSelectedTrackId"];
  setActiveClipTab: ReturnType<typeof useTimelineData>["setActiveClipTab"];
  setAssetPanelState: ReturnType<typeof useTimelineData>["setAssetPanelState"];
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
  handleTrackPopoverChange: ReturnType<typeof useTimelineTrackManagement>["handleTrackPopoverChange"];
  handleReorderTrack: ReturnType<typeof useTimelineTrackManagement>["handleReorderTrack"];
  handleRemoveTrack: ReturnType<typeof useTimelineTrackManagement>["handleRemoveTrack"];
  moveSelectedClipToTrack: ReturnType<typeof useTimelineTrackManagement>["moveSelectedClipToTrack"];
  moveClipToRow: ReturnType<typeof useTimelineTrackManagement>["moveClipToRow"];
  createTrackAndMoveClip: ReturnType<typeof useTimelineTrackManagement>["createTrackAndMoveClip"];
  clearActionDragState: ReturnType<typeof useTimelineEditing>["clearActionDragState"];
  uploadFiles: ReturnType<typeof useTimelineData>["uploadFiles"];
}

export interface TimelineChromeContextValue {
  saveStatus: ReturnType<typeof useTimelineData>["saveStatus"];
  renderStatus: ReturnType<typeof useTimelineData>["renderStatus"];
  renderLog: ReturnType<typeof useTimelineData>["renderLog"];
  renderDirty: ReturnType<typeof useTimelineData>["renderDirty"];
  renderProgress: ReturnType<typeof useTimelineData>["renderProgress"];
  setScaleWidth: ReturnType<typeof useTimelineData>["setScaleWidth"];
  handleAddTrack: ReturnType<typeof useTimelineTrackManagement>["handleAddTrack"];
  handleClearUnusedTracks: ReturnType<typeof useTimelineTrackManagement>["handleClearUnusedTracks"];
  unusedTrackCount: ReturnType<typeof useTimelineTrackManagement>["unusedTrackCount"];
  handleAddText: ReturnType<typeof useTimelineEditing>["handleAddText"];
  startRender: ReturnType<typeof useTimelineData>["startRender"];
}

export interface TimelinePlaybackContextValue {
  currentTime: number;
  previewRef: ReturnType<typeof useTimelinePlayback>["previewRef"];
  playerContainerRef: ReturnType<typeof useTimelinePlayback>["playerContainerRef"];
  onPreviewTimeUpdate: ReturnType<typeof useTimelinePlayback>["onPreviewTimeUpdate"];
  formatTime: ReturnType<typeof useTimelinePlayback>["formatTime"];
}

export interface UseTimelineStateResult {
  editor: TimelineEditorContextValue;
  chrome: TimelineChromeContextValue;
  playback: TimelinePlaybackContextValue;
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
    patchRegistry: dataHook.patchRegistry,
    uploadAsset: dataHook.uploadAsset,
    invalidateAssetRegistry: dataHook.invalidateAssetRegistry,
  });

  const trackManagement = useTimelineTrackManagement({
    dataRef: dataHook.dataRef,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
  });

  const editor = useMemo<TimelineEditorContextValue>(() => ({
    data: dataHook.data,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    selectedTrackId: dataHook.selectedTrackId,
    selectedClip: dataHook.selectedClip,
    selectedTrack: dataHook.selectedTrack,
    selectedClipHasPredecessor: dataHook.selectedClipHasPredecessor,
    compositionSize: dataHook.compositionSize,
    trackScaleMap: dataHook.trackScaleMap,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    isLoading: dataHook.isLoading,
    dataRef: dataHook.dataRef,
    crossTrackActive: dataHook.crossTrackActive,
    actionDragStateRef: dataHook.actionDragStateRef,
    preferences: dataHook.preferences,
    timelineRef: playback.timelineRef,
    timelineWrapperRef: playback.timelineWrapperRef,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    setActiveClipTab: dataHook.setActiveClipTab,
    setAssetPanelState: dataHook.setAssetPanelState,
    onCursorDrag: playback.onCursorDrag,
    onClickTimeArea: playback.onClickTimeArea,
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
    handleTrackPopoverChange: trackManagement.handleTrackPopoverChange,
    handleReorderTrack: trackManagement.handleReorderTrack,
    handleRemoveTrack: trackManagement.handleRemoveTrack,
    moveSelectedClipToTrack: trackManagement.moveSelectedClipToTrack,
    moveClipToRow: trackManagement.moveClipToRow,
    createTrackAndMoveClip: trackManagement.createTrackAndMoveClip,
    clearActionDragState: editing.clearActionDragState,
    uploadFiles: dataHook.uploadFiles,
  }), [
    dataHook.data,
    dataHook.resolvedConfig,
    dataHook.selectedClipId,
    dataHook.selectedTrackId,
    dataHook.selectedClip,
    dataHook.selectedTrack,
    dataHook.selectedClipHasPredecessor,
    dataHook.compositionSize,
    dataHook.trackScaleMap,
    dataHook.scale,
    dataHook.scaleWidth,
    dataHook.isLoading,
    dataHook.dataRef,
    dataHook.crossTrackActive,
    dataHook.actionDragStateRef,
    dataHook.preferences,
    playback.timelineRef,
    playback.timelineWrapperRef,
    dataHook.setSelectedClipId,
    dataHook.setSelectedTrackId,
    dataHook.setActiveClipTab,
    dataHook.setAssetPanelState,
    playback.onCursorDrag,
    playback.onClickTimeArea,
    editing.onActionMoveStart,
    editing.onActionMoving,
    editing.onActionMoveEnd,
    editing.onActionResizeStart,
    editing.onActionResizeEnd,
    editing.onChange,
    editing.onOverlayChange,
    editing.onTimelineDragOver,
    editing.onTimelineDragLeave,
    editing.onTimelineDrop,
    editing.handleAssetDrop,
    editing.handleDeleteClip,
    editing.handleSelectedClipChange,
    editing.handleResetClipPosition,
    editing.handleSplitSelectedClip,
    editing.handleToggleMute,
    trackManagement.handleTrackPopoverChange,
    trackManagement.handleReorderTrack,
    trackManagement.handleRemoveTrack,
    trackManagement.moveSelectedClipToTrack,
    trackManagement.moveClipToRow,
    trackManagement.createTrackAndMoveClip,
    editing.clearActionDragState,
    dataHook.uploadFiles,
  ]);

  const chrome = useMemo<TimelineChromeContextValue>(() => ({
    saveStatus: dataHook.saveStatus,
    renderStatus: dataHook.renderStatus,
    renderLog: dataHook.renderLog,
    renderDirty: dataHook.renderDirty,
    renderProgress: dataHook.renderProgress,
    setScaleWidth: dataHook.setScaleWidth,
    handleAddTrack: trackManagement.handleAddTrack,
    handleClearUnusedTracks: trackManagement.handleClearUnusedTracks,
    unusedTrackCount: trackManagement.unusedTrackCount,
    handleAddText: editing.handleAddText,
    startRender: dataHook.startRender,
  }), [
    dataHook.saveStatus,
    dataHook.renderStatus,
    dataHook.renderLog,
    dataHook.renderDirty,
    dataHook.renderProgress,
    dataHook.setScaleWidth,
    trackManagement.handleAddTrack,
    trackManagement.handleClearUnusedTracks,
    trackManagement.unusedTrackCount,
    editing.handleAddText,
    dataHook.startRender,
  ]);

  const playbackValue = useMemo<TimelinePlaybackContextValue>(() => ({
    currentTime: playback.currentTime,
    previewRef: playback.previewRef,
    playerContainerRef: playback.playerContainerRef,
    onPreviewTimeUpdate: playback.onPreviewTimeUpdate,
    formatTime: playback.formatTime,
  }), [
    playback.currentTime,
    playback.previewRef,
    playback.playerContainerRef,
    playback.onPreviewTimeUpdate,
    playback.formatTime,
  ]);

  return {
    editor,
    chrome,
    playback: playbackValue,
  };
}
