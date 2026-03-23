import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { TimelineRow } from '@xzdarcy/timeline-engine'
import { getAssetColor, inferTrackType, type ClipMeta } from './timeline-data'

interface AssetPanelProps {
  assetMap: Record<string, string>
  rows: TimelineRow[]
  meta: Record<string, ClipMeta>
  backgroundAsset?: string
}

const ACCEPTED_EXTENSIONS = [
  '.mp4', '.webm', '.mov',
  '.mp3', '.wav', '.aac', '.m4a',
  '.jpg', '.jpeg', '.png', '.gif', '.svg',
]

const HIDDEN_KEY = 'asset-panel-hidden'

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'))
  } catch { return new Set() }
}

function saveHidden(hidden: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]))
}

function isMediaFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

function getAssetPreviewType(path: string): 'video' | 'audio' | 'image' {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video'
  if (['.mp3', '.wav', '.aac', '.m4a'].includes(ext)) return 'audio'
  return 'image'
}

export default function AssetPanel({ assetMap, rows, meta, backgroundAsset }: AssetPanelProps) {
  const [showAll, setShowAll] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [hidden, setHidden] = useState(loadHidden)
  const [hoveredAsset, setHoveredAsset] = useState<{
    key: string
    path: string
    assetKind: string
    previewType: 'video' | 'audio' | 'image'
  } | null>(null)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dragCounter = useRef(0)

  const usedAssets = useMemo(() => {
    const used = new Set<string>()
    for (const row of rows) {
      for (const action of row.actions) {
        const m = meta[action.id]
        if (m?.asset) used.add(m.asset)
      }
    }
    return used
  }, [rows, meta])

  const allAssets = useMemo(() => {
    return Object.entries(assetMap)
      .filter(([key]) => key !== backgroundAsset)
      .filter(([key]) => showAll || !usedAssets.has(key))
      .map(([key, path]) => ({
        key,
        path,
        assetKind: inferTrackType(path),
        previewType: getAssetPreviewType(path),
        isHidden: hidden.has(key),
      }))
  }, [assetMap, backgroundAsset, showAll, usedAssets, hidden])

  const assets = useMemo(() => {
    return showHidden ? allAssets : allAssets.filter(a => !a.isHidden)
  }, [allAssets, showHidden])

  const hiddenCount = useMemo(() => allAssets.filter(a => a.isHidden).length, [allAssets])

  const toggleHide = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveHidden(next)
      return next
    })
  }, [])

  // When hovered asset changes to a video, play it
  useEffect(() => {
    if (hoveredAsset?.previewType === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [hoveredAsset])

  const typeLabel = (t: string) => {
    if (t === 'video') return 'VIDEO'
    if (t === 'audio') return 'AUDIO'
    return 'IMAGE'
  }

  const typeBadgeClass = (t: string) => `asset-type-badge asset-type-${t}`

  const onDragStart = (e: React.DragEvent, key: string, assetKind: string) => {
    e.dataTransfer.setData('asset-key', key)
    e.dataTransfer.setData('asset-kind', assetKind)
    e.dataTransfer.effectAllowed = 'copy'
  }

  // File drop handling
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  const onFileDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragCounter.current++
    setFileDragOver(true)
  }, [])

  const onFileDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onFileDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setFileDragOver(false)
    }
  }, [])

  const uploadFile = useCallback(async (file: File) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  }, [])

  const onFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setFileDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter(isMediaFile)
    if (files.length === 0) return

    setUploading(true)
    try {
      await Promise.all(files.map(uploadFile))
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }, [uploadFile])

  return (
    <div
      className="asset-panel"
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
    >
      <div className="asset-panel-header">
        <span className="asset-panel-title">Assets</span>
        <div className="asset-header-buttons">
          {hiddenCount > 0 && (
            <button
              className={`asset-toggle-btn${showHidden ? ' active' : ''}`}
              onClick={() => setShowHidden(!showHidden)}
              title={showHidden ? 'Hide hidden assets' : `Show ${hiddenCount} hidden`}
            >
              {showHidden ? `${hiddenCount} hidden` : `${hiddenCount} hidden`}
            </button>
          )}
          <button
            className="asset-toggle-btn"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Unused' : 'All'}
          </button>
        </div>
      </div>
      <div className="asset-list">
        {assets.length === 0 && !fileDragOver && !uploading && (
          <div className="asset-empty">No unused assets</div>
        )}
        {assets.map(({ key, path, assetKind, previewType, isHidden }) => (
          <div
            key={key}
            className={`asset-item${hoveredAsset?.key === key ? ' asset-item-active' : ''}${isHidden ? ' asset-item-hidden' : ''}`}
            draggable={!isHidden}
            onDragStart={(e) => onDragStart(e, key, assetKind)}
            onMouseEnter={() => setHoveredAsset({ key, path, previewType, assetKind })}
            onMouseLeave={() => setHoveredAsset(null)}
            style={{ borderLeftColor: getAssetColor(key) }}
          >
            <span className="asset-name">{key}</span>
            <span className={typeBadgeClass(previewType)}>{typeLabel(previewType)}</span>
            <button
              className="asset-hide-btn"
              onClick={(e) => { e.stopPropagation(); toggleHide(key) }}
              title={isHidden ? 'Show' : 'Hide'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {isHidden ? (
                  <>
                    <path d="M2 2L14 14" />
                    <path d="M6.5 6.5a2 2 0 002.8 2.8" />
                    <path d="M3.5 5.5C2.5 6.5 2 8 2 8s2 4 6 4c.8 0 1.5-.2 2.2-.4" />
                    <path d="M10.7 5.3C10 4.8 9.1 4 8 4C4 4 2 8 2 8" />
                  </>
                ) : (
                  <>
                    <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" />
                    <circle cx="8" cy="8" r="2" />
                  </>
                )}</svg>
            </button>
          </div>
        ))}
      </div>
      {fileDragOver && (
        <div className="asset-dropzone">
          <div className="asset-dropzone-content">
            <span className="asset-dropzone-icon">+</span>
            <span className="asset-dropzone-text">Drop to import</span>
          </div>
        </div>
      )}
      {uploading && (
        <div className="asset-uploading">Importing...</div>
      )}
      {hoveredAsset && !fileDragOver && (
        <div className="asset-preview">
          {hoveredAsset.previewType === 'video' && (
            <video
              ref={videoRef}
              src={`/media/${hoveredAsset.path}`}
              className="asset-preview-media"
              muted
              loop
              playsInline
            />
          )}
          {hoveredAsset.previewType === 'image' && (
            <img
              src={`/media/thumb/${hoveredAsset.path}`}
              className="asset-preview-media"
              alt={hoveredAsset.key}
            />
          )}
          {hoveredAsset.previewType === 'audio' && (
            <div className="asset-preview-audio">
              <span className="asset-preview-audio-icon">♫</span>
              <span className="asset-preview-audio-name">{hoveredAsset.key}</span>
            </div>
          )}
          <div className="asset-preview-label">{hoveredAsset.path}</div>
        </div>
      )}
    </div>
  )
}
