import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GlitchPass } from "three/addons/postprocessing/GlitchPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface PostProcessingOptions {
  /** 是否強制黑白高對比（無彩色色相分離，確保極簡灰階氛圍） */
  monochrome?: boolean;
}

export interface PostProcessingInstance {
  composer: EffectComposer;
  renderPass: RenderPass;
  glitchPass: GlitchPass;
  blockInvertPass: ShaderPass;
  triggerBeatGlitch: (duration?: number) => void;
  triggerBlockInvert: (duration?: number, blockCount?: number) => void;
  update: (deltaTime: number) => void;
  render: () => void;
  handleResize: (width: number, height: number, pixelRatio?: number) => void;
  dispose: () => void;
}

/**
 * 畫面六分區塊色相反轉著色器 (6-Block Invert Shader)
 * 將畫面切割為 6 塊（直向 2 欄 x 3 列，橫向 3 欄 x 2 列），
 * 隨機將選定區塊進行負片色相反轉：黑(0)轉白(1)、白(1)轉黑(0)、深灰轉淺灰。
 */
export const BlockInvertShader = {
  name: "BlockInvertShader",
  uniforms: {
    tDiffuse: { value: null },
    uActive: { value: 0.0 }, // 0.0 = 繞過, 1.0 = 啟用
    uInvertMask: { value: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0] }, // 長度 6 的陣列，各區塊是否反轉 (0 或 1)
    uColumns: { value: 2.0 },
    uRows: { value: 3.0 },
    uIntensity: { value: 1.0 }, // 反轉強度 0.0 ~ 1.0
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uActive;
    uniform float uInvertMask[6];
    uniform float uColumns;
    uniform float uRows;
    uniform float uIntensity;

    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      if (uActive > 0.01) {
        // 幾何六分區塊索引計算 (row * uColumns + col)
        float col = clamp(floor(vUv.x * uColumns), 0.0, uColumns - 1.0);
        float row = clamp(floor((1.0 - vUv.y) * uRows), 0.0, uRows - 1.0);
        int blockIdx = int(row * uColumns + col);

        float shouldInvert = 0.0;
        if (blockIdx == 0) shouldInvert = uInvertMask[0];
        else if (blockIdx == 1) shouldInvert = uInvertMask[1];
        else if (blockIdx == 2) shouldInvert = uInvertMask[2];
        else if (blockIdx == 3) shouldInvert = uInvertMask[3];
        else if (blockIdx == 4) shouldInvert = uInvertMask[4];
        else if (blockIdx == 5) shouldInvert = uInvertMask[5];

        if (shouldInvert > 0.5) {
          // 色相反轉：黑(0)轉白(1)、白(1)轉黑(0)、深灰(0.2)轉淺灰(0.8)
          vec3 inverted = vec3(1.0) - color.rgb;
          color.rgb = mix(color.rgb, inverted, uIntensity);
        }
      }

      gl_FragColor = color;
    }
  `,
};

/**
 * 黑白極簡風格 DigitalGlitch 片段著色器
 * 將原本彩色 RGB Split 轉換為乾淨純粹的高對比黑白灰階切片與雜訊
 */
const MonochromeDigitalGlitchShader = `
  uniform int byp;
  uniform sampler2D tDiffuse;
  uniform sampler2D tDisp;

  uniform float amount;
  uniform float angle;
  uniform float seed;
  uniform float seed_x;
  uniform float seed_y;
  uniform float distortion_x;
  uniform float distortion_y;
  uniform float col_s;

  varying vec2 vUv;

  float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  void main() {
    if (byp < 1) {
      vec2 p = vUv;
      float xs = floor(gl_FragCoord.x / 0.5);
      float ys = floor(gl_FragCoord.y / 0.5);
      float disp = texture2D(tDisp, p * seed * seed).r;

      // 畫面水平與垂直撕裂區塊判定
      if (p.y < distortion_x + col_s && p.y > distortion_x - col_s * seed) {
        if (seed_x > 0.) {
          p.y = 1. - (p.y + distortion_y);
        } else {
          p.y = distortion_y;
        }
      }
      if (p.x < distortion_y + col_s && p.x > distortion_y - col_s * seed) {
        if (seed_y > 0.) {
          p.x = distortion_x;
        } else {
          p.x = 1. - (p.x + distortion_x);
        }
      }
      p.x += disp * seed_x * (seed / 5.);
      p.y += disp * seed_y * (seed / 5.);

      // 取樣多重偏移
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec4 cr = texture2D(tDiffuse, p + offset);
      vec4 cga = texture2D(tDiffuse, p);
      vec4 cb = texture2D(tDiffuse, p - offset);

      // 轉換為極簡純黑白 / 高對比灰階，徹底消除紅綠色差
      float grayR = dot(cr.rgb, vec3(0.299, 0.587, 0.114));
      float grayG = dot(cga.rgb, vec3(0.299, 0.587, 0.114));
      float grayB = dot(cb.rgb, vec3(0.299, 0.587, 0.114));

      // 灰階交織
      float finalGray = (grayR * 0.4 + grayG * 0.4 + grayB * 0.2);

      // 黑白雪花噪點
      float snow = 100. * amount * (rand(vec2(xs * seed, ys * seed * 50.)) * 0.15);
      finalGray = clamp(finalGray + snow, 0.0, 1.0);

      gl_FragColor = vec4(vec3(finalGray), cga.a);
    } else {
      gl_FragColor = texture2D(tDiffuse, vUv);
    }
  }
