import { describe, expect, it } from 'vitest';
import { justifiedLayout } from './justified-layout';

describe('justifiedLayout', () => {
  const options = { containerWidth: 1000, rowHeight: 200, spacing: 4 };

  it('fills full rows exactly and keeps aspect ratios', () => {
    const ratios = Array.from({ length: 40 }, (_, i) => [4 / 3, 3 / 4, 16 / 9, 1][i % 4]);
    const { boxes, width, height } = justifiedLayout(ratios, options);

    const rows = new Map<number, typeof boxes>();
    for (const box of boxes) {
      rows.set(box.top, [...(rows.get(box.top) ?? []), box]);
    }
    const rowList = [...rows.values()];
    for (const row of rowList.slice(0, -1)) {
      const last = row[row.length - 1];
      expect(last.left + last.width).toBeCloseTo(1000, 5);
    }
    boxes.forEach((box, i) => expect(box.width / box.height).toBeCloseTo(ratios[i], 5));
    expect(width).toBeCloseTo(1000, 5);
    const lastBox = boxes[boxes.length - 1];
    expect(height).toBeCloseTo(lastBox.top + lastBox.height, 5);
  });

  it('does not stretch a short last row', () => {
    const { boxes, width, height } = justifiedLayout([1, 1], options);
    expect(boxes.map((box) => box.height)).toEqual([200, 200]);
    expect(width).toBe(404);
    expect(height).toBe(200);
  });

  it('shrinks a single panorama wider than the container', () => {
    const { boxes } = justifiedLayout([10], options);
    expect(boxes[0].width).toBeCloseTo(1000, 5);
    expect(boxes[0].height).toBeCloseTo(100, 5);
  });

  it('handles empty input', () => {
    expect(justifiedLayout([], options)).toEqual({ boxes: [], width: 0, height: 0 });
  });
});
