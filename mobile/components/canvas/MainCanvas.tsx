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
  phraseDropDuration: 0.16,

  /** 3. 第 4 拍小節（Bar Beat）是否微幅故障：0 代表關閉，可設 0.05 秒產生單幀微抖動 */
  barBeatDuration: 0,

  /** 4. 是否強制極簡純黑白高對比（消除彩色 RGB 分離雜訊，維持純粹黑白美感）：預設 true */
  monochrome: true,

  // --- 六區塊色相反轉 (Block Invert) 設定 ---
  /** 5. 是否啟用六區塊色相反轉 Shader（黑轉白、白轉黑、深轉淺）：預設 true */
  blockInvertEnabled: true,

  /** 6. 六區塊色相反轉持續時間（秒）：預設 0.2 秒 */
  blockInvertDuration: 0.2,

  /** 7. 每次反轉的隨機區塊數量（1 到 5 塊，預設 3 塊） */
  invertBlockCount: 3,
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
  smallAmp: 0.1,

  /** 3. 中變化躍遷跨度（Bar Beat，每 4 拍小節群體偏向躍遷到新位置的跨度，目前 0.45） */
  midAmp: 0.45,

  /** 4. 大變化躍遷跨度（Phrase Drop，每 8 拍大空間重組跨距新位置，目前 1.05） */
  largeAmp: 1.05,

  /** 5. 彈簧阻尼衰減係數（數值越大衰減越快、停頓頓挫感越硬，目前設定 2） */
  damping: 2,

  /** 6. 彈簧張力 / 回彈震盪頻率（數值越大彈簧回彈頻率越高，目前設定 1） */
  springTension: 1,

  // --- 文字外觀與分佈 ---
  /** 7. 文字大小比例：數值越大文字 Sprite 越大（預設 0.46） */
  textScale: 0.46,

  /** 8. 文字畫布字級大小（預設 30） */
  fontSize: 30,

  /** 9. 整體分佈半徑 / 空間飄散範圍（預設 1.5） */
  spreadRadius: 1.5,

  /** 10. 連線聚散距離閾值（兩節點小於此距離時相連，預設 2.1） */
  connectDistance: 2.1,

  /** 11. 節點數量（目前設定 5） */
  nodeCount: 5,

  /** 12. 文字標籤清單 */
  labels: ["無感", "剩餘價值", "每天", "灰色", "DAF"],

  /** 13. 線條顏色與文字顏色 */
  lineColor: 0x000000,
  textColor: "#000000",
};

export interface MainCanvasProps {
  /** 閉環線條換格間隔時間（秒） */
  stepInterval?: number;
  /** 閉環線條形變跨度速度 */
  morphSpeed?: number;
  /** 閉環線條寬度 */
  lineWidth?: number;
  /** 是否啟用微幅視角自動旋轉 */
  autoRotate?: boolean;
  /** 可自訂覆蓋的文字網路設定 */
  textNetworkConfig?: Partial<FloatingTextNetworkOptions>;
}

export default function MainCanvas({
  stepInterval = LINE_CONFIG.stepInterval,
  morphSpeed = LINE_CONFIG.morphSpeed,
  lineWidth = LINE_CONFIG.lineWidth,
  autoRotate = true,
  textNetworkConfig,
}: MainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene 設定（純白背景）
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // 2. Camera 設定
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 7.8);

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

    // 4. OrbitControls 軌道控制（支援觸控、滑鼠拖曳與平滑自轉）
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.65;
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
