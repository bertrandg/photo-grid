import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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

const ZOOM = 2.5;

/**
 * Full screen viewer. ←/→ walk the whole timeline, loading neighbour months on demand.
 * Click on the photo zooms in on that spot, click again zooms out. While zoomed, the
 * pointer position drives the framing: pointer on the left edge shows the left edge
 * of the photo, and so on.
 */
export function AssetViewer({ manager, asset, onNavigate, onClose }: Props) {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const zoomed = zoomedId === asset.id;
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  /** Pointer position inside the stage, 0..1 on each axis. */
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const preview = manager.api.getPreviewUrl(asset);
  const thumbnail = manager.api.getThumbnailUrl(asset);

  /** Size of the letterboxed photo when not zoomed. */
  const fittedSize = useCallback(
    (rect: DOMRect) => {
      const width = Math.min(rect.width, rect.height * asset.ratio);
      return { width, height: width / asset.ratio };
    },
    [asset.ratio],
  );

  // Pan is applied straight to the DOM: no React render on every pointer move.
  const applyTransform = useCallback(() => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    if (!stage || !layer) {
      return;
    }
    if (!zoomed) {
      layer.style.transform = '';
      return;
    }
    const rect = stage.getBoundingClientRect();
    const { width, height } = fittedSize(rect);
    const rangeX = Math.max(0, (width * ZOOM - rect.width) / 2);
    const rangeY = Math.max(0, (height * ZOOM - rect.height) / 2);
    const x = (0.5 - pointer.current.x) * 2 * rangeX;
    const y = (0.5 - pointer.current.y) * 2 * rangeY;
    layer.style.transform = `translate(${x}px, ${y}px) scale(${ZOOM})`;
  }, [zoomed, fittedSize]);

  useLayoutEffect(applyTransform, [applyTransform]);

  const toggleZoom = (next: boolean) => {
    // Animate the zoom in/out itself, but follow the pointer instantly afterwards.
    layerRef.current?.classList.add('animating');
    setZoomedId(next ? asset.id : null);
  };

  const isOnPhoto = (rect: DOMRect, clientX: number, clientY: number) => {
    const { width, height } = fittedSize(rect);
    return (
      Math.abs(clientX - (rect.left + rect.width / 2)) <= width / 2 &&
      Math.abs(clientY - (rect.top + rect.height / 2)) <= height / 2
    );
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    event.currentTarget.style.cursor = zoomed
      ? 'zoom-out'
      : isOnPhoto(rect, event.clientX, event.clientY)
        ? 'zoom-in'
        : '';
    if (zoomed) {
      applyTransform();
    }
  };

  const onStageClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (zoomed) {
      toggleZoom(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (!isOnPhoto(rect, event.clientX, event.clientY)) {
      onClose();
      return;
    }
    pointer.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    event.currentTarget.style.cursor = 'zoom-out';
    toggleZoom(true);
  };

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
        if (zoomed) {
          setZoomedId(null);
        } else {
          onClose();
        }
      } else if (event.key === 'ArrowRight') {
        void go(1);
      } else if (event.key === 'ArrowLeft') {
        void go(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, onClose, zoomed]);

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
      <div
        ref={stageRef}
        className={`viewer-stage${zoomed ? ' zoomed' : ''}`}
        onClick={onStageClick}
        onPointerMove={onPointerMove}
      >
        <div
          ref={layerRef}
          className="viewer-zoom"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget) {
              event.currentTarget.classList.remove('animating');
            }
          }}
        >
          {/* Low-res thumbnail (already in the browser cache) shown until the preview is loaded. */}
          {thumbnail && loadedId !== asset.id && <img className="viewer-image viewer-thumb" src={thumbnail} alt="" />}
          {preview ? (
            <img
              key={asset.id}
              className={`viewer-image${loadedId === asset.id ? ' loaded' : ''}`}
              src={preview}
              alt=""
              onLoad={() => setLoadedId(asset.id)}
              draggable={false}
            />
          ) : (
            <div
              className="viewer-image viewer-placeholder loaded"
              style={{ aspectRatio: String(asset.ratio), backgroundColor: asset.color ?? '#333' }}
            />
          )}
        </div>
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
