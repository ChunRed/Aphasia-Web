"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { createDynamicLine } from "./dynamicLine";

// ============================================================================
// 🎛️ 動態參數設定區（您可以直接在此修改數值，儲存後即時生效）
// ============================================================================
export const LINE_CONFIG = {
  /** 換格間隔時間（秒）：例如 0.2 代表每 0.2 秒換一格（5 fps） */
  stepInterval: 0.05,

  /** 形變與翻轉速度倍率：數值越大每次換格的姿態跨度越劇烈，預設 0.35 */
  morphSpeed: 0.6,

  /** 線條寬度（像素）：預設 2.5 */
  lineWidth: 1,

  /** 閉環採樣點數量：預設 260 */
  segmentCount: 300,
};

interface ThickLineSceneProps {
  /** 逐格切換間隔（秒），預設使用 LINE_CONFIG.stepInterval */
  stepInterval?: number;
  /** 形變與翻轉速度，預設使用 LINE_CONFIG.morphSpeed */
  morphSpeed?: number;
  /** 線條寬度（像素），預設使用 LINE_CONFIG.lineWidth */
  lineWidth?: number;
}

export default function ThickLineScene({
  stepInterval = LINE_CONFIG.stepInterval,
  morphSpeed = LINE_CONFIG.morphSpeed,
  lineWidth = LINE_CONFIG.lineWidth,
}: ThickLineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // 2. Camera setup
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 7.5);

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0xffffff, 1);
    container.appendChild(renderer.domElement);

    // 4. Create dynamic thick line
    const dynamicLine = createDynamicLine(LINE_CONFIG.segmentCount, lineWidth);
    dynamicLine.material.resolution.set(width, height);
    scene.add(dynamicLine.line);

    // 5. Window Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      dynamicLine.material.resolution.set(w, h);
      renderer.render(scene, camera);
    };

    window.addEventListener("resize", handleResize);

    // 6. Stepped Animation Loop (逐格／不連續節奏感)
    let animationFrameId: number;
    const clock = new THREE.Clock();
    let lastStep = -1;

    // 初始渲染一幀
    dynamicLine.update(0);
    renderer.render(scene, camera);

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      const currentStep = Math.floor(elapsedTime / stepInterval);

      // 當跨入新的時間階梯才更新幾何形狀與重繪
      if (currentStep !== lastStep) {
        lastStep = currentStep;
        // 步進時間係數（控制每次抽格躍遷的形變幅度）
        const stepTime = currentStep * morphSpeed;
        dynamicLine.update(stepTime);
        renderer.render(scene, camera);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 7. Cleanup & Unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      dynamicLine.dispose();
      scene.remove(dynamicLine.line);

      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [stepInterval, morphSpeed, lineWidth]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-white"
    />
  );
}
