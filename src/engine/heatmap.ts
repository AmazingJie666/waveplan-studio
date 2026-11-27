import { AP_SPECS, DEMAND_SPECS, rssiToRgba } from '../constants/specs';
import {
  AccessPoint,
  BandMode,
  DemandEvalItem,
  DemandPin,
  FloorHeatmapData,
  FloorLevel,
  NetworkEvaluation,
  WeakCurrentBox,
} from '../types/wifi';
import { estimateApCableRun, getFloorBoundsAndFootprint, pointInPolygon } from './geometry';
import {
  buildElevationCache,
  computeSingleApRssi,
  computeWirelessMeshPenalties,
  FloorElevationCache,
  samplePointSignal,
} from './rfModel';

export type { FloorHeatmapData } from '../types/wifi';

export interface IsoSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  threshold: number;
}

/**
 * Computes signal grid for a single floor at configurable meter resolution (`stepM`).
 */
export function computeFloorHeatmap(
  floor: FloorLevel,
  aps: AccessPoint[],
  bandMode: BandMode,
  cache: FloorElevationCache,
  meshPenalties: Map<string, number>,
  stepM = 0.22
): FloorHeatmapData {
  const { minX, minY, maxX, maxY, footprint } = getFloorBoundsAndFootprint(floor);
  const pad = 0.25;
  const gx0 = minX - pad;
  const gy0 = minY - pad;
  const gx1 = maxX + pad;
  const gy1 = maxY + pad;

  const cols = Math.max(8, Math.min(180, Math.ceil((gx1 - gx0) / stepM)));
  const rows = Math.max(8, Math.min(180, Math.ceil((gy1 - gy0) / stepM)));
  const actualStepX = (gx1 - gx0) / cols;
  const actualStepY = (gy1 - gy0) / rows;

  const total = cols * rows;
  const rssiGrid = new Float32Array(total);
  const rssi5Grid = new Float32Array(total);
  const rssi24Grid = new Float32Array(total);
  const indoorMask = new Uint8Array(total);

  const activeAps = aps.filter((a) => a.enabled);

  let indoorCells = 0;
  let above60Cells = 0;
  let above67Cells = 0;
  let deadCells = 0;

  for (let r = 0; r < rows; r++) {
    const py = gy0 + (r + 0.5) * actualStepY;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const px = gx0 + (c + 0.5) * actualStepX;

      // Exclude double-height void air-gap from standing-floor coverage metrics, though still render faint field
      const insideFootprint = pointInPolygon(px, py, footprint);
      let insideVoid = false;
      if (insideFootprint && floor.voids.length > 0) {
        for (const v of floor.voids) {
          if (v.kind === 'void' && pointInPolygon(px, py, v.points)) {
            insideVoid = true;
            break;
          }
        }
      }

      if (!insideFootprint) {
        indoorMask[idx] = 0;
        rssiGrid[idx] = Number.NaN;
        rssi5Grid[idx] = Number.NaN;
        rssi24Grid[idx] = Number.NaN;
        continue;
      }

      indoorMask[idx] = insideVoid ? 2 : 1; // 1 = walkable indoor floor, 2 = double-height void air space

      if (activeAps.length === 0) {
        rssiGrid[idx] = -95;
        rssi5Grid[idx] = -95;
        rssi24Grid[idx] = -95;
        if (!insideVoid) {
          indoorCells++;
          deadCells++;
        }
        continue;
      }

      let best5 = -110;
      let best24 = -110;
      for (let i = 0; i < activeAps.length; i++) {
        const ap = activeAps[i];
        const pen = meshPenalties.get(ap.id) ?? 0;
        const sig = computeSingleApRssi(ap, px, py, floor.id, cache, 1.1, pen);
        if (sig.rssi5 > best5) best5 = sig.rssi5;
        if (sig.rssi24 > best24) best24 = sig.rssi24;
      }

      const display =
        bandMode === '5ghz'
          ? best5
          : bandMode === '2.4ghz'
          ? best24
          : best5 >= -68
          ? best5
          : Math.max(best5, best24 - 5.5);

      rssi5Grid[idx] = best5;
      rssi24Grid[idx] = best24;
      rssiGrid[idx] = display;

      if (!insideVoid) {
        indoorCells++;
        if (display >= -60) above60Cells++;
        if (display >= -67) above67Cells++;
        if (display < -75) deadCells++;
      }
    }
  }

  return {
    floorId: floor.id,
    cols,
    rows,
    minX: gx0,
    minY: gy0,
    maxX: gx1,
    maxY: gy1,
    stepM,
    rssiGrid,
    rssi5Grid,
    rssi24Grid,
    indoorMask,
    indoorCells,
    above60Cells,
    above67Cells,
    deadCells,
  };
}

