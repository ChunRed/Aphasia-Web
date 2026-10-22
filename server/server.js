const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const socketIo = require('socket.io');
const { GoogleGenAI } = require('@google/genai');

// 1. 載入環境變數（支援 .env 與 .env.local）
['.env', '.env.local'].forEach((envFile) => {
	const envPath = path.join(__dirname, envFile);
	if (fs.existsSync(envPath)) {
		dotenv.config({ path: envPath });
	}
});

// 解析 Gemini API Key（支援標準 GEMINI_API_KEY 與 process.env.GEMINI_API_KEY 格式）
const rawApiKey =
	process.env.GEMINI_API_KEY ||
	process.env['process.env.GEMINI_API_KEY'] ||
	'';
const GEMINI_API_KEY = rawApiKey.replace(/^['"]|['"]$/g, '').trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

console.log(`[Config] Gemini Model: ${GEMINI_MODEL}`);
if (GEMINI_API_KEY) {
	console.log(`[Config] Gemini API Key loaded (prefix: ${GEMINI_API_KEY.slice(0, 8)}...)`);
} else {
	console.warn('[Config] [WARN] 未偵測到 GEMINI_API_KEY，將啟用 Fallback 模式');
}

// 2. 引入 System Instruction（社交媒體演算法推薦規則）與持久化歸檔模組
const { SYSTEM_INSTRUCTION } = require('./systemInstruction');
const { appendMessageArchive, ARCHIVE_FILE } = require('./archiveLogger');

// 3. 官方 @google/genai SDK 初始化與確切呼叫配置規格 (geminiConfig)
let ai = null;
if (GEMINI_API_KEY) {
	try {
		ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	} catch (err) {
		console.error('[Gemini] SDK 初始化失敗:', err);
	}
}

// 3. 官方 @google/genai SDK 極簡設定（完全對齊 Google AI Studio Playground）
const geminiConfig = {
	systemInstruction: SYSTEM_INSTRUCTION,
	responseMimeType: 'application/json',
	temperature: 0.2,
};

// 輔助函式：生成唯一 ID 與 Fallback UUID
const generateUUID = () => {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
};

const generateMessageId = () => {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
};

/**
 * 敏感詞與髒話過濾正則（確保本地保底抽取時絕不選中不雅詞彙）
 */
/**
 * 敏感詞與髒話過濾正則（確保本地保底抽取時若有其他詞彙可選，優先避開不雅詞彙）
 */
const PROFANITY_REGEX = /幹|操|靠北|靠杯|他媽|三小|白痴|白癡|智障|機掰|雞掰|賤人|混蛋|王八|死八婆|fuck|shit|bitch|asshole|cunt/i;

/**
 * 輔助函式：純演算法本地保底切片（純原文切片，字數 2~4，前中後分佈採樣，絕無外部寫死字詞）
 * @param {string} text 觀眾輸入原文
 * @returns {string[]} 3 個完全來自原文的真實子字串關鍵字
 */
function extractFallbackKeywords(text) {
	if (!text || typeof text !== 'string') {
		return [];
	}

	// 1. 純粹取自原文：去除標點符號與空白，切分出純文字區塊（chunk）
	// 每個 chunk 必定是原文中連續且不含標點空白的真實子字串
	const rawChunks = text
		.split(/[\s\p{P}\p{S}]+/gu)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	if (rawChunks.length === 0) {
		// 若原文全為符號，截取前 1~3 個原文字元循環，絕不補入外部詞彙
		const trimmedText = text.trim();
		if (!trimmedText) return [];
		const fallbackChar = trimmedText.slice(0, 1);
		return [fallbackChar, fallbackChar, fallbackChar];
	}

	// 計算純文字總長度與各 chunk 的 cleanIndex 起訖點
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

	const isValidSlice = (slice) => {
		return (
			typeof slice === 'string' &&
			slice.length >= 1 &&
			slice.length <= 4 &&
			text.includes(slice)
		);
	};

	// --- 超短文本處理：若原文總長度極短（例如 4 個字以內），拆解為單字或雙字作為關鍵字，絕不補入外部詞彙 ---
	if (totalCleanLen <= 4) {
		const candidates = [];
		// 優先取 2 字詞
		for (const { chunk } of chunkInfos) {
			for (let i = 0; i <= chunk.length - 2; i++) {
				const sub = chunk.slice(i, i + 2);
				if (!candidates.includes(sub) && isValidSlice(sub)) {
					candidates.push(sub);
				}
			}
		}
		// 不足時取 1 字詞
		for (const { chunk } of chunkInfos) {
			for (let i = 0; i < chunk.length; i++) {
				const sub = chunk.slice(i, i + 1);
				if (!candidates.includes(sub) && isValidSlice(sub)) {
					candidates.push(sub);
				}
			}
		}

		// 若依然不足 3 個（如原文僅 1~2 字元），從已有候選詞中循環補齊至 3 個，絕不補入外部詞彙
		const result = [];
		let idx = 0;
		while (result.length < 3 && candidates.length > 0) {
			result.push(candidates[idx % candidates.length]);
			idx++;
		}
		return result.slice(0, 3);
	}

	// --- 正常 / 長文本處理：分佈採樣（前段、中段、後段各截取一個 2～3 字的片段，組合成 3 個不重複的詞彙）---
	// 收集所有在 chunk 內部長度為 2~3 字的切片，並記錄其在 cleanText 中的起始位置
	const allSlices = [];
	for (const { chunk, cleanStart } of chunkInfos) {
		for (let len = 2; len <= 3; len++) {
			for (let i = 0; i <= chunk.length - len; i++) {
				const slice = chunk.slice(i, i + len);
				allSlices.push({
					word: slice,
					cleanIndex: cleanStart + i,
					len,
					isProfane: PROFANITY_REGEX.test(slice),
				});
			}
		}
	}

	if (allSlices.length === 0) {
		// 若 chunk 長度均為 1（例如全是單字分隔），取單字
		const singleChars = rawChunks.map((c) => c.slice(0, 1)).filter(isValidSlice);
		const result = [];
		let sIdx = 0;
		while (result.length < 3 && singleChars.length > 0) {
			result.push(singleChars[sIdx % singleChars.length]);
			sIdx++;
		}
		return result.slice(0, 3);
	}

	// 按在純文字中的位置排序
	allSlices.sort((a, b) => a.cleanIndex - b.cleanIndex);

	// 若存在非髒話候選詞，優先使用非髒話切片
	const nonProfanePool = allSlices.filter((s) => !s.isProfane);
	const poolToUse = nonProfanePool.length >= 3 ? nonProfanePool : allSlices;

	const sec1 = totalCleanLen / 3;
	const sec2 = (totalCleanLen * 2) / 3;

	const frontCandidates = poolToUse.filter((s) => s.cleanIndex < sec1);
	const midCandidates = poolToUse.filter((s) => s.cleanIndex >= sec1 && s.cleanIndex < sec2);
	const backCandidates = poolToUse.filter((s) => s.cleanIndex >= sec2);

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

	// 前段、中段、後段各截取一個 2～3 字的片段
	const frontWord = pickFromSection(frontCandidates, 2);
	if (frontWord) selected.push(frontWord);

	const midWord = pickFromSection(midCandidates, 2);
	if (midWord) selected.push(midWord);

	const backWord = pickFromSection(backCandidates, 2);
	if (backWord) selected.push(backWord);

	// 若某段無切片或產生重複，從其餘候選詞補足 3 個不重複詞彙
	if (selected.length < 3) {
		for (const item of poolToUse) {
			if (!selected.includes(item.word)) {
				selected.push(item.word);
				if (selected.length === 3) break;
			}
		}
	}

	// 若依然不足 3 個不重複詞（例如重複字詞多），循環補齊至 3 個
	let fillIdx = 0;
	while (selected.length < 3 && poolToUse.length > 0) {
		selected.push(poolToUse[fillIdx % poolToUse.length].word);
		fillIdx++;
	}

	return selected.slice(0, 3);
}

/**
 * 派發前的格式清洗（Sanitization）
 * 1. 檢查陣列中每個詞彙是否真正被 originalText 包含，若無則剔除。
 * 2. 檢查每個詞彙長度，若大於 4 個字一律截斷至前 4 個字。
 * 3. 確保最終輸出的關鍵字數量為 3 個，且全部皆為原文真實子字串。
 * @param {string[]} rawKeywords 輸入關鍵字陣列
 * @param {string} originalText 觀眾輸入原文
 * @returns {string[]} 清洗後嚴格為 3 個原文子字串的關鍵字陣列
 */
function sanitizeKeywords(rawKeywords, originalText) {
	if (!originalText || typeof originalText !== 'string') {
		return [];
	}

	const sanitized = [];
	const list = Array.isArray(rawKeywords) ? rawKeywords : [];

	for (const item of list) {
		if (typeof item !== 'string') continue;
		let kw = item.trim();
		if (!kw) continue;

		// 移除標點與空白
		kw = kw.replace(/[\s\p{P}\p{S}]+/gu, '');
		if (!kw) continue;

		// 若大於 4 個字一律截斷至前 4 個字
		if (kw.length > 4) {
			kw = kw.slice(0, 4);
		}

		// 檢查是否真正被 originalText 包含且尚未選取
		if (originalText.includes(kw) && !sanitized.includes(kw)) {
			sanitized.push(kw);
		}
	}

	// 若不足 3 個，調用本地保底切片補足至 3 個
	if (sanitized.length < 3) {
		const fallbacks = extractFallbackKeywords(originalText);
		for (const fb of fallbacks) {
			if (!sanitized.includes(fb) && originalText.includes(fb)) {
				sanitized.push(fb);
				if (sanitized.length === 3) break;
			}
		}

		// 極短文本或重複情況下循環補齊
		let fIdx = 0;
		while (sanitized.length < 3 && fallbacks.length > 0) {
			sanitized.push(fallbacks[fIdx % fallbacks.length]);
			fIdx++;
		}
	}

	return sanitized.slice(0, 3);
}

// 輔助函式：呼叫 Gemini API 分析文字（安全極簡呼叫，支援短暫尖峰重試）
const GEMINI_TIMEOUT_MS = 25000;
async function callGeminiSingle(text, config) {
	const timeoutPromise = new Promise((_, reject) =>
		setTimeout(() => reject(new Error('Gemini API 請求逾時')), GEMINI_TIMEOUT_MS)
	);
	const requestPromise = ai.models.generateContent({
		model: GEMINI_MODEL,
		contents: text,
		config,
	});
	return await Promise.race([requestPromise, timeoutPromise]);
}

async function analyzeWithGemini(text) {
	if (!ai) {
		console.warn('[Gemini] 未初始化 SDK，啟用本地保底切片');
		const fallbackKw = extractFallbackKeywords(text);
		return { keywords: sanitizeKeywords(fallbackKw, text), isFallback: true };
	}

	try {
		let response = null;
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				response = await callGeminiSingle(text, geminiConfig);
				break;
			} catch (err) {
				console.error(`[Gemini] 第 ${attempt} 次呼叫失敗. Error Detail:`, err);
				if (attempt < 2) {
					await new Promise((r) => setTimeout(r, 1200));
				}
			}
		}

		let keywords = [];
		const rawText =
			response && typeof response.text === 'function'
				? response.text()
				: response && typeof response.text === 'string'
					? response.text.trim()
					: response && response.text
						? String(response.text).trim()
						: '';

		console.log(`[Gemini] API 回傳 Raw Text:\n${rawText || '(空值或未回傳)'}`);
		if (response && !rawText) {
			try {
				console.log(`[Gemini] Response 詳細結構:`, JSON.stringify(response, null, 2));
			} catch (e) {
				console.log(`[Gemini] Response 物件:`, response);
			}
		}

		if (rawText) {
			try {
				const data = JSON.parse(rawText);
				keywords = Array.isArray(data.keywords)
					? data.keywords
						.filter((k) => typeof k === 'string')
						.map((k) => k.trim())
						.filter(Boolean)
					: [];
			} catch (parseErr) {
				console.error('[Gemini] JSON parse 失敗. Raw Text:', rawText, 'Error Detail:', parseErr);
			}
		}

		// 若解析出的關鍵字為空，自動從原文切 3 個字詞補上，永不拋出錯誤
		if (!keywords || keywords.length === 0) {
			const fallbackKw = extractFallbackKeywords(text);
			const sanitizedKw = sanitizeKeywords(fallbackKw, text);
			console.log(`[Gemini] 未能取得有效關鍵字，啟用本地保底關鍵字: [${sanitizedKw.join(', ')}]`);
			return { keywords: sanitizedKw, isFallback: true };
		}

		const cleanKw = sanitizeKeywords(keywords, text);
		console.log(`[Gemini] 解析成功並完成清洗: [${cleanKw.join(', ')}]`);
		return { keywords: cleanKw, isFallback: false };
	} catch (err) {
		console.error('[Gemini] 分析過程發生例外. Error Detail:', err);
		const fallbackKw = extractFallbackKeywords(text);
		return { keywords: sanitizeKeywords(fallbackKw, text), isFallback: true };
	}
}

