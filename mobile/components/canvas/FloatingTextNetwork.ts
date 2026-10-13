import * as THREE from "three";
import { createTextSprite, calculateStringBits, TextSpriteResult } from "./createTextSprite";

export interface NodeData {
  id: number;
  label: string;
  textIndex: number;       // 該文字在標籤清單中的 index 數 (0, 1, 2, ...)
  bits: number;            // 該文字計算所得之 UTF-8 位元數 (bits)
  basePos: THREE.Vector3;
  currentPos: THREE.Vector3;
  startPos: THREE.Vector3;  // 當前拍起始位置
  targetPos: THREE.Vector3; // 當前拍目標位置
  spriteResult: TextSpriteResult;
}

/**
 * 🎛️ 預設階層式節奏與彈簧阻尼常數（Hierarchical Rhythmic Beats Configuration）
 */
export const RHYTHM_CONFIG = {
  /** 基本拍點頻率（秒 / 拍）：每 0.39 秒為 1 拍 */
  BEAT_INTERVAL: 0.39,

  /** 1. 小變化躍遷跨度（Base Beat，每 1 拍位移到鄰近新位置） */
  SMALL_AMP: 0.16,

  /** 2. 中變化躍遷跨度（Bar Beat，每 4 拍小節群體偏向躍遷新位置） */
  MID_AMP: 0.45,

  /** 3. 大變化躍遷跨度（Phrase Drop，每 8 拍大空間重組跨距新位置） */
  LARGE_AMP: 1.05,

  /** 彈簧阻尼衰減係數（數值越大衰減越快、停頓頓挫越乾脆） */
  DAMPING: 5.0,

  /** 彈簧張力 / 回彈震盪頻率（數值越大回彈抖動頻率越高） */
  SPRING_TENSION: 1.2,
};

export interface FloatingTextNetworkOptions {
  /** 文字大小縮放（預設 0.46） */
  textScale?: number;
  /** 文字畫布字級大小（預設 30） */
  fontSize?: number;
  /** 整體初始空間分佈半徑 / 飄散基準範圍（預設 1.5） */
  spreadRadius?: number;

  /** 是否在文字下方顯示 index 數與 bits 位元數（預設 true） */
  showBitsInfo?: boolean;
  /** 下方 index 與 bits 小字字級縮放比例（預設 0.42） */
  subTextRatio?: number;

  // --- 階層式節奏與彈簧物理參數 ---
  /** 基本打拍間隔（秒 / 拍）：預設 0.39 秒 */
  beatInterval?: number;
  /** 小變化躍遷跨度（每 1 拍）：預設 0.16 */
  smallAmp?: number;
  /** 中變化躍遷跨度（每 4 拍）：預設 0.45 */
  midAmp?: number;
  /** 大變化躍遷跨度（每 8 拍）：預設 1.05 */
  largeAmp?: number;
  /** 彈簧阻尼係數：預設 5.0 */
  damping?: number;
  /** 彈簧張力頻率：預設 1.2 */
  springTension?: number;

  /** 連線聚散距離閾值（預設 2.1） */
  connectDistance?: number;
  /** 節點總數量（預設 5） */
  nodeCount?: number;
  /** 節點標籤字串陣列 */
  labels?: string[];
  /** 線條顏色 */
  lineColor?: number;
  /** 文字顏色 */
  textColor?: string;
}

export interface FloatingTextNetworkInstance {
  group: THREE.Group;
  nodes: NodeData[];
  update: (time: number) => void;
  dispose: () => void;
  updateKeywords: (newKeywords: string[]) => void;
}

/**
 * 快速確定性三維亂數向量生成器（基於 seed）
 */
function getPseudoVector3(seed: number): THREE.Vector3 {
  const s1 = seed * 12.9898 + 78.233;
  const s2 = seed * 39.346 + 11.135;
  const s3 = seed * 73.156 + 54.512;

  const rx = Math.sin(s1) * 43758.5453;
  const ry = Math.sin(s2) * 24634.6345;
  const rz = Math.sin(s3) * 58493.1234;

  const vx = (rx - Math.floor(rx)) * 2 - 1;
  const vy = (ry - Math.floor(ry)) * 2 - 1;
  const vz = (rz - Math.floor(rz)) * 2 - 1;

  const v = new THREE.Vector3(vx, vy, vz);
  if (v.lengthSq() < 0.001) return new THREE.Vector3(0, 1, 0);
  return v.normalize();
}

