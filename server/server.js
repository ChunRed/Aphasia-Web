const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
	origins: '*:*',
	pingTimeout: 60000,
	pingInterval: 25000,
});

// 暫存最新的 20 則 submit_text 訊息
const messageLogs = [];
const MAX_LOGS = 20;

// 計算當前真實線上使用者人數（排除 server/monitor 監控頁面，並按 UUID 去重）
const getOnlineUserCount = () => {
	const userUuids = new Set();
	const sockets = io.sockets.sockets;
	if (sockets) {
		Object.values(sockets).forEach((sock) => {
			// 只計算非 monitor 頁面的真實 client，且以 UUID 為準
			if (!sock.isMonitor && sock.userUUID) {
				userUuids.add(sock.userUUID);
			}
		});
	}
	return userUuids.size;
};

// 廣播當前真實線上人數給所有人
const broadcastOnlineCount = () => {
	const count = getOnlineUserCount();
	io.emit('online_count', count);
};

// Socket.IO 連線事件處理
io.on('connection', (socket) => {
	// 判斷是否為 server page (monitor 監控頁面)
	const role = socket.handshake.query.role;
	socket.isMonitor = (role === 'monitor' || role === 'server_page');

	// 取得 client 傳送的 UUID，若無則 fallback 到 socket.id
	const clientUUID = socket.handshake.query.uuid || socket.handshake.query.userId || socket.id;
	socket.userUUID = clientUUID;

	if (socket.isMonitor) {
		console.log(`[Socket.IO] Monitor dashboard connected: ${clientUUID}`);
	} else {
		console.log(`[Socket.IO] Client connected: ${clientUUID}`);
	}

	// 廣播最新人數給所有人
	broadcastOnlineCount();

	// 發送現有人數與最新 20 則日誌給新進入的使用者
	socket.emit('init_data', {
		onlineCount: getOnlineUserCount(),
		logs: messageLogs,
	});

	// 接收來自 client 的符合字數規則文字
	socket.on('submit_text', (data, callback) => {
		const uuid = (data && data.uuid) || socket.userUUID;
		const text = (data && data.text) || (typeof data === 'string' ? data : '');

		console.log({ uuid, text });

		// 存入最新 20 則日誌
		messageLogs.unshift({ uuid, text });
		if (messageLogs.length > MAX_LOGS) {
			messageLogs.pop();
		}

		// 廣播最新訊息給所有連線客戶端（含 server page）
		io.emit('new_text', { uuid, text });
		io.emit('new_message_log', { uuid, text });

		if (typeof callback === 'function') {
			callback({ success: true, message: 'Received' });
		}
	});

	// 相容一般 message 事件
	socket.on('message', (data, callback) => {
		console.log(`[Socket.IO] Message from ${socket.userUUID}:`, data);
		io.emit('message', {
			...data,
			uuid: socket.userUUID,
		});
		if (typeof callback === 'function') {
			callback({ success: true, timestamp: Date.now() });
		}
	});

	socket.on('disconnect', () => {
		if (socket.isMonitor) {
			console.log(`[Socket.IO] Monitor disconnected: ${socket.userUUID}`);
		} else {
			console.log(`[Socket.IO] Client disconnected: ${socket.userUUID}`);
		}
		// 稍微延遲讓 socket 從 io.sockets.sockets 中完全移除後重新計算廣播
		setTimeout(broadcastOnlineCount, 80);
	});
});

// 提供靜態檔案支援
app.use(express.static(path.join(__dirname, 'public')));

// 所有 GET 請求均回傳 page.html
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'page.html'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
	console.log(`Server listening on port ${PORT}`);
});