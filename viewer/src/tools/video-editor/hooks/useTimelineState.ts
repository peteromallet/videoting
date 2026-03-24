import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineAction, TimelineRow } from "@xzdarcy/timeline-engine";
import { getConfigSignature, parseResolution } from "@shared/config-utils";
import {
  addTrack,
  getTrackById,
  getVisualTracks,
  splitClipAtPlayhead,
  toggleClipMute,
  updateClipInConfig,
} from "@shared/editor-utils";
import { serializeForDisk } from "@shared/serialize";
import type { ClipType, TrackDefinition, TrackKind } from "@shared/types";
import type { PreviewHandle } from "@/tools/video-editor/components/PreviewPanel/RemotionPreview";
import {
  buildRowTrackPatches,
  buildTrackClipOrder,
  getCompatibleTrackId,
  moveClipBetweenTracks,
  SCALE_SECONDS,
  TIMELINE_START_LEFT,
  updateClipOrder,
} from "@/tools/video-editor/lib/coordinate-utils";
import {
  buildTimelineData,
  configToRows,
  getNextClipId,
  getSourceTime,
  inferTrackType,
  loadTimelineJson,
  resolveTimelineConfig,
  rowsToConfig,
  type ClipMeta,
  type ClipOrderMap,
  type TimelineData,
} from "@/tools/video-editor/lib/timeline-data";
import { loadAssetRegistry, saveTimelineConfig, uploadAssetFile } from "@/tools/video-editor/lib/timeline-api";
import { useEditorSettings } from "@/tools/video-editor/settings/useEditorSettings";
import { useTimelineSync } from "@/tools/video-editor/hooks/useTimelineSync";

export type SaveStatus = "saved" | "saving" | "dirty" | "error";
export type RenderStatus = "idle" | "rendering" | "done" | "error";

export interface EditorPreferences {
  scaleWidth: number;
  clipSections: Record<string, boolean>;
  assetPanel: {
    showAll: boolean;
    showHidden: boolean;
    hidden: string[];
  };
}

const defaultPreferences: EditorPreferences = {
  scaleWidth: 160,
  clipSections: {
    timing: true,
    position: true,
    effects: true,
    audio: false,
    transitions: true,
    text: true,
  },
  assetPanel: {
    showAll: false,
    showHidden: false,
    hidden: [],
  },
};

export interface ActionDragState {
  rowId: string;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
}

