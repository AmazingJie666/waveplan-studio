import { AccessPoint, FloorLevel, Point2D, WallSegment, WeakCurrentBox } from '../types/wifi';

/**
 * Checks if segment AB intersects segment CD in 2D.
 * Returns parameter t along AB in [0, 1] and |sin(theta)| of crossing angle for oblique wall thickness correction.
 */
export function intersectSegments(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): { hit: boolean; t: number; sinTheta: number } {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;

  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-8) {
    return { hit: false, t: 0, sinTheta: 1 };
  }

  const qpX = cx - ax;
  const qpY = cy - ay;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;

  if (t > 0.008 && t < 0.992 && u >= -0.001 && u <= 1.001) {
    const lenR = Math.hypot(rX, rY);
    const lenS = Math.hypot(sX, sY);
    const sinTheta = lenR > 1e-6 && lenS > 1e-6 ? Math.abs(denom) / (lenR * lenS) : 1;
    return { hit: true, t, sinTheta };
  }

  return { hit: false, t: 0, sinTheta: 1 };
}

/**
 * Even-odd point-in-polygon check.
 */
export function pointInPolygon(x: number, y: number, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Projects point (px, py) onto segment (x1,y1)-(x2,y2).
 */
export function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; dist: number; t: number; nx: number; ny: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return { x: x1, y: y1, dist: Math.hypot(px - x1, py - y1), t: 0, nx: 0, ny: 1 };
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const dist = Math.hypot(px - cx, py - cy);

  // Normal pointing towards (px, py)
  const len = Math.sqrt(lenSq);
  let nx = -dy / len;
  let ny = dx / len;
  if ((px - cx) * nx + (py - cy) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: cx, y: cy, dist, t, nx, ny };
}

/**
 * Computes effective bounding box and indoor footprint polygon of a floor.
 * If footprint is empty (user started drawing custom walls from scratch), derives a bounding polygon from walls/bgImage.
 */
export function getFloorBoundsAndFootprint(floor: FloorLevel): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  footprint: Point2D[];
} {
  if (floor.footprint && floor.footprint.length >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of floor.footprint) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    for (const w of floor.walls) {
      minX = Math.min(minX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxX = Math.max(maxX, w.x1, w.x2);
      maxY = Math.max(maxY, w.y1, w.y2);
    }
    return { minX, minY, maxX, maxY, footprint: floor.footprint };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of floor.walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }

  if (!Number.isFinite(minX)) {
    if (floor.bgImage) {
      minX = floor.bgImage.offsetX;
      minY = floor.bgImage.offsetY;
      maxX = floor.bgImage.offsetX + floor.bgImage.widthPx / floor.bgImage.pixelsPerMeter;
      maxY = floor.bgImage.offsetY + floor.bgImage.heightPx / floor.bgImage.pixelsPerMeter;
    } else {
      minX = 0;
      minY = 0;
      maxX = 12;
      maxY = 10;
    }
  }

  const pad = 0.05;
  const fallbackPoly: Point2D[] = [
    { x: minX - pad, y: minY - pad },
    { x: maxX + pad, y: minY - pad },
    { x: maxX + pad, y: maxY + pad },
    { x: minX - pad, y: maxY + pad },
  ];
  return { minX, minY, maxX, maxY, footprint: fallbackPoly };
}

/**
 * Computes floor elevation Z base map sorted by levelIndex.
 */
export function computeFloorElevations(floors: FloorLevel[]): Map<string, { zBase: number; zTop: number; index: number }> {
  const sorted = [...floors].sort((a, b) => a.levelIndex - b.levelIndex);
  const map = new Map<string, { zBase: number; zTop: number; index: number }>();
  let zCursor = 0;
  sorted.forEach((f, idx) => {
    map.set(f.id, { zBase: zCursor, zTop: zCursor + f.heightMeters, index: idx });
    zCursor += f.heightMeters;
  });
  return map;
}

/**
 * Estimates realistic Manhattan conduit cable run length (in meters) from WeakCurrentBox to an AP,
 * including vertical floor riser + ceiling/floor conduit + 1.8m termination slack.
 */
