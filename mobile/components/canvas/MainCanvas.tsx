"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createDynamicLine } from "./dynamicLine";
import { createFloatingTextNetwork, FloatingTextNetworkOptions } from "./FloatingTextNetwork";
import { createPostProcessing } from "./postprocessing";
import { LINE_CONFIG } from "./ThickLineScene";

// ============================================================================
// 🎛️ 故障後處理效果自訂參數（Glitch Post-Processing Configuration）
// ============================================================================
export const GLITCH_CONFIG = {
  /** 1. 是否啟用第 8 拍大變化 Glitch 故障效果（預設 true） */
  enabled: true,

  /** 2. 第 8 拍大變化（Phrase Drop）故障持續時間（秒）：預設 0.16 秒（瞬態信號中斷感） */
  phraseDropDuration: 0.06,

  /** 3. 第 4 拍小節（Bar Beat）是否微幅故障：0 代表關閉，可設 0.05 秒產生單幀微抖動 */
  barBeatDuration: 0,

  /** 4. 是否強制極簡純黑白高對比（消除彩色 RGB 分離雜訊，維持純粹黑白美感）：預設 true */
  monochrome: true,

  // --- 六區塊色相反轉 (Block Invert) 設定 ---
  /** 5. 是否啟用六區塊色相反轉 Shader（黑轉白、白轉黑、深轉淺）：預設 true */
  blockInvertEnabled: true,

  /** 6. 六區塊色相反轉持續時間（秒）：預設 0.2 秒 */
  blockInvertDuration: 0.5,

  /** 7. 每次反轉的隨機區塊數量（1 到 5 塊，預設 3 塊） */
  invertBlockCount: 4,
};

// ============================================================================
// 🎛️ 飄動文字網路自訂參數（階層式音樂節奏脈衝、彈簧阻尼、文字大小等）
// 您可以直接在此修改各項參數，儲存後即可即時熱重載預覽！
// ============================================================================
export const TEXT_NETWORK_CONFIG: FloatingTextNetworkOptions = {
  // --- 階層式節奏與彈簧阻尼參數 ---
  /** 1. 基本打拍間隔（秒 / 拍）：目前設定 0.6 秒（相當於音樂 Bpm 拍點節拍器） */
  beatInterval: 0.6,

  /** 2. 小變化躍遷跨度（Base Beat，每 1 拍位移到鄰近新位置的距離，目前 0.1） */
  smallAmp: 0.01,

  /** 3. 中變化躍遷跨度（Bar Beat，每 4 拍小節群體偏向躍遷到新位置的跨度，目前 0.45） */
  midAmp: 1,

  /** 4. 大變化躍遷跨度（Phrase Drop，每 8 拍大空間重組跨距新位置，目前 1.05） */
  largeAmp: 8.05,

  /** 5. 彈簧阻尼衰減係數（數值越大衰減越快、停頓頓挫感越硬，目前設定 2） */
  damping: 3,

  /** 6. 彈簧張力 / 回彈震盪頻率（數值越大彈簧回彈頻率越高，目前設定 1） */
  springTension: 0.7,

  // --- 文字外觀與分佈 ---
  /** 7. 文字大小比例：數值越大文字 Sprite 越大（預設 0.46） */
  textScale: 0.46,

  /** 8. 文字畫布字級大小（預設 30） */
  fontSize: 45,

  /** 9. 整體分佈半徑 / 空間飄散範圍（預設 1.5） */
  spreadRadius: 2.9,

  /** 10. 連線聚散距離閾值（兩節點小於此距離時相連，預設 2.1） */
  connectDistance: 2,

  /** 11. 節點數量（目前設定 5） */
  nodeCount: 10,

  /** 12. 文字標籤清單 */
  labels: ["無感", "剩餘價值", "每天", "灰色", "DAF"],

  /** 13. 是否在文字下方顯示 index 數與 bits 位元數（預設 true） */
  showBitsInfo: true,

  /** 14. 下方 index 與 bits 小字字級比例（預設 0.42，文字略小） */
  subTextRatio: 0.42,

  /** 15. 線條顏色與文字顏色 */
  lineColor: 0x000000,
  textColor: "#000000",
};

