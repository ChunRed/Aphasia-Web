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

// Socket.IO 連線事件處理
io.on('connection', (socket) => {
	console.log(`[Socket.IO] Client connected: ${socket.id}`);

	// 接收來自 client 的符合字數規則文字
	socket.on('submit_text', (data, callback) => {
		console.log(`[Socket.IO] Received text from ${socket.id}:`, data);

		// 廣播給所有連線客戶端
		io.emit('new_text', data);

		if (typeof callback === 'function') {
			callback({ success: true, message: 'Text received by server', timestamp: Date.now() });
		}
	});

	// 相容一般 message 事件
	socket.on('message', (data, callback) => {
		console.log(`[Socket.IO] Message from ${socket.id}:`, data);
		io.emit('message', data);
		if (typeof callback === 'function') {
			callback({ success: true, timestamp: Date.now() });
		}
	});

	socket.on('disconnect', () => {
		console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
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