/**
 * Renders a smooth bilinear-upscaled HTMLCanvasElement from `FloorHeatmapData`.
 * Used both as fast 2D blueprint overlay and as a dynamic Three.js floor texture.
 */
export function renderHeatmapToCanvas(
  hm: FloorHeatmapData,
  scaleFactor = 4,
  alphaScale = 0.72
): HTMLCanvasElement {
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = hm.cols;
  rawCanvas.height = hm.rows;
  const rawCtx = rawCanvas.getContext('2d')!;
  const imgData = rawCtx.createImageData(hm.cols, hm.rows);
  const data = imgData.data;

  for (let i = 0; i < hm.rssiGrid.length; i++) {
    const mask = hm.indoorMask[i];
    if (mask === 0) continue;
    // Double-height void air space rendered much lighter so user clearly sees the open void
    const localAlpha = mask === 2 ? alphaScale * 0.28 : alphaScale;
    const [r, g, b, a] = rssiToRgba(hm.rssiGrid[i], localAlpha);
    const p = i * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = a;
  }
  rawCtx.putImageData(imgData, 0, 0);

  if (scaleFactor <= 1) return rawCanvas;

  const smoothCanvas = document.createElement('canvas');
  smoothCanvas.width = hm.cols * scaleFactor;
  smoothCanvas.height = hm.rows * scaleFactor;
  const sCtx = smoothCanvas.getContext('2d')!;
  sCtx.imageSmoothingEnabled = true;
  sCtx.imageSmoothingQuality = 'high';
  sCtx.drawImage(rawCanvas, 0, 0, smoothCanvas.width, smoothCanvas.height);
  return smoothCanvas;
}

/**
 * Extracts crisp iso-RSSI contour line segments (e.g. -55 dBm, -67 dBm, -75 dBm) via Marching Squares.
 */
