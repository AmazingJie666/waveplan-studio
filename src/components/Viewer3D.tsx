import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Cable, Layers, RotateCcw } from 'lucide-react';
import { WALL_MATERIALS } from '../constants/specs';
import { getFloorBoundsAndFootprint } from '../engine/geometry';
import { FloorHeatmapData, renderHeatmapToCanvas } from '../engine/heatmap';
import { useI18n } from '../i18n/useI18n';
import { AccessPoint, DemandPin, FloorLevel, WeakCurrentBox } from '../types/wifi';

interface Viewer3DProps {
  floors: FloorLevel[];
  aps: AccessPoint[];
  demands: DemandPin[];
  weakBox: WeakCurrentBox;
  heatmaps: Map<string, FloorHeatmapData>;
  activeFloorId: string;
  onSelectFloor: (floorId: string) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  floors,
  aps,
  demands,
  weakBox,
  heatmaps,
  activeFloorId,
  onSelectFloor,
}) => {
  const { t, resolvedTheme } = useI18n();
  const isDark = resolvedTheme === 'dark';
  const mountRef = useRef<HTMLDivElement>(null);
  const [explodeGap, setExplodeGap] = useState<number>(floors.length > 1 ? 2.6 : 0);
  const [wallOpacity, setWallOpacity] = useState<number>(0.52);
  const [show3DCables, setShow3DCables] = useState<boolean>(true);
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  const sortedFloors = useMemo(
    () => [...floors].sort((a, b) => a.levelIndex - b.levelIndex),
    [floors]
  );

  // Compute global center of house for clean camera target
  const houseCenter = useMemo(() => {
    if (sortedFloors.length === 0) return { cx: 5, cy: 5, span: 12 };
    const b = getFloorBoundsAndFootprint(sortedFloors[0]);
    return {
      cx: (b.minX + b.maxX) / 2,
      cy: (b.minY + b.maxY) / 2,
      span: Math.max(b.maxX - b.minX, b.maxY - b.minY, 8),
    };
  }, [sortedFloors]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#111317' : '#F4F4F0');

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 640;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.2, 250);
    const totalStackH =
      sortedFloors.length * 3.0 + Math.max(0, sortedFloors.length - 1) * explodeGap;
    const dist = houseCenter.span * 1.45 + totalStackH * 0.7;
    camera.position.set(
      houseCenter.cx + dist * 0.78,
      totalStackH * 0.55 + dist * 0.68,
      houseCenter.cy + dist * 0.85
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(houseCenter.cx, totalStackH * 0.35, houseCenter.cy);
    controls.update();

    // Architectural studio lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.88);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfffaf0, 0.85);
    dirLight.position.set(houseCenter.cx + 16, 32, houseCenter.cy + 18);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.4);
    fillLight.position.set(houseCenter.cx - 15, 16, houseCenter.cy - 12);
    scene.add(fillLight);

    // Subtle ground drafting grid
    const gridHelper = new THREE.GridHelper(
      Math.ceil(houseCenter.span * 2.4),
      Math.ceil(houseCenter.span * 2.4),
      0xd4d4ce,
      0xe6e6e0
    );
    gridHelper.position.set(houseCenter.cx, -0.06, houseCenter.cy);
    scene.add(gridHelper);

    const disposables: { dispose: () => void }[] = [];

    // Build 3D Floor Groups (Note: 2D (x, y) maps to 3D (x, z), while elevation is +Y)
    const floorYMap = new Map<string, number>();
    let yCursor = 0;

    sortedFloors.forEach((fl, idx) => {
      const yBase = yCursor;
      floorYMap.set(fl.id, yBase);
      yCursor += fl.heightMeters + explodeGap;

      const floorGroup = new THREE.Group();
      floorGroup.position.y = yBase;
      scene.add(floorGroup);

      const { footprint } = getFloorBoundsAndFootprint(fl);

      // 1. Concrete Slab with true architectural cutouts (`holes`) for Double-Height VoidZones!
      if (footprint.length >= 3) {
        // Note: Shape is in XY plane; rotating X by +PI/2 maps (x, y) -> (x, 0, y)
        const slabShape = new THREE.Shape();
        footprint.forEach((pt, i) => {
          if (i === 0) slabShape.moveTo(pt.x, pt.y);
          else slabShape.lineTo(pt.x, pt.y);
        });
        slabShape.closePath();

        // Cut physical holes for double-height voids & stairwells
        for (const v of fl.voids) {
          if (v.points.length >= 3) {
            const holePath = new THREE.Path();
            v.points.forEach((pt, i) => {
              if (i === 0) holePath.moveTo(pt.x, pt.y);
              else holePath.lineTo(pt.x, pt.y);
            });
            holePath.closePath();
            slabShape.holes.push(holePath);

            // Crisp architectural orange/teal rim around void opening
            const rimPts = [...v.points, v.points[0]].map(
              (p) => new THREE.Vector3(p.x, 0.03, p.y)
            );
            const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPts);
            const rimMat = new THREE.LineBasicMaterial({ color: 0x0f766e });
            floorGroup.add(new THREE.Line(rimGeo, rimMat));
            disposables.push(rimGeo, rimMat);
          }
        }

        const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
          depth: 0.14,
          bevelEnabled: false,
        });
        slabGeo.rotateX(Math.PI / 2); // Extrudes downward to y = -0.14..0
        const slabMat = new THREE.MeshStandardMaterial({
          color: idx === 0 ? 0xe5e5df : 0xefefeb,
          roughness: 0.85,
          metalness: 0.05,
        });
        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
        slabMesh.receiveShadow = true;
        floorGroup.add(slabMesh);

        const slabEdges = new THREE.EdgesGeometry(slabGeo);
        const slabLineMat = new THREE.LineBasicMaterial({ color: 0xb8b8b0 });
        floorGroup.add(new THREE.LineSegments(slabEdges, slabLineMat));
        disposables.push(slabGeo, slabMat, slabEdges, slabLineMat);
      }

      // 2. Live Floor Signal Heatmap Plane
      const hm = heatmaps.get(fl.id);
      if (hm) {
        const hmCanvas = renderHeatmapToCanvas(hm, 4, 0.82);
        const tex = new THREE.CanvasTexture(hmCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        const planeW = hm.maxX - hm.minX;
        const planeH = hm.maxY - hm.minY;
        const planeGeo = new THREE.PlaneGeometry(planeW, planeH);
        planeGeo.rotateX(-Math.PI / 2);
        // Flip V because 2D canvas top-left Y=minY corresponds to 3D Z=minY
        tex.flipY = true;
        const planeMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.position.set(
          (hm.minX + hm.maxX) / 2,
          0.018,
          (hm.minY + hm.maxY) / 2
        );
        floorGroup.add(planeMesh);
        disposables.push(tex, planeGeo, planeMat);
      }

      // 3. 3D Extruded Material-Coded Architectural Walls
      const wallH = fl.heightMeters * 0.86;
      for (const w of fl.walls) {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (len < 0.05) continue;
        const spec = WALL_MATERIALS[w.material];
        const wallGeo = new THREE.BoxGeometry(len, wallH, spec.thicknessM);

        const isGlass = w.material === 'glass';
        const wallColor =
          w.material === 'concrete'
            ? 0x2a2c30
            : w.material === 'brick'
            ? 0x686d76
            : w.material === 'glass'
            ? 0x93c5fd
            : w.material === 'metal'
            ? 0xdc2626
            : 0xa1a6b0;

        const wallMat = new THREE.MeshPhysicalMaterial({
          color: wallColor,
          transparent: true,
          opacity: isGlass ? Math.min(0.28, wallOpacity * 0.6) : wallOpacity,
          roughness: isGlass ? 0.15 : 0.65,
        });

        const mesh = new THREE.Mesh(wallGeo, wallMat);
        const angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
        mesh.position.set((w.x1 + w.x2) / 2, wallH / 2, (w.y1 + w.y2) / 2);
        mesh.rotation.y = -angle;
        floorGroup.add(mesh);

        // Crisp architectural wireframe edge lines
        const edgeGeo = new THREE.EdgesGeometry(wallGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isGlass ? 0x3b82f6 : 0x18191b,
          transparent: true,
          opacity: Math.min(0.85, wallOpacity + 0.25),
        });
        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLines.position.copy(mesh.position);
        edgeLines.rotation.copy(mesh.rotation);
        floorGroup.add(edgeLines);

        disposables.push(wallGeo, wallMat, edgeGeo, edgeMat);
      }

      // 4. Demand Pins on this floor (small glowing beacons)
      for (const d of demands.filter((p) => p.floorId === fl.id)) {
        const pinGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20);
        const pinMat = new THREE.MeshStandardMaterial({
          color: d.category === 'critical' ? 0xea580c : 0x0f766e,
        });
        const pinMesh = new THREE.Mesh(pinGeo, pinMat);
        pinMesh.position.set(d.x, 0.08, d.y);
        floorGroup.add(pinMesh);
        disposables.push(pinGeo, pinMat);
      }

      // 5. Access Points on this floor (3D Braun Hardware + Subtle Signal Dome)
      for (const ap of aps.filter((a) => a.floorId === fl.id && a.enabled)) {
        const apGeo =
          ap.type === 'panel_ap'
            ? new THREE.BoxGeometry(0.24, 0.24, 0.09)
            : new THREE.CylinderGeometry(0.24, 0.28, 0.12, 28);
        const apMat = new THREE.MeshStandardMaterial({
          color: 0x18191b,
          roughness: 0.3,
        });
        const apMesh = new THREE.Mesh(apGeo, apMat);
        const visualY = Math.min(fl.heightMeters * 0.82, ap.mountHeightM);
        apMesh.position.set(ap.x, visualY, ap.y);
        floorGroup.add(apMesh);

        // Glowing Braun orange indicator beacon
        const coreGeo = new THREE.SphereGeometry(0.11, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({
          color: ap.wiredBackhaul || ap.type === 'router_main' ? 0xea580c : 0xf59e0b,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(ap.x, visualY + 0.12, ap.y);
        floorGroup.add(coreMesh);

        // Drop plumb line to floor so user clearly sees exact floor coordinate
        const plumbGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ap.x, 0.02, ap.y),
          new THREE.Vector3(ap.x, visualY, ap.y),
        ]);
        const plumbMat = new THREE.LineBasicMaterial({ color: 0xea580c });
        floorGroup.add(new THREE.Line(plumbGeo, plumbMat));

        disposables.push(apGeo, apMat, coreGeo, coreMat, plumbGeo, plumbMat);
      }
    });

    // 6. Weak-Current Box + 3D Cross-Floor PoE Ethernet Conduit Topology
    const boxY = (floorYMap.get(weakBox.floorId) ?? 0) + 0.45;
    const boxGeo = new THREE.BoxGeometry(0.42, 0.36, 0.22);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x18191b });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(weakBox.x, boxY, weakBox.y);
    scene.add(boxMesh);
    disposables.push(boxGeo, boxMat);

    if (show3DCables) {
      for (const ap of aps) {
        if (!ap.enabled) continue;
        if (!ap.wiredBackhaul && ap.type !== 'router_main') continue;

        const apFloorY = floorYMap.get(ap.floorId) ?? 0;
        const apFl = sortedFloors.find((f) => f.id === ap.floorId);
        const apVisualY =
          apFloorY + Math.min((apFl?.heightMeters ?? 3) * 0.82, ap.mountHeightM);

        // Orthogonal 3D conduit: WeakBox -> vertical riser shaft to target floor slab -> Manhattan X -> Z -> up to AP
        const pts = [
          new THREE.Vector3(weakBox.x, boxY, weakBox.y),
          new THREE.Vector3(weakBox.x, apFloorY + 0.08, weakBox.y),
          new THREE.Vector3(ap.x, apFloorY + 0.08, weakBox.y),
          new THREE.Vector3(ap.x, apFloorY + 0.08, ap.y),
          new THREE.Vector3(ap.x, apVisualY, ap.y),
        ];

        const curveGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const curveMat = new THREE.LineBasicMaterial({
          color: 0xea580c,
          linewidth: 2,
        });
        scene.add(new THREE.Line(curveGeo, curveMat));
        disposables.push(curveGeo, curveMat);
      }
    }

    // Resize handling
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [
    sortedFloors,
    aps,
    demands,
    weakBox,
    heatmaps,
    explodeGap,
    wallOpacity,
    show3DCables,
    houseCenter,
    resetTrigger,
    isDark,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#F4F4F0]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-left Multi-Floor Quick Inspector Pills */}
      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl p-2.5 shadow-sm max-w-xs z-20">
        <div className="text-xs font-semibold text-[#18191B] flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
          <span>{t('viewer3dTitle')}</span>
        </div>
        <p className="text-[11px] text-[#686D75] mt-1 leading-relaxed">
          {t('viewer3dDesc')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {sortedFloors.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelectFloor(f.id)}
              className={`px-2 py-0.5 text-[11px] font-mono-tech rounded border transition cursor-pointer ${
                activeFloorId === f.id
                  ? 'bg-[#18191B] text-white border-[#18191B]'
                  : 'bg-[#F6F6F3] text-[#5C6066] border-[#E3E3DF] hover:text-[#18191B]'
              }`}
            >
              {t('editFloorPrefix')}{f.name} {t('editFloorSuffix')}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Control Bar: Explode Gap Slider + Wall Opacity + 3D Conduits */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20">
        <div className="pointer-events-auto bg-white/95 backdrop-blur border border-[#E3E3DF] rounded-xl px-3.5 py-2 shadow-xs flex flex-wrap items-center gap-4 text-xs">
          {sortedFloors.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="text-[#5C6066] font-medium">{t('explodeGap')}</span>
              <input
                type="range"
                min={0}
                max={5.5}
                step={0.2}
                value={explodeGap}
                onChange={(e) => setExplodeGap(parseFloat(e.target.value))}
                className="w-24 accent-[#18191B] cursor-pointer"
              />
              <span className="font-mono-tech text-[11px] text-[#18191B] w-9">
                +{explodeGap.toFixed(1)}m
              </span>
            </label>
          )}

          <label className="flex items-center gap-2">
            <span className="text-[#5C6066] font-medium">{t('wallOpacity')}</span>
            <input
              type="range"
              min={0.15}
              max={0.9}
              step={0.05}
              value={wallOpacity}
              onChange={(e) => setWallOpacity(parseFloat(e.target.value))}
              className="w-20 accent-[#18191B] cursor-pointer"
            />
          </label>

          <button
            onClick={() => setShow3DCables((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
              show3DCables
                ? 'bg-[#18191B] text-white border-[#18191B]'
                : 'bg-[#F6F6F3] text-[#5C6066] border-[#E3E3DF]'
            }`}
          >
            <Cable className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>{t('poeConduit')}</span>
          </button>

          <button
            onClick={() => setResetTrigger((n) => n + 1)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-white text-[#18191B] text-xs cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> {t('resetView')}
          </button>
        </div>
      </div>
    </div>
  );
};
