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

// 2. 引入 System Instruction（社交媒體演算法推薦規則）
const { SYSTEM_INSTRUCTION } = require('./systemInstruction');

// 3. 官方 @google/genai SDK 初始化與確切呼叫配置規格 (geminiConfig)
let ai = null;
if (GEMINI_API_KEY) {
	try {
		ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	} catch (err) {
		console.error('[Gemini] SDK 初始化失敗:', err);
	}
}

const geminiConfig = {
	// 1. 系統提示詞
	systemInstruction: SYSTEM_INSTRUCTION,

	// 2. 結構化 JSON 輸出與 Schema 約束
	responseMimeType: 'application/json',
	responseSchema: {
		type: 'OBJECT',
		properties: {
			keywords: {
				type: 'ARRAY',
				items: {
					type: 'STRING',
				},
				description: '3 to 5 keywords extracted from the diary entry',
				minItems: 3,
				maxItems: 5,
			},
		},
		required: ['keywords'],
	},

	// 3. 模型推論參數控制
	temperature: 0.2, // 低隨機性，確保遵守抽取規則與權重排序

	// 4. 思考預算控制 (Thinking Budget)
	// 將 thinking 調到最低（設為 minimal 1），降低延遲並避免浪費 token
	thinkingConfig: {
		thinkingBudget: 1,
	},

	// 5. 輸出 Token 上限
	// 避免過小導致 JSON 被截斷，建議設 500 ~ 1000 足以容納完整陣列
	maxOutputTokens: 1000,
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

// 輔助函式：呼叫 Gemini API 分析文字（安全解析與型別檢查）
const GEMINI_TIMEOUT_MS = 10000;
async function analyzeWithGemini(text) {
	if (!ai) {
		console.warn('[Gemini] SDK 尚未初始化，使用預設標籤');
		return { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
	}

	try {
		// 加上 Promise.race 進行 10 秒逾時保護
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Gemini API 請求逾時')), GEMINI_TIMEOUT_MS)
		);

		let requestPromise = ai.models.generateContent({
			model: GEMINI_MODEL,
			contents: text,
			config: geminiConfig,
		});

		let response;
		try {
			response = await Promise.race([requestPromise, timeoutPromise]);
		} catch (initialErr) {
			console.warn(`[Gemini] 初次請求失敗 (${initialErr.message})，嘗試降級設定重試...`);
			const altConfig = { ...geminiConfig };
			delete altConfig.thinkingConfig;
			response = await ai.models.generateContent({
				model: GEMINI_MODEL,
				contents: text,
				config: altConfig,
			});
		}

		const rawText = response && response.text ? response.text.trim() : '';

		if (!rawText) {
			console.warn('[Gemini] 回傳內容為空，使用預設標籤');
			return { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
		}

		// 安全解析 JSON
		let parsed;
		try {
			parsed = JSON.parse(rawText);
		} catch (parseErr) {
			console.warn('[Gemini] JSON.parse 失敗:', parseErr.message, 'Raw text:', rawText);
			return { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
		}

		// 型別檢查與清洗：確保為字串陣列且非空
		if (parsed && Array.isArray(parsed.keywords)) {
			const sanitizedKeywords = parsed.keywords
				.filter((k) => typeof k === 'string')
				.map((k) => k.trim())
				.filter(Boolean);

			if (sanitizedKeywords.length > 0) {
				return { keywords: sanitizedKeywords, isFallback: false };
			}
		}

		console.warn('[Gemini] 回傳格式不符合預期 (無有效 keywords 陣列):', parsed);
		return { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
	} catch (err) {
		console.error(`[Gemini] 分析過程發生例外 (${err.message})，觸發 Fallback`);
		return { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
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

// 5.1 待派發給 mobile 展示端的分析成果佇列 (Dispatch Queue)
const dispatchQueue = [];

// 記錄所有連線的 mobile 裝置狀態
// Map<socketId, { socketId: string, deviceId: string, status: 'idle' | 'busy', socket: any }>
const mobileDevices = new Map();

/**
 * 嘗試將佇列中的待展示資料派發給指定的 mobile socket
 */
function tryDispatchToSocket(socketId) {
	const dev = mobileDevices.get(socketId);
	if (!dev || dev.status !== 'idle') return;
	if (dispatchQueue.length > 0) {
		const item = dispatchQueue.shift();
		const payload = {
			id: item.id,
			userId: item.userId,
			originalText: item.originalText,
			keywords: item.keywords,
		};
		dev.status = 'busy';
		dev.socket.emit('DISPATCH_PAYLOAD', payload);
		console.log(`[Dispatcher] 派發訊息給 Mobile ${dev.deviceId} (Msg ID: ${item.id}, 剩餘待派發: ${dispatchQueue.length})`);
	}
}

/**
 * 嘗試將待展示資料派發給任何閒置 (idle) 的 mobile 裝置
 */
function tryDispatchToIdleMobiles() {
	if (dispatchQueue.length === 0) return;
	for (const [sId, dev] of mobileDevices.entries()) {
		if (dev.status === 'idle') {
			const item = dispatchQueue.shift();
			const payload = {
				id: item.id,
				userId: item.userId,
				originalText: item.originalText,
				keywords: item.keywords,
			};
			dev.status = 'busy';
			dev.socket.emit('DISPATCH_PAYLOAD', payload);
			console.log(`[Dispatcher] 派發訊息給 Mobile ${dev.deviceId} (Msg ID: ${item.id}, 剩餘待派發: ${dispatchQueue.length})`);
			if (dispatchQueue.length === 0) break;
		}
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
		dispatchQueueCount: dispatchQueue.length,
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
	let hasError = false;

	try {
		analysisResult = await analyzeWithGemini(currentItem.originalText);
		if (analysisResult.isFallback) {
			hasError = true;
		}
	} catch (err) {
		console.error(`[Queue] 處理項目 ${currentItem.id} 時發生錯誤:`, err);
		analysisResult = { keywords: ['無有效價值', '無有效價值', '無有效價值'], isFallback: true };
		hasError = true;
	}

	if (!hasError && analysisResult && Array.isArray(analysisResult.keywords)) {
		// --- 成功：組裝標準 MessageLog 並存入記憶體 ---
		const processedEntry = {
			id: currentItem.id,
			userId: currentItem.userId,
			originalText: currentItem.originalText,
			keywords: analysisResult.keywords,
			timestamp: Date.now(),
			// 向下相容欄位
			uuid: currentItem.userId,
			text: currentItem.originalText,
			status: 'success',
		};

		console.log(`[Queue] 分析成功: User ${processedEntry.userId} -> [${processedEntry.keywords.join(', ')}]`);

		// 存入記憶體陣列（維護最新 20 則，超過則先進先出 FIFO）
		messageLogs.unshift(processedEntry);
		if (messageLogs.length > MAX_LOGS) {
			messageLogs.pop();
		}

		// 存入待展示派發佇列 (Pull/Handshake Dispatch Queue)
		dispatchQueue.push({
			id: processedEntry.id,
			userId: processedEntry.userId,
			originalText: processedEntry.originalText,
			keywords: processedEntry.keywords,
		});
		console.log(`[Dispatcher] 新增項目至待派發佇列 (ID: ${processedEntry.id}, 佇列長度: ${dispatchQueue.length})`);

		// 立即嘗試派發給目前處於 idle 的 mobile 展示端
		tryDispatchToIdleMobiles();

		// 廣播給所有連線客戶端（展示端、監控面板等）
		io.emit('new_processed_entry', processedEntry);
		io.emit('new_text', processedEntry);
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

	// 支援 Mobile 端的拉取式 (Pull/Handshake) 派工機制
	// 1. Mobile 啟動連線完成，宣告就緒 (DEVICE_READY)
	socket.on('DEVICE_READY', (data) => {
		const deviceId = (data && data.deviceId) || socket.userId || socket.id;
		mobileDevices.set(socket.id, {
			socketId: socket.id,
			deviceId,
			status: 'idle',
			socket,
		});
		console.log(`[Dispatcher] Mobile 宣告就緒 (DEVICE_READY): ${deviceId} (Socket: ${socket.id}, status: idle)`);
		tryDispatchToSocket(socket.id);
	});

	// 2. Mobile 完成一則訊息的視覺動態後，主動發送 DEVICE_IDLE 回報閒置
	socket.on('DEVICE_IDLE', (data) => {
		const deviceId = (data && data.deviceId) || socket.userId || socket.id;
		const dev = mobileDevices.get(socket.id);
		if (dev) {
			dev.status = 'idle';
		} else {
			mobileDevices.set(socket.id, {
				socketId: socket.id,
				deviceId,
				status: 'idle',
				socket,
			});
		}
		console.log(`[Dispatcher] Mobile 回報閒置 (DEVICE_IDLE): ${deviceId} (Socket: ${socket.id})`);
		tryDispatchToSocket(socket.id);
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
		mobileDevices.delete(socket.id);
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
	console.log(`===============================================`);
});