export function extractIsoContours(
  hm: FloorHeatmapData,
  thresholds = [-58, -67, -75]
): IsoSegment[] {
  const segments: IsoSegment[] = [];
  const dx = (hm.maxX - hm.minX) / hm.cols;
  const dy = (hm.maxY - hm.minY) / hm.rows;

  const interp = (v1: number, v2: number, iso: number) => {
    const d = v2 - v1;
    if (Math.abs(d) < 1e-5) return 0.5;
    return Math.max(0, Math.min(1, (iso - v1) / d));
  };

  for (const iso of thresholds) {
    for (let r = 0; r < hm.rows - 1; r++) {
      for (let c = 0; c < hm.cols - 1; c++) {
        const i00 = r * hm.cols + c;
        const i10 = i00 + 1;
        const i01 = (r + 1) * hm.cols + c;
        const i11 = i01 + 1;

        if (
          hm.indoorMask[i00] === 0 ||
          hm.indoorMask[i10] === 0 ||
          hm.indoorMask[i01] === 0 ||
          hm.indoorMask[i11] === 0
        ) {
          continue;
        }

        const v00 = hm.rssiGrid[i00];
        const v10 = hm.rssiGrid[i10];
        const v11 = hm.rssiGrid[i11];
        const v01 = hm.rssiGrid[i01];

        let state = 0;
        if (v00 >= iso) state |= 8;
        if (v10 >= iso) state |= 4;
        if (v11 >= iso) state |= 2;
        if (v01 >= iso) state |= 1;

        if (state === 0 || state === 15) continue;

        const x0 = hm.minX + (c + 0.5) * dx;
        const x1 = hm.minX + (c + 1.5) * dx;
        const y0 = hm.minY + (r + 0.5) * dy;
        const y1 = hm.minY + (r + 1.5) * dy;

        const top: [number, number] = [x0 + interp(v00, v10, iso) * dx, y0];
        const right: [number, number] = [x1, y0 + interp(v10, v11, iso) * dy];
        const bottom: [number, number] = [x0 + interp(v01, v11, iso) * dx, y1];
        const left: [number, number] = [x0, y0 + interp(v00, v01, iso) * dy];

        const addSeg = (pA: [number, number], pB: [number, number]) => {
          segments.push({ x1: pA[0], y1: pA[1], x2: pB[0], y2: pB[1], threshold: iso });
        };

        switch (state) {
          case 1:
          case 14:
            addSeg(left, bottom);
            break;
          case 2:
          case 13:
            addSeg(bottom, right);
            break;
          case 3:
          case 12:
            addSeg(left, right);
            break;
          case 4:
          case 11:
            addSeg(top, right);
            break;
          case 5:
            addSeg(left, top);
            addSeg(bottom, right);
            break;
          case 6:
          case 9:
            addSeg(top, bottom);
            break;
          case 7:
          case 8:
            addSeg(left, top);
            break;
          case 10:
            addSeg(top, right);
            addSeg(left, bottom);
            break;
        }
      }
    }
  }
  return segments;
}

/**
 * Evaluates overall whole-home weighted demand satisfaction, floor coverage, wiring budget, and actionable renovation advice.
 */