export interface UseTimelineStateResult {
  data: TimelineData | null;
  resolvedConfig: TimelineData["resolvedConfig"] | null;
  currentTime: number;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: ReturnType<typeof getTrackById> extends never ? never : TimelineData["resolvedConfig"]["clips"][number] | null;
  selectedTrack: TrackDefinition | null;
  selectedClipHasPredecessor: boolean;
  compositionSize: { width: number; height: number };
  trackScaleMap: Record<string, number>;
  saveStatus: SaveStatus;
  renderStatus: RenderStatus;
  renderLog: string;
  renderDirty: boolean;
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  timelineRef: React.RefObject<TimelineState | null>;
  previewRef: React.RefObject<PreviewHandle | null>;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  timelineWrapperRef: React.RefObject<HTMLDivElement | null>;
  dataRef: React.MutableRefObject<TimelineData | null>;
  crossTrackActive: React.MutableRefObject<boolean>;
  actionDragStateRef: React.MutableRefObject<Record<string, ActionDragState>>;
  preferences: EditorPreferences;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  setScaleWidth: (updater: number | ((value: number) => number)) => void;
  setClipSectionOpen: (section: keyof EditorPreferences["clipSections"], open: boolean) => void;
  setAssetPanelState: (patch: Partial<EditorPreferences["assetPanel"]>) => void;
  onPreviewTimeUpdate: (time: number) => void;
  onCursorDrag: (time: number) => void;
  onClickTimeArea: (time: number) => undefined;
  onActionMoveStart: ({ action, row }: { action: TimelineAction; row: TimelineRow }) => void;
  onActionMoving: ({ action, row, start, end }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => boolean | undefined;
  onActionMoveEnd: ({ action }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => void;
  onActionResizeStart: ({ action }: { action: TimelineAction }) => void;
  onActionResizeEnd: ({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => void;
  onChange: (nextRows: TimelineRow[]) => boolean | undefined;
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
  onTimelineDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleAssetDrop: (assetKey: string, trackId: string | undefined, time: number) => void;
  handleDeleteClip: (clipId: string) => void;
  handleSelectedClipChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  handleResetClipPosition: () => void;
  handleSplitSelectedClip: () => void;
  handleToggleMute: () => void;
  handleAddTrack: (kind: TrackKind) => void;
  handleTrackPopoverChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  handleReorderTrack: (trackId: string, direction: -1 | 1) => void;
  handleRemoveTrack: (trackId: string) => void;
  handleAddText: () => void;
  moveSelectedClipToTrack: (direction: "up" | "down") => void;
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number) => void;
  clearActionDragState: (clipId: string) => void;
  uploadFiles: (files: File[]) => Promise<void>;
  startRender: () => Promise<void>;
  formatTime: (time: number) => string;
}

export function useTimelineState(): UseTimelineStateResult {
  const queryClient = useQueryClient();
  const timelineRef = useRef<TimelineState>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineWrapperRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromPreview = useRef(false);
  const isSyncingFromTimeline = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef("");
  const dataRef = useRef<TimelineData | null>(null);
  const resizeStartRef = useRef<Record<string, { start: number; from: number }>>({});
  const crossTrackActive = useRef(false);
  const actionDragStateRef = useRef<Record<string, ActionDragState>>({});

  const [data, setData] = useState<TimelineData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderLog, setRenderLog] = useState("");
  const [renderDirty, setRenderDirty] = useState(false);
  const [preferences, setPreferences] = useEditorSettings<EditorPreferences>("video-editor:preferences", defaultPreferences);

  const scale = SCALE_SECONDS;
  const scaleWidth = preferences.scaleWidth;
  dataRef.current = data;

  const timelineQuery = useQuery({
    queryKey: ["timeline-data"],
    queryFn: loadTimelineJson,
    refetchInterval: 1000,
  });

  const assetRegistryQuery = useQuery({
    queryKey: ["asset-registry"],
    queryFn: loadAssetRegistry,
    refetchInterval: 2000,
  });

  const saveMutation = useMutation({
    mutationFn: saveTimelineConfig,
    onSuccess: (_value, savedConfig) => {
      const current = dataRef.current;
      if (!current) {
        return;
      }

      setSaveStatus("saved");
      setRenderDirty(true);
      lastSavedSignature.current = getConfigSignature(resolveTimelineConfig(savedConfig, current.registry));
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ): TimelineData => {
    const config = rowsToConfig(rows, meta, current.output, clipOrder, current.tracks);
    const resolvedConfig = resolveTimelineConfig(config, current.registry);
    const rowData = configToRows(config);

    return {
      ...current,
      config,
      resolvedConfig,
      rows: rowData.rows,
      meta: rowData.meta,
      clipOrder: rowData.clipOrder,
      effects: rowData.effects,
      tracks: config.tracks ?? [],
      output: { ...config.output },
      signature: getConfigSignature(resolvedConfig),
    };
  }, []);

  const saveTimeline = useCallback(async (nextData: TimelineData) => {
    setSaveStatus("saving");
    await saveMutation.mutateAsync(nextData.config);
  }, [saveMutation]);

  const scheduleSave = useCallback((nextData: TimelineData) => {
    setSaveStatus("dirty");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveTimeline(nextData);
    }, 500);
  }, [saveTimeline]);

  const commitData = useCallback((
    nextData: TimelineData,
    options?: {
      save?: boolean;
      selectedClipId?: string | null;
      selectedTrackId?: string | null;
      updateLastSavedSignature?: boolean;
    },
  ) => {
    setData(nextData);
    if (options?.selectedClipId !== undefined) {
      setSelectedClipId(options.selectedClipId);
    } else if (selectedClipId && !nextData.meta[selectedClipId]) {
      setSelectedClipId(null);
    }

    if (options?.selectedTrackId !== undefined) {
      setSelectedTrackId(options.selectedTrackId);
    } else {
      const fallbackTrackId = selectedTrackId && nextData.tracks.some((track) => track.id === selectedTrackId)
        ? selectedTrackId
        : nextData.tracks[0]?.id ?? null;
      setSelectedTrackId(fallbackTrackId);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (options?.save ?? true) {
      scheduleSave(nextData);
    }
  }, [scheduleSave, selectedClipId, selectedTrackId]);

  const applyTimelineEdit = useCallback((
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextMeta: Record<string, ClipMeta> = { ...current.meta };
    if (metaUpdates) {
      for (const [clipId, patch] of Object.entries(metaUpdates)) {
        nextMeta[clipId] = nextMeta[clipId] ? { ...nextMeta[clipId], ...patch } : (patch as ClipMeta);
      }
    }

    if (metaDeletes) {
      for (const clipId of metaDeletes) {
        delete nextMeta[clipId];
      }
    }

    const clipOrder = clipOrderOverride ?? buildTrackClipOrder(current.tracks, current.clipOrder, metaDeletes);
    const nextData = materializeData(current, nextRows, nextMeta, clipOrder);
    commitData(nextData);
  }, [commitData, materializeData]);

  const applyResolvedConfigEdit = useCallback((
    nextResolvedConfig: TimelineData["resolvedConfig"],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextData = buildTimelineData(serializeForDisk(nextResolvedConfig), current.registry);
    commitData(nextData, {
      selectedClipId: options?.selectedClipId,
      selectedTrackId: options?.selectedTrackId,
    });
  }, [commitData]);

  useEffect(() => {
    if (timelineQuery.data && timelineQuery.data.signature !== lastSavedSignature.current) {
      commitData(timelineQuery.data, { save: false, updateLastSavedSignature: true });
    }
  }, [commitData, timelineQuery.data]);

  useEffect(() => {
    const current = dataRef.current;
    const registry = assetRegistryQuery.data;
    if (!current || !registry) {
      return;
    }

    const nextData = buildTimelineData(current.config, registry);
    if (nextData.signature === current.signature && Object.keys(nextData.assetMap).length === Object.keys(current.assetMap).length) {
      return;
    }

    commitData(nextData, {
      save: false,
      selectedClipId,
      selectedTrackId,
    });
  }, [assetRegistryQuery.data, commitData, selectedClipId, selectedTrackId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  const resolvedConfig = data?.resolvedConfig ?? null;
  const selectedClip = useMemo(() => {
    if (!resolvedConfig || !selectedClipId) {
      return null;
    }
    return resolvedConfig.clips.find((clip) => clip.id === selectedClipId) ?? null;
  }, [resolvedConfig, selectedClipId]);

  const selectedTrack = useMemo(() => {
    if (!data) {
      return null;
    }

    const preferredTrackId = selectedClip?.track ?? selectedTrackId;
    return preferredTrackId ? getTrackById(data.resolvedConfig, preferredTrackId) : data.tracks[0] ?? null;
  }, [data, selectedClip, selectedTrackId]);

  const selectedClipHasPredecessor = useMemo(() => {
    if (!resolvedConfig || !selectedClip) {
      return false;
    }

    const siblings = resolvedConfig.clips
      .filter((clip) => clip.track === selectedClip.track)
      .sort((left, right) => left.at - right.at);
    const selectedIndex = siblings.findIndex((clip) => clip.id === selectedClip.id);
    return selectedIndex > 0;
  }, [resolvedConfig, selectedClip]);

  const compositionSize = useMemo(() => {
    return data ? parseResolution(data.output.resolution) : { width: 1280, height: 720 };
  }, [data]);

  const trackScaleMap = useMemo(() => {
    if (!data) {
      return {};
    }

    return Object.fromEntries(data.tracks.map((track) => [track.id, track.scale ?? 1]));
  }, [data]);

  const { onPreviewTimeUpdate, onCursorDrag, onClickTimeArea } = useTimelineSync({
    timelineRef,
    previewRef,
    setCurrentTime,
    isSyncingFromPreview,
    isSyncingFromTimeline,
  });

  const clearActionDragState = useCallback((clipId: string) => {
    delete actionDragStateRef.current[clipId];
  }, []);

  const moveClipToRow = useCallback((clipId: string, targetRowId: string, newStartTime?: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceRow = current.rows.find((row) => row.actions.some((action) => action.id === clipId));
    const targetRow = current.rows.find((row) => row.id === targetRowId);
    if (!sourceRow || !targetRow) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === sourceRow.id);
    const targetTrack = current.tracks.find((track) => track.id === targetRow.id);
    const action = sourceRow.actions.find((candidate) => candidate.id === clipId);
    if (!sourceTrack || !targetTrack || !action || sourceTrack.kind !== targetTrack.kind) {
      return;
    }

    const duration = action.end - action.start;
    const nextStart = typeof newStartTime === "number" ? Math.max(0, newStartTime) : action.start;
    const nextAction = { ...action, start: nextStart, end: nextStart + duration };
    const nextRows = current.rows.map((row) => {
      if (sourceRow.id === targetRow.id && row.id === sourceRow.id) {
        return {
          ...row,
          actions: row.actions.map((candidate) => (candidate.id === clipId ? nextAction : candidate)),
        };
      }

      if (row.id === sourceRow.id) {
        return { ...row, actions: row.actions.filter((candidate) => candidate.id !== clipId) };
      }

      if (row.id === targetRow.id) {
        return { ...row, actions: [...row.actions, nextAction] };
      }

      return row;
    });

    const nextClipOrder = moveClipBetweenTracks(current.clipOrder, clipId, sourceRow.id, targetRow.id);
    applyTimelineEdit(nextRows, { [clipId]: { track: targetRow.id } }, undefined, nextClipOrder);
  }, [applyTimelineEdit]);

  const createTrackAndMoveClip = useCallback((clipId: string, kind: TrackKind, newStartTime?: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceClip = current.resolvedConfig.clips.find((clip) => clip.id === clipId);
    const sourceTrack = sourceClip ? current.resolvedConfig.tracks.find((track) => track.id === sourceClip.track) : null;
    if (!sourceClip || !sourceTrack || sourceTrack.kind !== kind) {
      return;
    }

    const nextResolvedConfigBase = addTrack(current.resolvedConfig, kind);
    const newTrack = nextResolvedConfigBase.tracks.find((track) => {
      return !current.resolvedConfig.tracks.some((existingTrack) => existingTrack.id === track.id);
    }) ?? nextResolvedConfigBase.tracks[nextResolvedConfigBase.tracks.length - 1];
    if (!newTrack) {
      return;
    }

    const nextResolvedConfig = {
      ...nextResolvedConfigBase,
      clips: nextResolvedConfigBase.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        return {
          ...clip,
          at: typeof newStartTime === "number" ? Math.max(0, newStartTime) : clip.at,
          track: newTrack.id,
        };
      }),
    };

    applyResolvedConfigEdit(nextResolvedConfig, {
      selectedClipId: clipId,
      selectedTrackId: newTrack.id,
    });
  }, [applyResolvedConfigEdit]);

  const moveSelectedClipToTrack = useCallback((direction: "up" | "down") => {
    const current = dataRef.current;
    if (!current || !selectedClipId) {
      return;
    }

    const currentRowIndex = current.rows.findIndex((row) => row.actions.some((action) => action.id === selectedClipId));
    if (currentRowIndex < 0) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === current.rows[currentRowIndex]?.id);
    if (!sourceTrack) {
      return;
    }

    let targetRowIndex = currentRowIndex;
    while (true) {
      targetRowIndex += direction === "up" ? -1 : 1;
      if (targetRowIndex < 0 || targetRowIndex >= current.rows.length) {
        return;
      }

      const targetTrack = current.tracks.find((track) => track.id === current.rows[targetRowIndex]?.id);
      if (targetTrack?.kind === sourceTrack.kind) {
        moveClipToRow(selectedClipId, targetTrack.id);
        setSelectedTrackId(targetTrack.id);
        return;
      }
    }
  }, [moveClipToRow, selectedClipId]);