export function estimateApCableRun(
  weakBox: WeakCurrentBox,
  ap: AccessPoint,
  floors: FloorLevel[]
): { lengthMeters: number; path2D: Point2D[]; isCrossFloor: boolean } {
  if (!ap.wiredBackhaul && ap.type !== 'router_main') {
    return { lengthMeters: 0, path2D: [], isCrossFloor: false };
  }

  const elevMap = computeFloorElevations(floors);
  const boxElev = elevMap.get(weakBox.floorId)?.zBase ?? 0;
  const apElev = elevMap.get(ap.floorId)?.zBase ?? 0;
  const verticalRise = Math.abs(apElev - boxElev) + ap.mountHeightM;

  // Manhattan orthogonal path on target floor from vertical riser (weakBox.x, weakBox.y) to (ap.x, ap.y)
  const horizManhattan = Math.abs(ap.x - weakBox.x) + Math.abs(ap.y - weakBox.y);
  const slack = 1.8; // wall-conduit bends + patch termination slack
  const lengthMeters = Math.round((verticalRise + horizManhattan + slack) * 10) / 10;

  const midCorner: Point2D = { x: ap.x, y: weakBox.y };
  const path2D: Point2D[] = [
    { x: weakBox.x, y: weakBox.y },
    midCorner,
    { x: ap.x, y: ap.y },
  ];

  return {
    lengthMeters,
    path2D,
    isCrossFloor: weakBox.floorId !== ap.floorId,
  };
}

/**
 * Snaps a candidate point onto the nearest eligible wall for 86-panel AP placement.
 */
export function snapPanelApToNearestWall(
  x: number,
  y: number,
  walls: WallSegment[],
  maxDist = 1.2
): { x: number; y: number; azimuthDeg: number; snapped: boolean } {
  let bestDist = maxDist;
  let bestX = x;
  let bestY = y;
  let bestAzimuth = 0;
  let found = false;

  for (const w of walls) {
    if (w.material === 'glass') continue;
    const proj = closestPointOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      // Offset 8cm into the room from the wall centerline so rays into the room don't clip the mounting wall
      bestX = proj.x + proj.nx * 0.08;
      bestY = proj.y + proj.ny * 0.08;
      bestAzimuth = Math.round((Math.atan2(proj.ny, proj.nx) * 180) / Math.PI);
      found = true;
    }
  }

  return { x: bestX, y: bestY, azimuthDeg: bestAzimuth, snapped: found };
}

/**
 * Finds the nearest room to a point, strongly preferring rooms on the SAME side of walls
 * (0 wall crossings between point and room label) so a living-room AP isn't mislabeled as "Master Bath".
 */
export function findNearestRoomWallAware(
  x: number,
  y: number,
  floor: FloorLevel | undefined
): { roomName: string; dist: number; sameRoom: boolean } | null {
  if (!floor || floor.rooms.length === 0) return null;

  let bestScore = Infinity;
  let bestRoom = floor.rooms[0];
  let bestDist = Infinity;
  let bestSameRoom = true;

  for (const r of floor.rooms) {
    const d = Math.hypot(x - r.x, y - r.y);
    let wallCrossings = 0;
    for (const w of floor.walls) {
      if (intersectSegments(x, y, r.x, r.y, w.x1, w.y1, w.x2, w.y2).hit) {
        wallCrossings++;
      }
    }
    // Heavily penalize crossing solid walls so same-room match always wins
    const penalizedDist = d + wallCrossings * 6.5;
    if (penalizedDist < bestScore) {
      bestScore = penalizedDist;
      bestRoom = r;
      bestDist = d;
      bestSameRoom = wallCrossings === 0;
    }
  }

  return {
    roomName: bestRoom.name,
    dist: bestDist,
    sameRoom: bestSameRoom,
  };
}

/**
 * Computes distances from an AP to the nearest horizontal and vertical walls
 * for bare-concrete construction site tape-measure positioning.
 */
export function computeTapeMeasureRefs(
  x: number,
  y: number,
  walls: WallSegment[]
): { horizDistM: number; horizDir: string; vertDistM: number; vertDir: string } | null {
  if (walls.length === 0) return null;

  let minHoriz = Infinity;
  let horizDir = '最近墙体';
  let minVert = Infinity;
  let vertDir = '最近墙体';

  for (const w of walls) {
    const proj = closestPointOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    const dx = proj.x - x;
    const dy = proj.y - y;
    const isWallMostlyVertical = Math.abs(w.y2 - w.y1) >= Math.abs(w.x2 - w.x1);

    if (isWallMostlyVertical && proj.dist < minHoriz) {
      minHoriz = proj.dist;
      horizDir = dx >= 0 ? '东(右)墙' : '西(左)墙';
    } else if (!isWallMostlyVertical && proj.dist < minVert) {
      minVert = proj.dist;
      vertDir = dy >= 0 ? '南(下)墙' : '北(上)墙';
    }
  }

  if (!Number.isFinite(minHoriz) && !Number.isFinite(minVert)) return null;

  return {
    horizDistM: Number.isFinite(minHoriz) ? Math.round(minHoriz * 100) / 100 : 0,
    horizDir,
    vertDistM: Number.isFinite(minVert) ? Math.round(minVert * 100) / 100 : 0,
    vertDir,
  };
}
