import { useCallback, useEffect, useState } from 'react';
import type { TimelineAsset } from '../api/types';
import { formatDateTime } from '../timeline/format';
import type { TimelineManager } from '../timeline/timeline-manager';

interface Props {
  manager: TimelineManager;
  asset: TimelineAsset;
  onNavigate: (asset: TimelineAsset) => void;
  onClose: () => void;
}

function preload(url: string | null) {
  if (url) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }
}

/** Full screen viewer. ←/→ walk the whole timeline, loading neighbour months on demand. */
export function AssetViewer({ manager, asset, onNavigate, onClose }: Props) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const preview = manager.api.getPreviewUrl(asset);
  const thumbnail = manager.api.getThumbnailUrl(asset);

  const go = useCallback(
    async (direction: 1 | -1) => {
      const next = await manager.getAdjacentAsset(asset, direction);
      if (next) {
        onNavigate(next);
      }
    },
    [manager, asset, onNavigate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        void go(1);
      } else if (event.key === 'ArrowLeft') {
        void go(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, onClose]);

  // Warm up the neighbours so arrow navigation feels instant.
  useEffect(() => {
    let cancelled = false;
    for (const direction of [1, -1] as const) {
      void manager.getAdjacentAsset(asset, direction).then((next) => {
        if (!cancelled && next) {
          preload(manager.api.getPreviewUrl(next));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [manager, asset]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="viewer-stage">
        {/* Low-res thumbnail (already in the browser cache) shown until the preview is loaded. */}
        {thumbnail && loadedId !== asset.id && <img className="viewer-image viewer-thumb" src={thumbnail} alt="" />}
        {preview ? (
          <img
            key={asset.id}
            className={`viewer-image${loadedId === asset.id ? ' loaded' : ''}`}
            src={preview}
            alt=""
            onLoad={() => setLoadedId(asset.id)}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div
            className="viewer-image viewer-placeholder loaded"
            style={{ aspectRatio: String(asset.ratio), backgroundColor: asset.color ?? '#333' }}
          />
        )}
      </div>
      <header className="viewer-bar" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <span>{formatDateTime(asset.localDateTime)}</span>
      </header>
      <button
        type="button"
        className="viewer-nav prev"
        aria-label="Plus récente"
        onClick={(event) => {
          event.stopPropagation();
          void go(-1);
        }}
      >
        ‹
      </button>
      <button
        type="button"
        className="viewer-nav next"
        aria-label="Plus ancienne"
        onClick={(event) => {
          event.stopPropagation();
          void go(1);
        }}
      >
        ›
      </button>
    </div>
  );
}