  const onActionMoveStart = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow }) => {
    actionDragStateRef.current[action.id] = {
      rowId: row.id,
      initialStart: action.start,
      initialEnd: action.end,
      latestStart: action.start,
      latestEnd: action.end,
    };
  }, []);

  const onActionMoving = useCallback(({ action, row, start, end }: {
    action: TimelineAction;
    row: TimelineRow;
    start: number;
    end: number;
  }) => {
    actionDragStateRef.current[action.id] = {
      rowId: row.id,
      initialStart: actionDragStateRef.current[action.id]?.initialStart ?? action.start,
      initialEnd: actionDragStateRef.current[action.id]?.initialEnd ?? action.end,
      latestStart: start,
      latestEnd: end,
    };

    if (crossTrackActive.current) {
      return false;
    }

    return undefined;
  }, []);

  const onActionMoveEnd = useCallback(({ action }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => {
    if (!crossTrackActive.current) {
      clearActionDragState(action.id);
    }
  }, [clearActionDragState]);

  const onActionResizeStart = useCallback(({ action }: { action: TimelineAction }) => {
    const clipMeta = dataRef.current?.meta[action.id];
    if (!clipMeta || typeof clipMeta.hold === "number") {
      return;
    }

    resizeStartRef.current[action.id] = {
      start: action.start,
      from: clipMeta.from ?? 0,
    };
  }, []);

  const onActionResizeEnd = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => {
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta) {
      return;
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {
      ...buildRowTrackPatches(current.rows),
      [action.id]: {
        track: row.id,
      },
    };

    if (typeof clipMeta.hold !== "number") {
      const origin = resizeStartRef.current[action.id];
      if (origin && action.start !== origin.start) {
        metaUpdates[action.id] = {
          ...metaUpdates[action.id],
          from: Math.max(0, origin.from + (action.start - origin.start) * (clipMeta.speed ?? 1)),
        };
      }

      metaUpdates[action.id] = {
        ...metaUpdates[action.id],
        to: getSourceTime(
          {
            from: clipMeta.from ?? 0,
            start: action.start,
            speed: clipMeta.speed ?? 1,
          },
          action.end,
        ),
      };
    }

    const nextRows = current.rows.map((entry) => {
      if (entry.id !== row.id) {
        return entry;
      }

      return {
        ...entry,
        actions: entry.actions.map((candidate) => {
          return candidate.id === action.id
            ? { ...candidate, start: action.start, end: action.end }
            : candidate;
        }),
      };
    });

    applyTimelineEdit(nextRows, metaUpdates);
    delete resizeStartRef.current[action.id];
  }, [applyTimelineEdit]);

  const onChange = useCallback((nextRows: TimelineRow[]) => {
    if (crossTrackActive.current) {
      return false;
    }

    applyTimelineEdit(nextRows, buildRowTrackPatches(nextRows));
    return undefined;
  }, [applyTimelineEdit]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit]);

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const assetEntry = current.registry.assets[assetKey];
    const assetKind = inferTrackType(assetEntry?.file ?? assetKey);
    const resolvedTrackId = getCompatibleTrackId(current.tracks, trackId, assetKind, selectedTrackId);
    if (!resolvedTrackId) {
      return;
    }

    const track = current.tracks.find((candidate) => candidate.id === resolvedTrackId);
    if (!track) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const isImage = assetEntry?.type?.startsWith("image");
    const isManual = track.fit === "manual";
    const clipType: ClipType = isImage ? "hold" : "media";
    const baseDuration = Math.max(1, Math.min(assetEntry?.duration ?? 5, assetKind === "audio" ? assetEntry?.duration ?? 10 : 5));

    let clipMeta: ClipMeta;
    let duration: number;

    if (track.kind === "audio") {
      duration = assetEntry?.duration ?? 10;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType: "media",
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
      };
    } else if (isImage) {
      duration = 5;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        hold: duration,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    } else {
      duration = baseDuration;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    }

    const action: TimelineAction = {
      id: clipId,
      start: time,
      end: time + duration,
      effectId: `effect-${clipId}`,
    };

    const nextRows = current.rows.map((row) => (row.id === resolvedTrackId ? { ...row, actions: [...row.actions, action] } : row));
    const nextClipOrder = updateClipOrder(current.clipOrder, resolvedTrackId, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, { [clipId]: clipMeta }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(resolvedTrackId);
  }, [applyTimelineEdit, selectedTrackId]);

  const onTimelineDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("asset-key")) {
      event.preventDefault();
      event.currentTarget.dataset.dragOver = "true";
    }
  }, []);

  const onTimelineDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.dragOver;
  }, []);

  const onTimelineDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    delete event.currentTarget.dataset.dragOver;
    const assetKey = event.dataTransfer.getData("asset-key");
    const assetKind = event.dataTransfer.getData("asset-kind") as TrackKind;
    if (!assetKey || !dataRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = event.currentTarget.scrollLeft;
    const pixelsPerSecond = scaleWidth / scale;
    const dropX = event.clientX - rect.left;
    const time = Math.max(0, (dropX + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);

    const rowElements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".timeline-editor-edit-row"));
    const rowIndex = rowElements.findIndex((rowElement) => {
      const rowRect = rowElement.getBoundingClientRect();
      return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
    });
    const targetTrackId = rowIndex >= 0 ? dataRef.current.rows[rowIndex]?.id : undefined;
    const compatibleTrackId = getCompatibleTrackId(dataRef.current.tracks, targetTrackId, assetKind || "visual", selectedTrackId);
    handleAssetDrop(assetKey, compatibleTrackId ?? undefined, time);
  }, [handleAssetDrop, scale, scaleWidth, selectedTrackId]);

  const handleDeleteClip = useCallback((clipId: string) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const clipTrack = current.meta[clipId]?.track;
    const nextRows = current.rows.map((row) => ({
      ...row,
      actions: row.actions.filter((action) => action.id !== clipId),
    }));
    const nextClipOrder = clipTrack
      ? updateClipOrder(current.clipOrder, clipTrack, (ids) => ids.filter((id) => id !== clipId))
      : current.clipOrder;
    applyTimelineEdit(nextRows, undefined, [clipId], nextClipOrder);
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [applyTimelineEdit, selectedClipId]);

  const handleSelectedClipChange = useCallback((patch: Partial<ClipMeta> & { at?: number }) => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const nextResolvedConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => {
      return {
        ...clip,
        at: patch.at !== undefined ? Math.max(0, patch.at) : clip.at,
        clipType: patch.clipType ?? clip.clipType,
        from: patch.from !== undefined ? Math.max(0, patch.from) : clip.from,
        to: patch.to !== undefined ? Math.max(0, patch.to) : clip.to,
        speed: patch.speed !== undefined ? Math.min(4, Math.max(0.25, patch.speed)) : clip.speed,
        hold: patch.hold !== undefined ? Math.max(0.1, patch.hold) : clip.hold,
        volume: patch.volume !== undefined ? Math.min(1, Math.max(0, patch.volume)) : clip.volume,
        x: patch.x ?? clip.x,
        y: patch.y ?? clip.y,
        width: patch.width !== undefined ? Math.max(20, patch.width) : clip.width,
        height: patch.height !== undefined ? Math.max(20, patch.height) : clip.height,
        opacity: patch.opacity !== undefined ? Math.min(1, Math.max(0, patch.opacity)) : clip.opacity,
        text: patch.text !== undefined ? patch.text : clip.text,
        entrance: patch.entrance !== undefined ? patch.entrance : clip.entrance,
        exit: patch.exit !== undefined ? patch.exit : clip.exit,
        continuous: patch.continuous !== undefined ? patch.continuous : clip.continuous,
        transition: patch.transition !== undefined ? patch.transition : clip.transition,
      };
    });

    applyResolvedConfigEdit(nextResolvedConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleResetClipPosition = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const nextResolvedConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => {
      const { x, y, width, height, ...rest } = clip;
      return rest;
    });

    applyResolvedConfigEdit(nextResolvedConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleSplitSelectedClip = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const result = splitClipAtPlayhead(resolvedConfig, selectedClipId, currentTime);
    if (result.nextSelectedClipId) {
      applyResolvedConfigEdit(result.config, { selectedClipId: result.nextSelectedClipId });
    }
  }, [applyResolvedConfigEdit, currentTime, resolvedConfig, selectedClipId]);

  const handleToggleMute = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    applyResolvedConfigEdit(toggleClipMute(resolvedConfig, selectedClipId), { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleAddTrack = useCallback((kind: TrackKind) => {
    if (!resolvedConfig) {
      return;
    }

    const nextResolvedConfig = addTrack(resolvedConfig, kind);
    const nextTrack = nextResolvedConfig.tracks[nextResolvedConfig.tracks.length - 1] ?? null;
    applyResolvedConfigEdit(nextResolvedConfig, { selectedTrackId: nextTrack?.id ?? null });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleTrackPopoverChange = useCallback((trackId: string, patch: Partial<TrackDefinition>) => {
    if (!resolvedConfig) {
      return;
    }

    const nextConfig = {
      ...resolvedConfig,
      tracks: resolvedConfig.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track)),
    };
    applyResolvedConfigEdit(nextConfig, { selectedTrackId: trackId });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleReorderTrack = useCallback((trackId: string, direction: -1 | 1) => {
    if (!resolvedConfig) {
      return;
    }

    const index = resolvedConfig.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) {
      return;
    }

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= resolvedConfig.tracks.length) {
      return;
    }

    const nextTracks = [...resolvedConfig.tracks];
    [nextTracks[index], nextTracks[targetIndex]] = [nextTracks[targetIndex], nextTracks[index]];
    applyResolvedConfigEdit({ ...resolvedConfig, tracks: nextTracks }, { selectedTrackId: trackId });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleRemoveTrack = useCallback((trackId: string) => {
    if (!resolvedConfig) {
      return;
    }

    const track = resolvedConfig.tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }

    const sameKind = resolvedConfig.tracks.filter((entry) => entry.kind === track.kind);
    if (sameKind.length <= 1) {
      return;
    }

    const nextConfig = {
      ...resolvedConfig,
      tracks: resolvedConfig.tracks.filter((entry) => entry.id !== trackId),
      clips: resolvedConfig.clips.filter((clip) => clip.track !== trackId),
    };
    applyResolvedConfigEdit(nextConfig, { selectedTrackId: null });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleAddText = useCallback(() => {
    if (!data) {
      return;
    }

    const visualTrack = selectedTrack?.kind === "visual"
      ? selectedTrack
      : getVisualTracks(data.resolvedConfig).slice(-1)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(data.meta);
    const duration = 4;
    const action: TimelineAction = {
      id: clipId,
      start: currentTime,
      end: currentTime + duration,
      effectId: `effect-${clipId}`,
    };
    const nextRows = data.rows.map((row) => (row.id === visualTrack.id ? { ...row, actions: [...row.actions, action] } : row));
    const nextClipOrder = updateClipOrder(data.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);

    applyTimelineEdit(nextRows, {
      [clipId]: {
        track: visualTrack.id,
        clipType: "text",
        hold: duration,
        x: 180,
        y: 140,
        width: 920,
        height: 180,
        opacity: 1,
        text: {
          content: "New title",
          fontFamily: "Georgia, serif",
          fontSize: 64,
          color: "#ffffff",
          align: "center",
          bold: true,
          italic: false,
        },
      },
    }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyTimelineEdit, currentTime, data, selectedTrack]);

  const uploadFiles = useCallback(async (files: File[]) => {
    await Promise.all(files.map(uploadAssetFile));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["timeline-data"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-registry"] }),
    ]);
  }, [queryClient]);

  const startRender = useCallback(async () => {
    if (renderStatus === "rendering") {
      return;
    }

    setRenderStatus("rendering");
    setRenderLog("");
    try {
      const response = await fetch("/api/render", { method: "POST" });
      const reader = response.body?.getReader();
      if (!reader) {
        setRenderStatus("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: done")) {
            setRenderStatus("done");
            setRenderDirty(false);
          } else if (line.startsWith("event: error")) {
            setRenderStatus("error");
          } else if (line.startsWith("data: ")) {
            setRenderLog((currentLog) => currentLog + line.slice(6) + "\n");
          }
        }
      }
    } catch {
      setRenderStatus("error");
    }
  }, [renderStatus]);

  const formatTime = useCallback((time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }, []);

  const setScaleWidth = useCallback((updater: number | ((value: number) => number)) => {
    setPreferences((current) => ({
      ...current,
      scaleWidth: typeof updater === "function" ? (updater as (value: number) => number)(current.scaleWidth) : updater,
    }));
  }, [setPreferences]);

  const setClipSectionOpen = useCallback((section: keyof EditorPreferences["clipSections"], open: boolean) => {
    setPreferences((current) => ({
      ...current,
      clipSections: {
        ...current.clipSections,
        [section]: open,
      },
    }));
  }, [setPreferences]);

  const setAssetPanelState = useCallback((patch: Partial<EditorPreferences["assetPanel"]>) => {
    setPreferences((current) => ({
      ...current,
      assetPanel: {
        ...current.assetPanel,
        ...patch,
      },
    }));
  }, [setPreferences]);

  return {
    data,
    resolvedConfig,
    currentTime,
    selectedClipId,
    selectedTrackId,
    selectedClip,
    selectedTrack,
    selectedClipHasPredecessor,
    compositionSize,
    trackScaleMap,
    saveStatus,
    renderStatus,
    renderLog,
    renderDirty,
    scale,
    scaleWidth,
    isLoading: timelineQuery.isLoading && !data,
    timelineRef,
    previewRef,
    playerContainerRef,
    timelineWrapperRef,
    dataRef,
    crossTrackActive,
    actionDragStateRef,
    preferences,
    setSelectedClipId,
    setSelectedTrackId,
    setScaleWidth,
    setClipSectionOpen,
    setAssetPanelState,
    onPreviewTimeUpdate,
    onCursorDrag,
    onClickTimeArea,
    onActionMoveStart,
    onActionMoving,
    onActionMoveEnd,
    onActionResizeStart,
    onActionResizeEnd,
    onChange,
    onOverlayChange,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
    handleAssetDrop,
    handleDeleteClip,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleSplitSelectedClip,
    handleToggleMute,
    handleAddTrack,
    handleTrackPopoverChange,
    handleReorderTrack,
    handleRemoveTrack,
    handleAddText,
    moveSelectedClipToTrack,
    moveClipToRow,
    createTrackAndMoveClip,
    clearActionDragState,
    uploadFiles,
    startRender,
    formatTime,
  };
}
