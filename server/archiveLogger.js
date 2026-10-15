const fs = require('fs');
const path = require('path');

// 儲存路徑：Server 專案根目錄下 data/ 資料夾
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ARCHIVE_FILE =
	process.env.ARCHIVE_LOG_PATH ||
	path.join(DATA_DIR, 'messages_archive.jsonl');

/**
 * 確保 data/ 目錄存在，若不存在則自動建立 (recursive: true)
 */
async function ensureDataDir() {
	try {
		await fs.promises.mkdir(DATA_DIR, { recursive: true });
	} catch (err) {
		console.error('[ArchiveLog] 建立 data 目錄失敗:', err);
	}
}

/**
 * 將分析完成的訊息以 Append-only 方式非同步追加寫入本地 NDJSON 歸檔檔案
 *
 * 格式定義：每一行都是一筆獨立完整的 JSON 字串，以換行符 \n 結尾
 * {"id":"...","userId":"...","originalText":"...","keywords":["...","..."],"timestamp":1729000000000}
 *
 * @param {Object} entry 訊息資料物件
 * @param {string} entry.id 該筆訊息唯一 ID
 * @param {string} [entry.userId] 傳送者 UUID
 * @param {string} [entry.originalText] 觀眾輸入的完整日記內容
 * @param {string[]} [entry.keywords] Gemini 分析出的關鍵字陣列
 * @param {number} [entry.timestamp] 建立時間戳記
 * @returns {Promise<boolean>} 寫入是否成功（內部獨立攔截例外，不中斷主流程）
 */
async function appendMessageArchive(entry) {
	if (!entry) return false;

	try {
		await ensureDataDir();

		// 組裝標準歸檔結構
		const record = {
			id: String(entry.id || ''),
			userId: String(entry.userId || entry.uuid || ''),
			originalText: String(entry.originalText || entry.text || ''),
			keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
			timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
		};

		// 轉為單行 JSON 字串並以 \n 結尾 (NDJSON 規範)
		const line = JSON.stringify(record) + '\n';

		// 原生非同步非阻塞追加寫入
		await fs.promises.appendFile(ARCHIVE_FILE, line, 'utf8');
		console.log(`[ArchiveLog] 訊息已成功追加至持久化日誌 (ID: ${record.id})`);
		return true;
	} catch (err) {
		// 獨立錯誤容錯：僅記錄 error log，絕對不拋出異常以避免中斷主程式
		console.error('[ArchiveLog] 本地日誌追加寫入失敗 (Non-blocking):', err);
		return false;
	}
}

// 伺服器啟動時預先確保 data 資料夾存在
ensureDataDir().catch((err) => {
	console.error('[ArchiveLog] 初始化資料夾時發生未預期異常:', err);
});

module.exports = {
	DATA_DIR,
	ARCHIVE_FILE,
	ensureDataDir,
	appendMessageArchive,
};
