import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Canvas2D } from './components/Canvas2D';
import { OnboardingModal } from './components/OnboardingModal';
import { RightPanel } from './components/RightPanel';
import { useI18n } from './i18n/useI18n';
import { ToolDock } from './components/ToolDock';
import { TopBar } from './components/TopBar';
import { UploadWizard } from './components/UploadWizard';
import { Viewer3D } from './components/Viewer3D';
import { WiringReportModal } from './components/WiringReportModal';
import { computeFloorHeatmap, evaluateNetwork } from './engine/heatmap';
import { getFloorBoundsAndFootprint } from './engine/geometry';
import {
  generateArchitectureRecommendations,
  solveOptimalPlacement,
} from './engine/optimizer';
import type { WorkerRequest, WorkerResponse } from './engine/optimizer.worker';
import { buildElevationCache, computeWirelessMeshPenalties } from './engine/rfModel';
import { createPresetProjects } from './presets/templates';
import {
  AccessPoint,
  ActiveTool,
  APMountType,
  ArchitectureRecommendation,
  BandMode,
  DemandCategory,
  DemandPin,
  FloorLevel,
  FloorPlanBg,
  Point2D,
  ProjectModel,
  WallMaterial,
  WallSegment,
} from './types/wifi';

export function App() {
  const { lang, t } = useI18n();
  const presets = useMemo(() => createPresetProjects(), []);
  const [project, setProjectRaw] = useState<ProjectModel>(() => {
    try {
      const saved = localStorage.getItem('waveplan_autosave_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as ProjectModel;
        if (parsed && Array.isArray(parsed.floors) && parsed.floors.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore invalid storage
    }
    return presets[0];
  });
  const [undoStack, setUndoStack] = useState<ProjectModel[]>([]);

  const setProject = useCallback(
    (updater: ProjectModel | ((prev: ProjectModel) => ProjectModel), recordUndo = true) => {
      setProjectRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordUndo && next !== prev) {
          setUndoStack((hist) => [...hist.slice(-24), prev]);
        }
        return next;
      });
    },
    []
  );

  // Auto-save project draft to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('waveplan_autosave_v1', JSON.stringify(project));
    } catch {
      // ignore quota errors
    }
  }, [project]);

  const handleUndo = useCallback(() => {
    setUndoStack((hist) => {
      if (hist.length === 0) return hist;
      const prev = hist[hist.length - 1];
      setProjectRaw(prev);
      return hist.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  const [activeFloorId, setActiveFloorId] = useState<string>(() => project.floors[0].id);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [bandMode, setBandMode] = useState<BandMode>('5ghz');

  // Active editing tool states
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [wallMaterial, setWallMaterial] = useState<WallMaterial>('concrete');
  const [apTypeToPlace, setApTypeToPlace] = useState<APMountType>('panel_ap');
  const [demandCategoryToPlace, setDemandCategoryToPlace] =
    useState<DemandCategory>('critical');
  const [selectedApId, setSelectedApId] = useState<string | null>(null);

  // Modals & Mobile Drawer
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem('waveplan_onboarding_v1') !== '1';
    } catch {
      return true;
    }
  });
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [showWiringReport, setShowWiringReport] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Optimizer Worker state
  const workerRef = useRef<Worker | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [lastOptMs, setLastOptMs] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<
    ArchitectureRecommendation[] | null
  >(null);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('./engine/optimizer.worker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const res = ev.data;
        setIsOptimizing(false);
        setLastOptMs(res.elapsedMs);
        if (res.mode === 'fixed_roster') {
          setProject((prev) => ({ ...prev, aps: res.aps }));
        } else if (res.mode === 'recommend_all') {
          setRecommendations(res.recommendations);
        }
      };
      workerRef.current = worker;
      return () => worker.terminate();
    } catch {
      workerRef.current = null;
    }
  }, []);

  const activeFloor = useMemo(
    () => project.floors.find((f) => f.id === activeFloorId) ?? project.floors[0],
    [project.floors, activeFloorId]
  );

  // Real-time multi-floor heatmaps & network evaluation
  const { heatmaps, evaluation } = useMemo(() => {
    const cache = buildElevationCache(project.floors);
    const meshPenalties = computeWirelessMeshPenalties(project.aps, cache);
    const map = new Map();
    for (const fl of project.floors) {
      // High resolution (0.20m) on active 2D floor, fast resolution (0.26m) on background floors
      const step = fl.id === activeFloor.id || viewMode === '3d' ? 0.21 : 0.3;
      map.set(fl.id, computeFloorHeatmap(fl, project.aps, bandMode, cache, meshPenalties, step));
    }
    const evalRes = evaluateNetwork(
      project.floors,
      project.aps,
      project.demands,
      project.weakBox,
      bandMode,
      map,
      lang
    );
    return { heatmaps: map, evaluation: evalRes };
  }, [project, activeFloor.id, bandMode, viewMode, lang]);

  // Handlers
  const handleSelectPreset = useCallback((presetId: string) => {
    const freshPresets = createPresetProjects();
    const target = freshPresets.find((p) => p.id === presetId) ?? freshPresets[0];
    setProject(target, false);
    setUndoStack([]);
    setActiveFloorId(target.floors[0].id);
    setSelectedApId(null);
    setRecommendations(null);
    setLastOptMs(null);
  }, [setProject]);

  const handleDeleteFloor = useCallback(
    (floorId: string) => {
      if (project.floors.length <= 1) return;
      const remaining = project.floors.filter((f) => f.id !== floorId);
      setProject((prev) => ({
        ...prev,
        floors: remaining,
        aps: prev.aps.filter((a) => a.floorId !== floorId),
        demands: prev.demands.filter((d) => d.floorId !== floorId),
        weakBox:
          prev.weakBox.floorId === floorId
            ? { ...prev.weakBox, floorId: remaining[0].id }
            : prev.weakBox,
      }));
      if (activeFloorId === floorId) {
        setActiveFloorId(remaining[0].id);
      }
    },
    [project.floors, activeFloorId, setProject]
  );

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.waveplan.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as ProjectModel;
          if (parsed && Array.isArray(parsed.floors) && parsed.floors.length > 0) {
            setProject(parsed);
            setActiveFloorId(parsed.floors[0].id);
            setSelectedApId(null);
            setRecommendations(null);
            setViewMode('2d');
          }
        } catch {
          // ignore malformed file
        }
      };
      reader.readAsText(file);
    },
    [setProject]
  );

  const handleAddFloor = useCallback(() => {
    const sorted = [...project.floors].sort((a, b) => a.levelIndex - b.levelIndex);
    const topFloor = sorted[sorted.length - 1];
    const nextIdx = topFloor.levelIndex + 1;
    const nextName = `${nextIdx + 1}F`;
    const newFloorId = `floor-${Date.now()}`;

    // Inherit outer concrete envelope walls & footprint from floor below so user saves 70% drawing work!
    const inheritedWalls = topFloor.walls
      .filter((w) => w.material === 'concrete')
      .map((w, i) => ({ ...w, id: `w-inh-${Date.now()}-${i}` }));

    const newFloor: FloorLevel = {
      id: newFloorId,
      name: nextName,
      label: `${nextName} · 新增住宅楼层（已继承下层承重框）`,
      levelIndex: nextIdx,
      heightMeters: 3.0,
      slabAttenuation24: 15,
      slabAttenuation5: 22,
      footprint: topFloor.footprint.map((p) => ({ ...p })),
      walls: inheritedWalls,
      voids: [],
      rooms: [],
    };

    setProject((prev) => ({
      ...prev,
      floors: [...prev.floors, newFloor],
    }));
    setActiveFloorId(newFloorId);
    setViewMode('2d');
  }, [project.floors]);

  const handleUpdateFloor = useCallback((updated: FloorLevel) => {
    setProject((prev) => ({
      ...prev,
      floors: prev.floors.map((f) => (f.id === updated.id ? updated : f)),
    }));
  }, []);

  const handleUpdateAp = useCallback((ap: AccessPoint) => {
    setProject((prev) => ({
      ...prev,
      aps: prev.aps.map((item) => (item.id === ap.id ? ap : item)),
    }));
  }, []);

  const handleAddAp = useCallback((ap: AccessPoint) => {
    setProject((prev) => ({
      ...prev,
      aps: [...prev.aps, ap],
    }));
  }, []);

  const handleDeleteAp = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      aps: prev.aps.filter((a) => a.id !== id),
    }));
    setSelectedApId((prev) => (prev === id ? null : prev));
  }, []);

  const handleUpdateDemand = useCallback((pin: DemandPin) => {
    setProject((prev) => ({
      ...prev,
      demands: prev.demands.map((d) => (d.id === pin.id ? pin : d)),
    }));
  }, []);

  const handleAddDemand = useCallback((pin: DemandPin) => {
    setProject((prev) => ({
      ...prev,
      demands: [...prev.demands, pin],
    }));
  }, []);

  const handleDeleteDemand = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      demands: prev.demands.filter((d) => d.id !== id),
    }));
  }, []);

  // Scale Calibration: rescales current floor coordinates proportionally by (realMeters / currentMeasuredMeters)
  const handleCalibrateScale = useCallback(
    (realMeters: number, currentMeasuredMeters: number) => {
      const ratio = realMeters / Math.max(0.05, currentMeasuredMeters);
      if (!Number.isFinite(ratio) || ratio <= 0.05 || ratio > 20) return;

      setProject((prev) => ({
        ...prev,
        floors: prev.floors.map((f) => {
          if (f.id !== activeFloor.id) return f;
          return {
            ...f,
            footprint: f.footprint.map((p) => ({ x: p.x * ratio, y: p.y * ratio })),
            walls: f.walls.map((w) => ({
              ...w,
              x1: w.x1 * ratio,
              y1: w.y1 * ratio,
              x2: w.x2 * ratio,
              y2: w.y2 * ratio,
            })),
            voids: f.voids.map((v) => ({
              ...v,
              points: v.points.map((p) => ({ x: p.x * ratio, y: p.y * ratio })),
            })),
            rooms: f.rooms.map((r) => ({ ...r, x: r.x * ratio, y: r.y * ratio })),
            bgImage: f.bgImage
              ? {
                  ...f.bgImage,
                  pixelsPerMeter: f.bgImage.pixelsPerMeter / ratio,
                  offsetX: f.bgImage.offsetX * ratio,
                  offsetY: f.bgImage.offsetY * ratio,
                }
              : undefined,
          };
        }),
        aps: prev.aps.map((ap) =>
          ap.floorId === activeFloor.id
            ? { ...ap, x: ap.x * ratio, y: ap.y * ratio }
            : ap
        ),
        demands: prev.demands.map((d) =>
          d.floorId === activeFloor.id
            ? { ...d, x: d.x * ratio, y: d.y * ratio }
            : d
        ),
        weakBox:
          prev.weakBox.floorId === activeFloor.id
            ? {
                ...prev.weakBox,
                x: prev.weakBox.x * ratio,
                y: prev.weakBox.y * ratio,
              }
            : prev.weakBox,
      }));
      setActiveTool('select');
    },
    [activeFloor.id]
  );

  // Shifts active floor coordinates so clicked point becomes exact (0, 0) vertical alignment origin
  const handleShiftFloorOrigin = useCallback(
    (anchorX: number, anchorY: number) => {
      setProject((prev) => ({
        ...prev,
        floors: prev.floors.map((f) => {
          if (f.id !== activeFloor.id) return f;
          return {
            ...f,
            footprint: f.footprint.map((p) => ({
              x: p.x - anchorX,
              y: p.y - anchorY,
            })),
            walls: f.walls.map((w) => ({
              ...w,
              x1: w.x1 - anchorX,
              y1: w.y1 - anchorY,
              x2: w.x2 - anchorX,
              y2: w.y2 - anchorY,
            })),
            voids: f.voids.map((v) => ({
              ...v,
              points: v.points.map((p) => ({
                x: p.x - anchorX,
                y: p.y - anchorY,
              })),
            })),
            rooms: f.rooms.map((r) => ({
              ...r,
              x: r.x - anchorX,
              y: r.y - anchorY,
            })),
            bgImage: f.bgImage
              ? {
                  ...f.bgImage,
                  offsetX: f.bgImage.offsetX - anchorX,
                  offsetY: f.bgImage.offsetY - anchorY,
                }
              : undefined,
          };
        }),
        aps: prev.aps.map((ap) =>
          ap.floorId === activeFloor.id
            ? { ...ap, x: ap.x - anchorX, y: ap.y - anchorY }
            : ap
        ),
        demands: prev.demands.map((d) =>
          d.floorId === activeFloor.id
            ? { ...d, x: d.x - anchorX, y: d.y - anchorY }
            : d
        ),
        weakBox:
          prev.weakBox.floorId === activeFloor.id
            ? {
                ...prev.weakBox,
                x: prev.weakBox.x - anchorX,
                y: prev.weakBox.y - anchorY,
              }
            : prev.weakBox,
      }));
      setActiveTool('select');
    },
    [activeFloor.id]
  );

  const handleApplyUploadedFloorplan = useCallback(
    (payload: {
      bgImage: FloorPlanBg;
      extractedWalls?: WallSegment[];
      footprint?: Point2D[];
      importMode: 'new_project' | 'current_floor';
      floorName: string;
      clearOldPins: boolean;
    }) => {
      if (payload.importMode === 'new_project') {
        const newFloorId = `custom-${Date.now()}`;
        const newFloor: FloorLevel = {
          id: newFloorId,
          name: payload.floorName,
          label: `${payload.floorName} · 自定义上传户型`,
          levelIndex: 0,
          heightMeters: 2.9,
          slabAttenuation24: 15,
          slabAttenuation5: 22,
          footprint: payload.footprint ?? [
            { x: 0, y: 0 },
            { x: 12, y: 0 },
            { x: 12, y: 9 },
            { x: 0, y: 9 },
          ],
          walls: payload.extractedWalls ?? [],
          voids: [],
          rooms: [],
          bgImage: payload.bgImage,
        };
        const b = getFloorBoundsAndFootprint(newFloor);
        const cx = Math.round(((b.minX + b.maxX) / 2) * 10) / 10;
        const cy = Math.round(((b.minY + b.maxY) / 2) * 10) / 10;

        setProject({
          id: `custom-${Date.now()}`,
          name: '自定义上传户型方案',
          subtitle: '用户自定义导入户型',
          floors: [newFloor],
          weakBox: {
            floorId: newFloorId,
            x: Math.round((b.minX + 0.8) * 10) / 10,
            y: cy,
            label: '入户弱电箱',
          },
          aps: [
            {
              id: `ap-custom-${Date.now()}`,
              name: `${payload.floorName} 主路由`,
              floorId: newFloorId,
              x: cx,
              y: cy,
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
          demands: [],
        });
        setActiveFloorId(newFloorId);
        setSelectedApId(null);
        setRecommendations(null);
        setViewMode('2d');
        return;
      }

      // Import into current floor only (multi-floor custom editing)
      setProject((prev) => ({
        ...prev,
        id: prev.id.startsWith('custom') ? prev.id : 'custom-upload',
        name: prev.id.startsWith('custom') ? prev.name : '自定义多层户型方案',
        floors: prev.floors.map((f) => {
          if (f.id !== activeFloor.id) return f;
          return {
            ...f,
            name: payload.floorName,
            bgImage: payload.bgImage,
            walls: payload.extractedWalls ?? f.walls,
            rooms: payload.clearOldPins ? [] : f.rooms,
            footprint: payload.footprint ?? f.footprint,
          };
        }),
        demands: payload.clearOldPins
          ? prev.demands.filter((d) => d.floorId !== activeFloor.id)
          : prev.demands,
        aps: payload.clearOldPins
          ? prev.aps.filter((a) => a.floorId !== activeFloor.id)
          : prev.aps,
      }));
      setRecommendations(null);
    },
    [activeFloor.id, setProject]
  );

  // Trigger Mode B: Auto Architecture Recommendations
  const handleRunAutoRecommend = useCallback(() => {
    setIsOptimizing(true);
    if (workerRef.current) {
      const req: WorkerRequest = {
        id: `req-${Date.now()}`,
        mode: 'recommend_all',
        floors: project.floors,
        demands: project.demands,
        weakBox: project.weakBox,
        bandMode,
        lang,
      };
      workerRef.current.postMessage(req);
    } else {
      const t0 = performance.now();
      const recs = generateArchitectureRecommendations(
        project.floors,
        project.demands,
        project.weakBox,
        bandMode,
        lang
      );
      setRecommendations(recs);
      setLastOptMs(Math.round(performance.now() - t0));
      setIsOptimizing(false);
    }
  }, [project.floors, project.demands, project.weakBox, bandMode]);

  // Trigger Mode A: Fixed Device Roster Placement Optimization
  const handleRunFixedOptimize = useCallback(
    (roster: APMountType[]) => {
      setIsOptimizing(true);
      if (workerRef.current) {
        const req: WorkerRequest = {
          id: `req-${Date.now()}`,
          mode: 'fixed_roster',
          floors: project.floors,
          demands: project.demands,
          weakBox: project.weakBox,
          deviceTypes: roster,
          bandMode,
        };
        workerRef.current.postMessage(req);
      } else {
        const t0 = performance.now();
        const bestAps = solveOptimalPlacement({
          floors: project.floors,
          demands: project.demands,
          weakBox: project.weakBox,
          deviceTypes: roster,
          bandMode,
        });
        setProject((prev) => ({ ...prev, aps: bestAps }));
        setLastOptMs(Math.round(performance.now() - t0));
        setIsOptimizing(false);
      }
    },
    [project.floors, project.demands, project.weakBox, bandMode, lang]
  );

  const handleApplyRecommendation = useCallback((rec: ArchitectureRecommendation) => {
    setProject((prev) => ({
      ...prev,
      aps: rec.aps,
    }));
    setSelectedApId(null);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F6F3] overflow-hidden">
      <TopBar
        project={project}
        presets={presets}
        activeFloorId={activeFloor.id}
        viewMode={viewMode}
        bandMode={bandMode}
        overallScore={evaluation.overallScore}
        onSelectPreset={handleSelectPreset}
        onSelectFloor={setActiveFloorId}
        onAddFloor={handleAddFloor}
        onDeleteFloor={handleDeleteFloor}
        canUndo={undoStack.length > 0}
        onUndo={handleUndo}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onChangeViewMode={setViewMode}
        onChangeBandMode={setBandMode}
        onOpenUploadWizard={() => setShowUploadWizard(true)}
        onOpenWiringReport={() => setShowWiringReport(true)}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />

      <main className="flex-1 flex relative min-h-0 overflow-hidden">
        {/* Interactive Blueprint Stage (2D or 3D) */}
        <div className="flex-1 relative min-w-0 h-full">
          {viewMode === '2d' && (
            <ToolDock
              activeTool={activeTool}
              wallMaterial={wallMaterial}
              apTypeToPlace={apTypeToPlace}
              demandCategoryToPlace={demandCategoryToPlace}
              isUpperFloor={activeFloor.levelIndex > 0}
              onSelectTool={setActiveTool}
              onSelectWallMaterial={setWallMaterial}
              onSelectApType={setApTypeToPlace}
              onSelectDemandCategory={setDemandCategoryToPlace}
            />
          )}

          {viewMode === '2d' ? (
            <Canvas2D
              floor={activeFloor}
              allFloors={project.floors}
              aps={project.aps}
              demands={project.demands}
              weakBox={project.weakBox}
              heatmap={heatmaps.get(activeFloor.id)}
              bandMode={bandMode}
              activeTool={activeTool}
              wallMaterial={wallMaterial}
              apTypeToPlace={apTypeToPlace}
              demandCategoryToPlace={demandCategoryToPlace}
              selectedApId={selectedApId}
              onSelectAp={setSelectedApId}
              onUpdateAp={handleUpdateAp}
              onAddAp={handleAddAp}
              onDeleteAp={handleDeleteAp}
              onUpdateDemand={handleUpdateDemand}
              onAddDemand={handleAddDemand}
              onDeleteDemand={handleDeleteDemand}
              onUpdateWeakBox={(weakBox) => setProject((prev) => ({ ...prev, weakBox }))}
              onUpdateFloor={handleUpdateFloor}
              onCalibrateScale={handleCalibrateScale}
              onShiftFloorOrigin={handleShiftFloorOrigin}
            />
          ) : (
            <Viewer3D
              floors={project.floors}
              aps={project.aps}
              demands={project.demands}
              weakBox={project.weakBox}
              heatmaps={heatmaps}
              activeFloorId={activeFloor.id}
              onSelectFloor={(fid) => {
                setActiveFloorId(fid);
                setViewMode('2d');
              }}
            />
          )}

          {/* Mobile Floating Drawer Trigger */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden fixed right-3 top-17 z-30 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18191B] text-white text-xs font-semibold shadow-lg cursor-pointer no-print"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>{t('scoreLabel')} ({evaluation.overallScore}%)</span>
          </button>
        </div>

        {/* Desktop Right Sidebar */}
        <div className="hidden lg:block h-full">
          <RightPanel
            floors={project.floors}
            aps={project.aps}
            evaluation={evaluation}
            selectedApId={selectedApId}
            isOptimizing={isOptimizing}
            lastOptMs={lastOptMs}
            recommendations={recommendations}
            onSelectAp={setSelectedApId}
            onUpdateAp={handleUpdateAp}
            onDeleteAp={handleDeleteAp}
            onRunAutoRecommend={handleRunAutoRecommend}
            onRunFixedOptimize={handleRunFixedOptimize}
            onApplyRecommendation={handleApplyRecommendation}
            onOpenWiringReport={() => setShowWiringReport(true)}
          />
        </div>

        {/* Mobile Responsive Drawer */}
        {mobileDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end bg-black/35 no-print">
            <div className="w-[90vw] max-w-[390px] h-full bg-white shadow-2xl relative">
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="absolute top-3 right-3 z-50 px-2.5 py-1 rounded-md bg-[#F4F4F0] text-xs font-medium text-[#18191B]"
              >
                {t('closeDrawer')}
              </button>
              <RightPanel
                floors={project.floors}
                aps={project.aps}
                evaluation={evaluation}
                selectedApId={selectedApId}
                isOptimizing={isOptimizing}
                lastOptMs={lastOptMs}
                recommendations={recommendations}
                onSelectAp={setSelectedApId}
                onUpdateAp={handleUpdateAp}
                onDeleteAp={handleDeleteAp}
                onRunAutoRecommend={handleRunAutoRecommend}
                onRunFixedOptimize={handleRunFixedOptimize}
                onApplyRecommendation={(rec) => {
                  handleApplyRecommendation(rec);
                  setMobileDrawerOpen(false);
                }}
                onOpenWiringReport={() => {
                  setMobileDrawerOpen(false);
                  setShowWiringReport(true);
                }}
              />
            </div>
          </div>
        )}
      </main>

      {showOnboarding && (
        <OnboardingModal
          onClose={() => setShowOnboarding(false)}
          onQuickOptimizeDemo={handleRunAutoRecommend}
        />
      )}

      {showUploadWizard && (
        <UploadWizard
          floor={activeFloor}
          isPresetProject={presets.some((p) => p.id === project.id)}
          totalFloorsCount={project.floors.length}
          onClose={() => setShowUploadWizard(false)}
          onApplyUploadedFloorplan={handleApplyUploadedFloorplan}
        />
      )}

      {showWiringReport && (
        <WiringReportModal
          project={project}
          evaluation={evaluation}
          onClose={() => setShowWiringReport(false)}
        />
      )}
    </div>
  );
}
export default App;
