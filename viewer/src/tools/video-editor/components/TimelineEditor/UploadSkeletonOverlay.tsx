import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ROW_HEIGHT, TIMELINE_START_LEFT } from "@/tools/video-editor/lib/coordinate-utils";
import type { UploadEntry } from "@/tools/video-editor/hooks/useUploadTracker";

interface UploadSkeletonOverlayProps {
  uploads: Map<string, UploadEntry>;
  scale: number;
  scaleWidth: number;
  gridRef: HTMLElement | null;
}

export function UploadSkeletonOverlay({
  uploads,
  scale,
  scaleWidth,
  gridRef,
}: UploadSkeletonOverlayProps) {
  const [, forceScrollSync] = useState(0);
  const uploadList = useMemo(() => Array.from(uploads.values()), [uploads]);
  const pixelsPerSecond = scaleWidth / scale;
  const skeletonWidth = 3 * pixelsPerSecond;
  const scrollLeft = gridRef?.scrollLeft ?? 0;
  const scrollTop = gridRef?.scrollTop ?? 0;

  useEffect(() => {
    if (!gridRef) {
      return;
    }

    const syncScroll = () => {
      forceScrollSync((value) => value + 1);
    };
    gridRef.addEventListener("scroll", syncScroll, { passive: true });
    return () => {
      gridRef.removeEventListener("scroll", syncScroll);
    };
  }, [gridRef]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {uploadList.map((upload) => {
        const left = upload.time * pixelsPerSecond + TIMELINE_START_LEFT - scrollLeft;
        const top = upload.trackIndex * ROW_HEIGHT - scrollTop + 4;
        const isError = upload.status === "error";

        return (
          <div
            key={upload.id}
            className={`absolute flex items-center gap-1.5 overflow-hidden rounded-md border px-2 text-[11px] text-white shadow-sm ${isError ? "" : "animate-pulse"}`}
            style={{
              left,
              top,
              width: skeletonWidth,
              height: ROW_HEIGHT - 8,
              backgroundColor: isError ? "#991b1b" : "#475569",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            {isError ? (
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">Failed</div>
                <div className="truncate text-[10px] text-white/70">{upload.file.name}</div>
              </div>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">Uploading...</div>
                  <div className="truncate text-[10px] text-white/70">{upload.file.name}</div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
