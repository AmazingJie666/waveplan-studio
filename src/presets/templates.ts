import { ProjectModel, WallMaterial, WallSegment } from '../types/wifi';

let wid = 1;
const w = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  material: WallMaterial = 'concrete'
): WallSegment => ({
  id: `w-preset-${wid++}`,
  x1,
  y1,
  x2,
  y2,
  material,
});

/**
 * 3 curated architectural presets:
 * 1. 118㎡ Classic 3-Bedroom Flat (Single floor, shear-wall dead-zone showcase)
 * 2. 165㎡ Double-Height Duplex Loft (2 floors, living-room VoidZone cross-floor penetration)
 * 3. 260㎡ Three-Story Townhouse Villa (3 floors, vertical weak-current shaft & multi-AP AC+PoE)
 */
export function createPresetProjects(): ProjectModel[] {
  wid = 1;

  // =========================================================================
  // PRESET 1: 118㎡ 南北通透三居两卫（平层） — 12.0m x 9.2m
  // =========================================================================
  const flat118: ProjectModel = {
    id: 'flat-118',
    name: '118㎡ 南北通透三居室',
    subtitle: '平层 · 典型剪力墙隔断痛点演示',
    weakBox: {
      floorId: 'f1',
      x: 0.7,
      y: 4.8,
      label: '入户弱电箱',
    },
    floors: [
      {
        id: 'f1',
        name: '1F',
        label: '平层 · 三室两厅两卫',
        levelIndex: 0,
        heightMeters: 2.9,
        slabAttenuation24: 15,
        slabAttenuation5: 22,
        footprint: [
          { x: 0, y: 0 },
          { x: 12.0, y: 0 },
          { x: 12.0, y: 9.2 },
          { x: 0, y: 9.2 },
        ],
        voids: [],
        rooms: [
          { id: 'r1', name: '入户玄关', x: 1.2, y: 4.7 },
          { id: 'r2', name: '餐厨区', x: 2.2, y: 1.8, subtitle: '北向明厨' },
          { id: 'r3', name: '客厅', x: 4.5, y: 6.2, subtitle: '开间 4.2m' },
          { id: 'r4', name: '南向景观阳台', x: 4.5, y: 8.5 },
          { id: 'r5', name: '北书房 / 电竞室', x: 6.3, y: 1.8 },
          { id: 'r6', name: '公卫', x: 8.6, y: 1.8 },
          { id: 'r7', name: '南向次卧', x: 10.3, y: 2.2 },
          { id: 'r8', name: '南向主卧套房', x: 9.8, y: 6.8, subtitle: '含独立主卫' },
          { id: 'r9', name: '主卫', x: 7.9, y: 5.5 },
        ],
        walls: [
          // Outer concrete envelope
          w(0, 0, 12.0, 0, 'concrete'),
          w(12.0, 0, 12.0, 9.2, 'concrete'),
          w(12.0, 9.2, 7.2, 9.2, 'concrete'),
          w(2.2, 9.2, 0, 9.2, 'concrete'),
          w(0, 9.2, 0, 5.6, 'concrete'),
          w(0, 4.1, 0, 0, 'concrete'),
          // Entry metal security door & south balcony glass window
          w(0, 4.1, 0, 5.6, 'metal'),
          w(2.2, 9.2, 7.2, 9.2, 'glass'),

          // Foyer & Kitchen walls + Double-door fridge (metal)
          w(2.3, 3.6, 2.3, 5.5, 'brick'),
          w(0, 3.6, 1.5, 3.6, 'brick'),
          w(1.5, 3.6, 2.3, 3.6, 'glass'), // kitchen sliding glass door
          w(4.5, 0, 4.5, 3.6, 'concrete'), // structural shear wall between kitchen & study
          w(3.7, 0.3, 4.4, 0.3, 'metal'), // big kitchen refrigerator

          // Living room <-> Balcony sliding glass door
          w(2.2, 7.8, 7.2, 7.8, 'glass'),
          w(2.2, 7.8, 2.2, 9.2, 'concrete'),
          w(7.2, 7.8, 7.2, 9.2, 'concrete'),

          // North Study & Public Bath
          w(4.5, 3.6, 5.6, 3.6, 'brick'),
          w(5.6, 3.6, 6.5, 3.6, 'drywall'), // study door
          w(6.5, 3.6, 7.8, 3.6, 'concrete'),
          w(7.8, 0, 7.8, 3.6, 'brick'),
          w(7.8, 3.6, 8.6, 3.6, 'drywall'),
          w(8.6, 3.6, 9.4, 3.6, 'brick'),
          w(9.4, 0, 9.4, 3.6, 'concrete'), // shear wall to secondary bedroom

          // Secondary bedroom door
          w(9.4, 3.6, 10.3, 3.6, 'drywall'),
          w(10.3, 3.6, 12.0, 3.6, 'concrete'),

          // Load-bearing shear wall separating Living Room & Master Suite! (The WiFi killer!)
          w(7.2, 4.6, 7.2, 7.8, 'concrete'),
          w(7.2, 4.6, 8.1, 4.6, 'drywall'), // master suite door
          w(8.1, 4.6, 12.0, 4.6, 'concrete'),

          // Master Bathroom enclosure inside Master Suite
          w(8.9, 4.6, 8.9, 6.4, 'brick'),
          w(7.2, 6.4, 8.2, 6.4, 'brick'),
          w(8.2, 6.4, 8.9, 6.4, 'glass'),
        ],
      },
    ],
    // Initial suboptimal single router near foyer Weak-Current Box so user immediately sees dead zones in Master & Study!
    aps: [
      {
        id: 'ap-init-1',
        name: '玄关主路由',
        floorId: 'f1',
        x: 1.6,
        y: 4.8,
        mountHeightM: 0.85,
        type: 'router_main',
        txPower24: 20,
        txPower5: 23,
        channel24: 1,
        channel5: 36,
        wiredBackhaul: true,
        enabled: true,
      },
    ],
    demands: [
      { id: 'd1', floorId: 'f1', x: 6.1, y: 1.2, label: '书房电竞桌', category: 'critical' },
      { id: 'd2', floorId: 'f1', x: 11.1, y: 7.2, label: '主卧床头', category: 'high' },
      { id: 'd3', floorId: 'f1', x: 4.5, y: 6.1, label: '客厅主沙发', category: 'high' },
      { id: 'd4', floorId: 'f1', x: 11.0, y: 1.6, label: '次卧书桌', category: 'medium' },
      { id: 'd5', floorId: 'f1', x: 8.0, y: 5.3, label: '主卫马桶位', category: 'medium' },
      { id: 'd6', floorId: 'f1', x: 4.6, y: 8.6, label: '阳台扫地机基站', category: 'iot' },
    ],
  };

  // =========================================================================
  // PRESET 2: 165㎡ 现代挑空复式 Loft（双层 · 含客厅挑空区与楼梯井） — 10.8m x 8.6m
  // =========================================================================
  const loftEnvelope = () => [
    w(0, 0, 10.8, 0, 'concrete'),
    w(10.8, 0, 10.8, 8.6, 'concrete'),
    w(10.8, 8.6, 6.2, 8.6, 'concrete'),
    w(1.0, 8.6, 0, 8.6, 'concrete'),
    w(1.0, 8.6, 6.2, 8.6, 'glass'), // floor-to-ceiling curtain window
    w(0, 8.6, 0, 0, 'concrete'),
  ];

  const loft165: ProjectModel = {
    id: 'loft-165',
    name: '165㎡ 现代挑空复式 Loft',
    subtitle: '双层 · 演示客厅挑空区跨层穿透与楼板阻隔',
    weakBox: {
      floorId: 'loft-1f',
      x: 0.6,
      y: 2.2,
      label: '1F 入户弱电箱',
    },
    floors: [
      {
        id: 'loft-1f',
        name: '1F',
        label: '一层 · 挑空客厅 / 岛台餐厨 / 长辈房',
        levelIndex: 0,
        heightMeters: 3.1,
        slabAttenuation24: 15,
        slabAttenuation5: 22,
        footprint: [
          { x: 0, y: 0 },
          { x: 10.8, y: 0 },
          { x: 10.8, y: 8.6 },
          { x: 0, y: 8.6 },
        ],
        voids: [],
        rooms: [
          { id: 'lr1', name: '挑空大客厅', x: 3.5, y: 6.2, subtitle: '层高 6.2m 中空' },
          { id: 'lr2', name: '开放式岛台餐厅', x: 3.4, y: 2.1 },
          { id: 'lr3', name: '中西厨', x: 1.5, y: 1.1 },
          { id: 'lr4', name: '旋转楼梯间', x: 6.3, y: 1.8 },
          { id: 'lr5', name: '一楼长辈房', x: 8.8, y: 6.2 },
          { id: 'lr6', name: '一楼公卫', x: 8.9, y: 1.8 },
        ],
        walls: [
          ...loftEnvelope(),
          w(0, 1.8, 0, 2.9, 'metal'), // entry door
          w(0, 3.2, 2.8, 3.2, 'glass'), // kitchen glass partition
          w(5.4, 0, 5.4, 3.4, 'brick'), // stairwell west wall
          w(7.3, 0, 7.3, 3.4, 'concrete'), // stairwell east shear wall
          w(7.3, 3.4, 10.8, 3.4, 'brick'), // 1F bath south wall
          w(6.6, 4.4, 6.6, 8.6, 'concrete'), // shear wall before 1F elder bedroom
          w(6.6, 4.4, 7.6, 4.4, 'drywall'), // elder room door
          w(7.6, 4.4, 10.8, 4.4, 'concrete'),
        ],
      },
      {
        id: 'loft-2f',
        name: '2F',
        label: '二层 · 挑空走廊 / 主卧套房 / 独立书房',
        levelIndex: 1,
        heightMeters: 3.0,
        slabAttenuation24: 15,
        slabAttenuation5: 22,
        footprint: [
          { x: 0, y: 0 },
          { x: 10.8, y: 0 },
          { x: 10.8, y: 8.6 },
          { x: 0, y: 8.6 },
        ],
        voids: [
          {
            id: 'void-living',
            name: '客厅挑空上空 (无楼板)',
            kind: 'void',
            points: [
              { x: 0.6, y: 4.2 },
              { x: 5.8, y: 4.2 },
              { x: 5.8, y: 8.2 },
              { x: 0.6, y: 8.2 },
            ],
          },
          {
            id: 'void-stair',
            name: '楼梯井开口',
            kind: 'stairwell',
            points: [
              { x: 5.5, y: 0.3 },
              { x: 7.2, y: 0.3 },
              { x: 7.2, y: 3.2 },
              { x: 5.5, y: 3.2 },
            ],
          },
        ],
        rooms: [
          { id: 'lr2-1', name: '二楼书房 / 工作室', x: 2.6, y: 1.8, subtitle: '玻璃护栏临挑空' },
          { id: 'lr2-2', name: '挑空景观连廊', x: 6.2, y: 3.8 },
          { id: 'lr2-3', name: '二楼主卧大套房', x: 8.8, y: 6.4 },
          { id: 'lr2-4', name: '二楼主卫 & 衣帽间', x: 9.0, y: 1.8 },
        ],
        walls: [
          ...loftEnvelope(),
          // Glass balustrade around double-height void
          w(0.6, 4.2, 5.8, 4.2, 'glass'),
          w(5.8, 4.2, 5.8, 8.2, 'glass'),
          // 2F Study enclosure
          w(5.4, 0, 5.4, 3.4, 'brick'),
          w(0, 3.5, 4.4, 3.5, 'glass'),
          w(4.4, 3.5, 5.4, 3.5, 'drywall'),
          // 2F Master Suite behind concrete shear wall
          w(6.8, 4.2, 6.8, 8.6, 'concrete'),
          w(6.8, 3.4, 6.8, 4.2, 'drywall'), // master door
          w(7.3, 0, 7.3, 3.4, 'concrete'),
          w(7.3, 3.4, 8.3, 3.4, 'drywall'),
          w(8.3, 3.4, 10.8, 3.4, 'brick'),
        ],
      },
    ],
    aps: [
      {
        id: 'ap-loft-1',
        name: '1F 客厅电视柜主路由',
        floorId: 'loft-1f',
        x: 3.6,
        y: 4.6,
        mountHeightM: 0.85,
        type: 'router_main',
        txPower24: 20,
        txPower5: 23,
        channel24: 1,
        channel5: 36,
        wiredBackhaul: true,
        enabled: true,
      },
    ],
    demands: [
      { id: 'ld1', floorId: 'loft-1f', x: 3.2, y: 6.5, label: '1F 客厅沙发', category: 'high' },
      { id: 'ld2', floorId: 'loft-1f', x: 9.4, y: 6.4, label: '1F 长辈房床头', category: 'medium' },
      { id: 'ld3', floorId: 'loft-2f', x: 2.2, y: 1.5, label: '2F 书房双屏电脑桌', category: 'critical' },
      { id: 'ld4', floorId: 'loft-2f', x: 9.8, y: 6.8, label: '2F 主卧床头', category: 'high' },
      { id: 'ld5', floorId: 'loft-2f', x: 9.4, y: 1.5, label: '2F 主卫浴缸/马桶', category: 'medium' },
    ],
  };

  // =========================================================================
  // PRESET 3: 260㎡ 三层联排别墅（1F 社交餐厨 + 2F 儿女层 + 3F 主卧全景层） — 10.4m x 9.8m
  // =========================================================================
  const villaEnvelope = () => [
    w(0, 0, 10.4, 0, 'concrete'),
    w(10.4, 0, 10.4, 9.8, 'concrete'),
    w(10.4, 9.8, 6.8, 9.8, 'glass'),
    w(6.8, 9.8, 3.6, 9.8, 'concrete'),
    w(3.6, 9.8, 0, 9.8, 'glass'),
    w(0, 9.8, 0, 0, 'concrete'),
    // Central elevator + stairwell core across all 3 floors
    w(4.2, 3.2, 6.0, 3.2, 'metal'), // residential home elevator shaft
    w(4.2, 3.2, 4.2, 5.0, 'concrete'),
    w(6.0, 3.2, 6.0, 5.0, 'concrete'),
  ];

  const villaStairVoid = {
    id: 'villa-stair',
    name: '垂直楼梯井 & 弱电井',
    kind: 'stairwell' as const,
    points: [
      { x: 6.1, y: 3.0 },
      { x: 8.2, y: 3.0 },
      { x: 8.2, y: 5.2 },
      { x: 6.1, y: 5.2 },
    ],
  };

  const villa260: ProjectModel = {
    id: 'villa-260',
    name: '260㎡ 三层联排别墅',
    subtitle: '三层 · 垂直弱电井与全屋 AC+PoE AP 组网标杆',
    weakBox: {
      floorId: 'v-1f',
      x: 6.2,
      y: 2.6,
      label: '1F 弱电总箱(配PoE核心)',
    },
    floors: [
      {
        id: 'v-1f',
        name: '1F',
        label: '一层 · 社交横厅 / 中西双厨 / 门厅',
        levelIndex: 0,
        heightMeters: 3.3,
        slabAttenuation24: 16,
        slabAttenuation5: 23,
        footprint: [
          { x: 0, y: 0 },
          { x: 10.4, y: 0 },
          { x: 10.4, y: 9.8 },
          { x: 0, y: 9.8 },
        ],
        voids: [],
        rooms: [
          { id: 'vr1-1', name: '入户门厅', x: 8.6, y: 1.8 },
          { id: 'vr1-2', name: '中厨 & 西厨岛台', x: 2.2, y: 2.0 },
          { id: 'vr1-3', name: '7.2m 宽景横厅', x: 5.2, y: 7.6 },
          { id: 'vr1-4', name: '电梯/楼梯核心筒', x: 5.2, y: 4.2 },
        ],
        walls: [
          ...villaEnvelope(),
          w(10.4, 1.2, 10.4, 2.5, 'metal'), // villa entry door
          w(0, 3.8, 3.4, 3.8, 'glass'), // kitchen sliding glass
          w(6.8, 0, 6.8, 3.0, 'brick'),
        ],
      },
      {
        id: 'v-2f',
        name: '2F',
        label: '二层 · 南向双儿童房 / 北向长辈套房',
        levelIndex: 1,
        heightMeters: 3.0,
        slabAttenuation24: 16,
        slabAttenuation5: 23,
        footprint: [
          { x: 0, y: 0 },
          { x: 10.4, y: 0 },
          { x: 10.4, y: 9.8 },
          { x: 0, y: 9.8 },
        ],
        voids: [{ ...villaStairVoid, id: 'v2-stair' }],
        rooms: [
          { id: 'vr2-1', name: '南向儿童房 A', x: 2.5, y: 7.6 },
          { id: 'vr2-2', name: '南向儿童房 B', x: 8.0, y: 7.6 },
          { id: 'vr2-3', name: '北向长辈套房', x: 2.4, y: 1.8 },
          { id: 'vr2-4', name: '二层公卫 & 家政间', x: 8.8, y: 1.6 },
        ],
        walls: [
          ...villaEnvelope(),
          w(5.2, 5.4, 5.2, 9.8, 'concrete'), // wall between two kids rooms
          w(0, 5.4, 4.2, 5.4, 'brick'),
          w(4.2, 5.4, 5.2, 5.4, 'drywall'),
          w(5.2, 5.4, 6.2, 5.4, 'drywall'),
          w(6.2, 5.4, 10.4, 5.4, 'brick'),
          w(0, 3.2, 4.2, 3.2, 'concrete'),
          w(7.2, 0, 7.2, 3.0, 'brick'),
        ],
      },
      {
        id: 'v-3f',
        name: '3F',
        label: '三层 · 行政主卧大套房 / 双人书房 / 星空露台',
        levelIndex: 2,
        heightMeters: 3.0,
        slabAttenuation24: 16,
        slabAttenuation5: 23,
        footprint: [
          { x: 0, y: 0 },
          { x: 10.4, y: 0 },
          { x: 10.4, y: 9.8 },
          { x: 0, y: 9.8 },
        ],
        voids: [{ ...villaStairVoid, id: 'v3-stair' }],
        rooms: [
          { id: 'vr3-1', name: '全景主卧睡眠区', x: 2.8, y: 7.4 },
          { id: 'vr3-2', name: '步入式衣帽间 & 主卫', x: 2.2, y: 1.8 },
          { id: 'vr3-3', name: '三层独立双人书房', x: 8.4, y: 2.0 },
          { id: 'vr3-4', name: '南向观景露台', x: 8.2, y: 7.8 },
        ],
        walls: [
          ...villaEnvelope(),
          w(6.2, 5.2, 6.2, 9.8, 'glass'), // terrace glass door
          w(6.2, 5.2, 10.4, 5.2, 'concrete'),
          w(0, 3.4, 4.2, 3.4, 'brick'),
          w(6.4, 0, 6.4, 3.0, 'concrete'),
          w(6.4, 3.0, 7.5, 3.0, 'drywall'),
          w(7.5, 3.0, 10.4, 3.0, 'brick'),
        ],
      },
    ],
    aps: [
      {
        id: 'ap-v-1',
        name: '1F 横厅主路由',
        floorId: 'v-1f',
        x: 5.2,
        y: 6.2,
        mountHeightM: 0.85,
        type: 'router_main',
        txPower24: 20,
        txPower5: 23,
        channel24: 1,
        channel5: 36,
        wiredBackhaul: true,
        enabled: true,
      },
      {
        id: 'ap-v-2',
        name: '2F 走廊无线子路由',
        floorId: 'v-2f',
        x: 5.2,
        y: 5.1,
        mountHeightM: 0.8,
        type: 'mesh_node',
        txPower24: 19.5,
        txPower5: 22,
        channel24: 6,
        channel5: 44,
        wiredBackhaul: false, // Intentionally wireless in preset to trigger renovation wired-backhaul diagnostic!
        enabled: true,
      },
    ],
    demands: [
      { id: 'vd1', floorId: 'v-1f', x: 4.8, y: 7.8, label: '1F 横厅主沙发', category: 'high' },
      { id: 'vd2', floorId: 'v-1f', x: 2.0, y: 1.8, label: '1F 西厨岛台 iPad 位', category: 'medium' },
      { id: 'vd3', floorId: 'v-2f', x: 1.8, y: 8.2, label: '2F 儿童房A学习桌', category: 'high' },
      { id: 'vd4', floorId: 'v-2f', x: 8.8, y: 8.2, label: '2F 儿童房B学习桌', category: 'high' },
      { id: 'vd5', floorId: 'v-2f', x: 2.0, y: 1.6, label: '2F 长辈房床头', category: 'medium' },
      { id: 'vd6', floorId: 'v-3f', x: 2.2, y: 7.8, label: '3F 主卧床头', category: 'high' },
      { id: 'vd7', floorId: 'v-3f', x: 8.8, y: 1.5, label: '3F 书房远程办公桌', category: 'critical' },
    ],
  };

  return [flat118, loft165, villa260];
}
