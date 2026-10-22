// Test Sanitization Function
const { extractFallbackKeywords } = (() => {
  function extractFallbackKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    const rawChunks = text
      .split(/[\s\p{P}\p{S}]+/gu)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (rawChunks.length === 0) return [];

    const isValidSlice = (slice) =>
      typeof slice === 'string' &&
      slice.length >= 1 &&
      slice.length <= 4 &&
      text.includes(slice);

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

    if (totalCleanLen <= 4) {
      const candidates = [];
      for (const { chunk } of chunkInfos) {
        for (let i = 0; i <= chunk.length - 2; i++) {
          const sub = chunk.slice(i, i + 2);
          if (!candidates.includes(sub) && isValidSlice(sub)) {
            candidates.push(sub);
          }
        }
      }
      for (const { chunk } of chunkInfos) {
        for (let i = 0; i < chunk.length; i++) {
          const sub = chunk.slice(i, i + 1);
          if (!candidates.includes(sub) && isValidSlice(sub)) {
            candidates.push(sub);
          }
        }
      }
      const result = [];
      let idx = 0;
      while (result.length < 3 && candidates.length > 0) {
        result.push(candidates[idx % candidates.length]);
        idx++;
      }
      return result;
    }

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

    if (allSlices.length === 0) return [];
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
      if (matchedLen.length > 0) return matchedLen[0].word;
      return uniquePool[0].word;
    };

    const frontWord = pickFromSection(frontCandidates, 2);
    if (frontWord) selected.push(frontWord);

    const midWord = pickFromSection(midCandidates, 2);
    if (midWord) selected.push(midWord);

    const backWord = pickFromSection(backCandidates, 2);
    if (backWord) selected.push(backWord);

    if (selected.length < 3) {
      for (const item of allSlices) {
        if (!selected.includes(item.word)) {
          selected.push(item.word);
          if (selected.length === 3) break;
        }
      }
    }

    let fillIdx = 0;
    while (selected.length < 3 && allSlices.length > 0) {
      selected.push(allSlices[fillIdx % allSlices.length].word);
      fillIdx++;
    }

    return selected.slice(0, 3);
  }

  return { extractFallbackKeywords };
})();

/**
 * 派發前的格式清洗（Sanitization）
 * 1. 檢查陣列中每個詞彙是否真正被 originalText 包含，若無則剔除。
 * 2. 檢查每個詞彙長度，若大於 4 個字一律截斷至前 4 個字。
 * 3. 確保最終輸出的關鍵字數量為 3 個，且全部皆為原文真實子字串。
 */
function sanitizeKeywords(keywords, originalText) {
  if (!originalText || typeof originalText !== 'string') {
    return [];
  }

  const sanitized = [];
  const rawList = Array.isArray(keywords) ? keywords : [];

  for (let kw of rawList) {
    if (typeof kw !== 'string') continue;
    let trimmed = kw.trim();
    if (!trimmed) continue;

    // 長度大於 4 個字一律截斷至前 4 個字
    if (trimmed.length > 4) {
      trimmed = trimmed.slice(0, 4);
    }

    // 檢查是否真正被 originalText 包含，且不含純標點符號
    if (originalText.includes(trimmed) && !sanitized.includes(trimmed)) {
      sanitized.push(trimmed);
    }
  }

  // 若數量不足 3 個，調用本地保底切片演算法補足
  if (sanitized.length < 3) {
    const fallbacks = extractFallbackKeywords(originalText);
    for (const fb of fallbacks) {
      if (!sanitized.includes(fb) && originalText.includes(fb)) {
        sanitized.push(fb);
        if (sanitized.length === 3) break;
      }
    }
    // 極短文本或重複情況下循環補足至 3 個
    let fIdx = 0;
    while (sanitized.length < 3 && fallbacks.length > 0) {
      sanitized.push(fallbacks[fIdx % fallbacks.length]);
      fIdx++;
    }
  }

  return sanitized.slice(0, 3);
}

// 測試案例
const tests = [
  {
    text: "今天在咖啡廳看了一本書，下午去散步，晚上回家煮飯。",
    kw: ["咖啡廳", "超長句子直接被當作關鍵字", "不存在的假詞彙", "下午去散步好開心啊"]
  },
  {
    text: "今天好想睡覺不想上班而且外面在下雨",
    kw: ["紀錄", "片刻", "日常"] // 全是假資料
  },
  {
    text: "痛",
    kw: []
  },
  {
    text: "加油",
    kw: ["加油加油加油"] // > 4 字截斷為 "加油加油"，但原文沒有 "加油加油"
  }
];

tests.forEach((t, i) => {
  const res = sanitizeKeywords(t.kw, t.text);
  console.log(`Test ${i + 1}: Text="${t.text}"`);
  console.log(`Initial kw:`, t.kw);
  console.log(`Sanitized:`, res);
  console.log(`Length: ${res.length}, All in text: ${res.every(k => t.text.includes(k))}`);
  console.log('---');
});