// 4. Express 與 Socket.IO 初始化
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
	origins: '*:*',
	pingTimeout: 60000,
	pingInterval: 25000,
});

// 5. 待處理佇列 (Queue) 與 記憶體儲存 (Recent 20 Logs - FIFO)
const pendingQueue = [];
let isQueueProcessing = false;
const THROTTLE_INTERVAL_MS = 5000; // 5 秒頻率限制 (Throttling)

/**
 * 記憶體中儲存的 20 筆記錄 (MessageLog 格式)
 * interface MessageLog {
 *   id: string;          // 該筆訊息的唯一 ID
 *   userId: string;      // 傳送者的 UUID
 *   originalText: string;// 觀眾輸入的完整日記內容 (>= 10 字)
 *   keywords: string[];  // Gemini API 分析出的 3~5 個關鍵字
 *   timestamp: number;   // 建立時間戳記
 * }
 */
const messageLogs = [];
const MAX_LOGS = 20;

// 5.1 展示端多裝置識別與獨佔式輪流派工機制 (Worker Pool / Round-Robin)
/**
 * 訊息佇列 (readyMessageQueue)：Gemini 已分析完成、等待被展示的訊息。
 * 裝置連線池 (devicesMap)：連線中的手機裝置列表。
 *
 * interface ConnectedDevice {
 *   deviceUuid: string;
 *   socketId: string;
 *   status: 'idle' | 'busy';
 *   lastAssignedAt?: number;
 *   socket: any;
 * }
 */
