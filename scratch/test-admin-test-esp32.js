const http = require('http');
const express = require('c:/Users/user/myself/DAF/web/Aphasia-Web/server/node_modules/express');
const socketIo = require('c:/Users/user/myself/DAF/web/Aphasia-Web/server/node_modules/socket.io');
const socketIoClient = require('c:/Users/user/myself/DAF/web/Aphasia-Web/mobile/node_modules/socket.io-client');

console.log('--- 測試 ADMIN_TEST_ESP32 事件廣播邏輯 ---');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 掛載 server.js 中的相同邏輯
io.on('connection', (socket) => {
  socket.on('ADMIN_TEST_ESP32', (data) => {
    if (!data) return;
    const deviceId = Number(data.deviceId);
    const motorValue = Number(data.motorValue);

    if (isNaN(deviceId) || deviceId < 1 || deviceId > 6) {
      console.warn(`[Admin Test] 拒絕無效的裝置編號: ${data.deviceId}`);
      return;
    }
    if (isNaN(motorValue) || motorValue < 0 || motorValue > 255) {
      console.warn(`[Admin Test] 拒絕無效的馬達行程數值: ${data.motorValue}`);
      return;
    }

    io.emit('esp32-event', [Number(data.deviceId), Number(data.motorValue)]);
    console.log(`[Admin Test] Manual broadcast esp32-event -> Device: ${data.deviceId}, Value: ${data.motorValue}`);
  });
});

server.listen(9099, async () => {
  console.log('[Test Server] 測試伺服器已在 port 9099 啟動');

  const client = socketIoClient('http://localhost:9099', {
    transports: ['websocket'],
  });

  client.on('connect', () => {
    console.log('[Client] 已連線至測試伺服器');

    // 監聽是否收到轉發的 esp32-event
    client.on('esp32-event', (data) => {
      console.log(`[Client] 收到 esp32-event:`, data);
      if (Array.isArray(data) && data[0] === 3 && data[1] === 210) {
        console.log('✅ 驗證成功！收到正確的目標裝置 [3] 與馬達行程值 [210]');
        client.disconnect();
        server.close(() => {
          process.exit(0);
        });
      } else {
        console.error('❌ 驗證失敗：收到非預期資料', data);
        process.exit(1);
      }
    });

    // 觸發 ADMIN_TEST_ESP32 事件
    console.log('[Client] 發送 ADMIN_TEST_ESP32 (Device: 3, MotorValue: 210)...');
    client.emit('ADMIN_TEST_ESP32', {
      deviceId: 3,
      motorValue: 210,
    });
  });
});
