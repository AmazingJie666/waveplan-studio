import {
  APDeviceSpec,
  APMountType,
  DemandCategory,
  DemandSpec,
  WallMaterial,
  WallMaterialSpec,
} from '../types/wifi';

export const WALL_MATERIALS: Record<WallMaterial, WallMaterialSpec> = {
  concrete: {
    id: 'concrete',
    name: '钢筋混凝土承重墙',
    shortName: '承重墙',
    thicknessM: 0.24,
    attenuation24: 12,
    attenuation5: 18,
    color: '#18191B',
    strokeWidthPx: 5.5,
    description: '剪力墙/分户墙，内含密集钢筋网，5GHz 穿两堵即断流',
  },
  brick: {
    id: 'brick',
    name: '实心砖 / 砌块隔墙',
    shortName: '普通砖墙',
    thicknessM: 0.15,
    attenuation24: 7,
    attenuation5: 10.5,
    color: '#52565E',
    strokeWidthPx: 3.6,
    description: '厨卫及卧室间常见砌筑隔墙，可穿一堵，两堵明显衰减',
  },
  drywall: {
    id: 'drywall',
    name: '轻质石膏板 / 木门衣柜',
    shortName: '轻体/木门',
    thicknessM: 0.09,
    attenuation24: 3,
    attenuation5: 4.2,
    color: '#8B9099',
    strokeWidthPx: 2.2,
    dashed: true,
    description: '轻钢龙骨石膏板、木质房门或通顶定制衣柜，信号损耗较小',
  },
  glass: {
    id: 'glass',
    name: '双层中空玻璃移门/窗',
    shortName: '玻璃移门',
    thicknessM: 0.06,
    attenuation24: 2,
    attenuation5: 3.2,
    color: '#2563EB',
    strokeWidthPx: 2.4,
    description: '阳台推拉门、淋浴房玻璃隔断（注：Low-E 镀膜玻璃损耗会略高）',
  },
  metal: {
    id: 'metal',
    name: '金属防盗门 / 电梯井 / 冰箱',
    shortName: '金属遮挡',
    thicknessM: 0.12,
    attenuation24: 18,
    attenuation5: 25,
    color: '#DC2626',
    strokeWidthPx: 4.5,
    description: '入户门、电梯井道、双开门大冰箱及金属配电柜，强电磁屏蔽体',
  },
};

export const AP_SPECS: Record<APMountType, APDeviceSpec> = {
  router_main: {
    type: 'router_main',
    name: '旗舰双频千兆/2.5G 主路由',
    shortName: '旗舰主路由',
    mountDesc: '桌面/电视柜摆放 · 全向高增益天线',
    defaultHeightM: 0.85,
    txPower24: 20,
    txPower5: 23,
    unitPriceRmb: 499,
    directional: false,
    poeRequired: false,
  },
  mesh_node: {
    type: 'mesh_node',
    name: 'Mesh 分布式子路由',
    shortName: 'Mesh 子路由',
    mountDesc: '书桌/床头柜摆放 · 强烈建议预埋六类网线有线回程',
    defaultHeightM: 0.8,
    txPower24: 19.5,
    txPower5: 22,
    unitPriceRmb: 349,
    directional: false,
    poeRequired: false,
  },
  panel_ap: {
    type: 'panel_ap',
    name: '86 型 PoE 墙面面板 AP',
    shortName: '86 面板 AP',
    mountDesc: '嵌入标准 86 暗盒 · 正面朝房间定向增强，隐形美观',
    defaultHeightM: 0.5,
    txPower24: 18.5,
    txPower5: 20.5,
    unitPriceRmb: 329,
    directional: true,
    poeRequired: true,
  },
  ceiling_ap: {
    type: 'ceiling_ap',
    name: 'PoE 吸顶式全向 AP',
    shortName: '吸顶 AP',
    mountDesc: '吊顶居中暗装 · 避开低矮家具遮挡，大空间覆盖极佳',
    defaultHeightM: 2.8,
    txPower24: 20,
    txPower5: 22.5,
    unitPriceRmb: 429,
    directional: false,
    poeRequired: true,
  },
};