const readyMessageQueue = [];
const devicesMap = new Map(); // Map<string, ConnectedDevice> (key: deviceUuid)
const socketToDeviceUuid = new Map(); // Map<string, string> (key: socketId -> deviceUuid)

/**
 * 取得當前所有 idle 裝置中「最久未接單」的 1 台裝置 (Round-Robin / Least-Recently-Assigned)
 */
function getNextIdleDevice() {
	const idleDevices = [];
	for (const dev of devicesMap.values()) {
		if (dev.status === 'idle') {
			idleDevices.push(dev);
		}
	}
	if (idleDevices.length === 0) return null;

	// 排序規則：
	// 1. 未曾接單者 (lastAssignedAt === 0 或 undefined) 最優先
	// 2. 其餘依照 lastAssignedAt 由小到大（最久未接單的優先接單）
	// 3. 次排序依 deviceUuid 字母數字順序穩定排序（確保 1, 2, 3, 4, 5, 6 循序起步）
	idleDevices.sort((a, b) => {
		const aTime = a.lastAssignedAt || 0;
		const bTime = b.lastAssignedAt || 0;
		if (aTime !== bTime) {
			return aTime - bTime;
		}
		return String(a.deviceUuid).localeCompare(String(b.deviceUuid), undefined, { numeric: true });
	});

	return idleDevices[0];
}

