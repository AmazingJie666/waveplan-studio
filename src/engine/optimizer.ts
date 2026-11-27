import { AP_SPECS, CHANNELS_24, CHANNELS_5, DEMAND_SPECS } from '../constants/specs';
import {
  AccessPoint,
  APMountType,
  ArchitectureRecommendation,
  BandMode,
  DemandPin,
  FloorLevel,
  WeakCurrentBox,
} from '../types/wifi';
import {
  closestPointOnSegment,
  estimateApCableRun,
  findNearestRoomWallAware,
  getFloorBoundsAndFootprint,
  pointInPolygon,
} from './geometry';
import { evaluateNetwork } from './heatmap';
import { buildElevationCache, computeSingleApRssi, FloorElevationCache } from './rfModel';

interface CandidateSite {
  floorId: string;
  floorOrder: number;
  x: number;
  y: number;
  type: APMountType;
  mountHeightM: number;
  azimuthDeg?: number;
  cableDistM: number;
}

interface EvalSample {
  floorId: string;
  x: number;
  y: number;
  weight: number;
  target5: number;
  target24: number;
  preferBand: '5ghz' | 'dual' | '2.4ghz';
  isDemandPin: boolean;
}

export interface OptimizeCountConfig {
  floors: FloorLevel[];
  demands: DemandPin[];
  weakBox: WeakCurrentBox;
  deviceTypes: APMountType[]; // exact device roster to place, e.g. ['router_main', 'mesh_node'] or ['panel_ap', 'panel_ap', 'ceiling_ap']
  bandMode: BandMode;
}

function isInsideAnyVoid(x: number, y: number, floor: FloorLevel): boolean {
  for (const v of floor.voids) {
    if (pointInPolygon(x, y, v.points)) return true;
  }
  return false;
}

/**
 * Checks if a candidate point falls inside a wet/utility room (bathroom, kitchen, balcony)
 * where desktop routers or PoE APs should not be mounted.
 */
function isWetOrRestrictedZone(x: number, y: number, floor: FloorLevel): boolean {
  const match = findNearestRoomWallAware(x, y, floor);
  if (!match || !match.sameRoom || match.dist > 2.6) return false;
  return /卫|厕|浴|厨|阳台|露台|家政/.test(match.roomName);
}

/**
 * Generates physically valid mounting candidate sites on all floors:
 * - `panel_ap`: mounted flush on solid walls (concrete/brick/drywall), pointing into walkable indoor space
 * - `router_main` / `mesh_node`: placed near walls/cabinets (0.22m~0.65m from wall), never floating mid-air in room center
 * - `ceiling_ap`: placed on indoor ceiling grid, excluding double-height Void Zones & Stairwells
 */
