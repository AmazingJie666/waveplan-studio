import React from 'react';
import { Check, Map, Printer, ShieldAlert, Wrench, X } from 'lucide-react';
import { AP_SPECS, AP_SPECS_EN, COST_BASIS_NOTES, WALL_MATERIALS } from '../constants/specs';
import {
  computeTapeMeasureRefs,
  estimateApCableRun,
  findNearestRoomWallAware,
  getFloorBoundsAndFootprint,
} from '../engine/geometry';
import { Lang, localizeText, useI18n } from '../i18n/useI18n';
import {
  AccessPoint,
  FloorLevel,
  NetworkEvaluation,
  ProjectModel,
  WeakCurrentBox,
} from '../types/wifi';

interface WiringReportModalProps {
  project: ProjectModel;
  evaluation: NetworkEvaluation;
  onClose: () => void;
}

const COST_BASIS_NOTES_EN = [
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

function translateWallDir(dir: string, lang: Lang): string {
  if (lang === 'zh') return dir;
  if (dir === '东(右)墙') return 'East (Right) wall';
  if (dir === '西(左)墙') return 'West (Left) wall';
  if (dir === '南(下)墙') return 'South (Bottom) wall';
  if (dir === '北(上)墙') return 'North (Top) wall';
  return 'nearest wall';
}

function describeApLocation(
  ap: AccessPoint,
  floor: FloorLevel | undefined,
  weakBox: WeakCurrentBox,
  lang: Lang
): { roomHint: string; relativeHint: string; tapeHint: string } {
  let roomHint = lang === 'zh' ? '该层平面区域' : 'Floor area';
  const match = findNearestRoomWallAware(ap.x, ap.y, floor);
  if (match) {
    if (lang === 'zh') {
      roomHint =
        match.sameRoom && match.dist <= 2.8
          ? `「${match.roomName}」内`
          : match.sameRoom
          ? `靠近「${match.roomName}」`
          : `「${match.roomName}」附近墙体侧`;
    } else {
      const rName = localizeText(match.roomName, lang);
      roomHint =
        match.sameRoom && match.dist <= 2.8
          ? `Inside "${rName}"`
          : match.sameRoom
          ? `Near "${rName}"`
          : `Wall side near "${rName}"`;
    }
  }

  const dx = ap.x - weakBox.x;
  const dy = ap.y - weakBox.y;
  const parts: string[] = [];
  if (lang === 'zh') {
    if (Math.abs(dx) >= 0.4) parts.push(`偏${dx > 0 ? '东(右)' : '西(左)'} ${Math.abs(dx).toFixed(1)}m`);
    if (Math.abs(dy) >= 0.4) parts.push(`偏${dy > 0 ? '南(下)' : '北(上)'} ${Math.abs(dy).toFixed(1)}m`);
  } else {
    if (Math.abs(dx) >= 0.4) parts.push(`${Math.abs(dx).toFixed(1)}m ${dx > 0 ? 'East' : 'West'}`);
    if (Math.abs(dy) >= 0.4) parts.push(`${Math.abs(dy).toFixed(1)}m ${dy > 0 ? 'South' : 'North'}`);
  }

  const relativeHint =
    parts.length > 0
      ? lang === 'zh'
        ? `距弱电竖井${parts.join('、')}`
        : `${parts.join(', ')} from Riser`
      : lang === 'zh'
      ? '紧邻弱电箱位置'
      : 'Adjacent to Weak-Current Box';

  const tape = floor ? computeTapeMeasureRefs(ap.x, ap.y, floor.walls) : null;
  const tapeHint = tape
    ? lang === 'zh'
      ? `卷尺定位：距${tape.horizDir} ${tape.horizDistM}m · 距${tape.vertDir} ${tape.vertDistM}m`
      : `Tape Ref: ${tape.horizDistM}m to ${translateWallDir(tape.horizDir, lang)} · ${tape.vertDistM}m to ${translateWallDir(tape.vertDir, lang)}`
    : lang === 'zh'
    ? `图纸坐标 (${ap.x.toFixed(1)}m, ${ap.y.toFixed(1)}m)`
    : `Coords (${ap.x.toFixed(1)}m, ${ap.y.toFixed(1)}m)`;

  return { roomHint, relativeHint, tapeHint };
}

const FloorBlueprintMap: React.FC<{
  floor: FloorLevel;
  allFloors: FloorLevel[];
  indexedAps: { ap: AccessPoint; code: string }[];
  weakBox: WeakCurrentBox;
  lang: Lang;
}> = ({ floor, allFloors, indexedAps, weakBox, lang }) => {
  const { minX, minY, maxX, maxY, footprint } = getFloorBoundsAndFootprint(floor);
  const pad = 1.0;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = Math.max(4, maxX - minX + pad * 2);
  const vh = Math.max(4, maxY - minY + pad * 2);

  const floorAps = indexedAps.filter((item) => item.ap.floorId === floor.id);
  const isSameFloorBox = weakBox.floorId === floor.id;

  return (
    <div className="border border-[#DCDCD6] rounded-xl bg-[#FAFAF8] p-3 break-inside-avoid">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-[#18191B] text-white font-mono-tech text-[11px] font-semibold">
            {floor.name}
          </span>
          <span className="text-xs font-semibold text-[#18191B]">{localizeText(floor.label, lang)}</span>
        </div>
        <span className="text-[11px] font-mono-tech text-[#686D75]">
          {lang === 'zh' ? `本层 ${floorAps.length} 个点位` : `${floorAps.length} AP(s)`}
        </span>
      </div>

      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className="w-full h-56 bg-white rounded-lg border border-[#E5E5DF]"
        preserveAspectRatio="xMidYMid meet"
      >
        {footprint.length >= 3 && (
          <polygon
            points={footprint.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="#FFFFFF"
            stroke="#D4D4CE"
            strokeWidth={0.05}
          />
        )}

        {floor.voids.map((v) => (
          <g key={v.id}>
            <polygon
              points={v.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="#F1F5F9"
              stroke="#64748B"
              strokeWidth={0.06}
              strokeDasharray="0.22 0.14"
            />
          </g>
        ))}

        {floor.walls.map((w) => {
          const spec = WALL_MATERIALS[w.material];
          return (
            <line
              key={w.id}
              x1={w.x1}
              y1={w.y1}
              x2={w.x2}
              y2={w.y2}
              stroke={w.material === 'glass' ? '#0284C7' : spec.color}
              strokeWidth={Math.max(0.07, spec.thicknessM * 0.9)}
              strokeLinecap="square"
              strokeDasharray={spec.dashed ? '0.24 0.14' : undefined}
            />
          );
        })}

        {floor.rooms.map((rm) => (
          <text
            key={rm.id}
            x={rm.x}
            y={rm.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.36}
            fill="#64748B"
            fontWeight="600"
          >
            {localizeText(rm.name, lang)}
          </text>
        ))}

        {floorAps.map(({ ap }) => {
          if (!ap.wiredBackhaul && ap.type !== 'router_main') return null;
          const run = estimateApCableRun(weakBox, ap, allFloors);
          if (run.path2D.length < 2) return null;
          return (
            <polyline
              key={`cable-${ap.id}`}
              points={run.path2D.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#EA580C"
              strokeWidth={0.08}
              strokeDasharray="0.22 0.14"
            />
          );
        })}

        <g transform={`translate(${weakBox.x}, ${weakBox.y})`}>
          <rect
            x={-0.38}
            y={-0.28}
            width={0.76}
            height={0.56}
            rx={0.1}
            fill="#18191B"
            stroke="#EA580C"
            strokeWidth={0.07}
          />
          <text
            x={0}
            y={0.04}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.24}
            fill="#FFFFFF"
            fontWeight="700"
          >
            {lang === 'zh' ? (isSameFloorBox ? '弱电' : '竖井') : isSameFloorBox ? 'BOX' : 'RISER'}
          </text>
        </g>

        {floorAps.map(({ ap, code }) => (
          <g key={ap.id} transform={`translate(${ap.x}, ${ap.y})`}>
            <circle r={0.44} fill="#EA580C" stroke="#FFFFFF" strokeWidth={0.09} />
            <text
              x={0}
              y={0.04}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={0.34}
              fill="#FFFFFF"
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
            >
              {code}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-[#5C6066]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#EA580C] text-white text-[8px] font-mono-tech text-center leading-3">
            01
          </span>
          {lang === 'zh' ? 'AP 点位编号（对应下方施工明细表）' : 'AP Index (matches schedule below)'}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-2.5 rounded-xs bg-[#18191B] border border-[#EA580C]" />
          {lang === 'zh'
            ? isSameFloorBox
              ? '弱电总箱'
              : '垂直弱电井'
            : isSameFloorBox
            ? 'Weak-Current Box'
            : 'Vertical Riser'}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-[#EA580C]" />
          {lang === 'zh' ? '六类网线穿管路径' : 'Cat6 Conduit Route'}
        </span>
      </div>
    </div>
  );
};

export const WiringReportModal: React.FC<WiringReportModalProps> = ({
  project,
  evaluation,
  onClose,
}) => {
  const { lang, loc } = useI18n();
  const isZh = lang === 'zh';
  const { floors, aps, weakBox } = project;
  const sortedFloors = [...floors].sort((a, b) => a.levelIndex - b.levelIndex);
  const activeAps = aps.filter((a) => a.enabled);
  const indexedAps = activeAps.map((ap, i) => ({
    ap,
    code: String(i + 1).padStart(2, '0'),
  }));

  const poeCount = activeAps.filter((a) => AP_SPECS[a.type].poeRequired).length;
  const wireMaterialRmb = evaluation.totalCableMeters * 6;
  const totalBudget = evaluation.estimatedHardwareRmb + wireMaterialRmb;

  const getMountInstruction = (ap: AccessPoint, box: WeakCurrentBox, fls: FloorLevel[]) => {
    const run = estimateApCableRun(box, ap, fls);
    if (ap.type === 'panel_ap') {
      return isZh
        ? {
            boxSpec: '标准 86 型加深底盒 (深≥50mm)，距地 45~50cm（书桌侧可距地 75cm）',
            powerSpec: '无需 220V 强电插座（由弱电箱 PoE 交换机一根网线同时供电+传数据）',
            cableSpec: '预埋 1 根超六类非屏蔽网线 (Cat6A/Cat6)，盒内预留线头 18cm',
            lenM: run.lengthMeters,
          }
        : {
            boxSpec: 'Deep 86-type wall box (depth ≥50mm), 45–50cm AFF (75cm beside desk)',
            powerSpec: 'No AC outlet needed (powered + data via single PoE Ethernet cable)',
            cableSpec: 'Run 1× Cat6/Cat6A UTP cable from Weak-Current Box; leave 18cm slack',
            lenM: run.lengthMeters,
          };
    }
    if (ap.type === 'ceiling_ap') {
      return isZh
        ? {
            boxSpec: '木工吊顶中心开孔或预留八角盒，避开中央空调金属风管遮挡',
            powerSpec: '吊顶内无需电源插座（采用标准 802.3af/at PoE 网线直供）',
            cableSpec: '吊顶内预留 1 根六类/超六类网线，盘线余量 50cm 方便后期维护',
            lenM: run.lengthMeters,
          }
        : {
            boxSpec: 'Ceiling drop cutout / junction box, clear of metal HVAC ducts',
            powerSpec: 'No ceiling AC outlet needed (802.3af/at PoE over Cat6)',
            cableSpec: 'Run 1× Cat6/Cat6A cable into ceiling void with 50cm service loop',
            lenM: run.lengthMeters,
          };
    }
    if (ap.type === 'router_main') {
      return isZh
        ? {
            boxSpec: '电视柜/书房桌面后方 86 网口面板，距地 35cm',
            powerSpec: '旁侧必须配套预留 1~2 个五孔 220V 强电插座（需与弱电间距 ≥20cm 防干扰）',
            cableSpec:
              '【关键交底】若光猫在入户弱电箱、主路由放此处，强烈建议预埋 2 根六类网线（1根WAN上行 + 1根LAN回传弱电箱接全屋交换机）！',
            lenM: run.lengthMeters * 2,
          }
        : {
            boxSpec: 'Wall RJ45 faceplate behind TV console / desk, 35cm AFF',
            powerSpec: 'Install 1–2× AC power outlets ≥20cm away from data jack to avoid EMI',
            cableSpec:
              '[CRITICAL] Run 2× Cat6 cables here if ONT is in entry cabinet (1× WAN uplink + 1× LAN backfeed to switch)!',
            lenM: run.lengthMeters * 2,
          };
    }
    return isZh
      ? {
          boxSpec: ap.wiredBackhaul
            ? '柜面/桌面后方预留 86 型六类网络模块插座'
            : '纯无线回程摆放位（水电未封槽前仍建议补埋 1 根备用网线）',
          powerSpec: '配套预留 1 个五孔 220V 强电插座供电',
          cableSpec: ap.wiredBackhaul
            ? '预埋 1 根六类非屏蔽网线直通入户弱电箱'
            : '当前设为无线回程（0 网线）',
          lenM: run.lengthMeters,
        }
      : {
          boxSpec: ap.wiredBackhaul
            ? 'Wall RJ45 Cat6 jack behind cabinet / desk'
            : 'Wireless Mesh node spot (still recommend running 1 spare Cat6 before drywall)',
          powerSpec: 'Include 1× AC power outlet for adapter',
          cableSpec: ap.wiredBackhaul
            ? 'Run 1× Cat6 UTP cable directly to Weak-Current Box'
            : 'Wireless backhaul mode (0m cable)',
          lenM: run.lengthMeters,
        };
  };

  const costNotes = isZh ? COST_BASIS_NOTES : COST_BASIS_NOTES_EN;

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
      <div className="print-only-sheet bg-white border border-[#E3E3DF] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto">
        {/* Top Action Header */}
        <div className="no-print sticky top-0 bg-white/95 backdrop-blur px-6 py-4 border-b border-[#ECECE7] flex items-center justify-between z-10">
          <div>
            <span className="text-[11px] font-mono-tech uppercase px-2 py-0.5 rounded bg-[#18191B] text-white">
              {isZh ? 'WavePlan 施工交底输出' : 'WAVEPLAN CONTRACTOR HANDOVER'}
            </span>
            <h2 className="text-base font-bold text-[#18191B] mt-1">
              {isZh
                ? '《装修水电改造阶段 · 全屋弱电穿线与 WiFi 部署交底单》'
                : 'Pre-Renovation Structured Cabling & Wi-Fi Deployment Handover Sheet'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#18191B] hover:bg-[#2C2E33] text-white text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{isZh ? '打印 / 导出 PDF 发给工长' : 'Print / Export PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#686D75] hover:bg-[#F6F6F3] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Engineering Body */}
        <div className="p-6 sm:p-8 space-y-6 text-[#18191B]">
          {/* Title Banner */}
          <div className="border-b-2 border-[#18191B] pb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-mono-tech text-[#686D75]">
                WAVEPLAN STUDIO · PRE-RENOVATION RF & CABLING SPECIFICATION
              </div>
              <h1 className="text-xl font-bold mt-1">
                {loc(project.name)} — {isZh ? '弱电及全屋网络施工清单' : 'Cabling & Network Spec'}
              </h1>
            </div>
            <div className="text-right font-mono-tech text-xs">
              <div>
                {isZh ? '综合满足度评分' : 'Overall Score'}: {evaluation.overallScore} / 100
              </div>
              <div>
                {isZh ? '全屋 ≥-67dBm 高速覆盖率' : '≥-67dBm Coverage'}: {evaluation.coverageGoodPct}%
              </div>
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E3E3DF]">
              <div className="text-xs text-[#686D75]">
                {isZh ? '规划楼层 / AP总数' : 'Floors / Total APs'}
              </div>
              <div className="font-mono-tech text-base font-bold mt-1">
                {floors.length} {isZh ? '层' : 'F'} / {activeAps.length} {isZh ? '台' : 'APs'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E3E3DF]">
              <div className="text-xs text-[#686D75]">
                {isZh ? '建议六类网线备货' : 'Est. Cat6 Cable Spool'}
              </div>
              <div className="font-mono-tech text-base font-bold mt-1">
                ~{Math.ceil(evaluation.totalCableMeters * 1.15)} {isZh ? '米 (含余量)' : 'm (+15% slack)'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E3E3DF]">
              <div className="text-xs text-[#686D75]">
                {isZh ? '弱电箱核心交换配置' : 'Core Switch Spec'}
              </div>
              <div className="font-mono-tech text-sm font-bold mt-1">
                {poeCount > 0
                  ? isZh
                    ? `${Math.max(5, poeCount + 1)}口 PoE·AC一体机`
                    : `${Math.max(5, poeCount + 1)}-Port PoE+AC`
                  : isZh
                  ? '5/8口 2.5G 以太网交换机'
                  : '5/8-Port 2.5G Switch'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E3E3DF]">
              <div className="text-xs text-[#686D75]">
                {isZh ? '硬件 + 线材总预估' : 'Est. Hardware + Cable'}
              </div>
              <div className="font-mono-tech text-base font-bold text-[#EA580C] mt-1">
                ¥{totalBudget}
              </div>
            </div>
          </div>

          {/* Section 1: Visual Blueprint Maps */}
          <div>
            <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2.5">
              <Map className="w-4 h-4 text-[#EA580C]" />
              <span>
                {isZh
                  ? '一、 各楼层点位施工平面索引图（按图找号开槽）'
                  : '1. Floor-by-Floor AP & Conduit Location Blueprints'}
              </span>
            </h3>
            <div
              className={`grid gap-3 ${
                sortedFloors.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {sortedFloors.map((fl) => (
                <FloorBlueprintMap
                  key={fl.id}
                  floor={fl}
                  allFloors={floors}
                  indexedAps={indexedAps}
                  weakBox={weakBox}
                  lang={lang}
                />
              ))}
            </div>
          </div>

          {/* Section 2: Point-by-Point Schedule Table */}
          <div>
            <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2.5">
              <Wrench className="w-4 h-4 text-[#EA580C]" />
              <span>
                {isZh
                  ? `二、 水电工穿管布线逐点位施工明细表（从「${weakBox.label}」放射星型布线）`
                  : `2. Electrician Conduit & Jack Schedule (Star Topology from "${loc(weakBox.label)}")`}
              </span>
            </h3>
            <div className="overflow-x-auto border border-[#DCDCD6] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F4F0] border-b border-[#DCDCD6] text-[#4A4D52]">
                    <th className="py-2.5 px-3 font-semibold">
                      {isZh ? '编号 / 点位名称' : 'ID / AP Name'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      {isZh ? '楼层与直观位置' : 'Floor & Intuitive Location'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      {isZh ? '暗盒与安装高度要求' : 'Wall Box & Mounting Height'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      {isZh ? '网线与强电配套规范' : 'Cabling & AC Power Spec'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      {isZh ? '估算线长' : 'Est. Run'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECECE7]">
                  {indexedAps.map(({ ap, code }) => {
                    const fl = floors.find((f) => f.id === ap.floorId);
                    const flName = fl?.name ?? '1F';
                    const inst = getMountInstruction(ap, weakBox, floors);
                    const locDesc = describeApLocation(ap, fl, weakBox, lang);
                    return (
                      <tr key={ap.id} className="align-top">
                        <td className="py-2.5 px-3 font-medium">
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EA580C] text-white font-mono-tech text-[10px] font-bold">
                            AP-{code}
                          </div>
                          <div className="mt-1">{loc(ap.name)}</div>
                          <div className="text-[11px] text-[#7A7F87]">
                            {isZh ? AP_SPECS[ap.type].shortName : AP_SPECS_EN[ap.type].shortName}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] leading-relaxed">
                          <div className="font-semibold text-[#18191B]">
                            {flName} · {locDesc.roomHint}
                          </div>
                          <div className="text-[#5C6066] mt-0.5">{locDesc.relativeHint}</div>
                          <div className="font-mono-tech text-[10px] text-[#0F766E] mt-0.5">
                            {locDesc.tapeHint}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 leading-relaxed">{inst.boxSpec}</td>
                        <td className="py-2.5 px-3 leading-relaxed">
                          <div className="font-medium text-[#18191B]">{inst.cableSpec}</div>
                          <div className="text-[11px] text-[#686D75] mt-0.5">
                            {inst.powerSpec}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tech font-semibold whitespace-nowrap">
                          {inst.lenM > 0
                            ? `${inst.lenM.toFixed(1)} m`
                            : isZh
                            ? '无线'
                            : 'Wireless'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3 & 4 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-[#E3E3DF] bg-[#FAFAF8] break-inside-avoid">
              <h4 className="text-xs font-bold flex items-center gap-1.5 mb-2">
                <ShieldAlert className="w-4 h-4 text-[#EA580C]" />
                <span>
                  {isZh
                    ? '三、 弱电箱与穿管硬性交底准则（防返工必看）'
                    : '3. Mandatory Structured Cabling Rules'}
                </span>
              </h4>
              <ul className="space-y-1.5 text-xs text-[#33363C] leading-relaxed">
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    {isZh ? (
                      <>
                        <strong>严禁串联手拉手</strong>：所有房间的网线必须独立穿 PVC 弱电管
                        <strong>直通入户弱电箱</strong>，严禁像电话线一样在房间之间串接。
                      </>
                    ) : (
                      <>
                        <strong>Home-Run Star Topology Only</strong>: Every Ethernet drop must run
                        independently in PVC conduit directly to the Weak-Current Box—never
                        daisy-chain across rooms.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    {isZh ? (
                      <>
                        <strong>弱电箱尺寸扩容</strong>：开发商原配小弱电箱建议更换为{' '}
                        <strong>400×300×120mm</strong> 以上规格，内部预留至少 3 孔 220V
                        电源模块（供光猫 + AC/交换机用电）。
                      </>
                    ) : (
                      <>
                        <strong>Cabinet Sizing</strong>: Upgrade builder enclosure to ≥{' '}
                        <strong>400×300×120mm</strong> with at least 3× AC power sockets for
                        fiber ONT + PoE switch.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    {isZh ? (
                      <>
                        <strong>线材选购高性价比方案</strong>：家装百米内跑满万兆（10Gbps），直接采购国标无氧铜{' '}
                        <strong>Cat6（六类非屏蔽）或 Cat6A</strong> 即可，切勿高价买假“七类/八类屏蔽线”（接地不良反而降速）。
                      </>
                    ) : (
                      <>
                        <strong>Cable Choice</strong>: Use solid-copper{' '}
                        <strong>Cat6 / Cat6A UTP</strong> (supports 10Gbps under 55m); avoid
                        ungrounded shielded Cat7/Cat8 gimmicks.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    {isZh ? (
                      <>
                        <strong>预埋光纤升级冗余</strong>：书房电脑位与客厅电视柜建议顺管伴随穿入 1 根{' '}
                        <code className="font-mono-tech bg-[#EFEFEA] px-1 rounded">
                          LC-LC 单模双芯隐形光纤
                        </code>
                        （成本仅约 ¥25），未来 15 年可平滑升级全光万兆网。
                      </>
                    ) : (
                      <>
                        <strong>Future-Proof Fiber</strong>: Pull 1× spare{' '}
                        <code className="font-mono-tech bg-[#EFEFEA] px-1 rounded">
                          LC-LC single-mode fiber
                        </code>{' '}
                        to the study & living room (~¥25) for future 10G FTTR upgrades.
                      </>
                    )}
                  </span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-[#E3E3DF] bg-[#FAFAF8] break-inside-avoid">
              <h4 className="text-xs font-bold mb-2">
                {isZh
                  ? '四、 入住后路由器 / AC 控制器最佳漫游参数表'
                  : '4. Post-Move-In Roaming & Channel Tuning'}
              </h4>
              <div className="space-y-2 text-xs text-[#33363C]">
                <div className="flex justify-between py-1 border-b border-[#ECECE7]">
                  <span className="text-[#686D75]">
                    {isZh ? '无线名称 (SSID) 策略' : 'SSID & Band Steering'}
                  </span>
                  <span className="font-medium">
                    {isZh
                      ? '全屋统一 SSID（开启 5G 优选 / 频段引导）'
                      : 'Single unified SSID (5GHz preferred)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#ECECE7]">
                  <span className="text-[#686D75]">
                    {isZh ? '无缝漫游协议' : 'Fast Roaming Protocols'}
                  </span>
                  <span className="font-mono-tech font-medium">
                    {isZh ? '开启 802.11k / 802.11v' : 'Enable 802.11k / 802.11v'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#ECECE7]">
                  <span className="text-[#686D75]">
                    {isZh ? '漫游主动诱导 / 剔除阈值' : 'Roaming Kick / RSSI Threshold'}
                  </span>
                  <span className="font-mono-tech font-medium text-[#EA580C]">
                    -68 dBm ~ -72 dBm
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#ECECE7]">
                  <span className="text-[#686D75]">
                    {isZh ? '5GHz 频宽建议' : '5GHz Channel Width'}
                  </span>
                  <span className="font-mono-tech font-medium">
                    {isZh
                      ? 'AP≤2台用 160MHz；AP≥3台设为 80MHz 防干扰'
                      : '160MHz if ≤2 APs; 80MHz if ≥3 APs'}
                  </span>
                </div>
                <div className="pt-1 text-[11px] text-[#686D75] leading-relaxed">
                  {isZh ? '当前自动分配 5G 信道：' : 'Assigned 5GHz Channels: '}
                  {activeAps.map((a) => `${loc(a.name)}[Ch.${a.channel5}]`).join(' · ')}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Cost & Material Reference */}
          <div className="p-4 rounded-xl border border-[#E3E3DF] bg-[#F8F8F5] break-inside-avoid">
            <h4 className="text-xs font-bold mb-2">
              {isZh
                ? '五、 造价与线材测算参考依据（所有价格均为国内电商主流零售参考价，非绑定硬件）'
                : '5. Cost & Material Estimation Basis (Mainstream Retail Reference Prices)'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-[#4A4E56]">
              {costNotes.map((note) => (
                <div key={note.item} className="flex items-start gap-1.5">
                  <span className="font-semibold text-[#18191B] shrink-0">{note.item}: </span>
                  <span>{note.basis}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
