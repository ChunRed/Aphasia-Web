import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { TimelinePhase } from "../timeline/PerformanceTimeline";

export interface DynamicLineInstance {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  /** 原有相容時間更新函式 */
  update: (time: number) => void;
  /** 依據 Timeline 狀態機階段之動態演繹更新函式 */
  updateWithTimeline: (
    phase: TimelinePhase,
    phaseTime: number,
    totalTime: number
  ) => void;
  dispose: () => void;
}

/**
 * 建立並管理 3D 中央閉環厚線條 (dynamicLine)
 * 支援 4 階段狀態機動態演繹：
 * Phase 1 (0–8s)：保持平緩、低噪聲擾動的游動狀態（像平靜呼吸）
 * Phase 2 (8–11s，約 8.5s 爆發點)：噪聲計算頻率瞬間拉高，觸發劇烈的抽格扭曲（Morph Step）跳動
 * Phase 3 & 4 (11–20s)：逐步恢復平穩的中低速機械環繞
 */
export function createDynamicLine(
  segmentCount: number = 260,
  lineWidth: number = 2.5
): DynamicLineInstance {
  const geometry = new LineGeometry();

  const material = new LineMaterial({
    color: 0x111111,
    linewidth: lineWidth,
    worldUnits: false, // linewidth is in screen pixels
    dashed: false,
    alphaToCoverage: true,
  });

  // (segmentCount + 1) 頂點，最後一點閉合回到第一點
  const vertexCount = segmentCount + 1;
  const positions = new Float32Array(vertexCount * 3);

  // 內部抽格紀錄變數
  let lastPhase2Step = -1;
  let phase2StepTime = 0;

  /**
   * 計算特定 theta 角度 [0, 2*PI] 在指定狀態機下的 3D 空間形變
   * 注意：所有 theta 頻率係數皆為整數，保證在 0 與 2*PI 處完美無縫閉合
   */
  const computeVertex = (
    theta: number,
    phase: TimelinePhase,
    phaseTime: number,
    totalTime: number
  ): [number, number, number] => {
    let rMod = 0;
    let zMod = 0;
    let baseRadius = 5.9;
    let twistAngle = 0;
    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;

    if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
      // ======================================================================
      // Phase 1 (0–8s)：沉降平緩游動（平靜呼吸呼吸擴張）
      // ======================================================================
      const breathing = Math.sin(totalTime * 1.3);
      baseRadius = 5.9 + 0.32 * breathing;

      const t = totalTime * 0.75;
      rMod =
        0.28 * Math.sin(2 * theta + 1.2 * t) +
        0.18 * Math.cos(3 * theta - 1.0 * t);

      zMod =
        0.42 * Math.sin(2 * theta + 1.1 * t) +
        0.22 * Math.cos(3 * theta - 0.8 * t);

      twistAngle = 0.12 * Math.sin(2 * theta + 0.6 * t);

      rotX = totalTime * 0.16;
      rotY = totalTime * 0.28;
      rotZ = totalTime * 0.12;
    } else if (phase === TimelinePhase.PHASE_2_RUPTURE) {
      // ======================================================================
      // Phase 2 (8–11s)：斷裂與估價
      // 8.0s ~ 8.5s 微微蓄力，8.5s 爆發點觸發劇烈抽格扭曲（Morph Step）跳動
      // ======================================================================
      const isBurst = totalTime >= 8.5;

      if (!isBurst) {
        // 8.0s ~ 8.5s 蓄勢緊縮
        baseRadius = 5.7;
        const t = totalTime * 1.2;
        rMod =
          0.38 * Math.sin(2 * theta + 2.0 * t) +
          0.28 * Math.cos(3 * theta - 1.8 * t);
        zMod = 0.6 * Math.sin(3 * theta + 2.2 * t);
        twistAngle = 0.25 * Math.sin(2 * theta + 1.5 * t);
        rotX = totalTime * 0.4;
        rotY = totalTime * 0.6;
        rotZ = totalTime * 0.3;
      } else {
        // 8.5s 爆發點：高頻噪聲狂飆 + 劇烈抽格跳動 (Morph Step)
        baseRadius = 6.2;

        // 抽格離散時間
        const stepInterval = 0.045; // 約 22 fps 抽格跳變節奏
        const currentStep = Math.floor(phaseTime / stepInterval);
        if (currentStep !== lastPhase2Step) {
          lastPhase2Step = currentStep;
          phase2StepTime = currentStep * 1.45;
        }
        const t = phase2StepTime;

        // 噪聲計算頻率瞬間拉高，高諧波突波
        rMod =
          0.85 * Math.sin(3 * theta + 5.2 * t) +
          0.72 * Math.cos(5 * theta - 4.8 * t) +
          0.52 * Math.sin(7 * theta + 7.2 * t) +
          0.38 * Math.cos(11 * theta - 9.1 * t);

        zMod =
          1.55 * Math.sin(4 * theta + 6.2 * t) +
          1.05 * Math.cos(6 * theta - 5.5 * t) +
          0.62 * Math.sin(8 * theta + 8.1 * t);

        twistAngle = 0.75 * Math.sin(3 * theta + 4.2 * t);

        // 激烈的多軸翻轉暴走
        rotX = t * 2.4;
        rotY = t * 3.2;
        rotZ = t * 1.8;
      }
    } else if (phase === TimelinePhase.PHASE_3_ERASE) {
      // ======================================================================
      // Phase 3 (11–16s)：倒退抹消與失重
      // 逐步自暴走狀態衰減恢復，轉入平穩的中低速機械環繞
      // ======================================================================
      const progress = Math.min(1.0, Math.max(0.0, phaseTime / 5.0)); // 0 -> 1
      const calmEase = 1.0 - Math.pow(progress, 0.7); // 1 -> 0 衰減曲線

      baseRadius = 5.9 + 0.2 * Math.sin(totalTime * 1.5);

      // 隨著時間由抽格逐漸平滑化為機械旋轉
      const t = 11.0 * 1.45 + totalTime * (0.8 + 0.8 * calmEase);

      const amp = 0.35 + 0.45 * calmEase;
      rMod =
        amp * 0.6 * Math.sin(2 * theta + 2.5 * t) +
        amp * 0.4 * Math.cos(3 * theta - 2.0 * t) +
        amp * 0.25 * calmEase * Math.sin(5 * theta + 3.5 * t);

      zMod =
        amp * 0.9 * Math.sin(3 * theta + 2.4 * t) +
        amp * 0.5 * Math.cos(4 * theta - 2.8 * t);

      twistAngle = (0.2 + 0.4 * calmEase) * Math.sin(2 * theta + 1.8 * t);

      const rotSpeed = 0.5 + 1.2 * calmEase;
      rotX = totalTime * (0.25 * rotSpeed);
      rotY = totalTime * (0.5 * rotSpeed);
      rotZ = totalTime * (0.2 * rotSpeed);
    } else {
      // ======================================================================
      // Phase 4 (16–20s)：殘留與待機
      // 穩定、平穩、規律的中低速機械環繞
      // ======================================================================
      baseRadius = 5.9;
      const t = totalTime * 0.85;

      rMod =
        0.32 * Math.sin(2 * theta + 2.2 * t) +
        0.22 * Math.cos(3 * theta - 1.8 * t);

      zMod =
        0.48 * Math.sin(3 * theta + 2.0 * t) +
        0.3 * Math.cos(4 * theta - 2.2 * t);

      twistAngle = 0.18 * Math.sin(2 * theta + 1.5 * t);

      rotX = totalTime * 0.22;
      rotY = totalTime * 0.45;
      rotZ = totalTime * 0.18;
    }

    const r = baseRadius + rMod;

    // 初始 3D 座標
    let x = r * Math.cos(theta);
    let y = r * Math.sin(theta);
    let z = zMod;

    // 扭轉波變形
    const cosTw = Math.cos(twistAngle);
    const sinTw = Math.sin(twistAngle);
    const xTw = x * cosTw - z * sinTw;
    const zTw = x * sinTw + z * cosTw;
    x = xTw;
    z = zTw;

    // 3 軸旋轉矩陣運算
    // Rotate around X
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;

    // Rotate around Y
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;

    // Rotate around Z
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);
    const xFinal = x2 * cosZ - y1 * sinZ;
    const yFinal = x2 * sinZ + y1 * cosZ;

    return [xFinal, yFinal, z2];
  };

  /**
   * 根據時間軸狀態機更新厚線條幾何頂點
   */
  const updateWithTimeline = (
    phase: TimelinePhase,
    phaseTime: number,
    totalTime: number
  ) => {
    for (let i = 0; i < segmentCount; i++) {
      const theta = (i / segmentCount) * Math.PI * 2;
      const [x, y, z] = computeVertex(theta, phase, phaseTime, totalTime);
      const idx = i * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }

    // 強制閉合：第 segmentCount 頂點絕對等於第 0 頂點
    const lastIdx = segmentCount * 3;
    positions[lastIdx] = positions[0];
    positions[lastIdx + 1] = positions[1];
    positions[lastIdx + 2] = positions[2];

    geometry.setPositions(positions);
  };

  /**
   * 向下相容的純時間更新
   */
  const update = (time: number) => {
    updateWithTimeline(TimelinePhase.PHASE_1_ACCUMULATE, time, time);
  };

  // 初始化首幀
  updateWithTimeline(TimelinePhase.PHASE_1_ACCUMULATE, 0, 0);

  const line = new Line2(geometry, material);
  line.computeLineDistances();

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };

  return {
    line,
    geometry,
    material,
    update,
    updateWithTimeline,
    dispose,
  };
}
