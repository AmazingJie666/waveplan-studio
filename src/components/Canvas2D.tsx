import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Maximize2, RadioTower, RotateCw, Waves } from 'lucide-react';
import { AP_SPECS, DEMAND_SPECS, WALL_MATERIALS } from '../constants/specs';
import { useI18n } from '../i18n/useI18n';
import {
  closestPointOnSegment,
  estimateApCableRun,
  getFloorBoundsAndFootprint,
  pointInPolygon,
  snapPanelApToNearestWall,
} from '../engine/geometry';
import {
  extractIsoContours,
  FloorHeatmapData,
  renderHeatmapToCanvas,
} from '../engine/heatmap';
import {
  buildElevationCache,
  computeWirelessMeshPenalties,
  samplePointSignal,
} from '../engine/rfModel';
import {
  AccessPoint,
  ActiveTool,
  APMountType,
  BandMode,
  DemandCategory,
  DemandPin,
  FloorLevel,
  Point2D,
  PointSignalDetail,
  WallMaterial,
  WallSegment,
  WeakCurrentBox,
} from '../types/wifi';

interface Canvas2DProps {
  floor: FloorLevel;
  allFloors: FloorLevel[];
  aps: AccessPoint[];
  demands: DemandPin[];
  weakBox: WeakCurrentBox;
  heatmap?: FloorHeatmapData;
  bandMode: BandMode;
  activeTool: ActiveTool;
  wallMaterial: WallMaterial;
  apTypeToPlace: APMountType;
  demandCategoryToPlace: DemandCategory;
  selectedApId: string | null;
  onSelectAp: (id: string | null) => void;
  onUpdateAp: (ap: AccessPoint) => void;
  onAddAp: (ap: AccessPoint) => void;
  onDeleteAp: (id: string) => void;
  onUpdateDemand: (pin: DemandPin) => void;
  onAddDemand: (pin: DemandPin) => void;
  onDeleteDemand: (id: string) => void;
  onUpdateWeakBox: (box: WeakCurrentBox) => void;
  onUpdateFloor: (updated: FloorLevel) => void;
  onCalibrateScale: (measuredMeters: number, pixelDistOrMeterDist: number) => void;
  onShiftFloorOrigin: (anchorWorldX: number, anchorWorldY: number) => void;
}