function generateCandidateSites(
  floors: FloorLevel[],
  weakBox: WeakCurrentBox,
  allowedTypes: Set<APMountType>,
  cache: FloorElevationCache
): CandidateSite[] {
  const sites: CandidateSite[] = [];

  for (const floor of floors) {
    const flOrder = cache.byId.get(floor.id)?.order ?? 0;
    const { minX, minY, maxX, maxY, footprint } = getFloorBoundsAndFootprint(floor);

    // 1. Wall-mounted 86 Panel AP candidates
    if (allowedTypes.has('panel_ap')) {
      for (const w of floor.walls) {
        if (w.material === 'glass' || w.material === 'metal') continue;
        const segLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (segLen < 0.7) continue;

        const steps = Math.max(1, Math.min(5, Math.floor(segLen / 1.45)));
        const ux = (w.x2 - w.x1) / segLen;
        const uy = (w.y2 - w.y1) / segLen;
        const nx = -uy;
        const ny = ux;

        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          const bx = w.x1 + ux * segLen * t;
          const by = w.y1 + uy * segLen * t;

          // Check both normal sides of interior partition walls!
          for (const side of [1, -1]) {
            const px = Math.round((bx + nx * side * 0.1) * 100) / 100;
            const py = Math.round((by + ny * side * 0.1) * 100) / 100;
            const testIndoorX = bx + nx * side * 0.45;
            const testIndoorY = by + ny * side * 0.45;

            if (
              pointInPolygon(testIndoorX, testIndoorY, footprint) &&
              !isInsideAnyVoid(testIndoorX, testIndoorY, floor) &&
              !isWetOrRestrictedZone(testIndoorX, testIndoorY, floor)
            ) {
              const azimuthDeg = Math.round((Math.atan2(ny * side, nx * side) * 180) / Math.PI);
              sites.push({
                floorId: floor.id,
                floorOrder: flOrder,
                x: px,
                y: py,
                type: 'panel_ap',
                mountHeightM: AP_SPECS.panel_ap.defaultHeightM,
                azimuthDeg,
                cableDistM: Math.abs(px - weakBox.x) + Math.abs(py - weakBox.y) + flOrder * 3.1,
              });
            }
          }
        }
      }
    }

    // 2. Desktop Router / Mesh Node & Ceiling AP grid candidates
    const needDesk = allowedTypes.has('router_main') || allowedTypes.has('mesh_node');
    const needCeiling = allowedTypes.has('ceiling_ap');

    if (needDesk || needCeiling) {
      const gridStep = 1.05;
      for (let y = minY + 0.55; y <= maxY - 0.55; y += gridStep) {
        for (let x = minX + 0.55; x <= maxX - 0.55; x += gridStep) {
          if (
            !pointInPolygon(x, y, footprint) ||
            isInsideAnyVoid(x, y, floor) ||
            isWetOrRestrictedZone(x, y, floor)
          ) {
            continue;
          }

          // Minimum distance to any solid wall
          let minWallDist = Infinity;
          for (const w of floor.walls) {
            const d = closestPointOnSegment(x, y, w.x1, w.y1, w.x2, w.y2).dist;
            if (d < minWallDist) minWallDist = d;
          }

          const rx = Math.round(x * 20) / 20;
          const ry = Math.round(y * 20) / 20;
          const cableDistM = Math.abs(rx - weakBox.x) + Math.abs(ry - weakBox.y) + flOrder * 3.1;

          // Desktop routers sit realistically near walls/consoles (0.22m ~ 0.95m from wall), or if no walls drawn anywhere
          if (needDesk && (floor.walls.length === 0 || (minWallDist >= 0.2 && minWallDist <= 1.05))) {
            if (allowedTypes.has('router_main')) {
              sites.push({
                floorId: floor.id,
                floorOrder: flOrder,
                x: rx,
                y: ry,
                type: 'router_main',
                mountHeightM: AP_SPECS.router_main.defaultHeightM,
                cableDistM,
              });
            }
            if (allowedTypes.has('mesh_node')) {
              sites.push({
                floorId: floor.id,
                floorOrder: flOrder,
                x: rx,
                y: ry,
                type: 'mesh_node',
                mountHeightM: AP_SPECS.mesh_node.defaultHeightM,
                cableDistM,
              });
            }
          }

          // Ceiling APs prefer room interiors >= 0.45m away from walls
          if (needCeiling && (floor.walls.length === 0 || minWallDist >= 0.42)) {
            sites.push({
              floorId: floor.id,
              floorOrder: flOrder,
              x: rx,
              y: ry,
              type: 'ceiling_ap',
              mountHeightM: AP_SPECS.ceiling_ap.defaultHeightM,
              cableDistM,
            });
          }
        }
      }
    }
  }

  // Fallback if a floor had very tight geometry and produced 0 candidates for a requested type
  for (const t of allowedTypes) {
    if (!sites.some((s) => s.type === t)) {
      const fl = floors[0];
      const { minX, minY, maxX, maxY } = getFloorBoundsAndFootprint(fl);
      sites.push({
        floorId: fl.id,
        floorOrder: 0,
        x: Math.round(((minX + maxX) / 2) * 10) / 10,
        y: Math.round(((minY + maxY) / 2) * 10) / 10,
        type: t,
        mountHeightM: AP_SPECS[t].defaultHeightM,
        azimuthDeg: t === 'panel_ap' ? 0 : undefined,
        cableDistM: 4,
      });
    }
  }

  return sites;
}

