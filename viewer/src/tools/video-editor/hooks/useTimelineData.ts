import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import { getConfigSignature, parseResolution } from "@shared/config-utils";
import { getTrackById } from "@shared/editor-utils";
import { serializeForDisk } from "@shared/serialize";
import type { TimelineConfig, TrackDefinition } from "@shared/types";
import {
  buildTrackClipOrder,
  SCALE_SECONDS,
} from "@/tools/video-editor/lib/coordinate-utils";
import {
  buildTimelineData,
  configToRows,
  resolveTimelineConfig,
  rowsToConfig,
  loadTimelineJsonFromProvider,
  type ClipMeta,
  type ClipOrderMap,
  type TimelineData,
} from "@/tools/video-editor/lib/timeline-data";
import { uploadAssetFile } from "@/tools/video-editor/lib/timeline-api";
import { useEditorSettings } from "@/tools/video-editor/settings/useEditorSettings";
import { useDataProvider } from "@/tools/video-editor/contexts/DataProviderContext";

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

export function shouldAcceptPolledData(
  editSeq: number,
  savedSeq: number,
  polledSig: string,
  lastSavedSig: string,
): boolean {
  if (savedSeq < editSeq) {
    return false;
  }

  return polledSig !== lastSavedSig;
}

export interface ActionDragState {
  rowId: string;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
}

export interface UseTimelineDataResult {
  data: TimelineData | null;
  resolvedConfig: TimelineData["resolvedConfig"] | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: TimelineData["resolvedConfig"]["clips"][number] | null;
  selectedTrack: TrackDefinition | null;
  selectedClipHasPredecessor: boolean;
  compositionSize: { width: number; height: number };
  trackScaleMap: Record<string, number>;
  saveStatus: SaveStatus;
  renderStatus: RenderStatus;
  renderLog: string;
  renderDirty: boolean;
  renderProgress: { current: number; total: number; percent: number; phase: string } | null;
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: React.MutableRefObject<TimelineData | null>;
  crossTrackActive: React.MutableRefObject<boolean>;
  actionDragStateRef: React.MutableRefObject<Record<string, ActionDragState>>;
  resizeStartRef: React.MutableRefObject<Record<string, { start: number; from: number }>>;
  preferences: EditorPreferences;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  setRenderStatus: React.Dispatch<React.SetStateAction<RenderStatus>>;
  setRenderLog: React.Dispatch<React.SetStateAction<string>>;
  setRenderDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setScaleWidth: (updater: number | ((value: number) => number)) => void;
  setClipSectionOpen: (section: keyof EditorPreferences["clipSections"], open: boolean) => void;
  setAssetPanelState: (patch: Partial<EditorPreferences["assetPanel"]>) => void;
  applyTimelineEdit: (
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
  ) => void;
  applyResolvedConfigEdit: (
    nextResolvedConfig: TimelineData["resolvedConfig"],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null },
  ) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  uploadFiles: (files: File[]) => Promise<void>;
  startRender: () => Promise<void>;
}

