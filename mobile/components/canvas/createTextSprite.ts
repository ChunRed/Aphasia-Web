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
}

/**
 * 透過離屏 HTML Canvas 2D 繪製高解析度文字貼圖，並生成面向相機的 THREE.Sprite
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
  const fontSpec = `${fontWeight} ${scaledFontSize}px ${fontFamily}`;
  ctx.font = fontSpec;

  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(scaledFontSize * 1.3);

  const padX = 14 * dpr;
  const padY = 8 * dpr;

  canvas.width = textWidth + padX * 2;
  canvas.height = textHeight + padY * 2;

  // 重置畫布屬性（resize 會清空 canvas state）
  ctx.font = fontSpec;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;

  // 繪製文字
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

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
  sprite.scale.set(scale * aspect, scale, 1);
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
