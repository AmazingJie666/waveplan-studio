import {
  AccessPoint,
  APMountType,
  ArchitectureRecommendation,
  BandMode,
  DemandPin,
  FloorLevel,
  WeakCurrentBox,
} from '../types/wifi';
import { generateArchitectureRecommendations, solveOptimalPlacement } from './optimizer';

export type WorkerRequest =
  | {
      id: string;
      mode: 'fixed_roster';
      floors: FloorLevel[];
      demands: DemandPin[];
      weakBox: WeakCurrentBox;
      deviceTypes: APMountType[];
      bandMode: BandMode;
    }
  | {
      id: string;
      mode: 'recommend_all';
      floors: FloorLevel[];
      demands: DemandPin[];
      weakBox: WeakCurrentBox;
      bandMode: BandMode;
      lang?: 'zh' | 'en';
    };

export type WorkerResponse =
  | {
      id: string;
      mode: 'fixed_roster';
      aps: AccessPoint[];
      elapsedMs: number;
    }
  | {
      id: string;
      mode: 'recommend_all';
      recommendations: ArchitectureRecommendation[];
      elapsedMs: number;
    };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const t0 = performance.now();

  if (req.mode === 'fixed_roster') {
    const aps = solveOptimalPlacement({
      floors: req.floors,
      demands: req.demands,
      weakBox: req.weakBox,
      deviceTypes: req.deviceTypes,
      bandMode: req.bandMode,
    });
    const res: WorkerResponse = {
      id: req.id,
      mode: 'fixed_roster',
      aps,
      elapsedMs: Math.round(performance.now() - t0),
    };
    self.postMessage(res);
  } else if (req.mode === 'recommend_all') {
    const recommendations = generateArchitectureRecommendations(
      req.floors,
      req.demands,
      req.weakBox,
      req.bandMode,
      req.lang ?? 'zh'
    );
    const res: WorkerResponse = {
      id: req.id,
      mode: 'recommend_all',
      recommendations,
      elapsedMs: Math.round(performance.now() - t0),
    };
    self.postMessage(res);
  }
};