/**
 * 阻尼彈簧躍遷進度曲線（Damped Spring Step-Hop Progress）
 * p 從 0 到 1：以瞬間初速度快速爆發移向目標，伴隨物理回彈過衝，並在拍尾完全定格於 1.0 (新目標點)
 */
function calculateSpringHopProgress(
  p: number,
  damping: number,
  tension: number
): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  // 指數衰減 x 彈簧振盪
  const decay = Math.exp(-damping * p);
  const oscillation = Math.cos(tension * Math.PI * 2 * p);

  // 結尾遮罩保證拍尾精確抵達 1.0
  const finishEnvelope = 1 - Math.pow(p, 3);
  const progress = 1 - decay * oscillation * finishEnvelope;

  return progress;
}

/**
 * 建立 3D 空間中拍點躍遷至新位置 (Real Relocation on Beats) 的文字節點與同步連線網絡
 */
export function createFloatingTextNetwork(
  options: FloatingTextNetworkOptions = {}
): FloatingTextNetworkInstance {
  const {
    textScale = 0.46,
    fontSize = 30,
    spreadRadius = 1.5,
    showBitsInfo = true,
    subTextRatio = 0.42,
    beatInterval = RHYTHM_CONFIG.BEAT_INTERVAL,
    smallAmp = RHYTHM_CONFIG.SMALL_AMP,
    midAmp = RHYTHM_CONFIG.MID_AMP,
    largeAmp = RHYTHM_CONFIG.LARGE_AMP,
    damping = RHYTHM_CONFIG.DAMPING,
    springTension = RHYTHM_CONFIG.SPRING_TENSION,
    connectDistance = 2.1,
    nodeCount = 5,
    labels = ["無感", "剩餘價值", "每天", "灰色", "DAF"],
    lineColor = 0x000000,
    textColor = "#000000",
  } = options;

  const group = new THREE.Group();
  const nodes: NodeData[] = [];

  // 2. 建立動態連線網路（預先配置足夠容納節點的 BufferGeometry，避免頻繁 reallocation）
  const MAX_PAIRS = 300;
  const linePositions = new Float32Array(MAX_PAIRS * 2 * 3);

  const lineGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(linePositions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  lineGeometry.setAttribute("position", positionAttribute);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  lineSegments.renderOrder = 5;
  group.add(lineSegments);

  // 物理彈簧重組（Drop/Jump）狀態控制
  let isDropping = false;
  let dropProgress = 0;
  const DROP_DURATION = 1.1; // 降臨彈簧時間（秒）
  let lastTime = 0;
  let lastProcessedBeat = -1;

  /**
   * 重新構建文字節點與位元標籤，並觸發物理彈簧重組（Drop/Jump）
   */
  const rebuildNodes = (targetLabels: string[], triggerDrop: boolean = true) => {
    // 清除舊節點 Sprite 與 GPU 貼圖資源
    nodes.forEach((n) => {
      group.remove(n.spriteResult.sprite);
      n.spriteResult.dispose();
    });
    nodes.length = 0;

    const filtered = targetLabels.filter((l) => typeof l === "string" && l.trim().length > 0);
    const effectiveLabels = filtered.length > 0 ? filtered : ["無感", "剩餘價值", "每天", "灰色", "DAF"];
    const count = effectiveLabels.length;

    for (let i = 0; i < count; i++) {
      const textIndex = i;
      const label = effectiveLabels[i];
      const bits = calculateStringBits(label);
      // 依照規格生成 UTF-8 位元數標籤（如 [48 bits]）
      const subText = showBitsInfo ? `[${bits} bits]` : undefined;

      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const r = spreadRadius + Math.sin(i * 1.7) * (spreadRadius * 0.15);
      const x0 = r * Math.sin(phi) * Math.cos(theta);
      const y0 = r * Math.sin(phi) * Math.sin(theta);
      const z0 = r * Math.cos(phi);

      const basePos = new THREE.Vector3(x0, y0, z0);
      const targetPos = basePos.clone();

      let startPos: THREE.Vector3;
      let currentPos: THREE.Vector3;

      if (triggerDrop) {
        // 高空躍遷降臨 + 外圍爆散向量，呈現新關鍵字降臨之視覺張力
        startPos = new THREE.Vector3(
          x0 * 2.3 + Math.sin(i * 3.7) * 1.5,
          y0 + 5.2 + Math.cos(i * 2.1) * 2.2,
          z0 * 2.3 + Math.cos(i * 1.9) * 1.5
        );
        currentPos = startPos.clone();
      } else {
        startPos = basePos.clone();
        currentPos = basePos.clone();
      }

      // 建立文字貼圖 Sprite
      const spriteResult = createTextSprite(label, {
        fontSize,
        color: textColor,
        scale: textScale,
        subText,
        subTextRatio,
      });
      spriteResult.sprite.position.copy(currentPos);
      group.add(spriteResult.sprite);

      nodes.push({
        id: i,
        label,
        textIndex,
        bits,
        basePos,
        currentPos,
        startPos,
        targetPos,
        spriteResult,
      });
    }

    if (triggerDrop) {
      isDropping = true;
      dropProgress = 0;
    }
  };

  // 初始化預設節點（不觸發強制墜落）
  rebuildNodes(labels, false);

  /**
   * 依據節拍階層（每 1 拍小跳、每 4 拍中跳、每 8 拍大跳）計算節點的「下一個真實三維空間座標」
   */
  const computeNextTarget = (node: NodeData, beatIndex: number) => {
    const isPhraseDrop = beatIndex % 8 === 0;
    const isBarBeat = !isPhraseDrop && beatIndex % 4 === 0;
    const barIndex = Math.floor(beatIndex / 4);

    let hopDir: THREE.Vector3;
    let hopDistance: number;

    if (isPhraseDrop) {
      // [大變化 Phrase Drop]：向外大幅度跨域重組跳躍（X, Y, Z 三維立體大幅躍遷）
      const randomSeedDir = getPseudoVector3(node.id * 89.3 + beatIndex * 41.7);
      const tangentialDir = new THREE.Vector3(-node.currentPos.y, node.currentPos.x, node.currentPos.z * 0.7).normalize();
      hopDir = randomSeedDir.multiplyScalar(0.7).addScaledVector(tangentialDir, 0.5).normalize();
      hopDistance = largeAmp;
    } else if (isBarBeat) {
      // [中變化 Bar Beat]：小節群體偏向位移跳躍
      const groupDir = getPseudoVector3(barIndex * 71.3);
      const indivDir = getPseudoVector3(node.id * 37.1 + beatIndex * 19.3);
      hopDir = groupDir.multiplyScalar(0.65).addScaledVector(indivDir, 0.45).normalize();
      hopDistance = midAmp;
    } else {
      // [小變化 Base Beat]：每 1 拍向新目標點清脆位移
      hopDir = getPseudoVector3(node.id * 47.9 + beatIndex * 13.7);
      hopDistance = smallAmp;
    }

    // 計算新目標點：從當前目標點起步，加上帶方向性的位移向量
    const nextPos = node.targetPos.clone().addScaledVector(hopDir, hopDistance);

    // 限制三維分佈空間，使其維持在合理的視覺半徑內
    const minR = spreadRadius * 0.7;
    const maxR = spreadRadius * 1.35;
    const len = nextPos.length();
    if (len < minR) {
      nextPos.setLength(minR);
    } else if (len > maxR) {
      nextPos.setLength(maxR);
    }

    // 賦予柔性歸位張力，避免節點無限隨機遊走偏離中心
    nextPos.lerp(node.basePos, 0.12);

    return nextPos;
  };

  // 3. 節拍器計數器與躍遷更新
  const update = (time: number) => {
    const currentNodeCount = nodes.length;
    if (currentNodeCount === 0) return;

    const dt = lastTime > 0 ? Math.min(0.1, time - lastTime) : 0.016;
    lastTime = time;

    // 若正處於新關鍵字降臨物理彈簧重組階段 (Drop/Jump)
    if (isDropping) {
      dropProgress += dt / DROP_DURATION;
      const springProgress = calculateSpringHopProgress(
        Math.min(1, dropProgress),
        damping * 0.8,
        springTension * 1.2
      );

      for (let i = 0; i < currentNodeCount; i++) {
        const node = nodes[i];
        node.currentPos.lerpVectors(node.startPos, node.targetPos, springProgress);
        node.spriteResult.sprite.position.copy(node.currentPos);
      }

      if (dropProgress >= 1) {
        isDropping = false;
        // 降臨完畢，使 startPos 定格在 targetPos，並同步拍點
        for (let i = 0; i < currentNodeCount; i++) {
          nodes[i].startPos.copy(nodes[i].targetPos);
        }
        const safeInterval = Math.max(0.02, beatInterval);
        lastProcessedBeat = Math.floor(time / safeInterval);
      }
    } else {
      // 正常階層式音樂節拍脈衝
      const safeInterval = Math.max(0.02, beatInterval);
      const beatIndex = Math.floor(time / safeInterval);
      const beatElapsed = time - beatIndex * safeInterval;
      const normalizedBeatTime = Math.min(1, Math.max(0, beatElapsed / safeInterval));

      // 當拍點切換時（進入新的一拍），更新所有節點的起點與新的空間目標位置
      if (beatIndex !== lastProcessedBeat) {
        lastProcessedBeat = beatIndex;

        for (let i = 0; i < currentNodeCount; i++) {
          const node = nodes[i];
          node.startPos.copy(node.targetPos);
          const newTarget = computeNextTarget(node, beatIndex);
          node.targetPos.copy(newTarget);
        }
      }

      // 計算彈簧衝擊與回彈進度
      const springProgress = calculateSpringHopProgress(
        normalizedBeatTime,
        damping,
        springTension
      );

      for (let i = 0; i < currentNodeCount; i++) {
        const node = nodes[i];
        node.currentPos.lerpVectors(node.startPos, node.targetPos, springProgress);
        node.spriteResult.sprite.position.copy(node.currentPos);
      }
    }

    // 3.2 線條頂點 100% 同步更新
    let segmentCount = 0;
    const posAttr = positionAttribute;

    for (let i = 0; i < currentNodeCount; i++) {
      const posA = nodes[i].currentPos;

      for (let j = i + 1; j < currentNodeCount; j++) {
        const posB = nodes[j].currentPos;
        const dist = posA.distanceTo(posB);

        // 實時依據即時新座標連線
        if (dist <= connectDistance && segmentCount < MAX_PAIRS) {
          const vIdx = segmentCount * 2;
          posAttr.setXYZ(vIdx, posA.x, posA.y, posA.z);
          posAttr.setXYZ(vIdx + 1, posB.x, posB.y, posB.z);
          segmentCount++;
        }
      }
    }

    // 確保網絡骨架（在兩兩距離過遠時維持連通度）
    if (segmentCount < currentNodeCount && currentNodeCount > 1) {
      for (let i = 0; i < currentNodeCount; i++) {
        if (segmentCount >= MAX_PAIRS) break;
        const nextIdx = (i + 1) % currentNodeCount;
        const posA = nodes[i].currentPos;
        const posB = nodes[nextIdx].currentPos;

        const vIdx = segmentCount * 2;
        posAttr.setXYZ(vIdx, posA.x, posA.y, posA.z);
        posAttr.setXYZ(vIdx + 1, posB.x, posB.y, posB.z);
        segmentCount++;
      }
    }

    posAttr.needsUpdate = true;
    lineGeometry.setDrawRange(0, segmentCount * 2);
  };

  update(0);

  // 動態更新關鍵字 API：替換 Sprite、重新計算 bits、並觸發彈簧 Drop/Jump 重組
  const updateKeywords = (newKeywords: string[]) => {
    if (!newKeywords || !Array.isArray(newKeywords) || newKeywords.length === 0) return;
    const valid = newKeywords.filter((k) => typeof k === "string" && k.trim().length > 0);
    if (valid.length === 0) return;
    console.log(`[FloatingTextNetwork] 接收新關鍵字: [${valid.join(", ")}]，觸發物理彈簧降臨 (Drop/Jump)`);
    rebuildNodes(valid, true);
  };

  // 4. 清理卸載
  const dispose = () => {
    nodes.forEach((n) => {
      group.remove(n.spriteResult.sprite);
      n.spriteResult.dispose();
    });

    group.remove(lineSegments);
    lineGeometry.dispose();
    lineMaterial.dispose();
  };

  return {
    group,
    nodes,
    update,
    dispose,
    updateKeywords,
  };
}
