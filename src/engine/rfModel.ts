import { AP_SPECS, WALL_MATERIALS } from '../constants/specs';
import {
  AccessPoint,
  BandMode,
  FloorLevel,
  PointSignalDetail,
} from '../types/wifi';
import { computeFloorElevations, intersectSegments, pointInPolygon } from './geometry';

export interface FloorElevationCache {
  sortedFloors: FloorLevel[];
  byId: Map<string, { floor: FloorLevel; zBase: number; zTop: number; order: number }>;
}

export function buildElevationCache(floors: FloorLevel[]): FloorElevationCache {
  const sortedFloors = [...floors].sort((a, b) => a.levelIndex - b.levelIndex);
  const elevs = computeFloorElevations(sortedFloors);
  const byId = new Map<string, { floor: FloorLevel; zBase: number; zTop: number; order: number }>();
  sortedFloors.forEach((f, idx) => {
    const e = elevs.get(f.id)!;
    byId.set(f.id, { floor: f, zBase: e.zBase, zTop: e.zTop, order: idx });
  });
  return { sortedFloors, byId };
}

/**
 * Directional gain bias (in dB) for 86 wall-panel APs vs omnidirectional routers/ceiling APs.
 * Panel APs radiate forward (+2.5 dBi hemisphere) and attenuate behind the wall box (-6.5 dB).
 */