`;

/**
 * 建立並初始化 Three.js Post-Processing (EffectComposer + RenderPass + GlitchPass + BlockInvertPass)
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  options: PostProcessingOptions = {}
): PostProcessingInstance {
  const { monochrome = true } = options;

  // 1. 初始化 EffectComposer
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 2. 通道 1：常規 3D 場景渲染 RenderPass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 3. 通道 2：Glitch 撕裂切片通道 GlitchPass
  const glitchPass = new GlitchPass();
  glitchPass.goWild = false;

  const uniforms = glitchPass.uniforms as Record<string, { value: unknown }>;

  // 平常預設繞過 (bypass = 1)，確保畫面平時乾淨俐落無雜訊
  if (uniforms["byp"]) {
    uniforms["byp"].value = 1;
  }

  // 若啟用黑白模式，替換為極簡高對比黑白著色器
  if (monochrome && glitchPass.material) {
    glitchPass.material.fragmentShader = MonochromeDigitalGlitchShader;
    glitchPass.material.needsUpdate = true;
  }

  composer.addPass(glitchPass);

  // 4. 通道 3：六區塊色相反轉通道 BlockInvertPass (放置在最上層以達成清晰幾何刀割黑白反轉)
  const blockInvertPass = new ShaderPass(BlockInvertShader);
  blockInvertPass.uniforms["uColumns"].value = width > height ? 3.0 : 2.0;
  blockInvertPass.uniforms["uRows"].value = width > height ? 2.0 : 3.0;
  blockInvertPass.uniforms["uActive"].value = 0.0;
  composer.addPass(blockInvertPass);

  // 5. 動態計時控制
  let glitchTimer = 0;
  let invertTimer = 0;

  /**
   * 觸發瞬態強烈 Glitch
   */
  const triggerBeatGlitch = (duration: number = 0.16) => {
    glitchTimer = duration;
    glitchPass.goWild = true;
    if (uniforms["byp"]) {
      uniforms["byp"].value = 0;
    }
  };

  /**
   * 觸發六分區塊色相反轉（隨機將畫面 2~4 個幾何區塊黑白負片反轉）
   */
  const triggerBlockInvert = (duration: number = 0.25, blockCount: number = 3) => {
    invertTimer = duration;

    // 隨機抽選 2 到 4 個區塊反轉
    const mask = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const count = Math.min(5, Math.max(1, blockCount));
    const indices = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      mask[indices[i]] = 1.0;
    }

    blockInvertPass.uniforms["uInvertMask"].value = mask;
    blockInvertPass.uniforms["uActive"].value = 1.0;
  };

  /**
   * 每幀更新後處理狀態計時
   */
  const update = (deltaTime: number) => {
    // (A) Glitch 故障計時
    if (glitchTimer > 0) {
      glitchTimer -= deltaTime;
      if (glitchTimer <= 0) {
        glitchPass.goWild = false;
        if (uniforms["byp"]) {
          uniforms["byp"].value = 1;
        }
      }
    }

    // (B) 六分區塊色相反轉計時
    if (invertTimer > 0) {
      invertTimer -= deltaTime;
      if (invertTimer <= 0) {
        blockInvertPass.uniforms["uActive"].value = 0.0;
        blockInvertPass.uniforms["uInvertMask"].value = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      }
    }
  };

  /**
   * 執行合成渲染
   */
  const render = () => {
    composer.render();
  };

  /**
   * 視窗 Resize 處理
   */
  const handleResize = (w: number, h: number, pixelRatio: number = 2) => {
    composer.setSize(w, h);
    composer.setPixelRatio(pixelRatio);

    // 根據長寬比決定切成 2 欄 x 3 列 還是 3 欄 x 2 列
    blockInvertPass.uniforms["uColumns"].value = w > h ? 3.0 : 2.0;
    blockInvertPass.uniforms["uRows"].value = w > h ? 2.0 : 3.0;
  };

  /**
   * 資源清理
   */
  const dispose = () => {
    glitchPass.dispose();
    blockInvertPass.dispose();
    renderPass.dispose();
  };

  return {
    composer,
    renderPass,
    glitchPass,
    blockInvertPass,
    triggerBeatGlitch,
    triggerBlockInvert,
    update,
    render,
    handleResize,
    dispose,
  };
}
