import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'zh' | 'en';
export type ThemeMode = 'auto' | 'light' | 'dark';

const DICT = {
  zh: {
    brandSub: '装修前全屋 WiFi 仿真与弱电规划',
    presetPrefix: '样板间：',
    customPrefix: '自定义：',
    uploadPlan: '上传户型图',
    floor: '楼层',
    addFloorTitle: '新增楼层（自动继承下层外框与对齐基准）',
    deleteFloorTitle: '删除当前选中楼层',
    band5: '5GHz 高速',
    band24: '2.4G 穿墙',
    bandDual: '双频融合',
    view2d: '2D 蓝图',
    view3d: '3D 多层透视',
    scoreLabel: '满足度',
    wiringReport: '水电交底单',
    undoTitle: '撤销上一步 (Ctrl/Cmd + Z)',
    exportJsonTitle: '导出方案文件 (.json)',
    helpTitle: '查看使用向导',
    themeAuto: '自动',
    themeLight: '明亮',
    themeDark: '暗黑',
    closeDrawer: '收起',
    // ToolDock
    toolSelect: '选择/拖动',
    toolWall: '绘制墙体',
    toolVoid: '挑空/楼梯',
    toolAddAp: '放置AP',
    toolAddDemand: '标需求点',
    toolWeakBox: '定弱电箱',
    toolScale: '比例尺',
    toolAlign: '多层对齐',
    toolEraser: '橡皮擦',
    selectWallMat: '选择墙体/遮挡材质',
    loss5g: '5G 损耗',
    selectApType: '选择网络设备形态',
    selectDemandTier: '选择用网需求权重',
    weightPrefix: '权重',
    targetPrefix: '目标',
    // RightPanel
    evalTitle: '全屋网络体验评估',
    overallScoreLabel: '综合分',
    devicesOnline: '台设备在线',
    keyZonesPassed: '重点区达标',
    highSpeedCov: '高速覆盖率',
    estBudget: '预估预算',
    basisBtn: '依据',
    costBasisHeader: '费用与材料测算参考依据：',
    optTitle: '智能最优网络点位计算',
    optElapsed: '耗时',
    tabRecommend: '按需推荐组网方案',
    tabCustom: '指定设备求最优位',
    optDescRecommend:
      '结合全屋墙体衰减、楼层挑空与重点需求热区，自动测算对比单路由 / 有线 Mesh / 全屋 AC+PoE 面板 AP 最优布点：',
    btnCalcRecommend: '一键计算全屋最优组网方案',
    btnCalculating: '正在全局模拟退火寻优...',
    applyPlacement: '应用点位',
    scoreUnit: '分',
    passedLabel: '达标',
    cableLabel: '网线',
    approxBudgetPrefix: '约¥',
    optDescCustom: '自由设定计划购买的设备数量，算法自动贴墙/避开挑空区求全局最高分摆法：',
    btnCalcFixed: '计算最优摆放坐标',
    perUnitSuffix: '/台',
    deviceListTitle: '已部署网络设备清单',
    deviceEditTitle: '设备调优',
    backToList: '返回列表',
    wiredBackhaul: '预埋六类网线（有线回程）',
    wiredBackhaulDesc: '关闭后模拟纯无线 Mesh 中继衰减',
    power5g: '5GHz 功率',
    channel5g: '5GHz 信道规划',
    wiredTag: '有线',
    wirelessTag: '无线回程',
    tapeMeasurePrefix: '工地卷尺定位：距',
    demandHealthTitle: '核心用网区域信号体检',
    targetShort: '目标',
    diagnosticsTitle: '装修水电阶段避坑诊断',
    openReportCta: '查看并打印《水电工网线交底清单》 →',
    // Canvas2D & Viewer3D
    legendStrong: '强 -40',
    legendWeak: '-85 dBm 盲区',
    contours: '等值线',
    cables: '网线走线',
    wavePulse: '波纹',
    lowerGhost: '下层参考',
    fitScreenTitle: '居中适应屏幕',
    scaleDialogTitle: '校准全局户型比例尺',
    scaleDialogDesc: '请输入刚才拉出的橙色基准线段在现实中的真实长度（米），全屋墙体与底图将自动等比校准：',
    metersUnit: '米 (m)',
    cancel: '取消',
    confirmScale: '确认校准尺寸',
    rotateDir: '旋转朝向',
    connectedTo: '连接至',
    weakBoxShort: '弱电',
    riserShort: '竖井',
    voidCrossFloor: '↕ 跨层无楼板直通',
    alignOriginLabel: '(0,0) 垂直对齐锚点',
    viewer3dTitle: '3D 多层空间信号与弱电拓扑',
    viewer3dDesc: '左键旋转 · 右键平移 · 滚轮缩放。橙色折线展示从入户弱电箱经垂直竖井通往各层 AP 的六类网线穿管路径。',
    editFloorPrefix: '编辑 ',
    editFloorSuffix: ' 平面',
    explodeGap: '楼层爆炸间距',
    wallOpacity: '墙体透视度',
    poeConduit: 'PoE 网线穿管',
    resetView: '复位视角',
    // Onboarding
    onboardBadge: '3 步快速上手',
    onboardTitle: '30 秒搞懂：装修前怎么规划全屋 WiFi？',
    onboardSub: '不用懂专业射频术语，跟着下面 3 步就能算出路由器放哪最稳、网线往哪埋。',
    step1Title: '1. 选户型或上传图纸',
    step1Desc: '直接用「样板间」体验，或点「上传户型图」自动提取墙体。',
    step1ScaleWarn: '重点：导入户型图后，务必用左侧「比例尺」拉线输入实际米数，否则穿墙衰减与网线长度会失准！',
    step2Title: '2. 点出你在意的房间',
    step2Desc: '用左侧「标需求点」标出书房、主卧床头等位置，再用「定弱电箱」标出入户光猫位置。',
    step3Title: '3. 一键算最优 & 导出',
    step3Desc: '点右侧「一键计算全屋最优组网方案」，确认后点右上角「水电交底单」直接打印给工长。',
    dontShowAgain: '下次不再自动弹出',
    exploreSelf: '自己先逛逛',
    tryAutoOpt: '直接帮我算一次最优方案',
  },
  en: {
    brandSub: 'Pre-Renovation Wi-Fi & Cabling Planner',
    presetPrefix: 'Preset: ',
    customPrefix: 'Custom: ',
    uploadPlan: 'Upload Plan',
    floor: 'Floor',
    addFloorTitle: 'Add floor (auto-inherits structural frame)',
    deleteFloorTitle: 'Delete selected floor',
    band5: '5GHz Fast',
    band24: '2.4G Range',
    bandDual: 'Dual-Band',
    view2d: '2D Blueprint',
    view3d: '3D Exploded',
    scoreLabel: 'Score',
    wiringReport: 'Wiring Sheet',
    undoTitle: 'Undo (Ctrl/Cmd + Z)',
    exportJsonTitle: 'Export Project (.json)',
    helpTitle: 'Quick Start Guide',
    themeAuto: 'Auto',
    themeLight: 'Light',
    themeDark: 'Dark',
    closeDrawer: 'Close',
    // ToolDock
    toolSelect: 'Select',
    toolWall: 'Draw Wall',
    toolVoid: 'Void/Stair',
    toolAddAp: 'Place AP',
    toolAddDemand: 'Demand Pin',
    toolWeakBox: 'Weak Box',
    toolScale: 'Scale',
    toolAlign: 'Align 0,0',
    toolEraser: 'Eraser',
    selectWallMat: 'Wall / Obstacle Material',
    loss5g: '5G Loss',
    selectApType: 'AP Hardware Type',
    selectDemandTier: 'Demand Priority Tier',
    weightPrefix: 'Weight',
    targetPrefix: 'Target',
    // RightPanel
    evalTitle: 'Whole-Home Wi-Fi Score',
    overallScoreLabel: 'Score',
    devicesOnline: 'APs active',
    keyZonesPassed: 'Pins Passed',
    highSpeedCov: '≥-67dBm Cov',
    estBudget: 'Est. Cost',
    basisBtn: 'Basis',
    costBasisHeader: 'Cost & Material Estimation Basis:',
    optTitle: 'Smart AP Placement Optimizer',
    optElapsed: 'Time',
    tabRecommend: 'Auto Recommend',
    tabCustom: 'Fixed Devices',
    optDescRecommend:
      'Compares Single Router, Wired Mesh, and PoE In-Wall/Ceiling APs against your walls, voids, and demand pins:',
    btnCalcRecommend: 'Find Optimal Whole-Home Setup',
    btnCalculating: 'Running Simulated Annealing...',
    applyPlacement: 'Apply',
    scoreUnit: 'pts',
    passedLabel: 'Passed',
    cableLabel: 'Cat6',
    approxBudgetPrefix: '~¥',
    optDescCustom: 'Choose your planned device count and solve for the highest-scoring wall/ceiling coordinates:',
    btnCalcFixed: 'Optimize Placement',
    perUnitSuffix: ' ea',
    deviceListTitle: 'Deployed Network Devices',
    deviceEditTitle: 'Tune AP',
    backToList: 'All APs',
    wiredBackhaul: 'Wired Cat6 Backhaul',
    wiredBackhaulDesc: 'Disable to simulate wireless Mesh hop loss',
    power5g: '5GHz Tx Power',
    channel5g: '5GHz Channel',
    wiredTag: 'Wired',
    wirelessTag: 'Wireless',
    tapeMeasurePrefix: 'Tape Ref: ',
    demandHealthTitle: 'Key Demand Pins Check',
    targetShort: 'Target',
    diagnosticsTitle: 'Pre-Renovation Diagnostics',
    openReportCta: 'Open Printable Electrician Wiring Sheet →',
    // Canvas2D & Viewer3D
    legendStrong: 'Strong -40',
    legendWeak: '-85 dBm Dead',
    contours: 'Contours',
    cables: 'Cat6 Runs',
    wavePulse: 'Wave',
    lowerGhost: 'Lower Ghost',
    fitScreenTitle: 'Fit to Screen',
    scaleDialogTitle: 'Calibrate Global Floorplan Scale',
    scaleDialogDesc: 'Enter the real-world length (in meters) of the orange line you just drew:',
    metersUnit: 'm',
    cancel: 'Cancel',
    confirmScale: 'Apply Scale',
    rotateDir: 'Rotate',
    connectedTo: 'Served by',
    weakBoxShort: 'BOX',
    riserShort: 'RISER',
    voidCrossFloor: '↕ Open Double-Height',
    alignOriginLabel: '(0,0) Alignment Origin',
    viewer3dTitle: '3D Multi-Floor Signal & Cabling',
    viewer3dDesc: 'Left-drag rotate · Right-drag pan · Scroll zoom. Orange conduits trace Cat6 runs from the weak-current box.',
    editFloorPrefix: 'Edit ',
    editFloorSuffix: '',
    explodeGap: 'Floor Explode',
    wallOpacity: 'Wall Opacity',
    poeConduit: 'PoE Conduits',
    resetView: 'Reset Camera',
    // Onboarding
    onboardBadge: '3-STEP QUICK START',
    onboardTitle: 'Plan Your Home Wi-Fi in 30 Seconds',
    onboardSub: 'No RF jargon needed—follow 3 simple steps to see where routers go and where to run Ethernet.',
    step1Title: '1. Load or Upload Floorplan',
    step1Desc: 'Pick a preset home above, or click "Upload Plan" to auto-extract walls.',
    step1ScaleWarn: 'Key Step: Always use the "Scale" tool on the left to calibrate real-world meters after uploading—otherwise wall loss & cable lengths will be inaccurate!',
    step2Title: '2. Pin Important Rooms',
    step2Desc: 'Use "Demand Pin" to mark desks & beds, and "Weak Box" to mark your fiber entry cabinet.',
    step3Title: '3. Auto-Optimize & Export',
    step3Desc: 'Click "Find Optimal Whole-Home Setup", then open "Wiring Sheet" to print for your contractor.',
    dontShowAgain: "Don't show automatically next time",
    exploreSelf: 'Explore on My Own',
    tryAutoOpt: 'Run Optimal Setup Now',
  },
} as const;