/**
 * Builds weighted evaluation sample set combining high-priority DemandPins + uniform indoor grid cells.
 */
function buildEvalSamples(floors: FloorLevel[], demands: DemandPin[]): EvalSample[] {
  const samples: EvalSample[] = [];

  // High-priority user demand pins carry strong decisive weight
  for (const d of demands) {
    const spec = DEMAND_SPECS[d.category];
    samples.push({
      floorId: d.floorId,
      x: d.x,
      y: d.y,
      weight: spec.weight * 4.5,
      target5: spec.target5dBm,
      target24: spec.target24dBm,
      preferBand: spec.preferBand,
      isDemandPin: true,
    });
  }

  // Whole-home indoor walkable grid samples (1.0m step)
  for (const floor of floors) {
    const { minX, minY, maxX, maxY, footprint } = getFloorBoundsAndFootprint(floor);
    for (let y = minY + 0.5; y <= maxY - 0.3; y += 1.0) {
      for (let x = minX + 0.5; x <= maxX - 0.3; x += 1.0) {
        if (!pointInPolygon(x, y, footprint) || isInsideAnyVoid(x, y, floor)) continue;
        samples.push({
          floorId: floor.id,
          x,
          y,
          weight: 1.0,
          target5: -66,
          target24: -70,
          preferBand: 'dual',
          isDemandPin: false,
        });
      }
    }
  }

  return samples;
}

/**
 * Core precomputed tensor + Greedy + Simulated Annealing placement solver!
 */
