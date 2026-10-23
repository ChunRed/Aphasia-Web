"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFloatingTextNetwork, FloatingTextNetworkOptions } from "./FloatingTextNetwork";
import { createPostProcessing, PostProcessingInstance } from "./postprocessing";
import {
  usePerformanceTimeline,
  TimelinePhase,
  TimelineFrameData,
} from "../timeline/PerformanceTimeline";
import { useSocket, getOrCreateDeviceUUID } from "../socket/SocketManager";
import { getSeedPresetForDevice } from "@/config/seedPresets";

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
  labels: [] as string[],
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
  const { deviceUuid } = useSocket();

  // 取得裝置對應的預設種子關鍵字保底
  const seedPreset = getSeedPresetForDevice(
    deviceUuid || (typeof window !== "undefined" ? getOrCreateDeviceUUID() : "")
  );

  // 取得當前有效關鍵字，永遠確保陣列內至少有有效的字串元素
  const rawKeywords = propKeywords || timelinePayload?.keywords;
  const activeKeywords =
    rawKeywords && rawKeywords.length > 0
      ? rawKeywords
      : (seedPreset?.keywords || ["作家", "自豪", "文句", "也許"]);

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

    // 3. Renderer 設定（針對舊款手機平滑降級，避免 high-performance 導致上下文崩潰）
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "default",
        precision: "mediump",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      renderer.setClearColor(0xffffff, 1);
      container.appendChild(renderer.domElement);
    } catch (err) {
      console.warn("[MainCanvas] WebGL context initialization failed on this device:", err);
      // 舊款手機不支援 WebGL 2 時優雅降級為純白畫布，不阻礙 2D 文字與狀態機正常運作
      return;
    }

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
    const mergedTextConfig = {
      ...TEXT_NETWORK_CONFIG,
      fallbackKeywords: seedPreset?.keywords || ["作家", "自豪", "文句", "也許"],
      ...textNetworkConfig,
    };
    const floatingNetwork = createFloatingTextNetwork(mergedTextConfig);
    scene.add(floatingNetwork.group);

    // 6. 後處理系統 (EffectComposer + Monochrome Glitch + BlockInvertPass)
    let postProcessing: PostProcessingInstance | null = null;
    try {
      postProcessing = createPostProcessing(
        renderer,
        scene,
        camera,
        width,
        height,
        { monochrome: GLITCH_CONFIG.monochrome }
      );
    } catch (err) {
      console.warn("[MainCanvas] PostProcessing init failed, falling back to direct render:", err);
      postProcessing = null;
    }

    // 7. 響應式 Resize
    const handleResize = () => {
      try {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

        if (postProcessing) {
          postProcessing.handleResize(w, h, Math.min(window.devicePixelRatio || 1, 1.5));
        }
      } catch (e) {
        console.warn("[MainCanvas] Resize error:", e);
      }
    };

    window.addEventListener("resize", handleResize);

    // 8. 主渲染循環 (Render Loop)
    let animationFrameId: number;
    const clock = new THREE.Clock();

    let hasTriggeredBurstAt12 = false;
    let hasTriggeredGlitchAt18 = false;
    let lastHandledCycle = -1;

    const animate = () => {
      try {
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
          hasTriggeredGlitchAt18 = false;
        }

        // (A) 相機自轉更新
        if (phase === TimelinePhase.PHASE_2_RUPTURE) {
          controls.autoRotateSpeed = rotateSpeed * 1.5;
        } else {
          controls.autoRotateSpeed = rotateSpeed;
        }
        controls.update();

        // (B) 後處理著色器狀態控制（若 postProcessing 可用）
        if (postProcessing) {
          if (phase === TimelinePhase.PHASE_1_ACCUMULATE) {
            hasTriggeredBurstAt12 = false;
            hasTriggeredGlitchAt18 = false;
            postProcessing.blockInvertPass.uniforms["uActive"].value = 0.0;
            const glitchUniforms = postProcessing.glitchPass.uniforms as Record<string, { value: unknown }>;
            if (glitchUniforms["byp"]) {
              glitchUniforms["byp"].value = 1;
            }
          } else if (phase === TimelinePhase.PHASE_2_RUPTURE) {
            if (elapsedTime >= 12.0 && !hasTriggeredBurstAt12) {
              hasTriggeredBurstAt12 = true;
              console.log(`[MainCanvas] Phase 2 (12.0s 第一次閃爍爆發)：觸發 Monochrome Glitch + Block Invert Pass (以 bits 浮現)`);
              postProcessing.triggerBeatGlitch(GLITCH_CONFIG.phraseDropDuration);
              postProcessing.triggerBlockInvert(
                GLITCH_CONFIG.blockInvertDuration,
                GLITCH_CONFIG.invertBlockCount
              );
            }
          } else if (phase === TimelinePhase.PHASE_3_ERASE) {
            if (!hasTriggeredGlitchAt18) {
              hasTriggeredGlitchAt18 = true;
              console.log(`[MainCanvas] Phase 3 (18.0s 第二次閃爍單位突變)：觸發 Monochrome Glitch + Block Invert Pass (bits → g)`);
              postProcessing.triggerBeatGlitch(GLITCH_CONFIG.phraseDropDuration);
              postProcessing.triggerBlockInvert(
                GLITCH_CONFIG.blockInvertDuration,
                GLITCH_CONFIG.invertBlockCount
              );
            }
          } else {
            postProcessing.blockInvertPass.uniforms["uActive"].value = 0.0;
          }

          postProcessing.update(deltaTime);
        }

        // (C) 3D 關鍵字網絡動態更新（傳送連續運行時鐘 runningTime，確保 Phase 4 殘留待機時微弱連線與節點持續自轉漂浮）
        const runningTime = clock.getElapsedTime();
        floatingNetwork.updateWithTimeline(
          runningTime,
          phase,
          phaseTime,
          runningTime,
          activeKeywordsRef.current
        );

        // (D) 渲染輸出：優先使用後處理合成，若裝置不支援則平滑降級為直出
        if (postProcessing) {
          postProcessing.render();
        } else {
          renderer.render(scene, camera);
        }
      } catch (frameErr) {
        console.warn("[MainCanvas] Animate frame error:", frameErr);
        try {
          renderer.render(scene, camera);
        } catch {
          // ignore
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 9. 清理卸載
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      try {
        controls.dispose();
      } catch {}
      try {
        if (postProcessing) {
          postProcessing.dispose();
        }
      } catch {}
      try {
        floatingNetwork.dispose();
        scene.remove(floatingNetwork.group);
      } catch {}
      try {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      } catch {}
    };
  }, [autoRotate, rotateSpeed, textNetworkConfig]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-white"
    />
  );
}