// ============================================================================
// 🎥 相機環繞中心旋轉參數（Camera Orbit Configuration）
// 您可以直接在此調整旋轉速度與距離，儲存後即時生效！
// ============================================================================
export const CAMERA_CONFIG = {
  /** 1. 是否啟用相機對著中心自動環繞旋轉（預設 true） */
  autoRotate: true,

  /** 2. 相機對著中心旋轉的速度：
   *  數值越大旋轉越快（例如 1.0 為標準速度，2.0~3.0 快速旋轉，0.3 緩慢自轉；負值如 -1.0 可反向逆時針旋轉）
   */
  rotateSpeed: 6,

  /** 3. 相機環繞的中心目標點座標 [x, y, z]（預設 [0, 0, 0] 正中心） */
  target: [0, 0, 0] as [number, number, number],

  /** 4. 相機與中心目標點的距離（預設 7.8） */
  distance: 10.8,

  /** 5. 相機初始俯視仰角高度 Y 軸（預設 0.5 帶微幅仰角立體感；設 0 為完全水平正視） */
  elevation: 0.5,
};

export interface MainCanvasProps {
  /** 閉環線條換格間隔時間（秒） */
  stepInterval?: number;
  /** 閉環線條形變跨度速度 */
  morphSpeed?: number;
  /** 閉環線條寬度 */
  lineWidth?: number;
  /** 是否啟用相機對著中心自動旋轉（預設使用 CAMERA_CONFIG.autoRotate） */
  autoRotate?: boolean;
  /** 相機對著中心旋轉的速度（預設使用 CAMERA_CONFIG.rotateSpeed，數值越大轉越快，可設負值反向） */
  rotateSpeed?: number;
  /** 可自訂覆蓋的文字網路設定 */
  textNetworkConfig?: Partial<FloatingTextNetworkOptions>;
}