export const Canvas2D: React.FC<Canvas2DProps> = ({
  floor,
  allFloors,
  aps,
  demands,
  weakBox,
  heatmap,
  bandMode,
  activeTool,
  wallMaterial,
  apTypeToPlace,
  demandCategoryToPlace,
  selectedApId,
  onSelectAp,
  onUpdateAp,
  onAddAp,
  onDeleteAp,
  onUpdateDemand,
  onAddDemand,
  onDeleteDemand,
  onUpdateWeakBox,
  onUpdateFloor,
  onCalibrateScale,
  onShiftFloorOrigin,
}) => {
  const { t, loc, lang, resolvedTheme } = useI18n();
  const isDark = resolvedTheme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport state: panOffset in screen pixels + zoom in pixels-per-meter
  const [viewport, setViewport] = useState<{ ox: number; oy: number; ppm: number }>({
    ox: 160,
    oy: 90,
    ppm: 58,
  });
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 960, h: 680 });

  // Visual layer toggles
  const [showContours, setShowContours] = useState(true);
  const [showCables, setShowCables] = useState(true);
  const [showWavePulse, setShowWavePulse] = useState(false);
  const [showLowerGhost, setShowLowerGhost] = useState(true);

  // Interactive drag / draw states
  const [dragTarget, setDragTarget] = useState<
    | { kind: 'pan'; startSx: number; startSy: number; origOx: number; origOy: number }
    | { kind: 'ap'; id: string }
    | { kind: 'demand'; id: string }
    | { kind: 'weak_box' }
    | { kind: 'draw_wall'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'draw_void'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'draw_scale'; x1: number; y1: number; x2: number; y2: number }
    | null
  >(null);

  const [hoverProbe, setHoverProbe] = useState<{
    x: number;
    y: number;
    sx: number;
    sy: number;
    signal: PointSignalDetail | null;
  } | null>(null);

  // Scale Calibration inline modal prompt
  const [pendingScaleDistM, setPendingScaleDistM] = useState<number | null>(null);
  const [scaleInputText, setScaleInputText] = useState('3.6');

  // Background image cache
  const [bgImgEl, setBgImgEl] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!floor.bgImage?.dataUrl) {
      setBgImgEl(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBgImgEl(img);
    img.src = floor.bgImage.dataUrl;
  }, [floor.bgImage?.dataUrl]);

  // Fit floor cleanly into viewport
  const fitToFloor = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = getFloorBoundsAndFootprint(floor);
    const spanX = Math.max(4, maxX - minX);
    const spanY = Math.max(4, maxY - minY);

    const padLeft = 105;
    const padRight = 40;
    const padTop = 55;
    const padBottom = 65;

    const availW = Math.max(240, rect.width - padLeft - padRight);
    const availH = Math.max(220, rect.height - padTop - padBottom);
    const ppm = Math.max(22, Math.min(95, Math.min(availW / spanX, availH / spanY)));

    const ox = padLeft + (availW - spanX * ppm) / 2 - minX * ppm;
    const oy = padTop + (availH - spanY * ppm) / 2 - minY * ppm;
    setViewport({ ox, oy, ppm });
  }, [floor]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          w: Math.max(300, Math.floor(entry.contentRect.width)),
          h: Math.max(260, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when switching floor ID, preset, or uploading a new background floorplan
  const prevFloorKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${floor.id}::${floor.bgImage?.dataUrl?.slice(0, 40) ?? ''}`;
    if (prevFloorKeyRef.current !== key) {
      prevFloorKeyRef.current = key;
      requestAnimationFrame(() => fitToFloor());
    }
  }, [floor.id, floor.bgImage?.dataUrl, fitToFloor]);

  // Pre-render heatmap offscreen canvas & iso-contours whenever heatmap updates
  const heatmapCanvas = useMemo(() => {
    if (!heatmap) return null;
    return renderHeatmapToCanvas(heatmap, 4, 0.74);
  }, [heatmap]);

  const isoSegments = useMemo(() => {
    if (!heatmap || !showContours) return [];
    return extractIsoContours(heatmap, [-58, -67, -75]);
  }, [heatmap, showContours]);

  const elevCache = useMemo(() => buildElevationCache(allFloors), [allFloors]);
  const meshPenalties = useMemo(
    () => computeWirelessMeshPenalties(aps, elevCache),
    [aps, elevCache]
  );

  // Coordinate conversions
  const toScreen = useCallback(
    (wx: number, wy: number): [number, number] => [
      viewport.ox + wx * viewport.ppm,
      viewport.oy + wy * viewport.ppm,
    ],
    [viewport]
  );

  const toWorld = useCallback(
    (sx: number, sy: number): [number, number] => [
      (sx - viewport.ox) / viewport.ppm,
      (sy - viewport.oy) / viewport.ppm,
    ],
    [viewport]
  );

  // Magnetic vertex & orthogonal angle snapping for crisp wall drawing
  const snapWallPoint = useCallback(
    (wx: number, wy: number, anchor?: { x: number; y: number }): Point2D => {
      const snapRadius = Math.min(0.28, 12 / viewport.ppm);
      for (const w of floor.walls) {
        if (Math.hypot(wx - w.x1, wy - w.y1) <= snapRadius) return { x: w.x1, y: w.y1 };
        if (Math.hypot(wx - w.x2, wy - w.y2) <= snapRadius) return { x: w.x2, y: w.y2 };
      }

      let rx = Math.round(wx * 20) / 20;
      let ry = Math.round(wy * 20) / 20;

      if (anchor) {
        const dx = rx - anchor.x;
        const dy = ry - anchor.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.15) {
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          const mod90 = Math.abs(((deg % 90) + 90) % 90);
          if (mod90 < 7 || mod90 > 83) {
            if (Math.abs(dx) >= Math.abs(dy)) {
              ry = anchor.y;
            } else {
              rx = anchor.x;
            }
          }
        }
      }
      return { x: rx, y: ry };
    },
    [floor.walls, viewport.ppm]
  );

  // Wavefront animation frame phase
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    if (!showWavePulse) return;
    let raf = 0;
    const loop = (t: number) => {
      setPulsePhase((t / 1400) % 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showWavePulse]);

  // Main 2D Architectural Blueprint Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Warm Braun architectural paper background (adapts to Dark/Light mode)
    ctx.fillStyle = isDark ? '#111317' : '#F6F6F3';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    // 2. Meter drafting grid (1m minor, 5m major)
    const [wMinX, wMinY] = toWorld(0, 0);
    const [wMaxX, wMaxY] = toWorld(canvasSize.w, canvasSize.h);
    const gxStart = Math.floor(wMinX) - 1;
    const gxEnd = Math.ceil(wMaxX) + 1;
    const gyStart = Math.floor(wMinY) - 1;
    const gyEnd = Math.ceil(wMaxY) + 1;

    for (let gx = gxStart; gx <= gxEnd; gx++) {
      const [sx] = toScreen(gx, 0);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasSize.h);
      ctx.strokeStyle = isDark
        ? gx % 5 === 0
          ? '#262B35'
          : '#1A1E26'
        : gx % 5 === 0
        ? '#DFDFD8'
        : '#ECECE6';
      ctx.lineWidth = gx % 5 === 0 ? 1.1 : 0.7;
      ctx.stroke();
    }
    for (let gy = gyStart; gy <= gyEnd; gy++) {
      const [, sy] = toScreen(0, gy);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasSize.w, sy);
      ctx.strokeStyle = isDark
        ? gy % 5 === 0
          ? '#262B35'
          : '#1A1E26'
        : gy % 5 === 0
        ? '#DFDFD8'
        : '#ECECE6';
      ctx.lineWidth = gy % 5 === 0 ? 1.1 : 0.7;
      ctx.stroke();
    }

    // 3. Indoor floor paper fill
    const { footprint } = getFloorBoundsAndFootprint(floor);
    if (footprint.length >= 3) {
      ctx.beginPath();
      footprint.forEach((pt, idx) => {
        const [sx, sy] = toScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = isDark ? '#191C23' : '#FFFFFF';
      ctx.fill();
    }

    // 4. Uploaded Floorplan Background Image (if any)
    if (bgImgEl && floor.bgImage) {
      const bg = floor.bgImage;
      const [bx, by] = toScreen(bg.offsetX, bg.offsetY);
      const bw = (bg.widthPx / bg.pixelsPerMeter) * viewport.ppm;
      const bh = (bg.heightPx / bg.pixelsPerMeter) * viewport.ppm;
      ctx.save();
      ctx.globalAlpha = bg.opacity;
      ctx.drawImage(bgImgEl, bx, by, bw, bh);
      ctx.restore();
    }

    // 5. Lower-floor subtle structural reference ghost (for 2F / 3F)
    if (showLowerGhost && floor.levelIndex > 0) {
      const sorted = [...allFloors].sort((a, b) => a.levelIndex - b.levelIndex);
      const myIdx = sorted.findIndex((f) => f.id === floor.id);
      const lowerFloor = myIdx > 0 ? sorted[myIdx - 1] : null;
      if (lowerFloor) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        for (const lw of lowerFloor.walls) {
          if (lw.material !== 'concrete') continue;
          const [x1, y1] = toScreen(lw.x1, lw.y1);
          const [x2, y2] = toScreen(lw.x2, lw.y2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 6. Live Signal Heatmap Overlay
    if (heatmap && heatmapCanvas) {
      const [hx0, hy0] = toScreen(heatmap.minX, heatmap.minY);
      const [hx1, hy1] = toScreen(heatmap.maxX, heatmap.maxY);
      ctx.save();
      ctx.drawImage(heatmapCanvas, hx0, hy0, hx1 - hx0, hy1 - hy0);
      ctx.restore();
    }

    // 7. Iso-RSSI Contours (-58, -67, -75 dBm)
    if (showContours && isoSegments.length > 0) {
      ctx.save();
      for (const seg of isoSegments) {
        const [x1, y1] = toScreen(seg.x1, seg.y1);
        const [x2, y2] = toScreen(seg.x2, seg.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (seg.threshold === -58) {
          ctx.strokeStyle = 'rgba(6, 95, 70, 0.36)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
        } else if (seg.threshold === -67) {
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.55)';
          ctx.setLineDash([]);
          ctx.lineWidth = 1.25;
        } else {
          ctx.strokeStyle = 'rgba(185, 28, 28, 0.55)';
          ctx.setLineDash([5, 3]);
          ctx.lineWidth = 1.2;
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Optional Animated Wavefront Rings
    if (showWavePulse) {
      ctx.save();
      const floorAps = aps.filter((a) => a.enabled && a.floorId === floor.id);
      for (const ap of floorAps) {
        const [ax, ay] = toScreen(ap.x, ap.y);
        for (let ring = 0; ring < 3; ring++) {
          const prog = (pulsePhase + ring / 3) % 1;
          const radiusPx = prog * 6.5 * viewport.ppm;
          ctx.beginPath();
          ctx.arc(ax, ay, radiusPx, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(24, 25, 27, ${(1 - prog) * 0.22})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 9. Double-Height Void Zones & Stairwells (Architectural CAD Crossed Opening)
    for (const v of floor.voids) {
      if (v.points.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      v.points.forEach((pt, idx) => {
        const [sx, sy] = toScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle =
        v.kind === 'void' ? 'rgba(246, 246, 243, 0.72)' : 'rgba(241, 245, 249, 0.75)';
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // CAD diagonal cross lines across rectangular 4-point voids
      if (v.points.length === 4) {
        const [p0x, p0y] = toScreen(v.points[0].x, v.points[0].y);
        const [p1x, p1y] = toScreen(v.points[1].x, v.points[1].y);
        const [p2x, p2y] = toScreen(v.points[2].x, v.points[2].y);
        const [p3x, p3y] = toScreen(v.points[3].x, v.points[3].y);
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.lineTo(p2x, p2y);
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p3x, p3y);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Label at centroid
      const cx = v.points.reduce((acc, p) => acc + p.x, 0) / v.points.length;
      const cy = v.points.reduce((acc, p) => acc + p.y, 0) / v.points.length;
      const [scx, scy] = toScreen(cx, cy);
      ctx.setLineDash([]);
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#475569';
      ctx.fillText(loc(v.name), scx, scy - 2);
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#0F766E';
      ctx.fillText(t('voidCrossFloor'), scx, scy + 13);
      ctx.restore();
    }

    // 10. Room Architectural Typography Labels
    for (const rm of floor.rooms) {
      const [rx, ry] = toScreen(rm.x, rm.y);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '600 11.5px Inter, sans-serif';
      ctx.fillStyle = isDark ? 'rgba(241, 245, 249, 0.78)' : 'rgba(24, 25, 27, 0.72)';
      ctx.fillText(loc(rm.name), rx, ry);
      if (rm.subtitle && viewport.ppm >= 36) {
        ctx.font = '400 9.5px Inter, sans-serif';
        ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.72)' : 'rgba(60, 64, 70, 0.62)';
        ctx.fillText(loc(rm.subtitle), rx, ry + 13);
      }
      ctx.restore();
    }

    // 11. Conduit Cable Routing (Manhattan Cat6 paths from Weak-Current Box / Riser)
    if (showCables) {
      for (const ap of aps) {
        if (!ap.enabled || ap.floorId !== floor.id) continue;
        if (!ap.wiredBackhaul && ap.type !== 'router_main') continue;

        const run = estimateApCableRun(weakBox, ap, allFloors);
        if (run.path2D.length < 2) continue;

        ctx.save();
        ctx.beginPath();
        run.path2D.forEach((pt, idx) => {
          const [sx, sy] = toScreen(pt.x, pt.y);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = 'rgba(234, 88, 12, 0.72)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.7;
        ctx.stroke();

        // Cable length tag on midpoint
        const mid = run.path2D[1];
        const [mx, my] = toScreen((mid.x + ap.x) / 2, (mid.y + ap.y) / 2);
        if (run.lengthMeters > 2.2 && viewport.ppm >= 34) {
          const txt = `Cat6 · ${run.lengthMeters}m`;
          ctx.setLineDash([]);
          ctx.font = '500 9.5px "JetBrains Mono", monospace';
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(mx - tw / 2, my - 8, tw, 15);
          ctx.strokeStyle = 'rgba(234, 88, 12, 0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(mx - tw / 2, my - 8, tw, 15);
          ctx.fillStyle = '#C2410C';
          ctx.textAlign = 'center';
          ctx.fillText(txt, mx, my + 3);
        }
        ctx.restore();
      }
    }

    // 12. Architectural Walls
    for (const w of floor.walls) {
      const spec = WALL_MATERIALS[w.material];
      const [x1, y1] = toScreen(w.x1, w.y1);
      const [x2, y2] = toScreen(w.x2, w.y2);

      ctx.save();
      ctx.lineCap = 'square';

      if (w.material === 'glass') {
        // Architectural double-line glazing symbol
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#BAE6FD';
        ctx.lineWidth = Math.max(4, spec.thicknessM * viewport.ppm);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#0284C7';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle =
          isDark && w.material === 'concrete'
            ? '#E2E8F0'
            : isDark && w.material === 'brick'
            ? '#94A3B8'
            : spec.color;
        ctx.lineWidth = Math.max(
          spec.strokeWidthPx,
          spec.thicknessM * viewport.ppm * 0.85
        );
        if (spec.dashed) ctx.setLineDash([7, 4]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 13. Alignment Origin Crosshair (0, 0)
    {
      const [ox0, oy0] = toScreen(0, 0);
      ctx.save();
      ctx.strokeStyle = 'rgba(24, 25, 27, 0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox0, oy0, 6, 0, Math.PI * 2);
      ctx.moveTo(ox0 - 10, oy0);
      ctx.lineTo(ox0 + 10, oy0);
      ctx.moveTo(ox0, oy0 - 10);
      ctx.lineTo(ox0, oy0 + 10);
      ctx.stroke();
      if (activeTool === 'align_anchor') {
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#18191B';
        ctx.fillText('(0,0) 垂直对齐锚点', ox0 + 10, oy0 - 8);
      }
      ctx.restore();
    }

    // 14. Weak-Current Box / Vertical Riser Marker
    {
      const [bx, by] = toScreen(weakBox.x, weakBox.y);
      const isSameFloor = weakBox.floorId === floor.id;
      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = isSameFloor ? '#18191B' : 'rgba(24, 25, 27, 0.65)';
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-13, -11, 26, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(isSameFloor ? t('weakBoxShort') : t('riserShort'), 0, 3.5);

      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = isDark ? '#E2E8F0' : '#18191B';
      ctx.fillText(
        isSameFloor ? loc(weakBox.label) : `↕ ${loc(weakBox.label)}`,
        0,
        23
      );
      ctx.restore();
    }

    // 15. User High-Priority Demand Pins
    const floorDemands = demands.filter((d) => d.floorId === floor.id);
    for (const pin of floorDemands) {
      const spec = DEMAND_SPECS[pin.category];
      const sig = samplePointSignal(
        pin.x,
        pin.y,
        floor.id,
        aps,
        spec.preferBand === '5ghz' ? '5ghz' : spec.preferBand === '2.4ghz' ? '2.4ghz' : 'dual',
        elevCache,
        meshPenalties
      );
      const target = spec.preferBand === '2.4ghz' ? spec.target24dBm : spec.target5dBm;
      const actual =
        spec.preferBand === '5ghz'
          ? sig.rssi5
          : spec.preferBand === '2.4ghz'
          ? sig.rssi24
          : Math.max(sig.rssi5, sig.rssi24 - 4);
      const passed = actual >= target;

      const [px, py] = toScreen(pin.x, pin.y);
      ctx.save();
      ctx.translate(px, py);

      // Anchor dot
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = passed ? '#059669' : '#DC2626';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      // Pill tag above pin
      const badgeText = `${loc(pin.label)} · ${Math.round(actual)}dBm`;
      ctx.font = '600 10.5px Inter, sans-serif';
      const wText = ctx.measureText(badgeText).width + 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = passed ? '#10B981' : '#EF4444';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(-wText / 2, -27, wText, 19, 9.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = passed ? '#065F46' : '#991B1B';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, 0, -14);
      ctx.restore();
    }

    // 16. Cross-floor ghost APs + Current-floor interactive APs
    for (const ap of aps) {
      const [ax, ay] = toScreen(ap.x, ap.y);
      const isCurrentFloor = ap.floorId === floor.id;
      const isSelected = ap.id === selectedApId;

      if (!isCurrentFloor) {
        if (!ap.enabled) continue;
        // Subtle ghost indicator for APs on other floors
        const otherFl = allFloors.find((f) => f.id === ap.floorId)?.name ?? '';
        ctx.save();
        ctx.translate(ax, ay);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.fillText(otherFl, 0, 3);
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.translate(ax, ay);

      // Directional radiation cone for 86 wall-panel AP
      if (ap.type === 'panel_ap' && ap.azimuthDeg !== undefined && ap.enabled) {
        const rad = (ap.azimuthDeg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 34, rad - 0.68, rad + 0.68);
        ctx.closePath();
        ctx.fillStyle = 'rgba(234, 88, 12, 0.16)';
        ctx.fill();
      }

      // Selection halo
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(234, 88, 12, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#EA580C';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // Hardware body shape (Square for 86 Panel AP, Circle for Router/Ceiling AP)
      ctx.fillStyle = ap.enabled ? '#18191B' : '#9CA3AF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (ap.type === 'panel_ap') {
        ctx.roundRect(-11, -11, 22, 22, 4);
      } else {
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();

      // Braun orange status core
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = !ap.enabled
        ? '#D1D5DB'
        : ap.wiredBackhaul || ap.type === 'router_main'
        ? '#EA580C'
        : '#F59E0B';
      ctx.fill();

      // Label plate below AP
      const label = loc(ap.name);
      ctx.font = '600 11px Inter, sans-serif';
      const lw = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(24, 25, 27, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-lw / 2, 16, lw, 18, 5);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, 28.5);
      ctx.restore();
    }

    // 17. Active Drawing Previews (Wall / Void / Scale Calibration)
    if (dragTarget?.kind === 'draw_wall') {
      const [sx1, sy1] = toScreen(dragTarget.x1, dragTarget.y1);
      const [sx2, sy2] = toScreen(dragTarget.x2, dragTarget.y2);
      const lenM = Math.hypot(dragTarget.x2 - dragTarget.x1, dragTarget.y2 - dragTarget.y1);
      const matSpec = WALL_MATERIALS[wallMaterial];

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = matSpec.color;
      ctx.lineWidth = matSpec.strokeWidthPx;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const tag = `${lenM.toFixed(2)}m · ${matSpec.shortName}`;
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2 - 12;
      const tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = '#18191B';
      ctx.fillRect(mx - tw / 2, my - 10, tw, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(tag, mx, my + 3);
      ctx.restore();
    } else if (dragTarget?.kind === 'draw_void') {
      const [sx1, sy1] = toScreen(dragTarget.x1, dragTarget.y1);
      const [sx2, sy2] = toScreen(dragTarget.x2, dragTarget.y2);
      ctx.save();
      ctx.fillStyle = 'rgba(15, 118, 110, 0.14)';
      ctx.strokeStyle = '#0F766E';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.8;
      ctx.fillRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
      ctx.strokeRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
      ctx.restore();
    } else if (dragTarget?.kind === 'draw_scale') {
      const [sx1, sy1] = toScreen(dragTarget.x1, dragTarget.y1);
      const [sx2, sy2] = toScreen(dragTarget.x2, dragTarget.y2);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx1, sy1, 4.5, 0, Math.PI * 2);
      ctx.arc(sx2, sy2, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#EA580C';
      ctx.fill();
      ctx.restore();
    }

    // 18. Scale Bar in bottom-right corner
    {
      const barMeters = viewport.ppm >= 60 ? 1 : viewport.ppm >= 30 ? 2 : 5;
      const barPx = barMeters * viewport.ppm;
      const bx = canvasSize.w - barPx - 20;
      const by = canvasSize.h - 20;
      ctx.save();
      ctx.strokeStyle = '#18191B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by - 5);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + barPx, by);
      ctx.lineTo(bx + barPx, by - 5);
      ctx.stroke();
      ctx.font = '600 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#18191B';
      ctx.textAlign = 'center';
      ctx.fillText(`${barMeters} m`, bx + barPx / 2, by - 7);
      ctx.restore();
    }

    ctx.restore();
  }, [
    canvasSize,
    viewport,
    floor,
    allFloors,
    aps,
    demands,
    weakBox,
    heatmap,
    heatmapCanvas,
    isoSegments,
    showContours,
    showCables,
    showWavePulse,
    showLowerGhost,
    pulsePhase,
    selectedApId,
    dragTarget,
    wallMaterial,
    activeTool,
    bgImgEl,
    elevCache,
    meshPenalties,
    isDark,
    toScreen,
    toWorld,
  ]);

  // Pointer Interaction Handlers
  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = toWorld(sx, sy);
    return { sx, sy, wx, wy };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { sx, sy, wx, wy } = getPointerCoords(e);

    // Middle mouse button always pans
    if (e.button === 1) {
      setDragTarget({
        kind: 'pan',
        startSx: sx,
        startSy: sy,
        origOx: viewport.ox,
        origOy: viewport.oy,
      });
      return;
    }

    if (activeTool === 'select') {
      // Hit-test current floor APs first
      for (const ap of aps) {
        if (ap.floorId !== floor.id) continue;
        const [ax, ay] = toScreen(ap.x, ap.y);
        if (Math.hypot(sx - ax, sy - ay) <= 20) {
          onSelectAp(ap.id);
          setDragTarget({ kind: 'ap', id: ap.id });
          return;
        }
      }
      // Hit-test Demand Pins
      for (const d of demands) {
        if (d.floorId !== floor.id) continue;
        const [dx, dy] = toScreen(d.x, d.y);
        if (Math.hypot(sx - dx, sy - (dy - 10)) <= 22) {
          setDragTarget({ kind: 'demand', id: d.id });
          return;
        }
      }
      // Hit-test Weak Box
      const [bx, by] = toScreen(weakBox.x, weakBox.y);
      if (Math.hypot(sx - bx, sy - by) <= 18) {
        setDragTarget({ kind: 'weak_box' });
        return;
      }

      onSelectAp(null);
      setDragTarget({
        kind: 'pan',
        startSx: sx,
        startSy: sy,
        origOx: viewport.ox,
        origOy: viewport.oy,
      });
      return;
    }

    if (activeTool === 'wall') {
      const snapped = snapWallPoint(wx, wy);
      setDragTarget({
        kind: 'draw_wall',
        x1: snapped.x,
        y1: snapped.y,
        x2: snapped.x,
        y2: snapped.y,
      });
      return;
    }

    if (activeTool === 'void') {
      const rx = Math.round(wx * 10) / 10;
      const ry = Math.round(wy * 10) / 10;
      setDragTarget({ kind: 'draw_void', x1: rx, y1: ry, x2: rx, y2: ry });
      return;
    }

    if (activeTool === 'scale') {
      setDragTarget({ kind: 'draw_scale', x1: wx, y1: wy, x2: wx, y2: wy });
      return;
    }

    if (activeTool === 'weak_box') {
      onUpdateWeakBox({
        ...weakBox,
        floorId: floor.id,
        x: Math.round(wx * 20) / 20,
        y: Math.round(wy * 20) / 20,
      });
      return;
    }

    if (activeTool === 'align_anchor') {
      onShiftFloorOrigin(wx, wy);
      return;
    }

    if (activeTool === 'add_ap') {
      const spec = AP_SPECS[apTypeToPlace];
      let px = Math.round(wx * 20) / 20;
      let py = Math.round(wy * 20) / 20;
      let azimuthDeg: number | undefined;

      if (apTypeToPlace === 'panel_ap') {
        const snap = snapPanelApToNearestWall(px, py, floor.walls, 2.0);
        px = Math.round(snap.x * 100) / 100;
        py = Math.round(snap.y * 100) / 100;
        azimuthDeg = snap.azimuthDeg;
      }

      const newAp: AccessPoint = {
        id: `ap-${Date.now()}`,
        name: `${floor.name} ${spec.shortName}`,
        floorId: floor.id,
        x: px,
        y: py,
        mountHeightM: spec.defaultHeightM,
        type: apTypeToPlace,
        txPower24: spec.txPower24,
        txPower5: spec.txPower5,
        azimuthDeg,
        channel24: [1, 6, 11][aps.length % 3],
        channel5: [36, 44, 149, 157][aps.length % 4],
        wiredBackhaul: true,
        enabled: true,
      };
      onAddAp(newAp);
      onSelectAp(newAp.id);
      return;
    }

    if (activeTool === 'add_demand') {
      const spec = DEMAND_SPECS[demandCategoryToPlace];
      const count = demands.filter((d) => d.floorId === floor.id).length + 1;
      const newPin: DemandPin = {
        id: `dem-${Date.now()}`,
        floorId: floor.id,
        x: Math.round(wx * 20) / 20,
        y: Math.round(wy * 20) / 20,
        label: `${spec.shortName}-${count}`,
        category: demandCategoryToPlace,
      };
      onAddDemand(newPin);
      return;
    }

    if (activeTool === 'eraser') {
      // Check APs
      for (const ap of aps) {
        if (ap.floorId === floor.id && Math.hypot(wx - ap.x, wy - ap.y) < 0.45) {
          onDeleteAp(ap.id);
          return;
        }
      }
      // Check Demand Pins
      for (const d of demands) {
        if (d.floorId === floor.id && Math.hypot(wx - d.x, wy - d.y) < 0.5) {
          onDeleteDemand(d.id);
          return;
        }
      }
      // Check Voids
      for (const v of floor.voids) {
        if (pointInPolygon(wx, wy, v.points)) {
          onUpdateFloor({
            ...floor,
            voids: floor.voids.filter((item) => item.id !== v.id),
          });
          return;
        }
      }
      // Check Walls
      let closestWall: WallSegment | null = null;
      let minDist = 0.35;
      for (const w of floor.walls) {
        const d = closestPointOnSegment(wx, wy, w.x1, w.y1, w.x2, w.y2).dist;
        if (d < minDist) {
          minDist = d;
          closestWall = w;
        }
      }
      if (closestWall) {
        onUpdateFloor({
          ...floor,
          walls: floor.walls.filter((w) => w.id !== closestWall!.id),
        });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy, wx, wy } = getPointerCoords(e);

    if (dragTarget) {
      if (dragTarget.kind === 'pan') {
        setViewport((prev) => ({
          ...prev,
          ox: dragTarget.origOx + (sx - dragTarget.startSx),
          oy: dragTarget.origOy + (sy - dragTarget.startSy),
        }));
        return;
      }

      if (dragTarget.kind === 'ap') {
        const targetAp = aps.find((a) => a.id === dragTarget.id);
        if (targetAp) {
          let nx = Math.round(wx * 20) / 20;
          let ny = Math.round(wy * 20) / 20;
          let azimuthDeg = targetAp.azimuthDeg;
          if (targetAp.type === 'panel_ap') {
            const snap = snapPanelApToNearestWall(wx, wy, floor.walls, 0.9);
            if (snap.snapped) {
              nx = Math.round(snap.x * 100) / 100;
              ny = Math.round(snap.y * 100) / 100;
              azimuthDeg = snap.azimuthDeg;
            }
          }
          onUpdateAp({ ...targetAp, x: nx, y: ny, azimuthDeg });
        }
        return;
      }

      if (dragTarget.kind === 'demand') {
        const pin = demands.find((d) => d.id === dragTarget.id);
        if (pin) {
          onUpdateDemand({
            ...pin,
            x: Math.round(wx * 20) / 20,
            y: Math.round(wy * 20) / 20,
          });
        }
        return;
      }

      if (dragTarget.kind === 'weak_box') {
        onUpdateWeakBox({
          ...weakBox,
          x: Math.round(wx * 20) / 20,
          y: Math.round(wy * 20) / 20,
        });
        return;
      }

      if (dragTarget.kind === 'draw_wall') {
        const snapped = snapWallPoint(wx, wy, { x: dragTarget.x1, y: dragTarget.y1 });
        setDragTarget({ ...dragTarget, x2: snapped.x, y2: snapped.y });
        return;
      }

      if (dragTarget.kind === 'draw_void' || dragTarget.kind === 'draw_scale') {
        setDragTarget({
          ...dragTarget,
          x2: Math.round(wx * 20) / 20,
          y2: Math.round(wy * 20) / 20,
        });
        return;
      }
    }

    // Update Live Hover Signal Probe when inside floor bounds
    const { footprint } = getFloorBoundsAndFootprint(floor);
    if (pointInPolygon(wx, wy, footprint)) {
      const sig = samplePointSignal(
        wx,
        wy,
        floor.id,
        aps,
        bandMode,
        elevCache,
        meshPenalties,
        lang
      );
      setHoverProbe({ x: wx, y: wy, sx, sy, signal: sig });
    } else {
      setHoverProbe({ x: wx, y: wy, sx, sy, signal: null });
    }
  };

  const handlePointerUp = () => {
    if (!dragTarget) return;

    if (dragTarget.kind === 'draw_wall') {
      const len = Math.hypot(dragTarget.x2 - dragTarget.x1, dragTarget.y2 - dragTarget.y1);
      if (len >= 0.2) {
        const newWall: WallSegment = {
          id: `w-${Date.now()}`,
          x1: dragTarget.x1,
          y1: dragTarget.y1,
          x2: dragTarget.x2,
          y2: dragTarget.y2,
          material: wallMaterial,
        };
        onUpdateFloor({
          ...floor,
          walls: [...floor.walls, newWall],
        });
      }
    } else if (dragTarget.kind === 'draw_void') {
      const minX = Math.min(dragTarget.x1, dragTarget.x2);
      const maxX = Math.max(dragTarget.x1, dragTarget.x2);
      const minY = Math.min(dragTarget.y1, dragTarget.y2);
      const maxY = Math.max(dragTarget.y1, dragTarget.y2);
      if (maxX - minX >= 0.6 && maxY - minY >= 0.6) {
        onUpdateFloor({
          ...floor,
          voids: [
            ...floor.voids,
            {
              id: `void-${Date.now()}`,
              name: floor.levelIndex > 0 ? '挑空区 / 楼梯口' : '楼梯开口',
              kind: 'void',
              points: [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY },
              ],
            },
          ],
        });
      }
    } else if (dragTarget.kind === 'draw_scale') {
      const distM = Math.hypot(dragTarget.x2 - dragTarget.x1, dragTarget.y2 - dragTarget.y1);
      if (distM >= 0.2) {
        setPendingScaleDistM(distM);
        setScaleInputText(distM.toFixed(2));
      }
    }

    setDragTarget(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.91;

    setViewport((prev) => {
      const nextPpm = Math.max(18, Math.min(160, prev.ppm * factor));
      const wx = (sx - prev.ox) / prev.ppm;
      const wy = (sy - prev.oy) / prev.ppm;
      return {
        ppm: nextPpm,
        ox: sx - wx * nextPpm,
        oy: sy - wy * nextPpm,
      };
    });
  };

  const selectedAp = aps.find((a) => a.id === selectedApId && a.floorId === floor.id);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        style={{ width: canvasSize.w, height: canvasSize.h }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverProbe(null)}
        onWheel={handleWheel}
        className={
          activeTool === 'select'
            ? dragTarget?.kind === 'pan'
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-crosshair'
        }
      />

      {/* Selected Panel AP Quick Rotate Pill */}
      {selectedAp && selectedAp.type === 'panel_ap' && (
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl px-3 py-2 shadow-sm flex items-center gap-2.5 text-xs z-20">
          <RadioTower className="w-3.5 h-3.5 text-[#EA580C]" />
          <span className="font-medium">{loc(selectedAp.name)}</span>
          <button
            onClick={() =>
              onUpdateAp({
                ...selectedAp,
                azimuthDeg: ((selectedAp.azimuthDeg ?? 0) + 90) % 360,
              })
            }
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#F6F6F3] hover:bg-[#EAEAE4] border border-[#E3E3DF] font-mono-tech text-[11px] cursor-pointer"
          >
            <RotateCw className="w-3 h-3" /> {t('rotateDir')} ({selectedAp.azimuthDeg ?? 0}°)
          </button>
        </div>
      )}

      {/* Scale Calibration Prompt Dialog */}
      {pendingScaleDistM !== null && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-30">
          <div className="bg-white border border-[#E3E3DF] rounded-2xl shadow-xl p-5 w-80">
            <h4 className="font-semibold text-sm text-[#18191B]">{t('scaleDialogTitle')}</h4>
            <p className="text-xs text-[#686D75] mt-1">{t('scaleDialogDesc')}</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                step="0.05"
                min="0.3"
                max="50"
                value={scaleInputText}
                onChange={(e) => setScaleInputText(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm font-mono-tech border border-[#D4D4CE] rounded-lg focus:outline-none focus:border-[#18191B]"
                autoFocus
              />
              <span className="text-xs font-mono-tech text-[#686D75]">{t('metersUnit')}</span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingScaleDistM(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-[#E3E3DF] text-[#5C6066] hover:bg-[#F6F6F3] cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  const val = parseFloat(scaleInputText);
                  if (Number.isFinite(val) && val > 0.2) {
                    onCalibrateScale(val, pendingScaleDistM);
                  }
                  setPendingScaleDistM(null);
                }}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#18191B] text-white hover:bg-[#2E3035] cursor-pointer"
              >
                {t('confirmScale')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Layer Controls + Color Legend + Live Signal Probe */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2 pointer-events-none z-20 no-print">
        {/* Signal Color Scale + View Toggles */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl px-3 py-2 shadow-xs flex flex-wrap items-center gap-3 text-[11px]">
          {/* dBm Legend */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono-tech text-[#686D75]">{t('legendStrong')}</span>
            <div
              className="w-28 h-2.5 rounded-full border border-black/10"
              style={{
                background:
                  'linear-gradient(90deg, #059669 0%, #10B981 30%, #84CC16 52%, #F59E0B 72%, #EF4444 88%, #94A3B8 100%)',
              }}
            />
            <span className="font-mono-tech text-[#686D75]">{t('legendWeak')}</span>
          </div>

          <div className="h-3.5 w-px bg-[#E3E3DF] hidden sm:block" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowContours((v) => !v)}
              className={`px-2 py-1 rounded-md border text-[11px] transition cursor-pointer ${
                showContours
                  ? 'bg-[#18191B] text-white border-[#18191B]'
                  : 'bg-[#F6F6F3] text-[#5C6066] border-[#E3E3DF]'
              }`}
            >
              {t('contours')}
            </button>
            <button
              onClick={() => setShowCables((v) => !v)}
              className={`px-2 py-1 rounded-md border text-[11px] transition cursor-pointer ${
                showCables
                  ? 'bg-[#18191B] text-white border-[#18191B]'
                  : 'bg-[#F6F6F3] text-[#5C6066] border-[#E3E3DF]'
              }`}
            >
              {t('cables')}
            </button>
            <button
              onClick={() => setShowWavePulse((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition cursor-pointer ${
                showWavePulse
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'bg-[#F6F6F3] text-[#5C6066] border-[#E3E3DF]'
              }`}
            >
              <Waves className="w-3 h-3" /> {t('wavePulse')}
            </button>
            {floor.levelIndex > 0 && (
              <button
                onClick={() => setShowLowerGhost((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#E3E3DF] bg-[#F6F6F3] text-[#5C6066] hover:text-[#18191B] text-[11px] cursor-pointer"
              >
                {showLowerGhost ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{t('lowerGhost')}</span>
              </button>
            )}
            <button
              onClick={fitToFloor}
              className="p-1 rounded-md border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-white text-[#18191B] cursor-pointer"
              title="居中适应屏幕"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Hover RF Instrument Probe */}
        {hoverProbe?.signal && (
          <div className="bg-[#18191B]/95 backdrop-blur text-white rounded-xl px-3.5 py-2 shadow-md flex items-center gap-3 text-xs">
            <div>
              <div className="flex items-center gap-2 font-mono-tech">
                <span className="text-[#EA580C] font-semibold">
                  {hoverProbe.signal.displayRssi} dBm
                </span>
                <span className="text-white/40">|</span>
                <span className="text-emerald-400">
                  ~{hoverProbe.signal.estThroughputMbps} Mbps
                </span>
              </div>
              <div className="text-[10px] text-white/70 mt-0.5">
                {hoverProbe.signal.qualityText} · {t('connectedTo')} {loc(hoverProbe.signal.bestApName)}
              </div>
            </div>
            <div className="text-[10px] font-mono-tech text-white/50 border-l border-white/15 pl-2.5 hidden sm:block">
              <div>5G: {hoverProbe.signal.rssi5} dBm</div>
              <div>2.4G: {hoverProbe.signal.rssi24} dBm</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
