/**
 * Justified layout (Google Photos / Flickr style), the role played by
 * @immich/justified-layout-wasm in Immich: rows of thumbnails that keep their
 * aspect ratio and fill the width exactly, except the last row of a group.
 */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  boxes: Box[];
  /** Width actually used (a day with 2 photos is narrower than the viewport). */
  width: number;
  height: number;
}

export interface LayoutOptions {
  containerWidth: number;
  rowHeight: number;
  spacing: number;
  /** A row can't be stretched above rowHeight * maxRowHeightFactor. */
  maxRowHeightFactor?: number;
}

export function justifiedLayout(ratios: ArrayLike<number>, options: LayoutOptions): LayoutResult {
  const { containerWidth, rowHeight, spacing } = options;
  const maxRowHeight = rowHeight * (options.maxRowHeightFactor ?? 1.5);
  const boxes: Box[] = new Array(ratios.length);

  let top = 0;
  let maxWidth = 0;
  let rowStart = 0;
  let rowRatio = 0;

  const placeRow = (start: number, end: number, height: number) => {
    let left = 0;
    for (let i = start; i < end; i++) {
      const width = ratios[i] * height;
      boxes[i] = { top, left, width, height };
      left += width + spacing;
    }
    maxWidth = Math.max(maxWidth, left - spacing);
    top += height + spacing;
  };

  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i];
    rowRatio += ratio;
    const count = i - rowStart + 1;
    const widthAtTarget = rowRatio * rowHeight + spacing * (count - 1);
    if (widthAtTarget < containerWidth) {
      continue;
    }

    // Row is full. Either keep the last item (row gets shorter than the target)
    // or push it to the next row (row gets taller): pick the closest to the target.
    const heightWith = (containerWidth - spacing * (count - 1)) / rowRatio;
    const heightWithout = count > 1 ? (containerWidth - spacing * (count - 2)) / (rowRatio - ratio) : Infinity;
    if (heightWithout <= maxRowHeight && Math.abs(heightWithout - rowHeight) < Math.abs(rowHeight - heightWith)) {
      placeRow(rowStart, i, heightWithout);
      rowStart = i;
      rowRatio = ratio;
    } else {
      placeRow(rowStart, i + 1, heightWith);
      rowStart = i + 1;
      rowRatio = 0;
    }
  }

  if (rowStart < ratios.length) {
    // Last row isn't stretched, unless it would overflow (e.g. a single huge panorama).
    const count = ratios.length - rowStart;
    const height = Math.min(rowHeight, (containerWidth - spacing * (count - 1)) / rowRatio);
    placeRow(rowStart, ratios.length, height);
  }

  return { boxes, width: maxWidth, height: Math.max(0, top - spacing) };
}
