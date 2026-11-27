import React from 'react';
import {
  Crosshair,
  Eraser,
  MapPin,
  MousePointer,
  Router,
  Ruler,
  Server,
  SquareDashedBottom,
  BrickWall,
} from 'lucide-react';
import {
  AP_SPECS,
  AP_SPECS_EN,
  DEMAND_SPECS,
  DEMAND_SPECS_EN,
  WALL_MATERIALS,
  WALL_MATERIALS_EN,
} from '../constants/specs';
import { useI18n } from '../i18n/useI18n';
import {
  ActiveTool,
  APMountType,
  DemandCategory,
  WallMaterial,
} from '../types/wifi';

interface ToolDockProps {
  activeTool: ActiveTool;
  wallMaterial: WallMaterial;
  apTypeToPlace: APMountType;
  demandCategoryToPlace: DemandCategory;
  isUpperFloor: boolean;
  onSelectTool: (tool: ActiveTool) => void;
  onSelectWallMaterial: (mat: WallMaterial) => void;
  onSelectApType: (type: APMountType) => void;
  onSelectDemandCategory: (cat: DemandCategory) => void;
}

export const ToolDock: React.FC<ToolDockProps> = ({
  activeTool,
  wallMaterial,
  apTypeToPlace,
  demandCategoryToPlace,
  isUpperFloor,
  onSelectTool,
  onSelectWallMaterial,
  onSelectApType,
  onSelectDemandCategory,
}) => {
  const { t, lang } = useI18n();
  const isZh = lang === 'zh';
  const tools: {
    id: ActiveTool;
    icon: React.ReactNode;
    label: string;
    hint: string;
  }[] = [
    {
      id: 'select',
      icon: <MousePointer className="w-4 h-4" />,
      label: t('toolSelect'),
      hint: t('toolSelect'),
    },
    {
      id: 'wall',
      icon: <BrickWall className="w-4 h-4" />,
      label: t('toolWall'),
      hint: t('toolWall'),
    },
    {
      id: 'void',
      icon: <SquareDashedBottom className="w-4 h-4" />,
      label: t('toolVoid'),
      hint: isUpperFloor
        ? '框选复式挑空区或楼梯井（免除跨层混凝土楼板损耗）'
        : '在 2F/3F 楼层框选挑空区或楼梯井可打通上下层信号',
    },
    {
      id: 'add_ap',
      icon: <Router className="w-4 h-4" />,
      label: t('toolAddAp'),
      hint: t('toolAddAp'),
    },
    {
      id: 'add_demand',
      icon: <MapPin className="w-4 h-4" />,
      label: t('toolAddDemand'),
      hint: t('toolAddDemand'),
    },
    {
      id: 'weak_box',
      icon: <Server className="w-4 h-4" />,
      label: t('toolWeakBox'),
      hint: t('toolWeakBox'),
    },
    {
      id: 'scale',
      icon: <Ruler className="w-4 h-4" />,
      label: t('toolScale'),
      hint: t('toolScale'),
    },
    {
      id: 'align_anchor',
      icon: <Crosshair className="w-4 h-4" />,
      label: t('toolAlign'),
      hint: t('toolAlign'),
    },
    {
      id: 'eraser',
      icon: <Eraser className="w-4 h-4" />,
      label: t('toolEraser'),
      hint: t('toolEraser'),
    },
  ];

  return (
    <div className="absolute left-3 top-3 z-20 flex items-start gap-2 no-print">
      {/* Primary Vertical Bauhaus Dock */}
      <div className="bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl shadow-sm p-1.5 flex flex-col gap-1">
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              title={`${t.label}：${t.hint}`}
              className={`group flex flex-col items-center justify-center w-13 py-1.5 rounded-lg transition cursor-pointer ${
                isActive
                  ? 'bg-[#18191B] text-white shadow-xs'
                  : 'text-[#52565E] hover:bg-[#F3F3EE] hover:text-[#18191B]'
              }`}
            >
              <span className={isActive ? 'text-[#EA580C]' : ''}>{t.icon}</span>
              <span className="text-[10px] mt-0.5 font-medium tracking-tight leading-none">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contextual Sub-Palette for Wall / AP / Demand Tools */}
      {activeTool === 'wall' && (
        <div className="bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl shadow-sm p-2.5 w-52 animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-[#18191B] mb-2 flex items-center justify-between">
            <span>{t('selectWallMat')}</span>
            <span className="font-mono-tech text-[10px] text-[#7A7F87]">{t('loss5g')}</span>
          </div>
          <div className="space-y-1">
            {(Object.keys(WALL_MATERIALS) as WallMaterial[]).map((matKey) => {
              const spec = WALL_MATERIALS[matKey];
              const enSpec = WALL_MATERIALS_EN[matKey];
              const selected = wallMaterial === matKey;
              return (
                <button
                  key={matKey}
                  onClick={() => onSelectWallMaterial(matKey)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition flex items-center justify-between cursor-pointer ${
                    selected
                      ? 'border-[#18191B] bg-[#F6F6F3] font-medium'
                      : 'border-transparent hover:bg-[#F8F8F5]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-3.5 h-1.5 rounded-xs"
                      style={{ backgroundColor: spec.color }}
                    />
                    <span>{isZh ? spec.shortName : enSpec.shortName}</span>
                  </span>
                  <span className="font-mono-tech text-[11px] text-[#686D75]">
                    -{spec.attenuation5}dB
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 pt-2 border-t border-[#ECECE7] text-[11px] text-[#686D75] leading-relaxed">
            {isZh ? WALL_MATERIALS[wallMaterial].description : WALL_MATERIALS_EN[wallMaterial].description}
          </p>
        </div>
      )}

      {activeTool === 'add_ap' && (
        <div className="bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl shadow-sm p-2.5 w-56">
          <div className="text-[11px] font-semibold text-[#18191B] mb-2">
            {t('selectApType')}
          </div>
          <div className="space-y-1">
            {(Object.keys(AP_SPECS) as APMountType[]).map((apType) => {
              const spec = AP_SPECS[apType];
              const enSpec = AP_SPECS_EN[apType];
              const selected = apTypeToPlace === apType;
              return (
                <button
                  key={apType}
                  onClick={() => onSelectApType(apType)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition cursor-pointer ${
                    selected
                      ? 'border-[#18191B] bg-[#F6F6F3]'
                      : 'border-transparent hover:bg-[#F8F8F5]'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium text-[#18191B]">
                    <span>{isZh ? spec.shortName : enSpec.shortName}</span>
                    <span className="font-mono-tech text-[10px] text-[#686D75]">
                      ¥{spec.unitPriceRmb}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#7A7F87] mt-0.5 leading-snug">
                    {isZh ? spec.mountDesc : enSpec.mountDesc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTool === 'add_demand' && (
        <div className="bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl shadow-sm p-2.5 w-56">
          <div className="text-[11px] font-semibold text-[#18191B] mb-2">
            {t('selectDemandTier')}
          </div>
          <div className="space-y-1">
            {(Object.keys(DEMAND_SPECS) as DemandCategory[]).map((cat) => {
              const spec = DEMAND_SPECS[cat];
              const enSpec = DEMAND_SPECS_EN[cat];
              const selected = demandCategoryToPlace === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectDemandCategory(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition cursor-pointer ${
                    selected
                      ? 'border-[#18191B] bg-[#F6F6F3]'
                      : 'border-transparent hover:bg-[#F8F8F5]'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: spec.color }}
                      />
                      <span>{isZh ? spec.shortName : enSpec.shortName}</span>
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#686D75]">
                      {t('weightPrefix')} ×{spec.weight}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#7A7F87] mt-0.5 leading-snug">
                    {t('targetPrefix')} ≥ {spec.target5dBm} dBm
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
