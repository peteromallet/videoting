import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackKind } from "@shared/types";

export type UploadStatus = "uploading" | "error";

export interface UploadEntry {
  id: string;
  file: File;
  trackId: string;
  trackIndex: number;
  time: number;
  status: UploadStatus;
  kind: TrackKind;
}

export interface UseUploadTrackerResult {
  uploads: Map<string, UploadEntry>;
  addUpload: (entry: Omit<UploadEntry, "id" | "status">) => string;
  removeUpload: (id: string) => void;
  failUpload: (id: string) => void;
}

export function useUploadTracker(): UseUploadTrackerResult {
  const [uploads, setUploads] = useState<Map<string, UploadEntry>>(() => new Map());
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearUploadTimeout = useCallback((id: string) => {
    const timeout = timeoutRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRef.current.delete(id);
    }
  }, []);

  const addUpload = useCallback((entry: Omit<UploadEntry, "id" | "status">) => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearUploadTimeout(id);
    setUploads((current) => {
      const next = new Map(current);
      next.set(id, {
        ...entry,
        id,
        status: "uploading",
      });
      return next;
    });
    return id;
  }, [clearUploadTimeout]);

  const removeUpload = useCallback((id: string) => {
    clearUploadTimeout(id);
    setUploads((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, [clearUploadTimeout]);

  const failUpload = useCallback((id: string) => {
    clearUploadTimeout(id);
    setUploads((current) => {
      const existing = current.get(id);
      if (!existing) {
        return current;
      }
      const next = new Map(current);
      next.set(id, {
        ...existing,
        status: "error",
      });
      return next;
    });

    const timeout = setTimeout(() => {
      timeoutRef.current.delete(id);
      setUploads((current) => {
        if (!current.has(id)) {
          return current;
        }
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    }, 3000);
    timeoutRef.current.set(id, timeout);
  }, [clearUploadTimeout]);

  useEffect(() => {
    const timeouts = timeoutRef.current;
    return () => {
      for (const timeout of timeouts.values()) {
        clearTimeout(timeout);
      }
      timeouts.clear();
    };
  }, []);

  return {
    uploads,
    addUpload,
    removeUpload,
    failUpload,
  };
}