function computeAntennaGainDb(
  ap: AccessPoint,
  rxX: number,
  rxY: number,
  dz: number,
  dist3D: number
): number {
  const spec = AP_SPECS[ap.type];
  if (spec.directional && ap.azimuthDeg !== undefined) {
    const horizDist = Math.hypot(rxX - ap.x, rxY - ap.y);
    if (horizDist < 0.05) return 1.5;
    const rad = (ap.azimuthDeg * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const cosPhi = ((rxX - ap.x) * dirX + (rxY - ap.y) * dirY) / horizDist;
    // Smooth cardioid pattern: +2.5 dB dead-ahead, 0 dB at 90 deg, -6.5 dB directly behind
    return cosPhi >= 0 ? 2.5 * cosPhi : 6.5 * cosPhi;
  }

  if (ap.type === 'ceiling_ap') {
    // Ceiling AP radiates downward umbrella pattern best when receiver is below or same floor
    const sinElev = dist3D > 0.1 ? dz / dist3D : 0;
    return sinElev <= 0.15 ? 2.0 : -2.5;
  }

  // Omnidirectional dipole router / mesh node: toroidal horizontal pattern, slight null straight up/down
  const cosVert = dist3D > 0.1 ? Math.abs(dz) / dist3D : 0;
  return 2.0 - 3.5 * cosVert * cosVert;
}

/**
 * Modified 3D COST-231 Multi-Wall & Multi-Floor propagation model between one AP and a 3D receiver point.
 * Accounts for:
 *  1. Indoor path-loss exponent + FSPL at 2.4 GHz and 5.2 GHz
 *  2. Exact 3D floor-interval wall intersections + oblique wall grazing thickness amplification kappa(theta)
 *  3. Concrete slab penetration across floors, EXEMPTING double-height Void Zones & Stairwells!
 *  4. Wireless Mesh hop penalty if a Mesh Node is not wired backhaul.
 */
export function computeSingleApRssi(
  ap: AccessPoint,
  rxX: number,
  rxY: number,
  rxFloorId: string,
  cache: FloorElevationCache,
  rxHeightOnFloor = 1.1,
  wirelessBackhaulPenaltyDb = 0
): { rssi24: number; rssi5: number } {
  if (!ap.enabled) {
    return { rssi24: -110, rssi5: -110 };
  }

  const apFloorEntry = cache.byId.get(ap.floorId);
  const rxFloorEntry = cache.byId.get(rxFloorId);
  if (!apFloorEntry || !rxFloorEntry) {
    return { rssi24: -110, rssi5: -110 };
  }

  const zAp = apFloorEntry.zBase + ap.mountHeightM;
  const zRx = rxFloorEntry.zBase + rxHeightOnFloor;

  const dx = rxX - ap.x;
  const dy = rxY - ap.y;
  const dz = zRx - zAp;
  const dist3D = Math.max(0.35, Math.hypot(dx, dy, dz));

  // Free-Space + Indoor multipath distance loss (gamma ~ 2.15 for indoor reflections/clutter)
  // FSPL(1m, 2.44GHz) = 40.2 dB; FSPL(1m, 5.25GHz) = 46.8 dB
  const logDist = Math.log10(dist3D);
  const pathLoss24 = 40.2 + 21.2 * logDist;
  const pathLoss5 = 46.8 + 22.0 * logDist;

  let wallLoss24 = 0;
  let wallLoss5 = 0;
  let slabLoss24 = 0;
  let slabLoss5 = 0;

  const minOrder = Math.min(apFloorEntry.order, rxFloorEntry.order);
  const maxOrder = Math.max(apFloorEntry.order, rxFloorEntry.order);

  // 1. Cross-floor slab & void-zone evaluation
  if (minOrder !== maxOrder && Math.abs(dz) > 1e-4) {
    // Each slab sits at the zBase of upper floor `ord` (for ord = minOrder + 1 .. maxOrder)
    for (let ord = minOrder + 1; ord <= maxOrder; ord++) {
      const upperFloor = cache.sortedFloors[ord];
      const upperEntry = cache.byId.get(upperFloor.id)!;
      const tSlab = (upperEntry.zBase - zAp) / dz;
      const crossX = ap.x + tSlab * dx;
      const crossY = ap.y + tSlab * dy;

      // Check if crossing point passes through a double-height Void Zone or Stairwell on the upper floor
      let throughVoid = false;
      for (const voidZone of upperFloor.voids) {
        if (pointInPolygon(crossX, crossY, voidZone.points)) {
          throughVoid = true;
          break;
        }
      }

      if (throughVoid) {
        // Open double-height void / stairwell: only tiny handrail/diffraction loss (~1.5 dB)
        slabLoss24 += 1.0;
        slabLoss5 += 1.8;
      } else {
        slabLoss24 += upperFloor.slabAttenuation24;
        slabLoss5 += upperFloor.slabAttenuation5;
      }
    }
  }

  // 2. Per-floor 3D interval wall intersection + oblique grazing factor kappa(theta)
  for (let ord = minOrder; ord <= maxOrder; ord++) {
    const fl = cache.sortedFloors[ord];
    const flEntry = cache.byId.get(fl.id)!;

    let tMin = 0;
    let tMax = 1;
    if (minOrder !== maxOrder && Math.abs(dz) > 1e-4) {
      const t1 = (flEntry.zBase - zAp) / dz;
      const t2 = (flEntry.zTop - zAp) / dz;
      tMin = Math.max(0, Math.min(t1, t2));
      tMax = Math.min(1, Math.max(t1, t2));
    }

    for (const w of fl.walls) {
      const hit = intersectSegments(ap.x, ap.y, rxX, rxY, w.x1, w.y1, w.x2, w.y2);
      if (hit.hit && hit.t >= tMin - 0.005 && hit.t <= tMax + 0.005) {
        const mat = WALL_MATERIALS[w.material];
        // Oblique grazing factor: crossing a concrete shear wall at 25 deg travels >2x inside concrete
        const kappa = Math.min(1.62, 1 / Math.max(0.61, hit.sinTheta));
        wallLoss24 += mat.attenuation24 * kappa;
        wallLoss5 += mat.attenuation5 * kappa;
      }
    }
  }

  const antGain = computeAntennaGainDb(ap, rxX, rxY, dz, dist3D);

  const rssi24 = Math.min(
    -28,
    ap.txPower24 + antGain - pathLoss24 - wallLoss24 - slabLoss24 - wirelessBackhaulPenaltyDb * 0.5
  );
  const rssi5 = Math.min(
    -30,
    ap.txPower5 + antGain - pathLoss5 - wallLoss5 - slabLoss5 - wirelessBackhaulPenaltyDb
  );

  return { rssi24, rssi5 };
}

/**
 * Computes wireless backhaul signal penalties for any Mesh nodes that do NOT have wired backhaul enabled.
 */
export function computeWirelessMeshPenalties(
  aps: AccessPoint[],
  cache: FloorElevationCache
): Map<string, number> {
  const penalties = new Map<string, number>();
  const wiredRoots = aps.filter((a) => a.enabled && (a.wiredBackhaul || a.type === 'router_main'));

  for (const ap of aps) {
    if (!ap.enabled || ap.wiredBackhaul || ap.type === 'router_main') {
      penalties.set(ap.id, 0);
      continue;
    }
    if (wiredRoots.length === 0) {
      penalties.set(ap.id, 0);
      continue;
    }
    let bestBackhaul5 = -110;
    for (const root of wiredRoots) {
      if (root.id === ap.id) continue;
      const sig = computeSingleApRssi(root, ap.x, ap.y, ap.floorId, cache, ap.mountHeightM, 0);
      if (sig.rssi5 > bestBackhaul5) bestBackhaul5 = sig.rssi5;
    }
    // If wireless Mesh backhaul is weaker than -65 dBm, effective relay capacity drops sharply
    const penalty = bestBackhaul5 >= -62 ? 1.5 : bestBackhaul5 >= -70 ? 5.5 : 12.0;
    penalties.set(ap.id, penalty);
  }
  return penalties;
}

/**
 * Estimates realistic real-world Wi-Fi 6/7 PHY/TCP throughput (Mbps) from RSSI & band.
 */
export function estimateThroughputMbps(rssi5: number, rssi24: number, bandMode: BandMode): number {
  const calc5 = (r: number) => {
    if (r >= -50) return 940;
    if (r >= -58) return Math.round(680 + ((r + 58) / 8) * 260);
    if (r >= -67) return Math.round(320 + ((r + 67) / 9) * 360);
    if (r >= -74) return Math.round(75 + ((r + 74) / 7) * 245);
    if (r >= -82) return Math.round(8 + ((r + 82) / 8) * 67);
    return 0;
  };
  const calc24 = (r: number) => {
    if (r >= -55) return 145;
    if (r >= -67) return Math.round(75 + ((r + 67) / 12) * 70);
    if (r >= -76) return Math.round(22 + ((r + 76) / 9) * 53);
    if (r >= -84) return Math.round(3 + ((r + 84) / 8) * 19);
    return 0;
  };

  if (bandMode === '5ghz') return calc5(rssi5);
  if (bandMode === '2.4ghz') return calc24(rssi24);
  // Dual-band smart steering: stays on 5 GHz down to -71 dBm, falls back to 2.4 GHz below that
  return rssi5 >= -71 ? calc5(rssi5) : Math.max(calc5(rssi5), calc24(rssi24));
}

/**
 * Evaluates full multi-AP signal metrics at any indoor point (x, y) on `floorId`.
 */
export function samplePointSignal(
  x: number,
  y: number,
  floorId: string,
  aps: AccessPoint[],
  bandMode: BandMode,
  cache: FloorElevationCache,
  meshPenalties?: Map<string, number>,
  lang: 'zh' | 'en' = 'zh'
): PointSignalDetail {
  const activeAps = aps.filter((a) => a.enabled);
  if (activeAps.length === 0) {
    return {
      rssi5: -100,
      rssi24: -100,
      displayRssi: -100,
      bestApId: null,
      bestApName: lang === 'zh' ? '未放置设备' : 'No AP Placed',
      secondBestRssi5: -100,
      roamingReady: false,
      coChannelWarning: false,
      estThroughputMbps: 0,
      qualityTier: 'dead',
      qualityText: lang === 'zh' ? '无信号覆盖' : 'No Coverage',
    };
  }

  let best5 = -110;
  let second5 = -110;
  let best24 = -110;
  let bestAp: AccessPoint | null = null;
  let secondAp: AccessPoint | null = null;

  for (const ap of activeAps) {
    const pen = meshPenalties?.get(ap.id) ?? 0;
    const { rssi24, rssi5 } = computeSingleApRssi(ap, x, y, floorId, cache, 1.1, pen);

    if (rssi24 > best24) {
      best24 = rssi24;
    }

    const metric = bandMode === '2.4ghz' ? rssi24 : rssi5;
    const prevBestMetric =
      bandMode === '2.4ghz' ? (bestAp ? best24 : -110) : best5;

    if (rssi5 > best5) {
      second5 = best5;
      secondAp = bestAp;
      best5 = rssi5;
      if (bandMode !== '2.4ghz') bestAp = ap;
    } else if (rssi5 > second5) {
      second5 = rssi5;
      secondAp = ap;
    }

    if (bandMode === '2.4ghz' && metric >= prevBestMetric) {
      bestAp = ap;
    }
  }

  // Dual-band effective experience RSSI: prioritizes 5GHz, with cushioned fallback to 2.4GHz when 5GHz drops
  const displayRssi =
    bandMode === '5ghz'
      ? best5
      : bandMode === '2.4ghz'
      ? best24
      : best5 >= -68
      ? best5
      : Math.max(best5, best24 - 5.5);

  const coChannelWarning =
    bestAp !== null &&
    secondAp !== null &&
    best5 > -70 &&
    second5 > -72 &&
    Math.abs(best5 - second5) < 8 &&
    bestAp.channel5 === secondAp.channel5;

  const roamingReady = best5 >= -67 && second5 >= -72;
  const estThroughputMbps = estimateThroughputMbps(best5, best24, bandMode);

  let qualityTier: PointSignalDetail['qualityTier'] = 'dead';
  let qualityText = lang === 'zh' ? '信号盲区 · 易断流' : 'Dead Zone · Drops';
  if (displayRssi >= -60) {
    qualityTier = 'excellent';
    qualityText = lang === 'zh' ? '千兆满速 · 电竞零延迟' : 'Gigabit Full-Speed · Low Latency';
  } else if (displayRssi >= -67) {
    qualityTier = 'good';
    qualityText = lang === 'zh' ? '高速畅快 · 4K 秒开' : 'Fast & Stable · 4K Streaming';
  } else if (displayRssi >= -75) {
    qualityTier = 'fair';
    qualityText = lang === 'zh' ? '基础可用 · 建议漫游补盲' : 'Usable · Consider Roaming Fill';
  }

  return {
    rssi5: Math.round(best5 * 10) / 10,
    rssi24: Math.round(best24 * 10) / 10,
    displayRssi: Math.round(displayRssi * 10) / 10,
    bestApId: bestAp?.id ?? null,
    bestApName: bestAp?.name ?? (lang === 'zh' ? '无' : 'None'),
    secondBestRssi5: Math.round(second5 * 10) / 10,
    roamingReady,
    coChannelWarning,
    estThroughputMbps,
    qualityTier,
    qualityText,
  };
}
