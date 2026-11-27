import { Point2D, WallSegment } from '../types/wifi';

export interface ExtractedFloorplanResult {
  walls: WallSegment[];
  footprint: Point2D[];
}

/**
 * Pure client-side architectural floorplan wall-line extractor (zero API cost).
 * Works on typical black-and-white / grayscale real-estate floorplan JPG/PNGs:
 *  1. Downscales to analysis resolution (~420px max dimension).
 *  2. Uses adaptive darkness thresholding + 3x3 density filtering to keep thick structural wall strokes
 *     while suppressing thin dimension lines, text labels, and furniture icons.
 *  3. Extracts horizontal and vertical structural wall runs, merges collinear gaps (doors/windows),
 *     and converts pixel coordinates directly into physical meters.
 */
export async function extractWallsFromFloorplanImage(
  dataUrl: string,
  pixelsPerMeter: number,
  offsetX: number,
  offsetY: number,
  sensitivity: 'strict' | 'balanced' | 'sensitive' = 'balanced'
): Promise<ExtractedFloorplanResult> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(32, Math.round(img.width * scale));
  const h = Math.max(32, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  let sumLum = 0;
  for (let i = 0; i < w * h; i++) {
    const lum = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    gray[i] = lum;
    sumLum += lum;
  }
  const meanLum = sumLum / (w * h);

  // Dark stroke mask
  const lumCutoff =
    sensitivity === 'strict'
      ? Math.min(115, meanLum * 0.52)
      : sensitivity === 'balanced'
      ? Math.min(145, meanLum * 0.65)
      : Math.min(175, meanLum * 0.76);

  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    dark[i] = gray[i] < lumCutoff ? 1 : 0;
  }

  // 3x3 morphological density filter to discard 1px hairline dimension lines & text noise
  const minNeighbors = sensitivity === 'sensitive' ? 3 : 4;
  const thick = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!dark[y * w + x]) continue;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          cnt += dark[(y + dy) * w + (x + dx)];
        }
      }
      if (cnt >= minNeighbors) thick[y * w + x] = 1;
    }
  }

  const effectivePpm = pixelsPerMeter * scale;
  const minWallLenPx = Math.max(12, Math.round(0.75 * effectivePpm)); // ignore runs shorter than 0.75m
  const mergeBandPx = Math.max(4, Math.round(0.28 * effectivePpm));

  interface RawSeg {
    fixed: number;
    start: number;
    end: number;
    thickScore: number;
  }

  // Scan horizontal runs
  const rawHoriz: RawSeg[] = [];
  for (let y = 2; y < h - 2; y++) {
    let runStart = -1;
    let gap = 0;
    for (let x = 2; x < w - 2; x++) {
      const on = thick[y * w + x] === 1;
      if (on) {
        if (runStart < 0) runStart = x;
        gap = 0;
      } else if (runStart >= 0) {
        gap++;
        if (gap > 3) {
          const runEnd = x - gap;
          if (runEnd - runStart >= minWallLenPx) {
            rawHoriz.push({ fixed: y, start: runStart, end: runEnd, thickScore: 1 });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (runStart >= 0 && w - 3 - runStart >= minWallLenPx) {
      rawHoriz.push({ fixed: y, start: runStart, end: w - 3, thickScore: 1 });
    }
  }

  // Scan vertical runs
  const rawVert: RawSeg[] = [];
  for (let x = 2; x < w - 2; x++) {
    let runStart = -1;
    let gap = 0;
    for (let y = 2; y < h - 2; y++) {
      const on = thick[y * w + x] === 1;
      if (on) {
        if (runStart < 0) runStart = y;
        gap = 0;
      } else if (runStart >= 0) {
        gap++;
        if (gap > 3) {
          const runEnd = y - gap;
          if (runEnd - runStart >= minWallLenPx) {
            rawVert.push({ fixed: x, start: runStart, end: runEnd, thickScore: 1 });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (runStart >= 0 && h - 3 - runStart >= minWallLenPx) {
      rawVert.push({ fixed: x, start: runStart, end: h - 3, thickScore: 1 });
    }
  }

  // Cluster parallel adjacent scanline runs into single architectural wall centerlines
  const clusterRuns = (runs: RawSeg[]): RawSeg[] => {
    const sorted = [...runs].sort((a, b) => a.fixed - b.fixed || a.start - b.start);
    const clusters: { sumFixed: number; count: number; start: number; end: number }[] = [];

    for (const r of sorted) {
      let merged = false;
      for (const c of clusters) {
        const avgFixed = c.sumFixed / c.count;
        const overlap = Math.min(c.end, r.end) - Math.max(c.start, r.start);
        if (Math.abs(r.fixed - avgFixed) <= mergeBandPx && overlap >= -mergeBandPx) {
          c.sumFixed += r.fixed;
          c.count += 1;
          c.start = Math.min(c.start, r.start);
          c.end = Math.max(c.end, r.end);
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({ sumFixed: r.fixed, count: 1, start: r.start, end: r.end });
      }
    }

    return clusters.map((c) => ({
      fixed: Math.round(c.sumFixed / c.count),
      start: c.start,
      end: c.end,
      thickScore: c.count,
    }));
  };

  const mergedH = clusterRuns(rawHoriz);
  const mergedV = clusterRuns(rawVert);

  const toMeterX = (px: number) => Math.round((offsetX + px / effectivePpm) * 20) / 20;
  const toMeterY = (py: number) => Math.round((offsetY + py / effectivePpm) * 20) / 20;

  const walls: WallSegment[] = [];
  let seq = 1;

  for (const seg of mergedH.slice(0, 45)) {
    walls.push({
      id: `ext-h-${seq++}`,
      x1: toMeterX(seg.start),
      y1: toMeterY(seg.fixed),
      x2: toMeterX(seg.end),
      y2: toMeterY(seg.fixed),
      material: seg.thickScore >= 4 ? 'concrete' : 'brick',
    });
  }
  for (const seg of mergedV.slice(0, 45)) {
    walls.push({
      id: `ext-v-${seq++}`,
      x1: toMeterX(seg.fixed),
      y1: toMeterY(seg.start),
      x2: toMeterX(seg.fixed),
      y2: toMeterY(seg.end),
      material: seg.thickScore >= 4 ? 'concrete' : 'brick',
    });
  }

  // Derive outer bounding footprint from detected walls (or fallback to 85% inner image frame)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wl of walls) {
    minX = Math.min(minX, wl.x1, wl.x2);
    minY = Math.min(minY, wl.y1, wl.y2);
    maxX = Math.max(maxX, wl.x1, wl.x2);
    maxY = Math.max(maxY, wl.y1, wl.y2);
  }

  if (!Number.isFinite(minX)) {
    const fullW = img.width / pixelsPerMeter;
    const fullH = img.height / pixelsPerMeter;
    minX = offsetX + fullW * 0.08;
    minY = offsetY + fullH * 0.08;
    maxX = offsetX + fullW * 0.92;
    maxY = offsetY + fullH * 0.92;
  }

  const footprint: Point2D[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  return { walls, footprint };
}
