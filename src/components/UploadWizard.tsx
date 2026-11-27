import React, { useState } from 'react';
import { ImagePlus, Sparkles, Wand2, X } from 'lucide-react';
import { extractWallsFromFloorplanImage } from '../engine/floorplanExtractor';
import { useI18n } from '../i18n/useI18n';
import { FloorLevel, FloorPlanBg, Point2D, WallSegment } from '../types/wifi';

interface UploadWizardProps {
  floor: FloorLevel;
  isPresetProject: boolean;
  totalFloorsCount: number;
  onClose: () => void;
  onApplyUploadedFloorplan: (payload: {
    bgImage: FloorPlanBg;
    extractedWalls?: WallSegment[];
    footprint?: Point2D[];
    importMode: 'new_project' | 'current_floor';
    floorName: string;
    clearOldPins: boolean;
  }) => void;
}

function createSampleDeveloperFloorplanDataUrl(): {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
} {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 540;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 11;
  ctx.strokeRect(60, 50, 600, 440);

  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(410, 50);
  ctx.lineTo(410, 250);
  ctx.moveTo(410, 310);
  ctx.lineTo(410, 490);
  ctx.moveTo(410, 270);
  ctx.lineTo(660, 270);
  ctx.moveTo(220, 50);
  ctx.lineTo(220, 210);
  ctx.moveTo(60, 210);
  ctx.lineTo(170, 210);
  ctx.stroke();

  ctx.strokeStyle = '#999999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 28);
  ctx.lineTo(660, 28);
  ctx.stroke();

  ctx.fillStyle = '#666666';
  ctx.font = '15px sans-serif';
  ctx.fillText('Living 5.2m × 4.6m', 180, 370);
  ctx.fillText('Master', 495, 390);
  ctx.fillText('Study', 495, 165);
  ctx.fillText('Kitchen', 95, 135);

  return { dataUrl: c.toDataURL('image/png'), widthPx: c.width, heightPx: c.height };
}

