import * as THREE from "three";
import { createTextSprite, calculateStringBits, TextSpriteResult } from "./createTextSprite";
import { TimelinePhase } from "../timeline/PerformanceTimeline";

export interface NodeData {
  id: number;
  label: string;
  textIndex: number;
  bits: number;
  basePos: THREE.Vector3;
  currentPos: THREE.Vector3;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  spriteResult: TextSpriteResult;
}

export const RHYTHM_CONFIG = {
  BEAT_INTERVAL: 0.39,
  SMALL_AMP: 0.16,
  MID_AMP: 0.45,
  LARGE_AMP: 1.05,
  DAMPING: 5.0,
  SPRING_TENSION: 1.2,
};

export interface FloatingTextNetworkOptions {
  textScale?: number;
  fontSize?: number;
  spreadRadius?: number;
  showBitsInfo?: boolean;
  subTextRatio?: number;

  beatInterval?: number;
  smallAmp?: number;
  midAmp?: number;
  largeAmp?: number;
  damping?: number;
  springTension?: number;

  connectDistance?: number;
  nodeCount?: number;
  labels?: string[];
  lineColor?: number;
  textColor?: string;
}

export interface FloatingTextNetworkInstance {
  group: THREE.Group;
  nodes: NodeData[];
  update: (time: number) => void;
  updateWithTimeline: (
    time: number,
    phase: TimelinePhase,
    phaseTime: number,
    totalTime: number,
    activeKeywords?: string[]
  ) => void;
  dispose: () => void;
  updateKeywords: (newKeywords: string[]) => void;
}

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

function calculateSpringHopProgress(
  p: number,
  damping: number,
  tension: number
): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  const decay = Math.exp(-damping * p);
  const oscillation = Math.cos(tension * Math.PI * 2 * p);
  const finishEnvelope = 1 - Math.pow(p, 3);
  return 1 - decay * oscillation * finishEnvelope;
}

