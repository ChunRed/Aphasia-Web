import * as THREE from "three";

export interface TextSpriteResult {
  sprite: THREE.Sprite;
  texture: THREE.Texture;
  material: THREE.SpriteMaterial;
  dispose: () => void;
}

export interface CreateTextSpriteOptions {
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  scale?: number;
  /** 下方副標籤文字，例如 "[0] 48 bits" */
  subText?: string;
  /** 下方副標籤字級比例（相對於主文字，預設 0.46） */
  subTextRatio?: number;
  /** 下方副標籤文字顏色（預設與 color 相同） */
  subTextColor?: string;
}

/**
 * 計算字串在 UTF-8 編碼下的實際位元數（bits）
 * 每個 byte = 8 bits
 * 例如："無感" (6 bytes) = 48 bits, "剩餘價值" (12 bytes) = 96 bits, "DAF" (3 bytes) = 24 bits
 */
export function calculateStringBits(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length * 8;
  }
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes * 8;
}

/**
 * 透過離屏 HTML Canvas 2D 繪製高解析度文字貼圖（支援主標題與下方 index / bits 小字），
 * 並生成面向相機的 THREE.Sprite
 */
export function createTextSprite(
  text: string,
  options: CreateTextSpriteOptions = {}
): TextSpriteResult {
  const {
    fontSize = 20,
    color = "#000000",
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontWeight = 400,
    scale = 0.16,
    subText,
    subTextRatio = 0.46,
    subTextColor,
  } = options;

  if (typeof document === "undefined") {
    // 伺服器端環境防呆，回傳空物件以避免 SSR 錯誤
    const dummyMat = new THREE.SpriteMaterial();
    const dummySprite = new THREE.Sprite(dummyMat);
    return {
      sprite: dummySprite,
      texture: new THREE.Texture(),
      material: dummyMat,
      dispose: () => {},
    };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create 2D context for text sprite");
  }

  // 支援 2x 超取樣（Retina 銳利度）
  const dpr = 2;
  const scaledFontSize = fontSize * dpr;
  const subFontSize = Math.round(scaledFontSize * subTextRatio);

  const mainFontSpec = `${fontWeight} ${scaledFontSize}px ${fontFamily}`;
  const subFontSpec = `400 ${subFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

  ctx.font = mainFontSpec;
  const mainMetrics = ctx.measureText(text);
  const mainWidth = Math.ceil(mainMetrics.width);
  const mainHeight = Math.ceil(scaledFontSize * 1.25);

  let subWidth = 0;
  let subHeight = 0;
  if (subText) {
    ctx.font = subFontSpec;
    const subMetrics = ctx.measureText(subText);
    subWidth = Math.ceil(subMetrics.width);
    subHeight = Math.ceil(subFontSize * 1.2);
  }

  const gap = subText ? Math.round(5 * dpr) : 0;
  const contentWidth = Math.max(mainWidth, subWidth);
  const contentHeight = subText ? mainHeight + gap + subHeight : mainHeight;

  const padX = 14 * dpr;
  const padY = 8 * dpr;

  canvas.width = contentWidth + padX * 2;
  canvas.height = contentHeight + padY * 2;

  // 重置畫布屬性（改變 canvas width/height 會重置 context）
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (subText) {
    // 兩行排版：主文字在上方，副文字在下方
    const mainY = padY + mainHeight / 2;
    const subY = padY + mainHeight + gap + subHeight / 2;

    ctx.font = mainFontSpec;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, mainY);

    ctx.font = subFontSpec;
    ctx.fillStyle = subTextColor || color;
    ctx.fillText(subText, canvas.width / 2, subY);
  } else {
    // 單行排版
    ctx.font = mainFontSpec;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;

  // 保持主字體在 3D 空間中的基準縮放比例
  const baseSingleHeight = scaledFontSize * 1.3 + 16 * dpr;
  const heightMultiplier = subText ? canvas.height / baseSingleHeight : 1.0;
  const spriteHeight = scale * heightMultiplier;

  sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
  sprite.renderOrder = 10;

  const dispose = () => {
    texture.dispose();
    material.dispose();
  };

  return {
    sprite,
    texture,
    material,
    dispose,
  };
}