export function evaluateNetwork(
  floors: FloorLevel[],
  aps: AccessPoint[],
  demands: DemandPin[],
  weakBox: WeakCurrentBox,
  bandMode: BandMode,
  heatmaps?: Map<string, FloorHeatmapData>,
  lang: 'zh' | 'en' = 'zh'
): NetworkEvaluation {
  const cache = buildElevationCache(floors);
  const meshPenalties = computeWirelessMeshPenalties(aps, cache);

  // 1. Evaluate Demand Pins
  const demandResults: DemandEvalItem[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const pin of demands) {
    const spec = DEMAND_SPECS[pin.category];
    const fl = floors.find((f) => f.id === pin.floorId);
    const detail = samplePointSignal(
      pin.x,
      pin.y,
      pin.floorId,
      aps,
      spec.preferBand === '5ghz' ? '5ghz' : spec.preferBand === '2.4ghz' ? '2.4ghz' : 'dual',
      cache,
      meshPenalties
    );

    const targetDbm = spec.preferBand === '2.4ghz' ? spec.target24dBm : spec.target5dBm;
    const actualDbm =
      spec.preferBand === '5ghz'
        ? detail.rssi5
        : spec.preferBand === '2.4ghz'
        ? detail.rssi24
        : Math.max(detail.rssi5, detail.rssi24 - 4);

    const delta = actualDbm - targetDbm;
    // Smooth utility curve: >= target gets 0.92~1.0; slightly below tapers smoothly; <-76 drops near 0
    let sat = 1.0;
    if (delta >= 4) {
      sat = 1.0;
    } else if (delta >= 0) {
      sat = 0.92 + (delta / 4) * 0.08;
    } else if (delta >= -12) {
      sat = Math.max(0.1, 0.92 * Math.pow((delta + 12) / 12, 1.55));
    } else {
      sat = Math.max(0, 0.1 + (delta + 12) * 0.01);
    }

    demandResults.push({
      pin,
      floorName: fl?.name ?? '1F',
      detail,
      targetDbm,
      actualDbm,
      passed: actualDbm >= targetDbm,
      satisfaction01: sat,
    });

    weightedSum += spec.weight * sat;
    totalWeight += spec.weight;
  }

  // 2. Aggregate Floor Coverage Metrics
  let allIndoor = 0;
  let allAbove60 = 0;
  let allAbove67 = 0;
  let allDead = 0;
  const floorStats: NetworkEvaluation['floorStats'] = [];

  for (const fl of floors) {
    const hm =
      heatmaps?.get(fl.id) ??
      computeFloorHeatmap(fl, aps, bandMode, cache, meshPenalties, 0.35);

    allIndoor += hm.indoorCells;
    allAbove60 += hm.above60Cells;
    allAbove67 += hm.above67Cells;
    allDead += hm.deadCells;

    let sumRssi = 0;
    let cnt = 0;
    for (let i = 0; i < hm.rssiGrid.length; i++) {
      if (hm.indoorMask[i] === 1 && !Number.isNaN(hm.rssiGrid[i])) {
        sumRssi += hm.rssiGrid[i];
        cnt++;
      }
    }

    floorStats.push({
      floorId: fl.id,
      floorName: fl.name,
      goodCoveragePct: hm.indoorCells > 0 ? Math.round((hm.above67Cells / hm.indoorCells) * 100) : 0,
      deadZonePct: hm.indoorCells > 0 ? Math.round((hm.deadCells / hm.indoorCells) * 100) : 0,
      avgRssi: cnt > 0 ? Math.round((sumRssi / cnt) * 10) / 10 : -95,
    });
  }

  const coverageExcellentPct = allIndoor > 0 ? Math.round((allAbove60 / allIndoor) * 100) : 0;
  const coverageGoodPct = allIndoor > 0 ? Math.round((allAbove67 / allIndoor) * 100) : 0;
  const deadZonePct = allIndoor > 0 ? Math.round((allDead / allIndoor) * 100) : 100;
  const demandSatisfactionPct =
    totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : coverageGoodPct;

  // Overall composite score: 62% weighted key-demand satisfaction + 28% whole-home >= -67dBm coverage - dead-zone penalty
  const rawScore =
    demandSatisfactionPct * 0.62 + coverageGoodPct * 0.38 - deadZonePct * 0.45;
  const overallScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // 3. Hardware & Cable Length Budget
  const activeAps = aps.filter((a) => a.enabled);
  let totalCableMeters = 0;
  let estimatedHardwareRmb = 0;
  let poeCount = 0;

  for (const ap of activeAps) {
    const spec = AP_SPECS[ap.type];
    estimatedHardwareRmb += spec.unitPriceRmb;
    if (spec.poeRequired) poeCount++;
    const run = estimateApCableRun(weakBox, ap, floors);
    totalCableMeters += run.lengthMeters;
  }
  if (poeCount > 0) {
    // PoE AC gateway/switch cost (~399 RMB for 5/8-port PoE一体机)
    estimatedHardwareRmb += poeCount <= 4 ? 380 : 580;
  }
  totalCableMeters = Math.round(totalCableMeters);

  // 4. Smart Renovation Diagnostics
  const diagnostics: NetworkEvaluation['diagnostics'] = [];
  const isZh = lang === 'zh';

  if (activeAps.length === 0) {
    diagnostics.push({
      level: 'error',
      title: isZh ? '尚未放置任何网络设备' : 'No Network Devices Placed',
      detail: isZh
        ? '可在左侧工具栏手动添加路由器/AP，或直接在右侧点击「一键计算最优布点」。'
        : 'Add a router/AP from the left dock or run Auto-Optimize on the right.',
    });
  } else {
    const failedCritical = demandResults.filter(
      (d) => !d.passed && (d.pin.category === 'critical' || d.pin.category === 'high')
    );
    if (failedCritical.length > 0) {
      diagnostics.push({
        level: 'warning',
        title: isZh
          ? `${failedCritical.length} 个核心用网区域未达理想阈值`
          : `${failedCritical.length} Key Demand Pin(s) Below Target`,
        detail: isZh
          ? `重点关注：${failedCritical.map((f) => `${f.floorName} ${f.pin.label} (${f.actualDbm}dBm)`).join('、')}。建议调整点位或补增 1 个面板 AP。`
          : `Check: ${failedCritical.map((f) => `${f.floorName} ${f.pin.label} (${f.actualDbm}dBm)`).join(', ')}. Reposition or add an In-Wall AP.`,
      });
    } else if (demandResults.length > 0) {
      diagnostics.push({
        level: 'success',
        title: isZh ? '全屋核心需求点 100% 达标' : '100% of Key Demand Pins Satisfied',
        detail: isZh
          ? '所有电竞/办公及主卧客厅高频影音位均满足 5GHz 高速覆盖要求。'
          : 'All gaming, work, and 4K streaming zones meet 5GHz performance targets.',
      });
    }

    const wirelessMeshNodes = activeAps.filter((a) => a.type === 'mesh_node' && !a.wiredBackhaul);
    if (wirelessMeshNodes.length > 0) {
      diagnostics.push({
        level: 'warning',
        title: isZh
          ? `存在 ${wirelessMeshNodes.length} 台无线回程子路由`
          : `${wirelessMeshNodes.length} Wireless-Backhaul Mesh Node(s)`,
        detail: isZh
          ? '装修水电未封槽前，强烈建议从弱电箱补拉超六类网线改为「有线回程」，速率与稳定性可翻倍。'
          : 'Before closing walls, run Cat6 Ethernet from the Weak-Current Box for wired backhaul to double speed & stability.',
      });
    }

    if (floors.length > 1) {
      const uncoveredFloors = floors.filter(
        (fl) => !activeAps.some((ap) => ap.floorId === fl.id)
      );
      if (uncoveredFloors.length > 0) {
        diagnostics.push({
          level: 'info',
          title: isZh
            ? `${uncoveredFloors.map((f) => f.name).join('/')} 未独立部署本层 AP`
            : `${uncoveredFloors.map((f) => f.name).join('/')} Has No Dedicated AP`,
          detail: isZh
            ? '现浇钢筋混凝土楼板对 5GHz 衰减约 22dB，仅靠跨层穿透难以跑满千兆，建议每层至少预留 1 个有线网口。'
            : 'Concrete slabs attenuate 5GHz by ~22dB; reserve at least 1 wired Ethernet drop per floor.',
        });
      }
    }

    for (let i = 0; i < activeAps.length; i++) {
      for (let j = i + 1; j < activeAps.length; j++) {
        const a = activeAps[i];
        const b = activeAps[j];
        if (a.floorId === b.floorId) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 3.2) {
            diagnostics.push({
              level: 'warning',
              title: isZh
                ? `${a.name} 与 ${b.name} 间距过近 (${d.toFixed(1)}m)`
                : `${a.name} & ${b.name} Too Close (${d.toFixed(1)}m)`,
              detail: isZh
                ? '同层两台 AP 距离小于 3.5m 易引发手机「粘滞不漫游」和同频干扰，建议拉开间距或调低发射功率。'
                : 'Same-floor APs <3.5m apart cause sticky clients and interference. Space them out or lower Tx power.',
            });
          } else if (a.channel5 === b.channel5 && d < 8.5) {
            diagnostics.push({
              level: 'info',
              title: isZh
                ? `建议错开 5GHz 信道（当前同为 Ch.${a.channel5}）`
                : `Separate 5GHz Channels (Both on Ch.${a.channel5})`,
              detail: isZh
                ? `将 ${a.name} 与 ${b.name} 分别设为 36/44 与 149/157 频段，可彻底避免同频争抢。`
                : `Assign ${a.name} and ${b.name} to non-overlapping channels (e.g. 36 vs 149).`,
            });
          }
        }
      }
    }
  }

  const roamingScorePct =
    activeAps.length <= 1 ? 95 : Math.min(100, Math.max(55, 100 - deadZonePct));

  return {
    overallScore,
    demandSatisfactionPct,
    coverageExcellentPct,
    coverageGoodPct,
    deadZonePct,
    demandResults,
    floorStats,
    totalCableMeters,
    estimatedHardwareRmb,
    roamingScorePct,
    diagnostics,
  };
}