export default function MainCanvas({
  stepInterval = LINE_CONFIG.stepInterval,
  morphSpeed = LINE_CONFIG.morphSpeed,
  lineWidth = LINE_CONFIG.lineWidth,
  autoRotate = CAMERA_CONFIG.autoRotate,
  rotateSpeed = CAMERA_CONFIG.rotateSpeed,
  textNetworkConfig,
}: MainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene 設定（純白背景）
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // 2. Camera 設定（對準中心目標點）
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const [tx, ty, tz] = CAMERA_CONFIG.target;
    camera.position.set(tx, ty + CAMERA_CONFIG.elevation, tz + CAMERA_CONFIG.distance);
    camera.lookAt(tx, ty, tz);

    // 3. Renderer 設定
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0xffffff, 1);
    container.appendChild(renderer.domElement);

    // 4. OrbitControls 軌道控制（對著中心環繞旋轉，支援手勢拖曳與阻尼）
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(tx, ty, tz);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = rotateSpeed;
    controls.minDistance = 3.5;
    controls.maxDistance = 18.0;

    // 5. 核心視覺圖層 1：中央扭曲變形閉環 Thick Line
    const dynamicLine = createDynamicLine(LINE_CONFIG.segmentCount, lineWidth);
    dynamicLine.material.resolution.set(width, height);
    scene.add(dynamicLine.line);

    // 6. 核心視覺圖層 2：飄動文字節點與動態連線網路 (Floating Text Nodes Network)
    const mergedTextConfig = { ...TEXT_NETWORK_CONFIG, ...textNetworkConfig };
    const floatingNetwork = createFloatingTextNetwork(mergedTextConfig);
    scene.add(floatingNetwork.group);

    // 7. 後處理系統 (EffectComposer + RenderPass + BlockInvertPass + Monochrome GlitchPass)
    const postProcessing = createPostProcessing(
      renderer,
      scene,
      camera,
      width,
      height,
      { monochrome: GLITCH_CONFIG.monochrome }
    );

    // 支援手動或開發測試呼叫 window.__triggerGlitch()
    if (typeof window !== "undefined") {
      (window as unknown as { __triggerGlitch?: () => void }).__triggerGlitch = () => {
        postProcessing.triggerBeatGlitch(0.25);
        postProcessing.triggerBlockInvert(0.35, 3);
      };
    }

    // 8. 響應式 Resize 監聽
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      dynamicLine.material.resolution.set(w, h);

      postProcessing.handleResize(w, h, Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", handleResize);

    // 鍵盤空白鍵 (Space) 可手動即時觸發 Glitch + 色相反轉效果
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        postProcessing.triggerBeatGlitch(GLITCH_CONFIG.phraseDropDuration);
        postProcessing.triggerBlockInvert(
          GLITCH_CONFIG.blockInvertDuration,
          GLITCH_CONFIG.invertBlockCount
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // 9. 主渲染循環 (Render Loop)
    let animationFrameId: number;
    const clock = new THREE.Clock();
    let lastStep = -1;
    let lastBeatIndex = -1;

    // 初始首幀
    dynamicLine.update(0);
    floatingNetwork.update(0);
    controls.update();
    postProcessing.render();

    const animate = () => {
      const deltaTime = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // (A) 相機控制器平滑更新（自轉與阻尼）
      controls.update();

      // (B) 後處理狀態更新
      postProcessing.update(deltaTime);

      // (C) 節拍器同步：當進入第 8 拍大變化 (Phrase Drop) 時觸發瞬態 Glitch
      const beatInterval = mergedTextConfig.beatInterval || 0.6;
      const beatIndex = Math.floor(elapsedTime / beatInterval);
      if (beatIndex !== lastBeatIndex) {
        lastBeatIndex = beatIndex;

        if (beatIndex % 8 === 0) {
          // 第 8 拍大變化爆發：瞬間短暫觸發黑白強烈故障撕裂
          if (GLITCH_CONFIG.enabled) {
            postProcessing.triggerBeatGlitch(GLITCH_CONFIG.phraseDropDuration);
          }
          // 同時觸發畫面六區塊色相反轉（黑轉白、白轉黑、深轉淺）
          if (GLITCH_CONFIG.blockInvertEnabled) {
            postProcessing.triggerBlockInvert(
              GLITCH_CONFIG.blockInvertDuration,
              GLITCH_CONFIG.invertBlockCount
            );
          }
        } else if (
          GLITCH_CONFIG.enabled &&
          GLITCH_CONFIG.barBeatDuration > 0 &&
          beatIndex % 4 === 0
        ) {
          // 第 4 拍可選的微幅單幀抖動
          postProcessing.triggerBeatGlitch(GLITCH_CONFIG.barBeatDuration);
        }
      }

      // (D) 飄動文字網路：每幀平滑計算物理脈衝躍遷
      floatingNetwork.update(elapsedTime);

      // (E) 中央閉環厚線條：依 stepInterval 進行逐格抽格躍遷
      const currentStep = Math.floor(elapsedTime / stepInterval);
      if (currentStep !== lastStep) {
        lastStep = currentStep;
        const stepTime = currentStep * morphSpeed;
        dynamicLine.update(stepTime);
      }

      // (F) 由 EffectComposer 接管主畫面渲染
      postProcessing.render();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 10. 生命週期乾淨卸載
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);

      controls.dispose();
      postProcessing.dispose();

      floatingNetwork.dispose();
      scene.remove(floatingNetwork.group);

      dynamicLine.dispose();
      scene.remove(dynamicLine.line);

      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [stepInterval, morphSpeed, lineWidth, autoRotate, textNetworkConfig]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-white"
    />
  );
}