export function solveOptimalPlacement(config: OptimizeCountConfig): AccessPoint[] {
  const { floors, demands, weakBox, deviceTypes } = config;
  if (deviceTypes.length === 0 || floors.length === 0) return [];

  const cache = buildElevationCache(floors);
  const uniqueTypes = new Set<APMountType>(deviceTypes);
  const allSites = generateCandidateSites(floors, weakBox, uniqueTypes, cache);
  const samples = buildEvalSamples(floors, demands);

  const M = allSites.length;
  const N = samples.length;
  if (M === 0 || N === 0) return [];

  // Precompute M x N propagation RSSI matrices once (~15ms)!
  const mat5 = new Float32Array(M * N);
  const mat24 = new Float32Array(M * N);

  for (let m = 0; m < M; m++) {
    const c = allSites[m];
    const spec = AP_SPECS[c.type];
    const tempAp: AccessPoint = {
      id: 'tmp',
      name: 'tmp',
      floorId: c.floorId,
      x: c.x,
      y: c.y,
      mountHeightM: c.mountHeightM,
      type: c.type,
      txPower24: spec.txPower24,
      txPower5: spec.txPower5,
      azimuthDeg: c.azimuthDeg,
      channel24: 1,
      channel5: 36,
      wiredBackhaul: true,
      enabled: true,
    };

    const rowOffset = m * N;
    for (let n = 0; n < N; n++) {
      const s = samples[n];
      const sig = computeSingleApRssi(tempAp, s.x, s.y, s.floorId, cache, 1.1, 0);
      mat5[rowOffset + n] = sig.rssi5;
      mat24[rowOffset + n] = sig.rssi24;
    }
  }

  // Group candidate indices by APMountType
  const poolByType = new Map<APMountType, number[]>();
  for (const t of uniqueTypes) {
    poolByType.set(t, []);
  }
  allSites.forEach((s, idx) => {
    poolByType.get(s.type)!.push(idx);
  });

  // Fast O(K * N) objective evaluator
  let totalSampleWeight = 0;
  for (let n = 0; n < N; n++) totalSampleWeight += samples[n].weight;

  const evaluateIndices = (chosen: number[]): number => {
    let utilitySum = 0;
    let deadPenalty = 0;

    for (let n = 0; n < N; n++) {
      let best5 = -110;
      let best24 = -110;
      for (let k = 0; k < chosen.length; k++) {
        const idx = chosen[k] * N + n;
        const r5 = mat5[idx];
        const r24 = mat24[idx];
        if (r5 > best5) best5 = r5;
        if (r24 > best24) best24 = r24;
      }

      const s = samples[n];
      const actual =
        s.preferBand === '5ghz'
          ? best5
          : s.preferBand === '2.4ghz'
          ? best24
          : best5 >= -68
          ? best5
          : Math.max(best5, best24 - 5);
      const target = s.preferBand === '2.4ghz' ? s.target24 : s.target5;
      const diff = actual - target;

      let u = 1.0;
      if (diff >= 3) {
        u = 1.0;
      } else if (diff >= 0) {
        u = 0.93 + (diff / 3) * 0.07;
      } else if (diff >= -14) {
        u = 0.93 * Math.pow((diff + 14) / 14, 1.6);
      } else {
        u = Math.max(0, 0.05 + (diff + 14) * 0.004);
      }

      utilitySum += s.weight * u;
      if (actual < -74) {
        deadPenalty += s.isDemandPin ? 0.045 : 0.004;
      }
    }

    // Spatial separation & cable-efficiency tie-breaker
    let crowdingPenalty = 0;
    let cableTieBreak = 0;
    for (let i = 0; i < chosen.length; i++) {
      const a = allSites[chosen[i]];
      cableTieBreak += a.cableDistM * 0.00035;
      // Main router gently prefers weakBox's floor if multi-floor
      if (a.type === 'router_main' && a.floorId !== weakBox.floorId) {
        cableTieBreak += 0.012;
      }
      for (let j = i + 1; j < chosen.length; j++) {
        const b = allSites[chosen[j]];
        if (a.floorId === b.floorId) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 1.2) crowdingPenalty += 0.35;
          else if (dist < 3.6) crowdingPenalty += ((3.6 - dist) / 3.6) * 0.09;
        }
      }
    }

    return utilitySum / totalSampleWeight - deadPenalty - crowdingPenalty - cableTieBreak;
  };

  // Step 1: Greedy Max-Marginal-Gain Initialization
  const current: number[] = [];
  for (let slot = 0; slot < deviceTypes.length; slot++) {
    const t = deviceTypes[slot];
    const pool = poolByType.get(t)!;
    let bestIdx = pool[0];
    let bestVal = -Infinity;

    for (let p = 0; p < pool.length; p++) {
      const cand = pool[p];
      if (current.includes(cand) && pool.length > current.length) continue;
      current.push(cand);
      const val = evaluateIndices(current);
      current.pop();
      if (val > bestVal) {
        bestVal = val;
        bestIdx = cand;
      }
    }
    current.push(bestIdx);
  }

  // Step 2: Simulated Annealing global refinement (deterministic PRNG for stable reproducible optima)
  let bestSolution = [...current];
  let currentScore = evaluateIndices(current);
  let bestScore = currentScore;

  if (M > deviceTypes.length) {
    let seed = 1337 ^ (M * 31 + N * 17 + deviceTypes.length * 97);
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const iterations = Math.min(2200, 380 * deviceTypes.length + M * 4);
    for (let iter = 0; iter < iterations; iter++) {
      const temp = 0.045 * Math.pow(0.015, iter / iterations);
      const slot = Math.floor(rand() * deviceTypes.length);
      const pool = poolByType.get(deviceTypes[slot])!;
      if (pool.length <= 1) continue;

      const nextCand = pool[Math.floor(rand() * pool.length)];
      if (nextCand === current[slot]) continue;

      const prevCand = current[slot];
      current[slot] = nextCand;
      const nextScore = evaluateIndices(current);
      const delta = nextScore - currentScore;

      if (delta > 0 || rand() < Math.exp(delta / Math.max(1e-5, temp))) {
        currentScore = nextScore;
        if (nextScore > bestScore) {
          bestScore = nextScore;
          bestSolution = [...current];
        }
      } else {
        current[slot] = prevCand;
      }
    }
  }

  // Convert winning candidate indices into clean AccessPoint entities with non-overlapping channel plan
  return bestSolution.map((siteIdx, idx) => {
    const site = allSites[siteIdx];
    const spec = AP_SPECS[site.type];
    const fl = floors.find((f) => f.id === site.floorId);
    const flPrefix = fl ? fl.name : '1F';
    const typeLabel =
      site.type === 'router_main'
        ? '主路由'
        : site.type === 'mesh_node'
        ? `有线Mesh-${idx}`
        : site.type === 'panel_ap'
        ? `面板AP-${idx + 1}`
        : `吸顶AP-${idx + 1}`;

    return {
      id: `ap-opt-${Date.now()}-${idx}`,
      name: `${flPrefix} ${typeLabel}`,
      floorId: site.floorId,
      x: site.x,
      y: site.y,
      mountHeightM: site.mountHeightM,
      type: site.type,
      txPower24: spec.txPower24,
      txPower5: spec.txPower5,
      azimuthDeg: site.azimuthDeg,
      channel24: CHANNELS_24[idx % CHANNELS_24.length],
      channel5: CHANNELS_5[idx % CHANNELS_5.length],
      wiredBackhaul: true,
      enabled: true,
    };
  });
}