export type DictKey = keyof typeof DICT.zh;

const ZH_TO_EN_LABEL_MAP: Record<string, string> = {
  // Presets & Floors
  '118㎡ 南北通透三居室': '118㎡ 3-Bedroom Flat',
  '165㎡ 现代挑空复式 Loft': '165㎡ Double-Height Loft',
  '260㎡ 三层联排别墅': '260㎡ 3-Story Townhouse',
  '平层 · 三室两厅两卫': 'Single Floor · 3 Bed 2 Bath',
  '一层 · 挑空客厅 / 岛台餐厨 / 长辈房': '1F · Double-Height Living / Kitchen / Guest',
  '二层 · 挑空走廊 / 主卧套房 / 独立书房': '2F · Void Corridor / Master Suite / Study',
  '一层 · 社交横厅 / 中西双厨 / 门厅': '1F · Great Room / Dual Kitchen / Foyer',
  '二层 · 南向双儿童房 / 北向长辈套房': '2F · Kids Rooms / Elder Suite',
  '三层 · 行政主卧大套房 / 双人书房 / 星空露台': '3F · Master Suite / Study / Terrace',
  // Rooms & Voids
  '入户玄关': 'Entry Foyer',
  '餐厨区': 'Kitchen & Dining',
  '北向明厨': 'North Kitchen',
  '客厅': 'Living Room',
  '开间 4.2m': '4.2m Span',
  '南向景观阳台': 'South Balcony',
  '北书房 / 电竞室': 'Study / Gaming',
  '公卫': 'Common Bath',
  '南向次卧': 'Guest Bedroom',
  '南向主卧套房': 'Master Suite',
  '含独立主卫': 'Ensuite Bath',
  '主卫': 'Master Bath',
  '挑空大客厅': 'Double-Height Living',
  '层高 6.2m 中空': '6.2m Open Void',
  '开放式岛台餐厅': 'Island Dining',
  '中西厨': 'Dual Kitchen',
  '旋转楼梯间': 'Spiral Stairwell',
  '一楼长辈房': '1F Elder Bedroom',
  '一楼公卫': '1F Bath',
  '二楼书房 / 工作室': '2F Study / Studio',
  '玻璃护栏临挑空': 'Glass Balustrade',
  '挑空景观连廊': 'Void Gallery',
  '二楼主卧大套房': '2F Master Suite',
  '二楼主卫 & 衣帽间': '2F Bath & Closet',
  '客厅挑空上空 (无楼板)': 'Living Void (No Slab)',
  '楼梯井开口': 'Stairwell Opening',
  '挑空区 / 楼梯口': 'Void / Stairwell',
  '楼梯开口': 'Stair Opening',
  '垂直楼梯井 & 弱电井': 'Stairwell & Riser Shaft',
  '入户门厅': 'Main Foyer',
  '中厨 & 西厨岛台': 'Dual Kitchen',
  '7.2m 宽景横厅': '7.2m Wide Living',
  '电梯/楼梯核心筒': 'Elevator / Stair Core',
  '南向儿童房 A': 'Kids Room A',
  '南向儿童房 B': 'Kids Room B',
  '北向长辈套房': 'Elder Suite',
  '二层公卫 & 家政间': '2F Bath & Utility',
  '全景主卧睡眠区': 'Master Bedroom',
  '步入式衣帽间 & 主卫': 'Closet & Master Bath',
  '三层独立双人书房': '3F Dual Study',
  '南向观景露台': 'South Terrace',
  // Weak Box & APs & Demand Pins
  '入户弱电箱': 'Entry Weak-Current Box',
  '1F 入户弱电箱': '1F Weak-Current Box',
  '1F 弱电总箱(配PoE核心)': '1F PoE Core Cabinet',
  '玄关主路由': 'Foyer Main Router',
  '1F 客厅电视柜主路由': '1F Living Main Router',
  '1F 横厅主路由': '1F Living Main Router',
  '2F 走廊无线子路由': '2F Wireless Mesh',
  '书房电竞桌': 'Study Gaming Desk',
  '主卧床头': 'Master Bedside',
  '客厅主沙发': 'Living Sofa',
  '次卧书桌': 'Guest Desk',
  '主卫马桶位': 'Master Bath',
  '阳台扫地机基站': 'Balcony Robot Dock',
  '1F 客厅沙发': '1F Living Sofa',
  '1F 长辈房床头': '1F Elder Bedside',
  '2F 书房双屏电脑桌': '2F Study Dual-Monitor',
  '2F 主卧床头': '2F Master Bedside',
  '2F 主卫浴缸/马桶': '2F Master Bath',
  '1F 横厅主沙发': '1F Living Sofa',
  '1F 西厨岛台 iPad 位': '1F Kitchen Island',
  '2F 儿童房A学习桌': '2F Kids A Desk',
  '2F 儿童房B学习桌': '2F Kids B Desk',
  '2F 长辈房床头': '2F Elder Bedside',
  '3F 主卧床头': '3F Master Bedside',
  '3F 书房远程办公桌': '3F Study Work Desk',
  '自定义上传户型方案': 'Custom Uploaded Floorplan',
  '自定义多层户型方案': 'Custom Multi-Floor Plan',
};