/**
 * 核心獨佔式派發函式 (嚴格精準單發，絕不使用 io.emit 廣播展示內容)
 */
function tryDispatchNext() {
	if (readyMessageQueue.length === 0) return;

	while (readyMessageQueue.length > 0) {
		const targetDevice = getNextIdleDevice();
		if (!targetDevice) {
			// 無任何 idle 裝置可派發，等待裝置回報 DEVICE_IDLE
			break;
		}

		const item = readyMessageQueue.shift();
		const finalKeywords = sanitizeKeywords(item.keywords, item.originalText);
		const payload = {
			id: item.id,
			userId: item.userId,
			originalText: item.originalText,
			keywords: finalKeywords,
		};

		// 標記該裝置為 busy 並更新派發時間戳記
		targetDevice.status = 'busy';
		targetDevice.lastAssignedAt = Date.now();

		// 嚴格獨佔單發，僅發給該裝置的 socketId
		io.to(targetDevice.socketId).emit('DISPATCH_PAYLOAD', payload);

		const busyCount = Array.from(devicesMap.values()).filter((d) => d.status === 'busy').length;
		const totalCount = devicesMap.size;
		console.log(`[Dispatcher] Assigned message to Device [${targetDevice.deviceUuid}] with Keywords [${payload.keywords.join(', ')}] (Busy: ${busyCount}/${totalCount}, Pending Messages: ${readyMessageQueue.length}) [Msg: ${payload.id}]`);
	}
}

