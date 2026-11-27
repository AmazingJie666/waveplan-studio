# WavePlan Studio · 筑波

**Pre-Renovation Whole-Home Wi-Fi RF Simulator & Structured Cabling Planner**  
**装修前全屋 WiFi 信号仿真与弱电布线规划工具**

---

## 核心特性 / Key Features

1. **修正版 3D 跨层物理衰减引擎 (Modified 3D COST-231)**
   - 支持 5 种真实装修结构衰减建模：钢筋混凝土承重墙、实心砖墙、轻钢龙骨石膏板/木门、双层中空玻璃移门、金属防盗门/电梯井/冰箱。
   - 纳入**斜穿墙等效厚度修正**、**86 墙面面板 AP 定向辐射方向图**、**无线 Mesh 回程损耗惩罚**，以及**复式挑空区/楼梯井跨层楼板穿透豁免**。
2. **双模式智能最优布点求解器 (60ms Web Worker)**
   - **按需推荐组网方案**：自动测算对比「单台旗舰路由 / 有线回程 Mesh / 全屋 AC+PoE 隐形组网」的综合得分、需求达标率、六类网线米数与参考预算。
   - **指定设备求最优位**：自由设定设备组合，通过贪心初始化 + 模拟退火（Simulated Annealing）避开厨卫湿区与挑空悬空区，求解全局最高分坐标。
3. **2D 建筑蓝图 ↔ 3D 多层爆炸轴测透视**
   - 2D 蓝图支持 60fps 实时拖拽刷新热力、Marching Squares 等值线（`-58 / -67 / -75 dBm`）、正交磁吸画墙、比例尺拉线校准、悬停速率探针及直通弱电箱的 Cat6 走线估算。
   - 3D 模式（Three.js）支持多层悬浮爆炸间距调节、楼板挑空真开洞以及跨层 PoE 垂直穿管拓扑。
4. **纯前端户型底图墙体提取 & 《水电施工交底单》**
   - 零后端、零 API 成本，支持上传开发商黑白户型图本地自动提取墙体草稿。
   - 一键生成可打印 PDF 的《水电施工交底单》，内嵌**分楼层编号平面索引图**、**房间相对位置与工地卷尺定位**、86 暗盒规范及造价测算依据。
5. **中英双语 & 自适应暗黑/明亮模式**
   - 支持 `中文 / English` 一键切换，默认 `Auto` 跟随系统暗黑/明亮主题（也可手动切换），自动保存草稿并支持 `.waveplan.json` 方案导入导出与 `Ctrl/Cmd + Z` 撤销。

---

## 本地开发 / Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

---

## Co-Creators / 共创者

- **Ajie** ([@AmazingJie666](https://github.com/AmazingJie666)) — Product Vision, Architecture & Requirements
- **Antigravity** — Co-Creator & Engineering Implementation
