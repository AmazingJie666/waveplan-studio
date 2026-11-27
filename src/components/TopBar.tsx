import React from 'react';
import {
  Box,
  Download,
  FileSpreadsheet,
  FolderOpen,
  HelpCircle,
  Languages,
  Layers,
  Monitor,
  Moon,
  Plus,
  Radio,
  Sun,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { BandMode, FloorLevel, ProjectModel } from '../types/wifi';

interface TopBarProps {
  project: ProjectModel;
  presets: ProjectModel[];
  activeFloorId: string;
  viewMode: '2d' | '3d';
  bandMode: BandMode;
  overallScore: number;
  onSelectPreset: (presetId: string) => void;
  onSelectFloor: (floorId: string) => void;
  onAddFloor: () => void;
  onDeleteFloor: (floorId: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onChangeViewMode: (mode: '2d' | '3d') => void;
  onChangeBandMode: (band: BandMode) => void;
  onOpenUploadWizard: () => void;
  onOpenWiringReport: () => void;
  onOpenOnboarding: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  presets,
  activeFloorId,
  viewMode,
  bandMode,
  overallScore,
  onSelectPreset,
  onSelectFloor,
  onAddFloor,
  onDeleteFloor,
  canUndo,
  onUndo,
  onExportJson,
  onImportJson,
  onChangeViewMode,
  onChangeBandMode,
  onOpenUploadWizard,
  onOpenWiringReport,
  onOpenOnboarding,
}) => {
  const { lang, setLang, t, loc, themeMode, setThemeMode } = useI18n();
  const sortedFloors = [...project.floors].sort((a, b) => a.levelIndex - b.levelIndex);

  const cycleTheme = () => {
    setThemeMode(
      themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto'
    );
  };

  const scoreColor =
    overallScore >= 88
      ? 'bg-emerald-600 text-white'
      : overallScore >= 70
      ? 'bg-amber-500 text-white'
      : 'bg-rose-600 text-white';

  return (
    <header className="min-h-14 py-1.5 bg-white/95 backdrop-blur border-b border-[#E3E3DF] px-3 lg:px-5 flex flex-wrap items-center justify-between gap-2 z-30 shrink-0 no-print">
      {/* Brand + Preset Selector */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#18191B] text-white flex items-center justify-center relative shadow-xs">
            <Radio className="w-4 h-4 text-[#EA580C]" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#EA580C]" />
          </div>
          <div className="hidden xl:block leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-[#18191B]">
                WavePlan
              </span>
              <span className="text-[10px] font-mono-tech uppercase px-1.5 py-0.5 rounded bg-[#F1F1EC] text-[#5C6066] border border-[#E3E3DF]">
                筑波 Studio
              </span>
            </div>
            <p className="text-[11px] text-[#7A7F87] truncate max-w-[190px]">
              {t('brandSub')}
            </p>
          </div>
        </div>

        <div className="h-5 w-px bg-[#E3E3DF] hidden xl:block" />

        {/* Preset Switcher */}
        <div className="relative flex items-center">
          <FolderOpen className="w-3.5 h-3.5 text-[#7A7F87] absolute left-2.5 pointer-events-none" />
          <select
            aria-label="选择户型样板间"
            value={presets.some((p) => p.id === project.id) ? project.id : 'custom'}
            onChange={(e) => {
              if (e.target.value !== 'custom') onSelectPreset(e.target.value);
            }}
            className="pl-8 pr-6 py-1.5 text-xs font-medium bg-[#F6F6F3] hover:bg-[#EFEFEA] border border-[#E3E3DF] rounded-lg text-[#18191B] focus:outline-none focus:border-[#18191B] transition cursor-pointer max-w-[168px] sm:max-w-[205px] truncate"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {t('presetPrefix')}{loc(p.name)}
              </option>
            ))}
            {!presets.some((p) => p.id === project.id) && (
              <option value="custom">{t('customPrefix')}{loc(project.name)}</option>
            )}
          </select>
        </div>

        <button
          onClick={onOpenUploadWizard}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#D5D5CE] bg-white hover:bg-[#F6F6F3] text-[#18191B] transition cursor-pointer shrink-0"
          title={t('uploadPlan')}
        >
          <Upload className="w-3.5 h-3.5 text-[#EA580C]" />
          <span className="hidden sm:inline">{t('uploadPlan')}</span>
        </button>
      </div>

      {/* Center: Multi-Floor Switcher + Band Mode */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Floor Pills */}
        <div className="flex items-center bg-[#F6F6F3] p-0.5 rounded-lg border border-[#E3E3DF] shrink-0">
          <span className="px-2 text-[11px] text-[#7A7F87] hidden 2xl:inline-flex items-center gap-1">
            <Layers className="w-3 h-3" /> 楼层
          </span>
          {sortedFloors.map((fl: FloorLevel) => {
            const active = fl.id === activeFloorId && viewMode === '2d';
            return (
              <button
                key={fl.id}
                onClick={() => {
                  onSelectFloor(fl.id);
                  if (viewMode === '3d') onChangeViewMode('2d');
                }}
                className={`px-2.5 py-1 text-xs font-mono-tech font-medium rounded-md transition cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#18191B] text-white shadow-xs'
                    : 'text-[#5C6066] hover:text-[#18191B]'
                }`}
                title={fl.label}
              >
                {fl.name}
              </button>
            );
          })}
          <button
            onClick={onAddFloor}
            className="px-1.5 py-1 text-xs text-[#5C6066] hover:text-[#18191B] hover:bg-white/70 rounded-md transition cursor-pointer shrink-0"
            title="新增楼层（自动继承下层外框与对齐基准）"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {sortedFloors.length > 1 && (
            <button
              onClick={() => onDeleteFloor(activeFloorId)}
              className="px-1.5 py-1 text-xs text-[#7A7F87] hover:text-rose-600 hover:bg-white/70 rounded-md transition cursor-pointer shrink-0"
              title="删除当前选中楼层"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Band Selector */}
        <div className="hidden md:flex items-center bg-[#F6F6F3] p-0.5 rounded-lg border border-[#E3E3DF] shrink-0">
          {(
            [
              { id: '5ghz', label: t('band5') },
              { id: '2.4ghz', label: t('band24') },
              { id: 'dual', label: t('bandDual') },
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              onClick={() => onChangeBandMode(b.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                bandMode === b.id
                  ? 'bg-white text-[#18191B] shadow-xs border border-[#E3E3DF]/80'
                  : 'text-[#686D75] hover:text-[#18191B]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right: 2D/3D Switch + Score Pill + Export Wiring Sheet */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* 2D / 3D Isometric Toggle */}
        <div className="flex items-center bg-[#F6F6F3] p-0.5 rounded-lg border border-[#E3E3DF]">
          <button
            onClick={() => onChangeViewMode('2d')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
              viewMode === '2d'
                ? 'bg-white text-[#18191B] shadow-xs'
                : 'text-[#686D75] hover:text-[#18191B]'
            }`}
          >
            {t('view2d')}
          </button>
          <button
            onClick={() => onChangeViewMode('3d')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
              viewMode === '3d'
                ? 'bg-[#18191B] text-white shadow-xs'
                : 'text-[#686D75] hover:text-[#18191B]'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>{t('view3d')}</span>
          </button>
        </div>

        {/* Live Score Badge (compact for small screens) */}
        <div
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono-tech font-semibold ${scoreColor}`}
          title={t('evalTitle')}
        >
          <span>{t('scoreLabel')}</span>
          <span>{overallScore}%</span>
        </div>

        {/* Renovation Wiring Checklist CTA */}
        <button
          onClick={onOpenWiringReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18191B] hover:bg-[#2C2E33] text-white text-xs font-medium transition shadow-xs cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#EA580C]" />
          <span className="hidden lg:inline">{t('wiringReport')}</span>
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] disabled:opacity-35 text-[#5C6066] hover:text-[#18191B] transition cursor-pointer"
          title={t('undoTitle')}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onExportJson}
          className="hidden sm:flex p-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] text-[#5C6066] hover:text-[#18191B] transition cursor-pointer"
          title={t('exportJsonTitle')}
        >
          <Download className="w-4 h-4" />
        </button>

        <label
          className="hidden sm:flex p-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] text-[#5C6066] hover:text-[#18191B] transition cursor-pointer"
          title={lang === 'zh' ? '导入方案文件 (.json)' : 'Import Project (.json)'}
        >
          <FolderOpen className="w-4 h-4" />
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJson(f);
              e.target.value = '';
            }}
          />
        </label>

        <button
          onClick={cycleTheme}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] text-[#5C6066] hover:text-[#18191B] text-[11px] font-medium transition cursor-pointer"
          title={`Theme: ${themeMode}`}
          aria-label="切换明亮/暗黑模式"
        >
          {themeMode === 'auto' ? (
            <Monitor className="w-3.5 h-3.5" />
          ) : themeMode === 'light' ? (
            <Sun className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden 2xl:inline">
            {themeMode === 'auto'
              ? t('themeAuto')
              : themeMode === 'light'
              ? t('themeLight')
              : t('themeDark')}
          </span>
        </button>

        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] text-[#18191B] text-[11px] font-mono-tech font-semibold transition cursor-pointer"
          title="Switch Language (中文 / English)"
          aria-label="切换语言"
        >
          <Languages className="w-3.5 h-3.5 text-[#EA580C]" />
          <span>{lang === 'zh' ? 'EN' : '中'}</span>
        </button>

        <button
          onClick={onOpenOnboarding}
          className="p-1.5 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#EAEAE4] text-[#5C6066] hover:text-[#18191B] transition cursor-pointer"
          title={t('helpTitle')}
          aria-label="查看使用向导"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