/**
 * Mode B: Automatically evaluates & compares 3 whole-home networking architectures:
 *  1. 单台旗舰路由 (Single Flagship Router)
 *  2. 全屋有线 Mesh 组网 (Minimum count 2..4 to achieve >=95% score)
 *  3. 全屋 AC + PoE 隐形 AP 组网 (Minimum count 2..6 mixing Ceiling/Panel APs to achieve >=96% score)
 */
export function generateArchitectureRecommendations(
  floors: FloorLevel[],
  demands: DemandPin[],
  weakBox: WeakCurrentBox,
  bandMode: BandMode,
  lang: 'zh' | 'en' = 'zh'
): ArchitectureRecommendation[] {
  const isZh = lang === 'zh';
  const buildCard = (
    id: ArchitectureRecommendation['id'],
    name: string,
    badge: string,
    summary: string,
    suitableFor: string,
    aps: AccessPoint[]
  ): ArchitectureRecommendation => {
    const evalRes = evaluateNetwork(floors, aps, demands, weakBox, bandMode);
    const passed = evalRes.demandResults.filter((d) => d.passed).length;
    const poePorts = aps.filter((a) => AP_SPECS[a.type].poeRequired).length;
    let cableMeters = 0;
    for (const ap of aps) {
      cableMeters += estimateApCableRun(weakBox, ap, floors).lengthMeters;
    }
    cableMeters = Math.round(cableMeters);
    // Estimate Cat6 cable + conduit material at ~6 RMB/m
    const wireCost = cableMeters * 6;

    return {
      id,
      name,
      badge,
      summary,
      aps,
      overallScore: evalRes.overallScore,
      goodCoveragePct: evalRes.coverageGoodPct,
      demandPassed: passed,
      demandTotal: evalRes.demandResults.length,
      hardwareCostRmb: evalRes.estimatedHardwareRmb,
      cableMeters,
      totalBudgetRmb: evalRes.estimatedHardwareRmb + wireCost,
      poePortsNeeded: poePorts,
      suitableFor,
    };
  };

  // 1. Single Flagship Router
  const singleAps = solveOptimalPlacement({
    floors,
    demands,
    weakBox,
    deviceTypes: ['router_main'],
    bandMode,
  });
  const singleCard = buildCard(
    'single_router',
    isZh ? '单台旗舰高功率主路由' : 'Single Flagship Router',
    isZh ? '极简低成本' : 'Low Cost',
    isZh
      ? '仅在全屋几何中心附近预留 1 个网口摆放旗舰路由，零漫游切换开销。'
      : 'Place 1 flagship router near home center; zero roaming handoff overhead.',
    isZh ? '85㎡ 以内开敞小两居 / 少承重墙平层' : 'Open flats <85㎡ with few concrete walls',
    singleAps
  );

  // 2. Wired Mesh (search min count from max(2, floors.length) up to floors.length + 2)
  const minMesh = Math.max(2, floors.length);
  const maxMesh = Math.min(5, floors.length + 2);
  let bestMeshAps: AccessPoint[] = [];
  for (let cnt = minMesh; cnt <= maxMesh; cnt++) {
    const types: APMountType[] = ['router_main', ...Array(cnt - 1).fill('mesh_node')];
    const candidateAps = solveOptimalPlacement({
      floors,
      demands,
      weakBox,
      deviceTypes: types,
      bandMode,
    });
    bestMeshAps = candidateAps;
    const ev = evaluateNetwork(floors, candidateAps, demands, weakBox, bandMode);
    const allCriticalPassed = ev.demandResults
      .filter((d) => d.pin.category === 'critical' || d.pin.category === 'high')
      .every((d) => d.passed);
    if (ev.overallScore >= 94 && allCriticalPassed) break;
  }
  const meshCard = buildCard(
    'wired_mesh',
    isZh
      ? `有线回程 Mesh（1主 + ${bestMeshAps.length - 1}子）`
      : `Wired Mesh (1 Main + ${bestMeshAps.length - 1} Node)`,
    isZh ? '性价比之选' : 'Best Value',
    isZh
      ? '主路由居中 + 关键死角房间预埋六类网线接子路由，兼顾高速吞吐与易维护性。'
      : 'Central main router + wired Cat6 satellite nodes in dead-zone rooms.',
    isZh ? '100~170㎡ 三居/四居及双层复式住宅' : '100–170㎡ flats & 2-story duplexes',
    bestMeshAps
  );

  // 3. Whole-home PoE AC + Panel/Ceiling AP (1 ceiling AP for main living social zone + N-1 wall 86-panel APs for bedrooms/studies)
  const minPoe = Math.max(2, floors.length + 1);
  const maxPoe = Math.min(6, floors.length * 2 + 1);
  let bestPoeAps: AccessPoint[] = [];
  for (let cnt = minPoe; cnt <= maxPoe; cnt++) {
    const types: APMountType[] = ['ceiling_ap', ...Array(cnt - 1).fill('panel_ap')];
    const candidateAps = solveOptimalPlacement({
      floors,
      demands,
      weakBox,
      deviceTypes: types,
      bandMode,
    });
    bestPoeAps = candidateAps;
    const ev = evaluateNetwork(floors, candidateAps, demands, weakBox, bandMode);
    const allPassed = ev.demandResults.every((d) => d.passed);
    if (ev.overallScore >= 96 && allPassed) break;
  }
  const poeCard = buildCard(
    'ac_poe_ap',
    isZh
      ? `全屋 AC + PoE 隐形组网（${bestPoeAps.length}台AP）`
      : `Whole-Home AC + PoE APs (${bestPoeAps.length} APs)`,
    isZh ? '别墅/精装首选' : 'Pro Invisible',
    isZh
      ? '弱电箱集中装 PoE 一体机，客餐厅吸顶 AP + 卧室书房 86 墙面面板 AP，桌面零设备零电源线。'
      : 'Central PoE switch in cabinet + ceiling/in-wall APs; zero desktop clutter.',
    isZh ? '140㎡+ 大平层 / 多层复式 / 联排独栋别墅' : '140㎡+ homes, lofts & multi-story villas',
    bestPoeAps
  );

  return [singleCard, meshCard, poeCard];
}