// 計算當前真實線上使用者人數（排除 monitor 監控頁面，按 userId / UUID 去重）
const getOnlineUserCount = () => {
	const userUuids = new Set();
	const sockets = io.sockets.sockets;
	if (sockets) {
		Object.values(sockets).forEach((sock) => {
			if (!sock.isMonitor) {
				const uid = sock.userId || sock.userUUID;
				if (uid) {
					userUuids.add(uid);
				}
			}
		});
	}
	return userUuids.size;
};

// 廣播連線人數
const broadcastOnlineCount = () => {
	const count = getOnlineUserCount();
	io.emit('online_count', count);
};

// 廣播佇列狀態
const broadcastQueueStatus = () => {
	io.emit('queue_status', {
		pendingCount: pendingQueue.length,
		isProcessing: isQueueProcessing,
		dispatchQueueCount: readyMessageQueue.length,
	});
};

// 6. 排程佇列處理核心 (遞迴 setTimeout 確保每 5 秒取 1 筆，避免並發壅塞)
async function processQueue() {
	if (isQueueProcessing) return;
	if (pendingQueue.length === 0) {
		broadcastQueueStatus();
		return;
	}

	isQueueProcessing = true;
	const currentItem = pendingQueue.shift();
	broadcastQueueStatus();

	console.log(`[Queue] 取出訊息進行分析 (ID: ${currentItem.id}, User: ${currentItem.userId}, Socket: ${currentItem.socketId}, 剩餘待處理: ${pendingQueue.length})`);

	let analysisResult = null;

	try {
		analysisResult = await analyzeWithGemini(currentItem.originalText);
	} catch (err) {
		console.error(`[Queue] 處理項目 ${currentItem.id} 時發生例外. Error Detail:`, err);
		analysisResult = { keywords: extractFallbackKeywords(currentItem.originalText), isFallback: true };
	}

	const cleanKeywords = sanitizeKeywords(analysisResult?.keywords, currentItem.originalText);

	if (cleanKeywords && cleanKeywords.length > 0) {
		// --- 成功：組裝標準 MessageLog 並存入記憶體 ---
		const processedEntry = {
			id: currentItem.id,
			userId: currentItem.userId,
			originalText: currentItem.originalText,
			keywords: cleanKeywords,
			timestamp: Date.now(),
			// 向下相容欄位
			uuid: currentItem.userId,
			text: currentItem.originalText,
			status: 'success',
		};

		console.log(`[Queue] 分析成功: User ${processedEntry.userId} -> [${processedEntry.keywords.join(', ')}]`);

		// 本地日誌非同步追加寫入（Append-only Log 永久存檔備份，獨立 try/catch，絕不阻塞主流程與派發）
		appendMessageArchive(processedEntry).catch((err) => {
			console.error('[ArchiveLog] 非同步寫入發生未預期錯誤:', err);
		});

		// 存入記憶體陣列（維護最新 20 則，超過則先進先出 FIFO）
		messageLogs.unshift(processedEntry);
		if (messageLogs.length > MAX_LOGS) {
			messageLogs.pop();
		}

		// 存入待展示派發佇列 (readyMessageQueue)
		readyMessageQueue.push({
			id: processedEntry.id,
			userId: processedEntry.userId,
			originalText: processedEntry.originalText,
			keywords: processedEntry.keywords,
		});
		console.log(`[Dispatcher] 新增項目至待派發佇列 (ID: ${processedEntry.id}, 佇列長度: ${readyMessageQueue.length})`);

		// 立即嘗試進行獨佔式派發 (Round-Robin Worker Pool)
		tryDispatchNext();

		// 僅通知監控面板（絕不全域廣播 new_text 給展示端，避免污染其他裝置畫面）
		io.emit('new_processed_entry', processedEntry);
		io.emit('new_message_log', processedEntry);

		// 精準定向通知該傳送者 Socket：DIARY_SUCCESS
		const successPayload = {
			id: processedEntry.id,
			userId: processedEntry.userId,
			originalText: processedEntry.originalText,
			keywords: processedEntry.keywords,
			timestamp: processedEntry.timestamp,
			message: '關鍵字分析完成',
		};

		if (currentItem.socketId) {
			io.to(currentItem.socketId).emit('DIARY_SUCCESS', successPayload);
		}
		if (currentItem.userId) {
			io.to(currentItem.userId).emit('DIARY_SUCCESS', successPayload);
		}
	} else {
		// --- 失敗（API 報錯、逾時或格式錯誤）：精準定向回傳 DIARY_ERROR ---
		console.warn(`[Queue] 分析失敗: User ${currentItem.userId} (ID: ${currentItem.id})，發送 DIARY_ERROR`);

		const errorPayload = {
			id: currentItem.id,
			userId: currentItem.userId,
			message: '分析失敗，請再次輸入',
			code: 'ANALYSIS_FAILED',
			error: 'Gemini API 處理逾時或回傳格式不正確',
		};

		if (currentItem.socketId) {
			io.to(currentItem.socketId).emit('DIARY_ERROR', errorPayload);
		}
		if (currentItem.userId) {
			io.to(currentItem.userId).emit('DIARY_ERROR', errorPayload);
		}
	}

	// 遞迴延遲 5 秒後進行下一筆處理，確保前一次完成後再計算間隔
	setTimeout(() => {
		isQueueProcessing = false;
		broadcastQueueStatus();
		processQueue();
	}, THROTTLE_INTERVAL_MS);
}