export function useTimelineData(): UseTimelineDataResult {
  const queryClient = useQueryClient();
  const provider = useDataProvider();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef("");
  const editSeqRef = useRef(0);
  const savedSeqRef = useRef(0);
  const dataRef = useRef<TimelineData | null>(null);
  const resizeStartRef = useRef<Record<string, { start: number; from: number }>>({});
  const crossTrackActive = useRef(false);
  const actionDragStateRef = useRef<Record<string, ActionDragState>>({});

  const [data, setData] = useState<TimelineData | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderLog, setRenderLog] = useState("");
  const [renderDirty, setRenderDirty] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number; percent: number; phase: string } | null>(null);
  const [preferences, setPreferences] = useEditorSettings<EditorPreferences>("video-editor:preferences", defaultPreferences);
  const selectedClipIdRef = useRef<string | null>(selectedClipId);
  const selectedTrackIdRef = useRef<string | null>(selectedTrackId);

  const scale = SCALE_SECONDS;
  const scaleWidth = preferences.scaleWidth;

  useLayoutEffect(() => {
    dataRef.current = data;
    selectedClipIdRef.current = selectedClipId;
    selectedTrackIdRef.current = selectedTrackId;
  }, [data, selectedClipId, selectedTrackId]);

  const timelineQuery = useQuery({
    queryKey: ["timeline-data"],
    queryFn: () => loadTimelineJsonFromProvider(provider),
    refetchInterval: 1000,
  });

  const assetRegistryQuery = useQuery({
    queryKey: ["asset-registry"],
    queryFn: () => provider.loadAssetRegistry(),
    refetchInterval: 2000,
  });

  const saveMutation = useMutation({
    mutationFn: (config: TimelineConfig) => provider.saveTimeline(config),
    onError: () => {
      setSaveStatus("error");
      const current = dataRef.current;
      if (current) {
        scheduleSave(current, { preserveStatus: true });
      }
    },
  });

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ): TimelineData => {
    const config = rowsToConfig(rows, meta, current.output, clipOrder, current.tracks, current.config.customEffects);
    const resolvedConfig = resolveTimelineConfig(config, current.registry, (file) => provider.resolveAssetUrl(file));
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
  }, [provider]);

  const saveTimeline = useCallback(async (nextData: TimelineData, seq: number) => {
    setSaveStatus("saving");
    await saveMutation.mutateAsync(nextData.config, {
      onSuccess: () => {
        if (seq > savedSeqRef.current) {
          savedSeqRef.current = seq;
          lastSavedSignature.current = nextData.signature;
        }

        setSaveStatus(seq >= editSeqRef.current ? "saved" : "dirty");
        setRenderDirty(true);
      },
    });
  }, [saveMutation]);

  const scheduleSave = useCallback((nextData: TimelineData, options?: { preserveStatus?: boolean }) => {
    if (!options?.preserveStatus) {
      setSaveStatus("dirty");
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const seq = editSeqRef.current;
      void saveTimeline(nextData, seq);
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
    } else if (selectedClipIdRef.current && !nextData.meta[selectedClipIdRef.current]) {
      setSelectedClipId(null);
    }

    if (options?.selectedTrackId !== undefined) {
      setSelectedTrackId(options.selectedTrackId);
    } else {
      const fallbackTrackId = selectedTrackIdRef.current && nextData.tracks.some((track) => track.id === selectedTrackIdRef.current)
        ? selectedTrackIdRef.current
        : nextData.tracks[0]?.id ?? null;
      setSelectedTrackId(fallbackTrackId);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (options?.save ?? true) {
      editSeqRef.current += 1;
      scheduleSave(nextData);
    }
  }, [scheduleSave]);

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

    const nextData = buildTimelineData(serializeForDisk(nextResolvedConfig), current.registry, (file) => provider.resolveAssetUrl(file));
    commitData(nextData, {
      selectedClipId: options?.selectedClipId,
      selectedTrackId: options?.selectedTrackId,
    });
  }, [commitData, provider]);

  // Use a ref for commitData to avoid the polling effect re-firing
  // when commitData's identity changes due to dependency cascades.
  const commitDataRef = useRef(commitData);
  useLayoutEffect(() => {
    commitDataRef.current = commitData;
  }, [commitData]);

  useEffect(() => {
    const polledData = timelineQuery.data;
    if (!polledData) return;

    if (!shouldAcceptPolledData(
      editSeqRef.current,
      savedSeqRef.current,
      polledData.signature,
      lastSavedSignature.current,
    )) {
      return;
    }

    // Use setTimeout(0) to batch with React's state updates
    const syncHandle = window.setTimeout(() => {
      // Re-check the guard inside the timeout in case an edit happened
      // between scheduling and executing
      if (shouldAcceptPolledData(
        editSeqRef.current,
        savedSeqRef.current,
        polledData.signature,
        lastSavedSignature.current,
      )) {
        commitDataRef.current(polledData, { save: false, updateLastSavedSignature: true });
      }
    }, 0);

    return () => {
      window.clearTimeout(syncHandle);
    };
    // Only re-run when timelineQuery.data actually changes — NOT when commitData changes
  }, [timelineQuery.data]);

  useEffect(() => {
    const current = dataRef.current;
    const registry = assetRegistryQuery.data;
    if (!current || !registry) {
      return;
    }

    if (savedSeqRef.current < editSeqRef.current) {
      return;
    }

    const nextData = buildTimelineData(current.config, registry, (file) => provider.resolveAssetUrl(file));
    if (nextData.signature === current.signature && Object.keys(nextData.assetMap).length === Object.keys(current.assetMap).length) {
      return;
    }

    const syncHandle = window.setTimeout(() => {
      // Re-check guard inside timeout
      if (savedSeqRef.current < editSeqRef.current) return;
      commitDataRef.current(nextData, {
        save: false,
        selectedClipId: selectedClipIdRef.current,
        selectedTrackId: selectedTrackIdRef.current,
      });
    }, 0);

    return () => {
      window.clearTimeout(syncHandle);
    };
  }, [assetRegistryQuery.data]);

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

  const uploadFiles = useCallback(async (files: File[]) => {
    if (provider.uploadAsset) {
      await Promise.all(files.map((file) => provider.uploadAsset!(file)));
    } else {
      await Promise.all(files.map(uploadAssetFile));
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["timeline-data"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-registry"] }),
    ]);
  }, [queryClient, provider]);

  const startRender = useCallback(async () => {
    if (renderStatus === "rendering") {
      return;
    }

    setRenderStatus("rendering");
    setRenderLog("");
    setRenderProgress({ current: 0, total: 0, percent: 0, phase: "Starting..." });
    console.log("[render] Starting render...");
    try {
      const response = await fetch("/api/render", { method: "POST" });
      console.log("[render] Response status:", response.status);
      const reader = response.body?.getReader();
      if (!reader) {
        console.error("[render] No reader available");
        setRenderStatus("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let lastEvent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[render] Stream ended. Last event:", lastEvent);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          console.log("[render] Line:", JSON.stringify(line));
          if (line.startsWith("event: ")) {
            lastEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (lastEvent === "done") {
              console.log("[render] DONE! Triggering download...");
              setRenderStatus("done");
              setRenderDirty(false);
              setRenderProgress(null);
              // Auto-download the rendered video
              const link = document.createElement("a");
              link.href = "/output/render.mp4";
              link.download = "render.mp4";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              lastEvent = "";
            } else if (lastEvent === "error") {
              console.error("[render] ERROR:", data);
              setRenderStatus("error");
              setRenderProgress(null);
              lastEvent = "";
            } else {
              setRenderLog((currentLog) => currentLog + data + "\n");
              // Parse progress from Remotion output
              const renderedMatch = data.match(/(?:Rendered|Encoded)\s+(\d+)\/(\d+)/);
              if (renderedMatch) {
                const current = parseInt(renderedMatch[1], 10);
                const total = parseInt(renderedMatch[2], 10);
                setRenderProgress({ current, total, percent: total > 0 ? Math.round((current / total) * 100) : 0, phase: "Rendering" });
              } else if (data.match(/Bundling\s+(\d+)%/)) {
                const pct = parseInt(data.match(/Bundling\s+(\d+)%/)![1], 10);
                setRenderProgress((prev) => ({ ...(prev ?? { current: 0, total: 0, percent: 0, phase: "Bundling" }), percent: pct, phase: "Bundling" }));
              } else if (data.includes("Getting composition") || data.includes("Composition")) {
                setRenderProgress((prev) => ({ ...(prev ?? { current: 0, total: 0, percent: 100, phase: "Bundling" }), phase: "Preparing..." }));
              }
            }
          }
        }
      }
    } catch {
      setRenderStatus("error");
    }
  }, [renderStatus]);

  return {
    data,
    resolvedConfig,
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
    renderProgress,
    scale,
    scaleWidth,
    isLoading: timelineQuery.isLoading && !data,
    dataRef,
    crossTrackActive,
    actionDragStateRef,
    resizeStartRef,
    preferences,
    setSelectedClipId,
    setSelectedTrackId,
    setRenderStatus,
    setRenderLog,
    setRenderDirty,
    setScaleWidth,
    setClipSectionOpen,
    setAssetPanelState,
    applyTimelineEdit,
    applyResolvedConfigEdit,
    queryClient,
    uploadFiles,
    startRender,
  };
}
