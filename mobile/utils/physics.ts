/**
 * 展場天平與資訊微觀質量物理常數與計算工具
 * 物理常數：1 bit = 3.19 × 10⁻³⁸ kg = 3.19 × 10⁻³⁵ g
 */

export const BIT_TO_GRAM_CONSTANT = 3.19e-35;

export interface FormattedMass {
  /** 假數（保留兩位小數），例如 "1.22" */
  mantissa: string;
  /** 指數，例如 -32 */
  exponent: number;
  /** Unicode 上標字串，例如 "1.22 × 10⁻³² g" */
  formattedUnicode: string;
  /** 用於 HTML 渲染結構的分離資料 */
  htmlParts: {
    mantissa: string;
    exponent: number;
    unit: string;
  };
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  "-": "⁻",
  "+": "⁺",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/**
 * 將數值轉換為 Unicode 上標字元
 */
export function toSuperscript(num: number | string): string {
  return String(num)
    .split("")
    .map((ch) => SUPERSCRIPT_MAP[ch] || ch)
    .join("");
}

/**
 * 計算字串所佔位元數 (bits)
 * 嚴格遵循規格：
 * - 中文字 (CJK): 24 bits (3 bytes)
 * - ASCII / 標點符號: 8 bits (1 byte)
 */
export function calculateTextBits(text: string): number {
  if (!text || typeof text !== "string") return 0;
  if (typeof TextEncoder !== "undefined") {
    try {
      return new TextEncoder().encode(text).length * 8;
    } catch {
      // fallback to manual loop
    }
  }

  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes * 8;
}

/**
 * 將位元數 (bits) 依物理常數換算為微觀質量 (g)
 * 公式：m = B × 3.19 × 10⁻³⁵ g
 * 保留兩位小數與標準科學記號格式
 *
 * 範例：B = 384 -> m ≈ 1.22 × 10⁻³² g
 * 範例：B = 72  -> m ≈ 2.30 × 10⁻³³ g
 */
export function bitsToMassInGrams(bits: number): FormattedMass {
  if (!bits || isNaN(bits) || bits <= 0) {
    return {
      mantissa: "0.00",
      exponent: 0,
      formattedUnicode: "0.00 g",
      htmlParts: {
        mantissa: "0.00",
        exponent: 0,
        unit: "g",
      },
    };
  }

  const massGrams = bits * BIT_TO_GRAM_CONSTANT;

  // 使用標準科學記號保留兩位小數 (例如 "1.22e-32")
  const expStr = massGrams.toExponential(2);
  const parts = expStr.split("e");
  const mantissa = parts[0] || "0.00";
  const exponent = parseInt(parts[1] || "0", 10);
  const expUnicode = toSuperscript(exponent);

  return {
    mantissa,
    exponent,
    formattedUnicode: `${mantissa} × 10${expUnicode} g`,
    htmlParts: {
      mantissa,
      exponent,
      unit: "g",
    },
  };
}
