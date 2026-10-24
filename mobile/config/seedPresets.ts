/**
 * 開機預設種子資料（Default Presets）
 * 共 6 組，提供 Mobile 裝置開機時依據 deviceId（或連線順序 1~6）各自指派初始 Payload，
 * 徹底消除初次開機連線時的 5 秒空白與 undefined 報錯。
 */

export interface SeedPreset {
  id: string;
  userId: string;
  originalText: string;
  keywords: string[];
}

export const SEED_PRESETS: SeedPreset[] = [
  {
    id: "seed-1",
    userId: "system-seed-1",
    originalText: "對於組織文句這件事我曾經覺得很自豪過，覺得自己也許適合當個作家。",
    keywords: ["作家", "自豪", "文句", "也許"],
  },
  {
    id: "seed-2",
    userId: "system-seed-2",
    originalText: "這是我的第738篇日記，其實每天寫日記就是一種記憶外包，寫下、然後假裝自己記得，其實都是交給電腦。",
    keywords: ["日記", "記憶外包", "電腦", "記得"],
  },
  {
    id: "seed-3",
    userId: "system-seed-3",
    originalText: "其實我也不知的為什麼寫下了這些話，只是好像自己正在失去重要的事物，匆忙的用文字記錄下，趕快撿起掉落的碎片，粗魯的用膠水黏起",
    keywords: ["失去", "記錄", "碎片", "文字"],
  },
  {
    id: "seed-4",
    userId: "system-seed-4",
    originalText: "這些字終將離去、消除。僅存具有價值的部分，而其餘的文字，將只留在你的記憶中，逐漸模糊淡去。",
    keywords: ["記憶", "文字", "價值", "模糊"],
  },
  {
    id: "seed-5",
    userId: "system-seed-5",
    originalText: "那些字只不過是過客，在這個演算法中他們不具任何價值，你注入的情感、無關緊要。",
    keywords: ["演算法", "情感", "價值", "過客"],
  },
  {
    id: "seed-6",
    userId: "system-seed-6",
    originalText: "人工智慧時代，那些漂亮的文字噼哩啪啦的不斷落下、快速堆疊出超乎自己能力的優美字詞。",
    keywords: ["人工智慧", "文字", "能力", "優美"],
  },
  {
    id: "seed-7",
    userId: "system-seed-7",
    originalText: "還好最近沒有惡夢，只有夢到一些莫名其妙的動物，站起來的狗、高速移動的鷸、趴在肩膀上的鴨子",
    keywords: ["惡夢", "動物", "夢到"],
  },
  {
    id: "seed-8",
    userId: "system-seed-8",
    originalText: "外面的雷停不下來，可是一次又一次照亮天空的閃電好像讓人稍微平靜一些。",
    keywords: ["平靜", "閃電", "天空"],
  },
  {
    id: "seed-9",
    userId: "system-seed-9",
    originalText: "好像很久沒有像這樣打點什麼無關緊要的事當作日記，可能是因為隔了六個小時候又會再跟自己見面，好像沒有什麼值得寫下來的",
    keywords: ["日記", "值得", "見面"],
  },
  {
    id: "seed-10",
    userId: "system-seed-10",
    originalText: "成為自己的心中的小天才，是一種偉大的夢想吧。",
    keywords: ["夢想", "偉大", "天才", "心中"],
  },
  {
    id: "seed-11",
    userId: "system-seed-11",
    originalText: "我一直以為失去某個人的消息是因為他現在過得很幸福，一直以為這是一種告訴彼此我很好的默契。",
    keywords: ["幸福", "默契", "失去", "消息"],
  },
  {
    id: "seed-12",
    userId: "system-seed-12",
    originalText: "一年中總有某幾天特別想跟人聊天，想告訴別人自己的事，而其他日子，這些故事都說不出口。",
    keywords: ["聊天", "故事", "日子"],
  },
];

/**
 * 嚴格裝置白名單：僅允許 1、2、3、4、5、6
 */
export const ALLOWED_DEVICE_IDS = ["1", "2", "3", "4", "5", "6"] as const;
export type AllowedDeviceId = typeof ALLOWED_DEVICE_IDS[number];

/**
 * 驗證傳入字串是否為合法的白名單裝置編號 (1~6)
 */
export function isValidDeviceId(id: unknown): id is AllowedDeviceId {
  if (typeof id !== "string") return false;
  return ALLOWED_DEVICE_IDS.includes(id.trim() as AllowedDeviceId);
}

/**
 * 判定是否處於本地開發或測試預覽環境 (localhost, 127.0.0.1, LAN IP, 或 development 模式)
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV === "development";
  }
  const { hostname } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    process.env.NODE_ENV === "development"
  );
}

/**
 * 依據嚴格白名單之 deviceId (僅限 "1" ~ "6") 取得對應組別的預設資料 (Index 0 ~ 5)
 * 若非白名單裝置，一律回傳 null，不進行任何回退
 */
export function getSeedPresetForDevice(deviceId?: string | null): SeedPreset | null {
  if (!deviceId || !isValidDeviceId(deviceId)) {
    return null;
  }

  const num = parseInt(deviceId.trim(), 10);
  return SEED_PRESETS[num - 1] || null;
}
