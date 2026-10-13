const socketIoClient = require('c:/Users/user/myself/DAF/web/Aphasia-Web/mobile/node_modules/socket.io-client');

const SERVER_URL = 'http://localhost:8080';

async function testWorkerPool() {
  console.log('[Test] Starting 6-Device Worker Pool / Round-Robin Test (Devices: 1 ~ 6)...');

  const devices = [];
  const receivedByDevice = {
    '1': [],
    '2': [],
    '3': [],
    '4': [],
    '5': [],
    '6': [],
  };

  // 1. 連線 6 台獨立手機裝置 (模擬 URL ?deviceId=1 ~ ?deviceId=6)
  for (let i = 1; i <= 6; i++) {
    const devId = String(i);
    const sock = socketIoClient(SERVER_URL, {
      query: {
        deviceUuid: devId,
        deviceId: devId,
        role: 'mobile',
      },
      transports: ['websocket', 'polling'],
    });

    sock.on('DISPATCH_PAYLOAD', (payload) => {
      console.log(`[Test Client] Device [${devId}] received DISPATCH_PAYLOAD: [${payload.id}] -> Text: "${payload.originalText}"`);
      receivedByDevice[devId].push(payload);
    });

    devices.push({ devId, sock });
  }

  // 2. 連線 Input Client
  const inputSocket = socketIoClient(SERVER_URL, {
    query: {
      uuid: 'test-input-user',
      role: 'client',
    },
    transports: ['websocket', 'polling'],
  });

  inputSocket.on('DIARY_ERROR', (err) => {
    console.error('[Test Client] Received DIARY_ERROR from server:', err);
  });

  // 等候所有 6 台裝置與 input client 連線完成
  await new Promise((resolve) => {
    let connected = 0;
    const onConn = () => {
      connected++;
      if (connected === 7) resolve();
    };
    devices.forEach((d) => d.sock.on('connect', onConn));
    inputSocket.on('connect', onConn);
  });

  console.log('[Test] All 6 mobile devices and input client connected.');

  // 各裝置發送 DEVICE_READY
  devices.forEach((d) => {
    d.sock.emit('DEVICE_READY', { deviceUuid: d.devId, deviceId: d.devId, status: 'idle' });
  });

  await new Promise((r) => setTimeout(r, 600));

  // 輔助函式：發送日記並確認進入排程
  const submitDiary = (text) => {
    return new Promise((resolve) => {
      inputSocket.emit(
        'SUBMIT_DIARY',
        {
          userId: 'test-input-user',
          originalText: text,
        },
        (ack) => {
          console.log('[Test] SUBMIT_DIARY ack:', ack?.message, 'ID:', ack?.id);
          resolve(ack);
        }
      );
    });
  };

  // 等候特定裝置接收到訊息
  const waitForDevice = (devId, timeoutMs = 60000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (receivedByDevice[devId].length > 0) {
          clearInterval(interval);
          resolve(receivedByDevice[devId][receivedByDevice[devId].length - 1]);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for Device [${devId}] to receive payload`));
        }
      }, 300);
    });
  };

  // =========================================================================
  // 測試 1: 依序派發前 3 則訊息，驗證分別派發給 Device 1, Device 2, Device 3 (獨佔單發，非廣播)
  // =========================================================================
  console.log('\n--- Step 1: 送出第 1 則日記 (預期派給 Device 1) ---');
  await submitDiary('今天在海邊散步看夕陽，海浪拍打的聲音非常療癒舒服。');
  const p1 = await waitForDevice('1');
  console.log(`[Test] Confirmed Device 1 received payload: ${p1.id}`);

  // 驗證其他 5 台裝置均未收到（嚴格獨佔，非廣播）
  for (let i = 2; i <= 6; i++) {
    if (receivedByDevice[String(i)].length !== 0) {
      throw new Error(`Device ${i} should have 0 messages, but got ${receivedByDevice[String(i)].length}! Non-broadcast rule broken.`);
    }
  }
  console.log('[Test] Verified: ONLY Device 1 received Message 1 (Devices 2~6 received 0 messages).');

  // 等待伺服器 5 秒節流間隔完成
  console.log('[Test] 等待 6 秒節流間隔...');
  await new Promise((r) => setTimeout(r, 6000));

  console.log('\n--- Step 2: 送出第 2 則日記 (預期派給 Device 2) ---');
  await submitDiary('工作忙碌了一整天，下班吃了一碗熱騰騰的日式拉麵，心滿意足。');
  const p2 = await waitForDevice('2');
  console.log(`[Test] Confirmed Device 2 received payload: ${p2.id}`);

  if (receivedByDevice['1'].length !== 1 || receivedByDevice['2'].length !== 1) {
    throw new Error('Round-robin state mismatch after Message 2');
  }
  for (let i = 3; i <= 6; i++) {
    if (receivedByDevice[String(i)].length !== 0) {
      throw new Error(`Device ${i} should have 0 messages!`);
    }
  }
  console.log('[Test] Verified: Device 2 received Message 2, Device 1 stayed at 1, Devices 3~6 remained at 0.');

  // =========================================================================
  // 測試 2: 裝置狀態切換與回報 (DEVICE_IDLE)
  // 讓 Device 1 完成演出並回報 DEVICE_IDLE。
  // 送入第 3 則日記 -> 應派發給「最久未接單 / 從未接單」的 Device 3，而不是剛回報 idle 的 Device 1
  // =========================================================================
  console.log('\n--- Step 3: Device 1 回報 DEVICE_IDLE，並送出第 3 則日記 ---');
  devices[0].sock.emit('DEVICE_IDLE', { deviceUuid: '1', deviceId: '1', status: 'idle' });
  
  // 等待伺服器 5 秒節流間隔完成
  console.log('[Test] 等待 6 秒節流間隔...');
  await new Promise((r) => setTimeout(r, 6000));

  await submitDiary('夜晚的城市燈火通明，窗外的車流就像一條安靜的銀河一樣。');
  const p3 = await waitForDevice('3');
  console.log(`[Test] Confirmed Device 3 received payload: ${p3.id}`);

  if (receivedByDevice['1'].length !== 1) {
    throw new Error('Device 1 should still have 1 message (it should NOT have intercepted Message 3)!');
  }
  if (receivedByDevice['3'].length !== 1) {
    throw new Error('Device 3 should have received Message 3!');
  }
  console.log('[Test] Verified: Least-recently-assigned rule passed! Device 3 (never assigned) was picked over Device 1 (recently assigned).');

  // =========================================================================
  // 總結統計
  // =========================================================================
  console.log('\n[Test] Final Received Counts:');
  for (let i = 1; i <= 6; i++) {
    console.log(`  Device [${i}]: ${receivedByDevice[String(i)].length} messages`);
  }

  console.log('\n[Test] ALL CHECKS PASSED: 6-Device Worker Pool / Exclusive Round-Robin is WORKING PERFECTLY!');

  // 清理連線
  devices.forEach((d) => d.sock.disconnect());
  inputSocket.disconnect();
  process.exit(0);
}

testWorkerPool().catch((err) => {
  console.error('[Test] FAILED:', err);
  process.exit(1);
});