/**
 * 建立並管理 3D 關鍵字節點與黑色直線網絡 (FloatingTextNetwork)
 * 時間軸 25 秒規範：
 * Phase 1 (0–12s)：完全隱藏，保持純白畫布
 * Phase 2 (12–15s，12.0s 瞬間爆發)：載入 keywords 生成 Sprite 與 [XX bits] 標籤，自螢幕深處猛力拋出 (Spring Drop)，拉出黑色直線網絡
 * Phase 3 (15–21s)：隨 2D 文本倒退抹消，3D 直線連線逐漸稀疏淡出 (0.85 -> 0.0)
 * Phase 4 (21–25s)：連線完全消失，3～5 個關鍵字在純白空間中緩慢漂浮自轉
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
    labels = ["無感", "剩餘價值", "每天", "灰色", "DAF"],
    lineColor = 0x000000,
    textColor = "#000000",
  } = options;

  const group = new THREE.Group();
  group.visible = false;

  const nodes: NodeData[] = [];

  const MAX_PAIRS = 300;
  const linePositions = new Float32Array(MAX_PAIRS * 2 * 3);

  const lineGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(linePositions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  lineGeometry.setAttribute("position", positionAttribute);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });

  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  lineSegments.renderOrder = 5;
  group.add(lineSegments);

  let isDropping = false;
  let dropProgress = 0;
  const DROP_DURATION = 1.2;
  let lastTime = 0;
  let lastProcessedBeat = -1;

  let hasExplodedInPhase2 = false;

  const rebuildNodes = (targetLabels: string[], triggerExplosion: boolean = true) => {
    nodes.forEach((n) => {
      group.remove(n.spriteResult.sprite);
      n.spriteResult.dispose();
    });
    nodes.length = 0;

    const filtered = targetLabels.filter((l) => typeof l === "string" && l.trim().length > 0);
    const effectiveLabels =
      filtered.length > 0 ? filtered : ["無感", "剩餘價值", "每天", "灰色", "DAF"];
    const count = effectiveLabels.length;

    for (let i = 0; i < count; i++) {
      const textIndex = i;
      const label = effectiveLabels[i];
      const bits = calculateStringBits(label);
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

      if (triggerExplosion) {
        // 從螢幕深處猛力拋出 (-Z 軸深處)
        startPos = new THREE.Vector3(
          x0 * 3.5 + Math.sin(i * 2.7) * 2.5,
          y0 * 3.0 + 4.5 * Math.cos(i * 2.1),
          z0 - 25.0 + Math.sin(i * 3.1) * 3.0 // 深處
        );
        currentPos = startPos.clone();
      } else {
        startPos = basePos.clone();
        currentPos = basePos.clone();
      }

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

    if (triggerExplosion) {
      isDropping = true;
      dropProgress = 0;
    }
  };

  rebuildNodes(labels, false);

  const computeNextTarget = (node: NodeData, beatIndex: number) => {
    const isPhraseDrop = beatIndex % 8 === 0;
    const isBarBeat = !isPhraseDrop && beatIndex % 4 === 0;
    const barIndex = Math.floor(beatIndex / 4);

    let hopDir: THREE.Vector3;
    let hopDistance: number;

    if (isPhraseDrop) {
      const randomSeedDir = getPseudoVector3(node.id * 89.3 + beatIndex * 41.7);
      const tangentialDir = new THREE.Vector3(-node.currentPos.y, node.currentPos.x, node.currentPos.z * 0.7).normalize();
      hopDir = randomSeedDir.multiplyScalar(0.7).addScaledVector(tangentialDir, 0.5).normalize();
      hopDistance = largeAmp;
    } else if (isBarBeat) {
      const groupDir = getPseudoVector3(barIndex * 71.3);
      const indivDir = getPseudoVector3(node.id * 37.1 + beatIndex * 19.3);
      hopDir = groupDir.multiplyScalar(0.65).addScaledVector(indivDir, 0.45).normalize();
      hopDistance = midAmp;
    } else {
      hopDir = getPseudoVector3(node.id * 47.9 + beatIndex * 13.7);
      hopDistance = smallAmp;
    }

    const nextPos = node.targetPos.clone().addScaledVector(hopDir, hopDistance);
    const minR = spreadRadius * 0.7;
    const maxR = spreadRadius * 1.35;
    const len = nextPos.length();
    if (len < minR) {
      nextPos.setLength(minR);
    } else if (len > maxR) {
      nextPos.setLength(maxR);
    }

    nextPos.lerp(node.basePos, 0.12);
    return nextPos;
  };

  const updateWithTimeline = (
    time: number,
    phase: TimelinePhase,
    phaseTime: number,
    totalTime: number,
    activeKeywords?: string[]
  ) => {
    const dt = lastTime > 0 ? Math.min(0.1, time - lastTime) : 0.016;
    lastTime = time;

    // ========================================================================
    // Phase 1 (0.0s – 12.0s)：沉澱凝視 -> 純白底，完全隱藏 3D 網絡與連線
    // ========================================================================
    if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
      group.visible = false;
      lineMaterial.opacity = 0.0;
      hasExplodedInPhase2 = false;
      return;
    }

    // ========================================================================
    // Phase 2 (12.0s – 15.0s)：演算法斷裂與關鍵字爆發
    // 12.0s 瞬間爆發：彈簧物理阻尼 (Spring Drop) 從螢幕深處猛力拋出，拉出黑色直線網絡
    // ========================================================================
    if (phase === TimelinePhase.PHASE_2_RUPTURE) {
      if (!hasExplodedInPhase2) {
        hasExplodedInPhase2 = true;
        console.log(
          `[FloatingTextNetwork] Phase 2 (12.0s 瞬間爆發)：彈射進場！關鍵字: [${(
            activeKeywords || labels
          ).join(", ")}]`
        );
        rebuildNodes(activeKeywords && activeKeywords.length > 0 ? activeKeywords : labels, true);
        group.visible = true;
        lineMaterial.opacity = 0.85;
      }
    }

    // ========================================================================
    // Phase 3 (15.0s – 21.0s，長度 6 秒)：倒退抹消與失重
    // 3D 網絡在背景環繞，隨著 2D 文字被刪除，3D 直線連線逐漸稀疏淡出 (0.85 -> 0.0)
    // ========================================================================
    if (phase === TimelinePhase.PHASE_3_ERASE) {
      group.visible = true;
      const eraseProgress = Math.min(1.0, Math.max(0.0, phaseTime / 6.0)); // 0 -> 1 (6秒)
      lineMaterial.opacity = Math.max(0.0, 0.85 * (1.0 - eraseProgress));
    }

    // ========================================================================
    // Phase 4 (21.0s – 25.0s，長度 4 秒)：殘留與懸空
    // 連線完全消失，3～5 個關鍵字在純白空間中緩慢漂浮自轉
    // ========================================================================
    if (phase === TimelinePhase.PHASE_4_RESIDUAL) {
      group.visible = true;
      lineMaterial.opacity = 0.0;
    }

    const currentNodeCount = nodes.length;
    if (currentNodeCount === 0) return;

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
        for (let i = 0; i < currentNodeCount; i++) {
          nodes[i].startPos.copy(nodes[i].targetPos);
        }
        const safeInterval = Math.max(0.02, beatInterval);
        lastProcessedBeat = Math.floor(time / safeInterval);
      }
    } else if (phase === TimelinePhase.PHASE_4_RESIDUAL) {
      // Phase 4 緩慢漂浮自轉懸空
      for (let i = 0; i < currentNodeCount; i++) {
        const node = nodes[i];
        const driftAngle = totalTime * 0.28 + i * ((Math.PI * 2) / currentNodeCount);
        const radius = spreadRadius * (0.95 + 0.08 * Math.sin(totalTime * 0.4 + i));
        node.currentPos.set(
          radius * Math.cos(driftAngle),
          node.basePos.y + 0.15 * Math.sin(totalTime * 0.6 + i * 1.5),
          radius * Math.sin(driftAngle)
        );
        node.spriteResult.sprite.position.copy(node.currentPos);
      }
    } else {
      // Phase 2 / Phase 3 常規節拍躍遷更新
      const safeInterval = Math.max(0.02, beatInterval);
      const beatIndex = Math.floor(time / safeInterval);
      const beatElapsed = time - beatIndex * safeInterval;
      const normalizedBeatTime = Math.min(1, Math.max(0, beatElapsed / safeInterval));

      if (beatIndex !== lastProcessedBeat) {
        lastProcessedBeat = beatIndex;
        for (let i = 0; i < currentNodeCount; i++) {
          const node = nodes[i];
          node.startPos.copy(node.targetPos);
          const newTarget = computeNextTarget(node, beatIndex);
          node.targetPos.copy(newTarget);
        }
      }

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

    // 連線幾何頂點更新（若 opacity > 0）
    if (lineMaterial.opacity > 0.005) {
      let segmentCount = 0;
      const posAttr = positionAttribute;

      // 隨著連線淡出，可動態調整連線距離門檻使網絡連線更顯稀疏
      const effectiveDistance =
        phase === TimelinePhase.PHASE_3_ERASE
          ? connectDistance * (0.6 + 0.4 * (1.0 - phaseTime / 6.0))
          : connectDistance;

      for (let i = 0; i < currentNodeCount; i++) {
        const posA = nodes[i].currentPos;

        for (let j = i + 1; j < currentNodeCount; j++) {
          const posB = nodes[j].currentPos;
          const dist = posA.distanceTo(posB);

          if (dist <= effectiveDistance && segmentCount < MAX_PAIRS) {
            const vIdx = segmentCount * 2;
            posAttr.setXYZ(vIdx, posA.x, posA.y, posA.z);
            posAttr.setXYZ(vIdx + 1, posB.x, posB.y, posB.z);
            segmentCount++;
          }
        }
      }

      // 基礎連通骨架
      if (segmentCount < currentNodeCount && currentNodeCount > 1 && lineMaterial.opacity > 0.2) {
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
    } else {
      lineGeometry.setDrawRange(0, 0);
    }
  };

  const update = (time: number) => {
    updateWithTimeline(time, TimelinePhase.PHASE_2_RUPTURE, 1.0, 13.0);
  };

  const updateKeywords = (newKeywords: string[]) => {
    if (!newKeywords || !Array.isArray(newKeywords) || newKeywords.length === 0) return;
    const valid = newKeywords.filter((k) => typeof k === "string" && k.trim().length > 0);
    if (valid.length === 0) return;
    rebuildNodes(valid, true);
  };

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
    updateWithTimeline,
    dispose,
    updateKeywords,
  };
}