export const DEMAND_SPECS: Record<DemandCategory, DemandSpec> = {
  critical: {
    category: 'critical',
    name: '电竞 / 远程会议核心位',
    shortName: '核心低延迟',
    weight: 3.0,
    target5dBm: -58,
    target24dBm: -62,
    preferBand: '5ghz',
    color: '#EA580C',
    description: '书房电脑桌、工作室——要求 5GHz 强信号满速且零丢包抖动',
  },
  high: {
    category: 'high',
    name: '高频 4K 影音 / 刷视频位',
    shortName: '高频影音',
    weight: 2.0,
    target5dBm: -65,
    target24dBm: -68,
    preferBand: '5ghz',
    color: '#0F766E',
    description: '主卧床头、客厅主沙发——要求 5GHz 稳定覆盖与丝滑漫游',
  },
  medium: {
    category: 'medium',
    name: '日常覆盖区（次卧/餐厨/卫浴）',
    shortName: '日常流畅',
    weight: 1.2,
    target5dBm: -70,
    target24dBm: -70,
    preferBand: 'dual',
    color: '#2563EB',
    description: '次卧、餐厅、卫生间马桶位——日常网页视频与语音通话不断连',
  },
  iot: {
    category: 'iot',
    name: '全屋智能 IoT 传感边缘区',
    shortName: '智能家居',
    weight: 0.5,
    target5dBm: -76,
    target24dBm: -76,
    preferBand: '2.4ghz',
    color: '#64748B',
    description: '生活阳台、入户玄关、储物间——扫地机/智能门锁 2.4GHz 稳定在线',
  },
};

export const CHANNELS_24 = [1, 6, 11];
export const CHANNELS_5 = [36, 44, 52, 149, 157];

export const COST_BASIS_NOTES = [
  {
    item: '旗舰主路由 (¥499)',
    basis: '参考主流双频 Wi-Fi 6/7（AX3000~BE5100）家用路由均价区间 ¥350~¥650',
  },
  {
    item: 'Mesh 子路由 (¥349/台)',
    basis: '参考支持有线回程的 AX3000 分布式节点单价（¥280~¥420/台）',
  },
  {
    item: '86 面板 AP (¥329/台)',
    basis: '参考主流 AX3000 规格标准 86 盒 PoE 面板 AP 单价（¥280~¥380/台）',
  },
  {
    item: '吸顶 AP (¥429/台)',
    basis: '参考主流 AX3000 双频 PoE 吸顶 AP 单价（¥360~¥500/台）',
  },
  {
    item: 'PoE·AC 一体机 (¥380~¥580)',
    basis: '5口(¥380)/8口(¥580) 千兆 PoE 供电与 AC 管理一体机均价（仅面板/吸顶方案计入）',
  },
  {
    item: '六类网线与辅材 (¥6/米)',
    basis: '国标无氧铜 Cat6 非屏蔽线(~¥4/m) + PVC 穿线管辅材摊销(~¥2/m)，不含水电人工开槽费',
  },
  {
    item: '线长估算公式',
    basis: '垂直楼层高差 + 水平直角(曼哈顿)走线距离 + 1.8m 端接余量（备货另含 15% 施工余量）',
  },
];

export const COST_BASIS_NOTES_EN = [
  {
    item: 'Flagship Router (¥499 / ~$70)',
    basis: 'Mainstream dual-band Wi-Fi 6/7 (AX3000–BE5100) retail range ¥350–¥650',
  },
  {
    item: 'Mesh Node (¥349 / ~$49 ea)',
    basis: 'Wired-backhaul AX3000 Mesh node unit price (¥280–¥420)',
  },
  {
    item: '86 In-Wall AP (¥329 / ~$46 ea)',
    basis: 'Standard 86-box AX3000 PoE wall-plate AP unit price (¥280–¥380)',
  },
  {
    item: 'Ceiling AP (¥429 / ~$60 ea)',
    basis: 'Mainstream AX3000 dual-band PoE ceiling AP unit price (¥360–¥500)',
  },
  {
    item: 'PoE·AC Gateway (¥380–¥580)',
    basis: '5-port (¥380) / 8-port (¥580) Gigabit PoE + AC controller switch (only added for PoE AP setups)',
  },
  {
    item: 'Cat6 Cable & Conduit (¥6/m)',
    basis: 'OFC Cat6 UTP cable (~¥4/m) + PVC conduit amortization (~¥2/m), excluding electrician labor',
  },
  {
    item: 'Length Formula',
    basis: 'Vertical floor riser + Manhattan horizontal run + 1.8m termination slack (+15% spool buffer)',
  },
];

export const WALL_MATERIALS_EN: Record<
  WallMaterial,
  { name: string; shortName: string; description: string }
