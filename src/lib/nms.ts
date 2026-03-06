import { BoundingBox } from '../types';

export function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  const x1 = Math.max(box1.xmin, box2.xmin);
  const y1 = Math.max(box1.ymin, box2.ymin);
  const x2 = Math.min(box1.xmax, box2.xmax);
  const y2 = Math.min(box1.ymax, box2.ymax);

  if (x2 < x1 || y2 < y1) return 0.0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = (box1.xmax - box1.xmin) * (box1.ymax - box1.ymin);
  const area2 = (box2.xmax - box2.xmin) * (box2.ymax - box2.ymin);

  return intersection / (area1 + area2 - intersection);
}

export function nonMaxSuppression(boxes: BoundingBox[], iouThreshold: number): BoundingBox[] {
  if (boxes.length === 0) return [];

  // Sort by confidence descending
  const sortedBoxes = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const selectedBoxes: BoundingBox[] = [];

  while (sortedBoxes.length > 0) {
    const current = sortedBoxes.shift()!;
    selectedBoxes.push(current);

    for (let i = sortedBoxes.length - 1; i >= 0; i--) {
      const other = sortedBoxes[i];
      if (calculateIoU(current, other) > iouThreshold) {
        sortedBoxes.splice(i, 1);
      }
    }
  }

  return selectedBoxes;
}
