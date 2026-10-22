// Improved Fallback with clean text sectioning
function extractFallbackKeywords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 1. 拆解為純文字片段（依據標點符號、空白與特殊符號切分）
  // 每個 chunk 必定是原文字串中連續且不含標點空白的子字串
  const rawChunks = text
    .split(/[\s\p{P}\p{S}]+/gu)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawChunks.length === 0) {
    return [];
  }

  // 輔助函式：檢查詞彙長度在 1~4 且為原文真實子字串
  const isValidSlice = (slice) => {
    return (
      typeof slice === 'string' &&
      slice.length >= 1 &&
      slice.length <= 4 &&
      text.includes(slice)
    );
  };

  // 計算純文字總長度與各 chunk 的 cleanIndex 起始點
  let totalCleanLen = 0;
  const chunkInfos = [];
  for (const chunk of rawChunks) {
    chunkInfos.push({
      chunk,
      cleanStart: totalCleanLen,
      cleanEnd: totalCleanLen + chunk.length,
    });
    totalCleanLen += chunk.length;
  }

  // --- 超短文本處理（4 個字以內）---
  if (totalCleanLen <= 4) {
    const candidates = [];
    // 優先切 2 字詞
    for (const { chunk } of chunkInfos) {
      for (let i = 0; i <= chunk.length - 2; i++) {
        const sub = chunk.slice(i, i + 2);
        if (!candidates.includes(sub) && isValidSlice(sub)) {
          candidates.push(sub);
        }
      }
    }
    // 不足時切 1 字詞
    for (const { chunk } of chunkInfos) {
      for (let i = 0; i < chunk.length; i++) {
        const sub = chunk.slice(i, i + 1);
        if (!candidates.includes(sub) && isValidSlice(sub)) {
          candidates.push(sub);
        }
      }
    }

    // 若依然不足 3 個（例如只有 1~2 字元），從已有的候選字中循環複製，絕不補入外部詞彙
    const result = [];
    let idx = 0;
    while (result.length < 3 && candidates.length > 0) {
      result.push(candidates[idx % candidates.length]);
      idx++;
    }
    return result;
  }

  // --- 正常 / 長文本處理：分佈採樣（前段、中段、後段各截取 2~3 字）---
  // 找出所有在 chunk 內部的 2~3 字切片，並標記其在 cleanText 中的起始位置
  const allSlices = [];
  for (const { chunk, cleanStart } of chunkInfos) {
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= chunk.length - len; i++) {
        const slice = chunk.slice(i, i + len);
        allSlices.push({
          word: slice,
          cleanIndex: cleanStart + i,
          len: len,
        });
      }
    }
  }

  if (allSlices.length === 0) {
    return [];
  }

  // 按在 cleanText 中的出現位置排序
  allSlices.sort((a, b) => a.cleanIndex - b.cleanIndex);

  const sec1 = totalCleanLen / 3;
  const sec2 = (totalCleanLen * 2) / 3;

  const frontCandidates = allSlices.filter((s) => s.cleanIndex < sec1);
  const midCandidates = allSlices.filter((s) => s.cleanIndex >= sec1 && s.cleanIndex < sec2);
  const backCandidates = allSlices.filter((s) => s.cleanIndex >= sec2);

  const selected = [];

  const pickFromSection = (pool, preferLen = 2) => {
    const uniquePool = pool.filter((item) => !selected.includes(item.word));
    if (uniquePool.length === 0) return null;

    const matchedLen = uniquePool.filter((item) => item.len === preferLen);
    if (matchedLen.length > 0) {
      return matchedLen[0].word;
    }
    return uniquePool[0].word;
  };

  const frontWord = pickFromSection(frontCandidates, 2);
  if (frontWord) selected.push(frontWord);

  const midWord = pickFromSection(midCandidates, 2);
  if (midWord) selected.push(midWord);

  const backWord = pickFromSection(backCandidates, 2);
  if (backWord) selected.push(backWord);

  // 若某段沒有切片（例如某段剛好被標點符號佔滿或 chunk 過短），從其餘候選詞補足 3 個不重複詞
  if (selected.length < 3) {
    for (const item of allSlices) {
      if (!selected.includes(item.word)) {
        selected.push(item.word);
        if (selected.length === 3) break;
      }
    }
  }

  // 若依然不足 3 個不重複詞（例如重複字詞多），允許循環補齊
  let fillIdx = 0;
  while (selected.length < 3 && allSlices.length > 0) {
    selected.push(allSlices[fillIdx % allSlices.length].word);
    fillIdx++;
  }

  return selected.slice(0, 3);
}

// 測試案例
const testCases = [
  '今天在咖啡廳看了一本書，下午去散步，晚上回家煮飯。',
  '今天好想睡覺不想上班而且外面在下雨',
  '咖啡咖啡咖啡咖啡咖啡好喝',
  '今天好累',
  '我好累',
  '加油',
  '痛',
  '😭今天好難過...真的好想哭！！！💔',
  'Starbucks coffee was so good today, but I am tired',
  '無感剩餘價值每天灰色'
];

testCases.forEach((tc) => {
  const result = extractFallbackKeywords(tc);
  console.log(`Input: "${tc}"`);
  console.log(`Result:`, result);
  const allInOriginal = result.every((k) => tc.includes(k));
  const validLengths = result.every((k) => k.length >= 1 && k.length <= 4);
  console.log(`-> Count: ${result.length}, All in original: ${allInOriginal}, Valid lengths: ${validLengths}`);
  console.log('---');
});