> = {
  concrete: {
    name: 'Reinforced Concrete Shear Wall',
    shortName: 'Concrete',
    description: 'Load-bearing rebar wall; two layers block 5GHz almost completely',
  },
  brick: {
    name: 'Solid Brick / Masonry Wall',
    shortName: 'Brick',
    description: 'Standard room partition; passes 1 wall well, attenuates across 2+',
  },
  drywall: {
    name: 'Drywall / Wood Door / Closet',
    shortName: 'Drywall',
    description: 'Light framing, wooden doors, or wardrobes with minimal loss',
  },
  glass: {
    name: 'Double-Glazed Sliding Door / Window',
    shortName: 'Glass',
    description: 'Balcony sliding doors or shower glass (Low-E tint loses slightly more)',
  },
  metal: {
    name: 'Steel Door / Elevator / Fridge',
    shortName: 'Metal',
    description: 'Entry security door, elevator shaft, or double-door fridge (strong shield)',
  },
};

export const AP_SPECS_EN: Record<
  APMountType,
  { name: string; shortName: string; mountDesc: string }
> = {
  router_main: {
    name: 'Flagship Dual-Band Router',
    shortName: 'Main Router',
    mountDesc: 'Desk / TV console · High-gain omni antennas',
  },
  mesh_node: {
    name: 'Wired Mesh Satellite',
    shortName: 'Mesh Node',
    mountDesc: 'Desk / Nightstand · Run Cat6 wired backhaul before renovation',
  },
  panel_ap: {
    name: '86-Box PoE In-Wall AP',
    shortName: 'In-Wall AP',
    mountDesc: 'Flush 86 wall box · Directional into room, clean & hidden',
  },
  ceiling_ap: {
    name: 'PoE Ceiling Omni AP',
    shortName: 'Ceiling AP',
    mountDesc: 'Ceiling-mounted · Clears furniture clutter for wide coverage',
  },
};

export const DEMAND_SPECS_EN: Record<
  DemandCategory,
  { name: string; shortName: string; description: string }
> = {
  critical: {
    name: 'Gaming / Video Calls Core',
    shortName: 'Critical',
    description: 'Study desk / office — requires full-speed 5GHz with zero jitter',
  },
  high: {
    name: '4K Streaming / Bedside',
    shortName: 'High',
    description: 'Master bed / living sofa — smooth 5GHz & seamless roaming',
  },
  medium: {
    name: 'Daily Coverage (Guest / Bath)',
    shortName: 'Medium',
    description: 'Guest rooms, dining, bathrooms — reliable daily browsing',
  },
  iot: {
    name: 'Smart Home IoT Edge',
    shortName: 'IoT',
    description: 'Balcony, foyer, storage — 2.4GHz connectivity for locks & docks',
  },
};

/**
 * Braun / Architectural daylight color scale for RSSI (-35 dBm to -88 dBm)
 * Crisp, readable against architectural linework and suitable for A4 printing.
 */
export function rssiToRgba(rssi: number, alphaScale = 1): [number, number, number, number] {
  if (Number.isNaN(rssi)) return [0, 0, 0, 0];

  // Clamp between -88 and -36
  const clamped = Math.max(-88, Math.min(-36, rssi));

  // Key stops:
  // -36 dBm: Deep Emerald (#059669) -> [5, 150, 105]
  // -55 dBm: Mint Emerald (#10B981) -> [16, 185, 129]
  // -64 dBm: Lime Chartreuse (#84CC16) -> [132, 204, 22]
  // -69 dBm: Warm Amber (#F59E0B) -> [245, 158, 11]
  // -76 dBm: Coral Rose (#EF4444) -> [239, 68, 68]
  // -88 dBm: Cool Dead Slate (#94A3B8) -> [148, 163, 184]
  const stops: { dbm: number; rgb: [number, number, number]; a: number }[] = [
    { dbm: -36, rgb: [5, 150, 105], a: 195 },
    { dbm: -55, rgb: [16, 185, 129], a: 178 },
    { dbm: -64, rgb: [132, 204, 22], a: 162 },
    { dbm: -70, rgb: [245, 158, 11], a: 155 },
    { dbm: -76, rgb: [239, 68, 68], a: 148 },
    { dbm: -88, rgb: [148, 163, 184], a: 115 },
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const hi = stops[i];
    const lo = stops[i + 1];
    if (clamped >= lo.dbm && clamped <= hi.dbm) {
      const t = (hi.dbm - clamped) / (hi.dbm - lo.dbm);
      return [
        Math.round(hi.rgb[0] + (lo.rgb[0] - hi.rgb[0]) * t),
        Math.round(hi.rgb[1] + (lo.rgb[1] - hi.rgb[1]) * t),
        Math.round(hi.rgb[2] + (lo.rgb[2] - hi.rgb[2]) * t),
        Math.round((hi.a + (lo.a - hi.a) * t) * alphaScale),
      ];
    }
  }

  return [148, 163, 184, Math.round(115 * alphaScale)];
}
