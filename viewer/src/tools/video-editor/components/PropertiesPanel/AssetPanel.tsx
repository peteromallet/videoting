import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Film, ImageIcon, Music4, Upload } from "lucide-react";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { ClipMeta } from "@/tools/video-editor/lib/timeline-data";
import { getAssetColor, inferTrackType } from "@/tools/video-editor/lib/timeline-data";

interface AssetPanelProps {
  assetMap: Record<string, string>;
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  backgroundAsset?: string;
  showAll: boolean;
  showHidden: boolean;
  hidden: string[];
  setPanelState: (patch: { showAll?: boolean; showHidden?: boolean; hidden?: string[] }) => void;
  onUploadFiles: (files: File[]) => Promise<void>;
}

const ACCEPTED_EXTENSIONS = [".mp4", ".webm", ".mov", ".mp3", ".wav", ".aac", ".m4a", ".jpg", ".jpeg", ".png", ".gif", ".svg"];

function isMediaFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function getAssetPreviewType(path: string): "video" | "audio" | "image" {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".mp4", ".webm", ".mov"].includes(ext)) {
    return "video";
  }
  if ([".mp3", ".wav", ".aac", ".m4a"].includes(ext)) {
    return "audio";
  }
  return "image";
}

const previewIcon = {
  video: Film,
  audio: Music4,
  image: ImageIcon,
} as const;

export default function AssetPanel({
  assetMap,
  rows,
  meta,
  backgroundAsset,
  showAll,
  showHidden,
  hidden,
  setPanelState,
  onUploadFiles,
}: AssetPanelProps) {
  const [hoveredAsset, setHoveredAsset] = useState<{
    key: string;
    path: string;
    assetKind: string;
    previewType: "video" | "audio" | "image";
  } | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  const usedAssets = useMemo(() => {
    const used = new Set<string>();
    for (const row of rows) {
      for (const action of row.actions) {
        const clipMeta = meta[action.id];
        if (clipMeta?.asset) {
          used.add(clipMeta.asset);
        }
      }
    }
    return used;
  }, [meta, rows]);

  const allAssets = useMemo(() => {
    return Object.entries(assetMap)
      .filter(([key]) => key !== backgroundAsset)
      .filter(([key]) => showAll || !usedAssets.has(key))
      .map(([key, path]) => ({
        key,
        path,
        assetKind: inferTrackType(path),
        previewType: getAssetPreviewType(path),
        isHidden: hiddenSet.has(key),
      }));
  }, [assetMap, backgroundAsset, hiddenSet, showAll, usedAssets]);

  const assets = useMemo(() => (showHidden ? allAssets : allAssets.filter((asset) => !asset.isHidden)), [allAssets, showHidden]);
  const hiddenCount = useMemo(() => allAssets.filter((asset) => asset.isHidden).length, [allAssets]);

  const toggleHide = useCallback((key: string) => {
    setPanelState({
      hidden: hiddenSet.has(key) ? hidden.filter((entry) => entry !== key) : [...hidden, key],
    });
  }, [hidden, hiddenSet, setPanelState]);

  useEffect(() => {
    if (hoveredAsset?.previewType === "video" && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [hoveredAsset]);

  const onDragStart = (event: React.DragEvent, key: string, assetKind: string) => {
    event.dataTransfer.setData("asset-key", key);
    event.dataTransfer.setData("asset-kind", assetKind);
    event.dataTransfer.effectAllowed = "copy";
  };

  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

  const onFileDragEnter = useCallback((event: React.DragEvent) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragCounter.current += 1;
    setFileDragOver(true);
  }, []);

  const onFileDragOver = useCallback((event: React.DragEvent) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onFileDragLeave = useCallback((event: React.DragEvent) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setFileDragOver(false);
    }
  }, []);

  const handleUploadSelection = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    try {
      await onUploadFiles(files);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  }, [onUploadFiles]);

  const onFileDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setFileDragOver(false);
    await handleUploadSelection(Array.from(event.dataTransfer.files).filter(isMediaFile));
  }, [handleUploadSelection]);

  const onFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleUploadSelection(Array.from(event.target.files ?? []).filter(isMediaFile));
    event.target.value = "";
  }, [handleUploadSelection]);

  return (
    <Card
      className={`relative overflow-hidden ${fileDragOver ? "ring-2 ring-primary/70" : ""}`}
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
    >
      <CardHeader className="border-b border-border/70 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Assets</CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              className="hidden"
              onChange={onFileInputChange}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Upload assets">
              <Upload className="h-4 w-4" />
            </Button>
            {hiddenCount > 0 ? (
              <Button variant={showHidden ? "secondary" : "outline"} size="sm" onClick={() => setPanelState({ showHidden: !showHidden })}>
                {hiddenCount} hidden
              </Button>
            ) : null}
            <Button variant={showAll ? "secondary" : "outline"} size="sm" onClick={() => setPanelState({ showAll: !showAll })}>
              {showAll ? "Unused" : "All"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div className="max-h-[36vh] space-y-2 overflow-auto pr-1">
          {assets.length === 0 && !fileDragOver && !uploading ? (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">No unused assets</div>
          ) : null}
          {assets.map(({ key, path, assetKind, previewType, isHidden }) => {
            const Icon = previewIcon[previewType];
            return (
              <div
                key={key}
                className={`group rounded-xl border border-border/70 bg-editor-surface0/35 transition-colors ${hoveredAsset?.key === key ? "border-primary/50 bg-editor-surface0/80" : "hover:bg-editor-surface0/55"} ${isHidden ? "opacity-50" : ""}`}
                style={{ borderLeftColor: getAssetColor(key), borderLeftWidth: 4 }}
                draggable={!isHidden}
                onDragStart={(event) => onDragStart(event, key, assetKind)}
                onMouseEnter={() => setHoveredAsset({ key, path, previewType, assetKind })}
                onMouseLeave={() => setHoveredAsset(null)}
              >
                <div className="flex items-start justify-between gap-3 px-3 py-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">{key}</span>
                    </div>
                    <Badge variant="outline" className="capitalize">{previewType}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => { event.stopPropagation(); toggleHide(key); }}>
                    {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {hoveredAsset && !fileDragOver ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-editor-crust">
            {hoveredAsset.previewType === "video" ? (
              <video ref={videoRef} src={`/media/${hoveredAsset.path}`} className="aspect-video w-full object-cover" muted loop playsInline />
            ) : hoveredAsset.previewType === "image" ? (
              <img src={`/media/${hoveredAsset.path}`} alt={hoveredAsset.key} className="aspect-video w-full object-cover" />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 text-muted-foreground">
                <Music4 className="h-8 w-8" />
                <span className="text-sm">{hoveredAsset.key}</span>
              </div>
            )}
          </div>
        ) : null}

        {fileDragOver ? (
          <div className="rounded-xl border border-dashed border-primary/60 bg-primary/10 px-4 py-8 text-center">
            <Upload className="mx-auto mb-2 h-6 w-6 text-primary" />
            <div className="text-sm font-medium text-foreground">Drop to import</div>
          </div>
        ) : null}

        {uploading ? <div className="text-sm text-muted-foreground">Importing...</div> : null}
      </CardContent>
    </Card>
  );
}
