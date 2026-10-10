import { memo, useState } from 'react';
import { thumbHashToDataURL } from 'thumbhash';
import type { TimelineAsset } from '../api/types';
import type { Box } from '../timeline/justified-layout';

const thumbhashCache = new Map<string, string>();

function thumbhashUrl(thumbhash: string) {
  let url = thumbhashCache.get(thumbhash);
  if (!url) {
    const bytes = Uint8Array.from(atob(thumbhash), (char) => char.charCodeAt(0));
    url = thumbHashToDataURL(bytes);
    if (thumbhashCache.size > 5000) {
      thumbhashCache.clear();
    }
    thumbhashCache.set(thumbhash, url);
  }
  return url;
}

function formatDuration(duration: string) {
  const [hours, minutes, seconds] = duration.split(':');
  const s = String(Math.floor(Number(seconds))).padStart(2, '0');
  return Number(hours) > 0 ? `${Number(hours)}:${minutes}:${s}` : `${Number(minutes)}:${s}`;
}

interface Props {
  asset: TimelineAsset;
  box: Box;
  url: string | null;
  showImage: boolean;
  onOpen: (asset: TimelineAsset) => void;
}

export const Thumbnail = memo(function Thumbnail({ asset, box, url, showImage, onOpen }: Props) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = asset.thumbhash ? `url(${thumbhashUrl(asset.thumbhash)})` : undefined;

  return (
    <button
      type="button"
      className="tile"
      style={{
        transform: `translate(${box.left}px, ${box.top}px)`,
        width: box.width,
        height: box.height,
        backgroundColor: asset.color ?? undefined,
        backgroundImage: placeholder,
      }}
      onClick={() => onOpen(asset)}
      aria-label={asset.localDateTime}
    >
      {showImage && url && (
        <img
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          className={loaded ? 'loaded' : undefined}
          onLoad={() => setLoaded(true)}
        />
      )}
      {asset.isVideo && <span className="tile-badge">▶ {asset.duration ? formatDuration(asset.duration) : ''}</span>}
    </button>
  );
});