// 7. Socket.IO 連線事件處理
io.on('connection', (socket) => {
	const role = socket.handshake.query.role;
	socket.isMonitor = (role === 'monitor' || role === 'server_page');

	// 優先讀取 query.userId，若無則讀取 query.uuid 或 socket.id
	const clientUserId =
		socket.handshake.query.userId ||
		socket.handshake.query.uuid ||
		socket.id;
	socket.userId = clientUserId;
	socket.userUUID = clientUserId; // 保留相容性

	// 讓該 socket 加入以 userId 為名的 room，方便精準定向
	socket.join(clientUserId);

	if (socket.isMonitor) {
		console.log(`[Socket.IO] Monitor dashboard connected: ${clientUserId}`);
	} else {
		console.log(`[Socket.IO] Client connected: ${clientUserId} (Socket ID: ${socket.id})`);
	}

	// 廣播連線人數
	broadcastOnlineCount();

	// 發送現有人數、最新 20 則完整 MessageLog 日誌與當前佇列長度給新進入的使用者
	socket.emit('init_data', {
		onlineCount: getOnlineUserCount(),
		logs: messageLogs,
		queueLength: pendingQueue.length,
		isProcessing: isQueueProcessing,
	});

	// 通用處理函式：接收日記文字並入列
	const handleDiarySubmission = (data, callback) => {
		// 1. 取得 userId：優先取 payload 的 userId / uuid，若無則 fallback 到 socket 綁定值，最外層補上伺服器端自動生成 UUID
		const userId =
			(data && (data.userId || data.uuid)) ||
			socket.userId ||
			socket.userUUID ||
			generateUUID();

		// 2. 取得觀眾輸入的完整日記內容 (>= 10 字)
		const originalText =
			(data && (data.originalText || data.text)) ||
			(typeof data === 'string' ? data : '');

		const entryId = generateMessageId();
		const queueItem = {
			id: entryId,
			userId,
			socketId: socket.id, // 精準記錄傳送者 Socket ID
			originalText,
			receivedAt: Date.now(),
		};

		// 推進待處理佇列
		pendingQueue.push(queueItem);
		console.log(`[Socket.IO] 收到日記文字已入列 (ID: ${entryId}, User: ${userId}, Socket: ${socket.id}, 佇列長度: ${pendingQueue.length})`);

		// 立即確認回傳給 client，表示已成功進入排程佇列 (Client 進入 PENDING)
		if (typeof callback === 'function') {
			callback({
				success: true,
				message: '已加入排程佇列，等待分析處理',
				id: entryId,
				userId,
				queuePosition: pendingQueue.length,
			});
		}

		broadcastQueueStatus();

		// 觸發佇列處理器
		processQueue();
	};

	// 支援 SUBMIT_DIARY 與 submit_text 事件
	socket.on('SUBMIT_DIARY', handleDiarySubmission);
	socket.on('submit_text', handleDiarySubmission);

	// 支援 Mobile 端的獨佔式 (Worker Pool / Round-Robin) 派工機制
	// 1. Mobile 啟動連線完成，宣告就緒 (DEVICE_READY)
	socket.on('DEVICE_READY', (data) => {
		const devUuid =
			(data && (data.deviceUuid || data.deviceId)) ||
			socket.handshake.query.deviceUuid ||
			socket.handshake.query.deviceId ||
			socket.userId ||
			socket.id;

		const existing = devicesMap.get(devUuid);
		const connectedDevice = {
			deviceUuid: devUuid,
			socketId: socket.id,
			status: 'idle',
			lastAssignedAt: existing ? (existing.lastAssignedAt || 0) : 0,
			socket,
		};

		devicesMap.set(devUuid, connectedDevice);
		socketToDeviceUuid.set(socket.id, devUuid);

		const busyCount = Array.from(devicesMap.values()).filter((d) => d.status === 'busy').length;
		const totalCount = devicesMap.size;
		console.log(`[Dispatcher] Device [${devUuid}] connected and READY (Active: ${totalCount}, Busy: ${busyCount}/${totalCount}, Pending Messages: ${readyMessageQueue.length})`);

		tryDispatchNext();
	});

	// 2. Mobile 完成一則訊息的視覺動態後，主動發送 DEVICE_IDLE 回報閒置
	socket.on('DEVICE_IDLE', (data) => {
		const devUuid =
			(data && (data.deviceUuid || data.deviceId)) ||
			socketToDeviceUuid.get(socket.id) ||
			socket.handshake.query.deviceUuid ||
			socket.handshake.query.deviceId ||
			socket.userId ||
			socket.id;

		let dev = devicesMap.get(devUuid);
		if (!dev) {
			dev = {
				deviceUuid: devUuid,
				socketId: socket.id,
				status: 'idle',
				lastAssignedAt: 0,
				socket,
			};
			devicesMap.set(devUuid, dev);
		} else {
			dev.status = 'idle';
			dev.socketId = socket.id;
			dev.socket = socket;
		}
		socketToDeviceUuid.set(socket.id, devUuid);

		const busyCount = Array.from(devicesMap.values()).filter((d) => d.status === 'busy').length;
		const totalCount = devicesMap.size;
		console.log(`[Dispatcher] Device [${devUuid}] reported IDLE (Busy: ${busyCount}/${totalCount}, Pending Messages: ${readyMessageQueue.length})`);

		tryDispatchNext();
	});

	// 相容一般 message 事件
	socket.on('message', (data, callback) => {
		console.log(`[Socket.IO] Message from ${socket.userId}:`, data);
		io.emit('message', {
			...data,
			userId: socket.userId,
			uuid: socket.userId,
		});
		if (typeof callback === 'function') {
			callback({ success: true, timestamp: Date.now() });
		}
	});

	socket.on('disconnect', () => {
		const devUuid = socketToDeviceUuid.get(socket.id);
		if (devUuid) {
			const dev = devicesMap.get(devUuid);
			if (dev && dev.socketId === socket.id) {
				devicesMap.delete(devUuid);
				console.log(`[Dispatcher] Device [${devUuid}] disconnected (Remaining Active: ${devicesMap.size})`);
			}
			socketToDeviceUuid.delete(socket.id);
		}

		if (socket.isMonitor) {
			console.log(`[Socket.IO] Monitor disconnected: ${socket.userId}`);
		} else {
			console.log(`[Socket.IO] Client disconnected: ${socket.userId}`);
		}
		setTimeout(broadcastOnlineCount, 80);
	});
});

// 8. 靜態檔案支援與萬用路由
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'page.html'));
});

// 9. 啟動伺服器
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
	console.log(`===============================================`);
	console.log(`[Server] Aphasia Server running on http://localhost:${PORT}`);
	console.log(`[Config] Gemini Model: ${GEMINI_MODEL}`);
	console.log(`[Queue] Queue Throttling: 1 request / ${THROTTLE_INTERVAL_MS / 1000}s`);
	console.log(`[ArchiveLog] Append-only Log: ${ARCHIVE_FILE}`);
	console.log(`===============================================`);
});