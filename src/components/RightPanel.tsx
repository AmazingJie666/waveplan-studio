import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Info,
  Sparkles,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  AP_SPECS,
  AP_SPECS_EN,
  CHANNELS_5,
  COST_BASIS_NOTES,
  COST_BASIS_NOTES_EN,
} from '../constants/specs';
import { computeTapeMeasureRefs } from '../engine/geometry';
import { useI18n } from '../i18n/useI18n';
import {
  AccessPoint,
  APMountType,
  ArchitectureRecommendation,
  FloorLevel,
  NetworkEvaluation,
} from '../types/wifi';

interface RightPanelProps {
  floors: FloorLevel[];
  aps: AccessPoint[];
  evaluation: NetworkEvaluation;
  selectedApId: string | null;
  isOptimizing: boolean;
  lastOptMs: number | null;
  recommendations: ArchitectureRecommendation[] | null;
  onSelectAp: (id: string | null) => void;
  onUpdateAp: (ap: AccessPoint) => void;
  onDeleteAp: (id: string) => void;
  onRunAutoRecommend: () => void;
  onRunFixedOptimize: (roster: APMountType[]) => void;
  onApplyRecommendation: (rec: ArchitectureRecommendation) => void;
  onOpenWiringReport: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  floors,
  aps,
  evaluation,
  selectedApId,
  isOptimizing,
  lastOptMs,
  recommendations,
  onSelectAp,
  onUpdateAp,
  onDeleteAp,
  onRunAutoRecommend,
  onRunFixedOptimize,
  onApplyRecommendation,
  onOpenWiringReport,
}) => {
  const { t, loc, lang } = useI18n();
  const isZh = lang === 'zh';
  const [optTab, setOptTab] = useState<'recommend' | 'custom'>('recommend');
  const [showCostBasis, setShowCostBasis] = useState(false);
  const [rosterCounts, setRosterCounts] = useState<Record<APMountType, number>>({
    router_main: 1,
    mesh_node: Math.max(1, floors.length),
    panel_ap: 0,
    ceiling_ap: 0,
  });

  const selectedAp = aps.find((a) => a.id === selectedApId) ?? null;

  const handleTriggerFixed = () => {
    const roster: APMountType[] = [];
    (Object.keys(rosterCounts) as APMountType[]).forEach((t) => {
      for (let i = 0; i < rosterCounts[t]; i++) roster.push(t);
    });
    if (roster.length === 0) roster.push('router_main');
    onRunFixedOptimize(roster);
  };

  const ringStroke =
    evaluation.overallScore >= 88
      ? '#10B981'
      : evaluation.overallScore >= 70
      ? '#F59E0B'
      : '#EF4444';

  const circumference = 2 * Math.PI * 28;
  const dashOffset =
    circumference * (1 - Math.max(0, Math.min(100, evaluation.overallScore)) / 100);

  return (
    <aside className="w-full lg:w-[370px] xl:w-[396px] h-full bg-white border-l border-[#E3E3DF] flex flex-col overflow-y-auto shrink-0 no-print">
      {/* 1. Whole-Home Score & Key Renovation Metrics */}
      <div className="p-4 border-b border-[#ECECE7]">
        <div className="flex items-center gap-3.5">
          {/* Circular Score Gauge */}
          <div className="relative w-17 h-17 shrink-0 flex items-center justify-center">
            <svg className="w-17 h-17 -rotate-90" viewBox="0 0 68 68">
              <circle
                cx="34"
                cy="34"
                r="28"
                stroke="#EFEFEA"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="34"
                cy="34"
                r="28"
                stroke={ringStroke}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                fill="none"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono-tech font-bold text-base leading-none text-[#18191B]">
                {evaluation.overallScore}
              </span>
              <span className="text-[9px] text-[#7A7F87] mt-0.5">{t('overallScoreLabel')}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#686D75]">
                {t('evalTitle')}
              </h2>
              <span className="font-mono-tech text-[11px] text-[#18191B] font-medium">
                {aps.filter((a) => a.enabled).length} {t('devicesOnline')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <div className="bg-[#F7F7F4] rounded-lg px-2 py-1.5 border border-[#ECECE6]">
                <div className="text-[10px] text-[#7A7F87]">{t('keyZonesPassed')}</div>
                <div className="font-mono-tech text-xs font-semibold text-[#18191B] mt-0.5">
                  {evaluation.demandResults.filter((d) => d.passed).length}/
                  {evaluation.demandResults.length}
                </div>
              </div>
              <div className="bg-[#F7F7F4] rounded-lg px-2 py-1.5 border border-[#ECECE6]">
                <div className="text-[10px] text-[#7A7F87]">{t('highSpeedCov')}</div>
                <div className="font-mono-tech text-xs font-semibold text-emerald-700 mt-0.5">
                  {evaluation.coverageGoodPct}%
                </div>
              </div>
              <div className="bg-[#F7F7F4] rounded-lg px-2 py-1.5 border border-[#ECECE6]">
                <div className="text-[10px] text-[#7A7F87] flex items-center justify-between">
                  <span>{t('estBudget')}</span>
                  <button
                    onClick={() => setShowCostBasis((v) => !v)}
                    className="text-[9.5px] underline text-[#5C6066] hover:text-[#18191B] cursor-pointer"
                  >
                    {t('basisBtn')}
                  </button>
                </div>
                <div className="font-mono-tech text-xs font-semibold text-[#18191B] mt-0.5">
                  ¥{evaluation.estimatedHardwareRmb}
                </div>
              </div>
            </div>

            {showCostBasis && (
              <div className="mt-2 p-2.5 rounded-lg bg-[#F7F7F4] border border-[#E3E3DF] text-[10.5px] text-[#5C6066] space-y-1">
                <div className="font-semibold text-[#18191B]">{t('costBasisHeader')}</div>
                {(isZh ? COST_BASIS_NOTES : COST_BASIS_NOTES_EN).map((n) => (
                  <div key={n.item}>
                    <span className="font-medium text-[#18191B]">{n.item}: </span>
                    {n.basis}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Multi-floor breakdown bars */}
        {evaluation.floorStats.length > 1 && (
          <div className="mt-3 pt-2.5 border-t border-[#F1F1EC] space-y-1.5">
            {evaluation.floorStats.map((fs) => (
              <div key={fs.floorId} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono-tech font-semibold w-7 text-[#18191B]">
                  {fs.floorName}
                </span>
                <div className="flex-1 h-1.5 bg-[#EFEFEA] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${fs.goodCoveragePct}%` }}
                  />
                </div>
                <span className="font-mono-tech text-[#5C6066] whitespace-nowrap text-right">
                  {fs.goodCoveragePct}% ({fs.avgRssi}dBm)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Dual-Mode Placement Optimization Engine */}
      <div className="p-4 border-b border-[#ECECE7] bg-[#FAFAF8]">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#EA580C]" />
            <h3 className="text-xs font-semibold text-[#18191B]">
              {t('optTitle')}
            </h3>
          </div>
          {lastOptMs !== null && (
            <span className="font-mono-tech text-[10px] text-[#7A7F87]">
              {t('optElapsed')} {lastOptMs}ms
            </span>
          )}
        </div>

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 bg-[#ECECE7] p-0.5 rounded-lg text-xs mb-3">
          <button
            onClick={() => setOptTab('recommend')}
            className={`py-1.5 rounded-md font-medium transition cursor-pointer ${
              optTab === 'recommend'
                ? 'bg-white text-[#18191B] shadow-xs'
                : 'text-[#686D75] hover:text-[#18191B]'
            }`}
          >
            {t('tabRecommend')}
          </button>
          <button
            onClick={() => setOptTab('custom')}
            className={`py-1.5 rounded-md font-medium transition cursor-pointer ${
              optTab === 'custom'
                ? 'bg-white text-[#18191B] shadow-xs'
                : 'text-[#686D75] hover:text-[#18191B]'
            }`}
          >
            {t('tabCustom')}
          </button>
        </div>

        {optTab === 'recommend' ? (
          <div>
            <p className="text-[11px] text-[#686D75] leading-relaxed mb-2.5">
              {t('optDescRecommend')}
            </p>
            <button
              onClick={onRunAutoRecommend}
              disabled={isOptimizing}
              className="w-full py-2 px-3 rounded-xl bg-[#18191B] hover:bg-[#2C2E33] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>
                {isOptimizing ? t('btnCalculating') : t('btnCalcRecommend')}
              </span>
            </button>

            {recommendations && (
              <div className="mt-3 space-y-2">
                {recommendations.map((rec) => {
                  const isHigh = rec.overallScore >= 92;
                  const recTitle = isZh
                    ? rec.name
                    : rec.id === 'single_router'
                    ? 'Single Flagship Router'
                    : rec.id === 'wired_mesh'
                    ? `Wired Mesh (1 Main + ${Math.max(1, rec.aps.length - 1)} Node)`
                    : `Whole-Home AC + PoE APs (${rec.aps.length} APs)`;
                  const recBadge = isZh
                    ? rec.badge
                    : rec.id === 'single_router'
                    ? 'Low Cost'
                    : rec.id === 'wired_mesh'
                    ? 'Best Value'
                    : 'Pro Invisible';
                  const recSummary = isZh
                    ? rec.summary
                    : rec.id === 'single_router'
                    ? 'Place 1 flagship router near home center; zero roaming handoff overhead.'
                    : rec.id === 'wired_mesh'
                    ? 'Central main router + wired Cat6 satellite nodes in dead-zone rooms.'
                    : 'Central PoE switch in cabinet + ceiling/in-wall APs; zero desktop clutter.';
                  return (
                    <div
                      key={rec.id}
                      className="bg-white rounded-xl border border-[#E3E3DF] hover:border-[#18191B] p-2.5 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#18191B]">
                              {recTitle}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F3F3EE] text-[#5C6066] font-medium">
                              {recBadge}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#686D75] mt-0.5 leading-snug">
                            {recSummary}
                          </p>
                        </div>
                        <span
                          className={`font-mono-tech text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
                            isHigh
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {rec.overallScore}{t('scoreUnit')}
                        </span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-[#F2F2EE] flex items-center justify-between text-[11px]">
                        <div className="font-mono-tech text-[#5C6066] space-x-2">
                          <span>
                            {t('passedLabel')} {rec.demandPassed}/{rec.demandTotal}
                          </span>
                          <span>·</span>
                          <span>{t('cableLabel')} ~{rec.cableMeters}m</span>
                          <span>·</span>
                          <span className="text-[#18191B] font-semibold">
                            {t('approxBudgetPrefix')}{rec.totalBudgetRmb}
                          </span>
                        </div>
                        <button
                          onClick={() => onApplyRecommendation(rec)}
                          className="px-2.5 py-1 rounded-md bg-[#EA580C] hover:bg-[#D94E07] text-white font-medium text-[11px] transition cursor-pointer"
                        >
                          {t('applyPlacement')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[11px] text-[#686D75] mb-2">
              {t('optDescCustom')}
            </p>
            <div className="space-y-1.5 mb-3">
              {(Object.keys(AP_SPECS) as APMountType[]).map((tKey) => {
                const spec = AP_SPECS[tKey];
                const enSpec = AP_SPECS_EN[tKey];
                const val = rosterCounts[tKey];
                return (
                  <div
                    key={tKey}
                    className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#E3E3DF] text-xs"
                  >
                    <div>
                      <span className="font-medium text-[#18191B]">
                        {isZh ? spec.shortName : enSpec.shortName}
                      </span>
                      <span className="text-[10px] text-[#7A7F87] ml-1.5">
                        ¥{spec.unitPriceRmb}{t('perUnitSuffix')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono-tech">
                      <button
                        onClick={() =>
                          setRosterCounts((prev) => ({
                            ...prev,
                            [tKey]: Math.max(0, prev[tKey] - 1),
                          }))
                        }
                        className="w-6 h-6 rounded bg-[#F4F4F0] hover:bg-[#E5E5DF] text-[#18191B] cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-semibold">{val}</span>
                      <button
                        onClick={() =>
                          setRosterCounts((prev) => ({
                            ...prev,
                            [tKey]: Math.min(6, prev[tKey] + 1),
                          }))
                        }
                        className="w-6 h-6 rounded bg-[#F4F4F0] hover:bg-[#E5E5DF] text-[#18191B] cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleTriggerFixed}
              disabled={isOptimizing}
              className="w-full py-2 px-3 rounded-xl bg-[#18191B] hover:bg-[#2C2E33] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>{isOptimizing ? t('btnCalculating') : t('btnCalcFixed')}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Selected AP Property Inspector OR Active Device Roster */}
      <div className="p-4 border-b border-[#ECECE7]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#18191B] flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-[#5C6066]" />
            <span>
              {selectedAp ? `${t('deviceEditTitle')} · ${loc(selectedAp.name)}` : t('deviceListTitle')}
            </span>
          </h3>
          {selectedAp && (
            <button
              onClick={() => onSelectAp(null)}
              className="text-[11px] text-[#686D75] hover:text-[#18191B] cursor-pointer"
            >
              {t('backToList')}
            </button>
          )}
        </div>

        {selectedAp ? (
          <div className="bg-[#F7F7F4] border border-[#E3E3DF] rounded-xl p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={selectedAp.name}
                onChange={(e) => onUpdateAp({ ...selectedAp, name: e.target.value })}
                className="flex-1 bg-white px-2.5 py-1 rounded-md border border-[#DCDCD6] text-xs font-medium"
              />
              <button
                onClick={() => onDeleteAp(selectedAp.id)}
                className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
                title="删除此设备"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {selectedAp.type === 'mesh_node' && (
              <label className="flex items-center justify-between bg-white px-2.5 py-2 rounded-lg border border-[#E3E3DF] cursor-pointer">
                <div>
                  <div className="font-medium text-[#18191B]">{t('wiredBackhaul')}</div>
                  <div className="text-[10px] text-[#7A7F87]">{t('wiredBackhaulDesc')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedAp.wiredBackhaul}
                  onChange={(e) =>
                    onUpdateAp({ ...selectedAp, wiredBackhaul: e.target.checked })
                  }
                  className="accent-[#18191B] w-4 h-4"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[#686D75] mb-1">
                  {t('power5g')} ({selectedAp.txPower5} dBm)
                </label>
                <input
                  type="range"
                  min={14}
                  max={24}
                  step={0.5}
                  value={selectedAp.txPower5}
                  onChange={(e) =>
                    onUpdateAp({ ...selectedAp, txPower5: parseFloat(e.target.value) })
                  }
                  className="w-full accent-[#18191B]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#686D75] mb-1">
                  {t('channel5g')}
                </label>
                <select
                  value={selectedAp.channel5}
                  onChange={(e) =>
                    onUpdateAp({ ...selectedAp, channel5: Number(e.target.value) })
                  }
                  className="w-full bg-white border border-[#DCDCD6] rounded-md px-2 py-1 text-xs font-mono-tech"
                >
                  {CHANNELS_5.map((ch) => (
                    <option key={ch} value={ch}>
                      Ch.{ch} (80/160MHz)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const apFl = floors.find((f) => f.id === selectedAp.floorId);
              const tape = apFl ? computeTapeMeasureRefs(selectedAp.x, selectedAp.y, apFl.walls) : null;
              if (!tape) return null;
              return (
                <div className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E3E3DF] text-[10.5px] font-mono-tech text-[#0F766E]">
                  工地卷尺定位：距{tape.horizDir} {tape.horizDistM}m · 距{tape.vertDir} {tape.vertDistM}m
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-1.5">
            {aps.map((ap) => {
              const flName = floors.find((f) => f.id === ap.floorId)?.name ?? '1F';
              return (
                <div
                  key={ap.id}
                  onClick={() => onSelectAp(ap.id)}
                  className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-[#ECECE7] hover:border-[#18191B] bg-[#FAFAF8] text-xs cursor-pointer transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tech text-[10px] px-1.5 py-0.5 rounded bg-[#18191B] text-white">
                      {flName}
                    </span>
                    <span className="font-medium truncate">{loc(ap.name)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono-tech text-[11px] text-[#686D75]">
                    <span>
                      {ap.wiredBackhaul || ap.type === 'router_main' ? t('wiredTag') : t('wirelessTag')}
                    </span>
                    <span>Ch.{ap.channel5}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Demand Hotspots Health Check & Pre-Renovation Diagnostics */}
      <div className="p-4 space-y-3 flex-1">
        <div>
          <h3 className="text-xs font-semibold text-[#18191B] mb-2">
            {t('demandHealthTitle')}
          </h3>
          <div className="space-y-1.5">
            {evaluation.demandResults.map((item) => (
              <div
                key={item.pin.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F8F8F5] border border-[#ECECE7] text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  )}
                  <span className="font-mono-tech text-[10px] text-[#7A7F87]">
                    {item.floorName}
                  </span>
                  <span className="truncate font-medium text-[#18191B]">
                    {loc(item.pin.label)}
                  </span>
                </div>
                <div className="font-mono-tech text-[11px] shrink-0">
                  <span
                    className={
                      item.passed ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'
                    }
                  >
                    {item.actualDbm} dBm
                  </span>
                  <span className="text-[#9398A1] text-[10px] ml-1">
                    ({t('targetShort')} {item.targetDbm})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Renovation Diagnostics */}
        <div>
          <h3 className="text-xs font-semibold text-[#18191B] mb-2">
            {t('diagnosticsTitle')}
          </h3>
          <div className="space-y-2">
            {evaluation.diagnostics.map((diag, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                  diag.level === 'success'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : diag.level === 'warning'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                    : diag.level === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-[#F6F6F3] border-[#E3E3DF] text-[#33363C]'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>{diag.title}</span>
                </div>
                <p className="text-[11px] opacity-85 mt-0.5">{diag.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onOpenWiringReport}
          className="w-full py-2.5 px-3 rounded-xl border border-[#18191B] bg-white hover:bg-[#F6F6F3] text-[#18191B] text-xs font-semibold transition cursor-pointer"
        >
          {t('openReportCta')}
        </button>
      </div>
    </aside>
  );
};