export function localizeText(text: string, lang: Lang): string {
  if (lang === 'zh') return text;
  if (ZH_TO_EN_LABEL_MAP[text]) return ZH_TO_EN_LABEL_MAP[text];
  // Handle dynamic generated labels like "1F 主路由", "2F 面板AP-2", "1F 吸顶AP-1", "1F 有线Mesh-1"
  return text
    .replace('主路由', 'Main Router')
    .replace('有线Mesh', 'Wired Mesh')
    .replace('面板AP', 'In-Wall AP')
    .replace('吸顶AP', 'Ceiling AP')
    .replace('核心低延迟', 'Gaming/Work')
    .replace('高频影音', '4K/Bedside')
    .replace('日常流畅', 'Daily')
    .replace('智能家居', 'IoT');
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
  loc: (text: string) => string;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem('waveplan_lang_v1') === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const v = localStorage.getItem('waveplan_theme_v1');
      if (v === 'light' || v === 'dark' || v === 'auto') return v;
    } catch {
      // ignore
    }
    return 'auto';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'auto' ? (systemDark ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [resolvedTheme]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('waveplan_lang_v1', l);
    } catch {
      // ignore
    }
  };

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    try {
      localStorage.setItem('waveplan_theme_v1', m);
    } catch {
      // ignore
    }
  };

  const t = (key: DictKey): string => DICT[lang][key];
  const loc = (text: string): string => localizeText(text, lang);

  return (
    <I18nContext.Provider
      value={{ lang, setLang, t, loc, themeMode, setThemeMode, resolvedTheme }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
