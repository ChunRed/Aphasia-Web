"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFloatingTextNetwork, FloatingTextNetworkOptions } from "./FloatingTextNetwork";
import { createPostProcessing } from "./postprocessing";
import {
  usePerformanceTimeline,
  TimelinePhase,
  TimelineFrameData,
} from "../timeline/PerformanceTimeline";

// ============================================================================
// 🎛️ 故障後處理效果自訂參數（Glitch Post-Processing Configuration）
// ============================================================================
export const GLITCH_CONFIG = {
  enabled: true,
  phraseDropDuration: 0.3,
  monochrome: true,
  blockInvertEnabled: true,
  blockInvertDuration: 0.3,
  invertBlockCount: 3,
};

// ============================================================================
// 🎛️ 飄動文字網絡自訂參數（純粹黑白關鍵字節點 + 幾何直線網絡）
// ============================================================================
export const TEXT_NETWORK_CONFIG: FloatingTextNetworkOptions = {
  beatInterval: 0.6,
  smallAmp: 0.01,
  midAmp: 1,
  largeAmp: 8.05,
  damping: 3,
  springTension: 0.7,
  textScale: 0.46,
  fontSize: 45,
  spreadRadius: 2.9,
  connectDistance: 2.2,
  nodeCount: 5,
  labels: ["無感", "剩餘價值", "每天", "灰色", "DAF"],
  showBitsInfo: true,
  subTextRatio: 0.42,
  lineColor: 0x000000,
  textColor: "#000000",
};

// ============================================================================
// 🎥 相機環繞中心旋轉參數（Camera Orbit Configuration）
// ============================================================================
export const CAMERA_CONFIG = {
  autoRotate: true,
  rotateSpeed: 4.0,
  target: [0, 0, 0] as [number, number, number],
  distance: 10.8,
  elevation: 0.5,
};

export interface MainCanvasProps {
  autoRotate?: boolean;
  rotateSpeed?: number;
  textNetworkConfig?: Partial<FloatingTextNetworkOptions>;
  keywords?: string[];
}

export default function MainCanvas({
  autoRotate = CAMERA_CONFIG.autoRotate,
  rotateSpeed = CAMERA_CONFIG.rotateSpeed,
  textNetworkConfig,
  keywords: propKeywords,
}: MainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { subscribeFrame, payload: timelinePayload } = usePerformanceTimeline();

  // 取得當前有效關鍵字
  const activeKeywords = propKeywords || timelinePayload?.keywords || [];

  const latestFrameDataRef = useRef<TimelineFrameData | null>(null);
  const activeKeywordsRef = useRef<string[]>(activeKeywords);
  activeKeywordsRef.current = activeKeywords;

  // 訂閱時間軸 60fps 高頻訊號
  useEffect(() => {
    const unsubscribe = subscribeFrame((data) => {
      latestFrameDataRef.current = data;
    });
    return unsubscribe;
  }, [subscribeFrame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene 設定（純白背景，保持純粹極簡）
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // 2. Camera 設定
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

    // 4. OrbitControls 軌道控制
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(tx, ty, tz);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = rotateSpeed;
    controls.minDistance = 3.5;
    controls.maxDistance = 18.0;

    // 5. 核心 3D 視覺圖層：關鍵字節點與直線連線網絡 (FloatingTextNetwork)
    // （已徹底移除 DynamicLine 動態厚線，保留純粹黑白空間）
    const mergedTextConfig = { ...TEXT_NETWORK_CONFIG, ...textNetworkConfig };
    const floatingNetwork = createFloatingTextNetwork(mergedTextConfig);
    scene.add(floatingNetwork.group);

    // 6. 後處理系統 (EffectComposer + Monochrome Glitch + BlockInvertPass)
    const postProcessing = createPostProcessing(
      renderer,
      scene,
      camera,
      width,
      height,
      { monochrome: GLITCH_CONFIG.monochrome }
    );

    // 7. 響應式 Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      postProcessing.handleResize(w, h, Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", handleResize);

    // 8. 主渲染循環 (Render Loop)
    let animationFrameId: number;
    const clock = new THREE.Clock();

    let hasTriggeredBurstAt12 = false;
    let lastHandledCycle = -1;

    const animate = () => {
      const deltaTime = clock.getDelta();
      const currentFrame = latestFrameDataRef.current;

      const phase = currentFrame?.phase || TimelinePhase.PHASE_1_ACCUMULATE;
      const elapsedTime = currentFrame?.elapsedTime || 0.0;
      const phaseTime = currentFrame?.phaseTime || 0.0;
      const cycleIndex = currentFrame?.cycleIndex || 0;

      // 新循環或搶佔重置標記
      if (cycleIndex !== lastHandledCycle) {
        lastHandledCycle = cycleIndex;
        hasTriggeredBurstAt12 = false;
      }

      // (A) 相機自轉更新
      if (phase === TimelinePhase.PHASE_2_RUPTURE) {
        controls.autoRotateSpeed = rotateSpeed * 1.5;
      } else {
        controls.autoRotateSpeed = rotateSpeed;
      }
      controls.update();

      // (B) 後處理著色器狀態控制
      // Phase 1 (0.0s – 12.0s)：純白畫布，全部關閉（Pass disabled）
      // Phase 2 (12.0s 瞬間爆發)：啟用 Monochrome Glitch Pass 撕裂約 0.3 秒，伴隨 Block Invert Pass 瞬間閃爍
      // Phase 3 & Phase 4：關閉反轉，保持乾淨平靜
      if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
        hasTriggeredBurstAt12 = false;
        postProcessing.blockInvertPass.uniforms["uActive"].value = 0.0;
        const glitchUniforms = postProcessing.glitchPass.uniforms as Record<string, { value: unknown }>;
        if (glitchUniforms["byp"]) {
          glitchUniforms["byp"].value = 1;
        }
      } else if (phase === TimelinePhase.PHASE_2_RUPTURE) {
        if (elapsedTime >= 12.0 && !hasTriggeredBurstAt12) {
          hasTriggeredBurstAt12 = true;
          console.log(`[MainCanvas] Phase 2 (12.0s 瞬間爆發)：觸發 Monochrome Glitch + Block Invert Pass`);
          postProcessing.triggerBeatGlitch(GLITCH_CONFIG.phraseDropDuration);
          postProcessing.triggerBlockInvert(
            GLITCH_CONFIG.blockInvertDuration,
            GLITCH_CONFIG.invertBlockCount
          );
        }
      } else {
        // Phase 3 & 4
        postProcessing.blockInvertPass.uniforms["uActive"].value = 0.0;
      }

      postProcessing.update(deltaTime);

      // (C) 3D 關鍵字網絡動態更新
      // Phase 1：完全隱藏，保持純白畫布
      // Phase 2 (12.0s)：彈簧阻尼自深處炸出至前景，拉出幾何直線網絡
      // Phase 3 (15.0s – 21.0s)：隨 2D 文本倒退刪除，連線逐漸淡出稀疏
      // Phase 4 (21.0s – 25.0s)：連線完全消失，關鍵字緩慢漂浮自轉
      floatingNetwork.updateWithTimeline(
        elapsedTime,
        phase,
        phaseTime,
        elapsedTime,
        activeKeywordsRef.current
      );

      // (D) 後處理合成渲染
      postProcessing.render();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 9. 清理卸載
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      controls.dispose();
      postProcessing.dispose();

      floatingNetwork.dispose();
      scene.remove(floatingNetwork.group);

      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [autoRotate, rotateSpeed, textNetworkConfig]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-white"
    />
  );
}
