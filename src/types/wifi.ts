export type WallMaterial = 'concrete' | 'brick' | 'drywall' | 'glass' | 'metal';

export interface Point2D {
  x: number; // meters relative to floor alignment anchor (0, 0)
  y: number; // meters relative to floor alignment anchor (0, 0)
}

export interface WallMaterialSpec {
  id: WallMaterial;
  name: string;
  shortName: string;
  thicknessM: number;
  attenuation24: number; // dB per perpendicular pass at 2.4 GHz
  attenuation5: number;  // dB per perpendicular pass at 5 GHz
  color: string;
  strokeWidthPx: number;
  dashed?: boolean;
  description: string;
}

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  material: WallMaterial;
}

export interface VoidZone {
  id: string;
  name: string;
  kind: 'void' | 'stairwell';
  points: Point2D[]; // polygon vertices in meters; exempts slab loss between this floor and floor below
}

export interface RoomLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  subtitle?: string;
}

export interface FloorPlanBg {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  pixelsPerMeter: number;
  offsetX: number; // meter coordinate of image top-left X
  offsetY: number; // meter coordinate of image top-left Y
  opacity: number;
}

export interface FloorLevel {
  id: string;
  name: string;       // e.g. "1F", "2F", "3F"
  label: string;      // e.g. "一层 · 客餐厨社交层"
  levelIndex: number; // 0 = ground, 1 = 2F, 2 = 3F...
  heightMeters: number;
  slabAttenuation24: number; // dB for reinforced concrete slab below this floor
  slabAttenuation5: number;  // dB for reinforced concrete slab below this floor
  footprint: Point2D[];      // outer boundary polygon in meters (used for indoor coverage masking)
  walls: WallSegment[];
  voids: VoidZone[];
  rooms: RoomLabel[];
  bgImage?: FloorPlanBg;
}

export type APMountType = 'router_main' | 'mesh_node' | 'panel_ap' | 'ceiling_ap';

export interface APDeviceSpec {
  type: APMountType;
  name: string;
  shortName: string;
  mountDesc: string;
  defaultHeightM: number;
  txPower24: number; // dBm EIRP (CN standard)
  txPower5: number;  // dBm EIRP (CN standard)
  unitPriceRmb: number;
  directional: boolean;
  poeRequired: boolean;
}

export interface AccessPoint {
  id: string;
  name: string;
  floorId: string;
  x: number;
  y: number;
  mountHeightM: number;
  type: APMountType;
  txPower24: number;
  txPower5: number;
  azimuthDeg?: number; // direction in degrees (0 = +X, 90 = +Y) for wall-mounted panel AP
  channel24: number;
  channel5: number;
  wiredBackhaul: boolean;
  enabled: boolean;
}

export interface WeakCurrentBox {
  floorId: string;
  x: number;
  y: number;
  label: string;
}

export type DemandCategory = 'critical' | 'high' | 'medium' | 'iot';

export interface DemandSpec {
  category: DemandCategory;
  name: string;
  shortName: string;
  weight: number;
  target5dBm: number;
  target24dBm: number;
  preferBand: '5ghz' | 'dual' | '2.4ghz';
  color: string;
  description: string;
}

export interface DemandPin {
  id: string;
  floorId: string;
  x: number;
  y: number;
  label: string;
  category: DemandCategory;
}

export type BandMode = '5ghz' | '2.4ghz' | 'dual';

export type ActiveTool =
  | 'select'
  | 'wall'
  | 'void'
  | 'scale'
  | 'weak_box'
  | 'add_ap'
  | 'add_demand'
  | 'align_anchor'
  | 'eraser';

export interface ProjectModel {
  id: string;
  name: string;
  subtitle: string;
  floors: FloorLevel[];
  aps: AccessPoint[];
  demands: DemandPin[];
  weakBox: WeakCurrentBox;
}

export interface PointSignalDetail {
  rssi5: number;
  rssi24: number;
  displayRssi: number;
  bestApId: string | null;
  bestApName: string;
  secondBestRssi5: number;
  roamingReady: boolean;
  coChannelWarning: boolean;
  estThroughputMbps: number;
  qualityTier: 'excellent' | 'good' | 'fair' | 'dead';
  qualityText: string;
}

export interface FloorHeatmapData {
  floorId: string;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  stepM: number;
  rssiGrid: Float32Array;     // display RSSI per cell (NaN if outside footprint)
  rssi5Grid: Float32Array;
  rssi24Grid: Float32Array;
  indoorMask: Uint8Array;     // 1 = inside footprint, 0 = outside
  indoorCells: number;
  above60Cells: number;
  above67Cells: number;
  deadCells: number;          // < -75 dBm
}

export interface DemandEvalItem {
  pin: DemandPin;
  floorName: string;
  detail: PointSignalDetail;
  targetDbm: number;
  actualDbm: number;
  passed: boolean;
  satisfaction01: number; // 0.0 ~ 1.0 smooth satisfaction
}

export interface NetworkEvaluation {
  overallScore: number;         // 0 ~ 100 weighted satisfaction score
  demandSatisfactionPct: number;
  coverageExcellentPct: number; // >= -60 dBm
  coverageGoodPct: number;      // >= -67 dBm
  deadZonePct: number;          // < -75 dBm
  demandResults: DemandEvalItem[];
  floorStats: {
    floorId: string;
    floorName: string;
    goodCoveragePct: number;
    deadZonePct: number;
    avgRssi: number;
  }[];
  totalCableMeters: number;
  estimatedHardwareRmb: number;
  roamingScorePct: number;
  diagnostics: {
    level: 'success' | 'warning' | 'error' | 'info';
    title: string;
    detail: string;
  }[];
}

export interface ArchitectureRecommendation {
  id: 'single_router' | 'wired_mesh' | 'ac_poe_ap';
  name: string;
  badge: string;
  summary: string;
  aps: AccessPoint[];
  overallScore: number;
  goodCoveragePct: number;
  demandPassed: number;
  demandTotal: number;
  hardwareCostRmb: number;
  cableMeters: number;
  totalBudgetRmb: number;
  poePortsNeeded: number;
  suitableFor: string;
}