export const UploadWizard: React.FC<UploadWizardProps> = ({
  floor,
  isPresetProject,
  totalFloorsCount,
  onClose,
  onApplyUploadedFloorplan,
}) => {
  const { lang } = useI18n();
  const isZh = lang === 'zh';

  const [preview, setPreview] = useState<{
    dataUrl: string;
    widthPx: number;
    heightPx: number;
  } | null>(null);
  const [houseWidthMeters, setHouseWidthMeters] = useState<string>('12.0');
  const [autoExtract, setAutoExtract] = useState<boolean>(true);
  const [sensitivity, setSensitivity] = useState<'strict' | 'balanced' | 'sensitive'>('balanced');
  const [importMode, setImportMode] = useState<'new_project' | 'current_floor'>(
    isPresetProject ? 'new_project' : 'current_floor'
  );
  const [floorName, setFloorName] = useState<string>(
    isPresetProject ? '1F' : floor.name
  );
  const [clearOldPins, setClearOldPins] = useState<boolean>(true);
  const [processing, setProcessing] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setPreview({ dataUrl, widthPx: img.width, heightPx: img.height });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleApply = async () => {
    if (!preview) return;
    setProcessing(true);
    try {
      const spanM = Math.max(3, parseFloat(houseWidthMeters) || 12);
      const ppm = preview.widthPx / spanM;
      const bgImage: FloorPlanBg = {
        dataUrl: preview.dataUrl,
        widthPx: preview.widthPx,
        heightPx: preview.heightPx,
        pixelsPerMeter: ppm,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.48,
      };

      let extractedWalls: WallSegment[] | undefined;
      let footprint: Point2D[] | undefined;

      if (autoExtract) {
        const res = await extractWallsFromFloorplanImage(
          preview.dataUrl,
          ppm,
          0,
          0,
          sensitivity
        );
        extractedWalls = res.walls;
        footprint = res.footprint;
      }

      onApplyUploadedFloorplan({
        bgImage,
        extractedWalls,
        footprint,
        importMode,
        floorName: floorName.trim() || '1F',
        clearOldPins,
      });
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 no-print">
      <div className="bg-white border border-[#E3E3DF] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-[#ECECE7] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-[#18191B]">
              {isZh ? `导入 ${floor.name} 户型图与智能墙体提取` : `Import ${floor.name} Floorplan & Extract Walls`}
            </h3>
            <p className="text-xs text-[#686D75] mt-0.5">
              {isZh
                ? '纯浏览器本地识别，户型隐私不上传云端，零 API 调用成本'
                : 'Runs 100% locally in your browser—floorplan privacy stays on-device'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#686D75] hover:bg-[#F6F6F3] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!preview ? (
            <div className="space-y-2.5">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#D4D4CE] hover:border-[#18191B] rounded-xl p-7 bg-[#FAFAF8] cursor-pointer transition">
                <ImagePlus className="w-8 h-8 text-[#EA580C] mb-2" />
                <span className="text-sm font-medium text-[#18191B]">
                  {isZh ? '点击选择开发商户型图 (PNG / JPG / WebP)' : 'Click to choose floorplan image (PNG / JPG / WebP)'}
                </span>
                <span className="text-xs text-[#7A7F87] mt-1">
                  {isZh
                    ? '清晰白底黑线CAD导出图或售楼处黑白宣传册效果最佳'
                    : 'Works best with clean black-on-white architectural plans'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setPreview(createSampleDeveloperFloorplanDataUrl())}
                className="w-full py-2 px-3 rounded-xl border border-[#E3E3DF] bg-[#F6F6F3] hover:bg-[#ECECE6] text-xs font-medium text-[#18191B] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>
                  {isZh
                    ? '手头暂无图片？一键生成测试黑白户型图体验自动提取'
                    : 'No image handy? Generate a sample B&W floorplan to test'}
                </span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-xl border border-[#E3E3DF] bg-[#F6F6F3] p-2">
              <img
                src={preview.dataUrl}
                alt="Floorplan preview"
                className="max-h-48 mx-auto rounded object-contain"
              />
              <button
                onClick={() => setPreview(null)}
                className="absolute top-3 right-3 px-2 py-1 rounded bg-black/75 text-white text-[11px] cursor-pointer"
              >
                {isZh ? '重新选择' : 'Re-select'}
              </button>
            </div>
          )}

          {/* Calibration & Auto Extraction Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#18191B] mb-1">
                {isZh ? '图片整体横向物理宽度估算 (米)' : 'Estimated Full Image Width (m)'}
              </label>
              <input
                type="number"
                step="0.5"
                min="4"
                max="40"
                value={houseWidthMeters}
                onChange={(e) => setHouseWidthMeters(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono-tech border border-[#D4D4CE] rounded-lg"
              />
              <p className="text-[10px] text-[#EA580C] font-medium mt-1">
                {isZh
                  ? '导入后请务必用左侧「比例尺」拉线精准校准！'
                  : 'Always fine-tune with the "Scale" tool after import!'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#18191B] mb-1">
                {isZh ? '边缘提取灵敏度' : 'Wall Extraction Sensitivity'}
              </label>
              <select
                value={sensitivity}
                onChange={(e) =>
                  setSensitivity(e.target.value as 'strict' | 'balanced' | 'sensitive')
                }
                disabled={!autoExtract}
                className="w-full px-3 py-1.5 text-xs border border-[#D4D4CE] rounded-lg bg-white disabled:opacity-50"
              >
                <option value="strict">
                  {isZh ? '严格（仅提取粗黑承重墙线）' : 'Strict (Thick concrete walls only)'}
                </option>
                <option value="balanced">
                  {isZh ? '均衡（推荐 · 自动过滤尺寸标注线）' : 'Balanced (Recommended · filters dimension lines)'}
                </option>
                <option value="sensitive">
                  {isZh ? '高灵敏（提取浅灰色细隔墙）' : 'Sensitive (Includes thin light-gray walls)'}
                </option>
              </select>
            </div>
          </div>

          {/* Import Scope & Floor Recognition Controls */}
          <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E3E3DF] space-y-2">
            <div className="text-xs font-semibold text-[#18191B]">
              {isZh ? '楼层归属与旧数据清理方式' : 'Floor Assignment & Cleanup'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label
                className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                  importMode === 'new_project'
                    ? 'bg-white border-[#18191B]'
                    : 'border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'new_project'}
                  onChange={() => {
                    setImportMode('new_project');
                    setFloorName('1F');
                    setClearOldPins(true);
                  }}
                  className="mt-0.5 accent-[#18191B]"
                />
                <div>
                  <div className="font-medium text-[#18191B]">
                    {isZh ? '新建独立户型项目' : 'New Standalone Project'}
                  </div>
                  <div className="text-[10px] text-[#686D75]">
                    {isZh
                      ? `清空旧样板间多余楼层（如${totalFloorsCount}层）与旧家具标注`
                      : `Clears old ${totalFloorsCount}-floor preset & stale pins`}
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                  importMode === 'current_floor'
                    ? 'bg-white border-[#18191B]'
                    : 'border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'current_floor'}
                  onChange={() => setImportMode('current_floor')}
                  className="mt-0.5 accent-[#18191B]"
                />
                <div>
                  <div className="font-medium text-[#18191B]">
                    {isZh ? `仅导入到当前楼层 (${floor.name})` : `Replace Current Floor (${floor.name})`}
                  </div>
                  <div className="text-[10px] text-[#686D75]">
                    {isZh ? '保留现有多层结构，适合为 2F/3F 分别传图' : 'Keep multi-floor stack for uploading 2F/3F'}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[#5C6066]">{isZh ? '识别楼层名称：' : 'Floor Label:'}</span>
                <select
                  value={floorName}
                  onChange={(e) => setFloorName(e.target.value)}
                  className="px-2 py-1 rounded border border-[#DCDCD6] bg-white font-mono-tech text-xs"
                >
                  <option value="B1">{isZh ? 'B1 (地下室)' : 'B1 (Basement)'}</option>
                  <option value="1F">{isZh ? '1F (一层/平层)' : '1F (Ground)'}</option>
                  <option value="2F">{isZh ? '2F (二层)' : '2F (2nd Floor)'}</option>
                  <option value="3F">{isZh ? '3F (三层)' : '3F (3rd Floor)'}</option>
                  <option value="4F">{isZh ? '4F (四层/阁楼)' : '4F (Attic)'}</option>
                </select>
              </label>

              {importMode === 'current_floor' && (
                <label className="flex items-center gap-1.5 text-[#5C6066] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearOldPins}
                    onChange={(e) => setClearOldPins(e.target.checked)}
                    className="accent-[#18191B]"
                  />
                  <span>{isZh ? '清空本层旧家具/需求标注' : 'Clear old pins on this floor'}</span>
                </label>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-[#18191B] cursor-pointer">
              <input
                type="checkbox"
                checked={autoExtract}
                onChange={(e) => setAutoExtract(e.target.checked)}
                className="accent-[#18191B] w-4 h-4"
              />
              <span className="font-medium flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5 text-[#EA580C]" />
                {isZh
                  ? '自动提取黑白户型图中的正交墙线草稿（导入后请用「标需求点」点出新房间位置）'
                  : 'Auto-extract wall drafts (after import, mark rooms with "Demand Pin")'}
              </span>
            </label>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-[#F8F8F5] border-t border-[#ECECE7] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#DCDCD6] bg-white text-[#5C6066] cursor-pointer"
          >
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button
            disabled={!preview || processing}
            onClick={handleApply}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#18191B] hover:bg-[#2C2E33] disabled:opacity-40 text-white cursor-pointer"
          >
            {processing
              ? isZh
                ? '正在提取墙线...'
                : 'Extracting walls...'
              : isZh
              ? '导入底图并生成墙体模型'
              : 'Import & Generate Walls'}
          </button>
        </div>
      </div>
    </div>
  );
};
