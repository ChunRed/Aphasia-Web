const { spawn } = require('child_process');
const path = require('path');
const socketIoClient = require(path.join(__dirname, '../mobile/node_modules/socket.io-client'));

const SERVER_PORT = 8089;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

async function runTest() {
  console.log('[Test] Starting server on port', SERVER_PORT);
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../server'),
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'pipe',
  });

  serverProc.stdout.on('data', (d) => process.stdout.write('[Server stdout] ' + d));
  serverProc.stderr.on('data', (d) => process.stderr.write('[Server stderr] ' + d));

  // 等待 server 啟動
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('[Test] Connecting Device 2 (simulating mobile device)...');
  const deviceSock = socketIoClient(SERVER_URL, {
    query: {
      deviceUuid: '2',
      deviceId: '2',
      role: 'mobile',
    },
    transports: ['websocket', 'polling'],
  });

  const devReadyPromise = new Promise((resolve) => {
    deviceSock.on('connect', () => {
      console.log('[Test] Device 2 connected, sending DEVICE_READY');
      deviceSock.emit('DEVICE_READY', { deviceUuid: '2', deviceId: '2', status: 'idle' });
      resolve();
    });
  });
  await devReadyPromise;

  console.log('[Test] Connecting Client user...');
  const clientSock = socketIoClient(SERVER_URL, {
    query: {
      uuid: 'test-user-spatial',
      role: 'client',
    },
    transports: ['websocket', 'polling'],
  });

  await new Promise((resolve) => clientSock.on('connect', resolve));

  let receivedAnalysisResult = null;
  let receivedDiarySuccess = null;

  clientSock.on('ANALYSIS_RESULT', (data) => {
    console.log('[Test] Client received ANALYSIS_RESULT:', data);
    receivedAnalysisResult = data;
  });

  clientSock.on('DIARY_SUCCESS', (data) => {
    console.log('[Test] Client received DIARY_SUCCESS:', data);
    receivedDiarySuccess = data;
  });

  console.log('[Test] Submitting diary from client...');
  clientSock.emit('SUBMIT_DIARY', {
    userId: 'test-user-spatial',
    originalText: '今天天氣晴朗，微風徐徐吹來，心情感覺格外輕鬆自在。',
  });

  // 等待接收事件
  const startTime = Date.now();
  while ((!receivedAnalysisResult || !receivedDiarySuccess) && Date.now() - startTime < 20000) {
    await new Promise((r) => setTimeout(r, 500));
  }

  // 驗證
  let passed = true;
  if (!receivedAnalysisResult) {
    console.error('[Test] FAILED: Did not receive ANALYSIS_RESULT within timeout');
    passed = false;
  } else if (receivedAnalysisResult.targetDeviceId !== 2) {
    console.error(`[Test] FAILED: Expected targetDeviceId === 2, got: ${receivedAnalysisResult.targetDeviceId}`);
    passed = false;
  } else {
    console.log('[Test] SUCCESS: ANALYSIS_RESULT contains targetDeviceId: 2');
  }

  if (!receivedDiarySuccess) {
    console.error('[Test] FAILED: Did not receive DIARY_SUCCESS within timeout');
    passed = false;
  } else if (receivedDiarySuccess.targetDeviceId !== 2) {
    console.error(`[Test] FAILED: Expected targetDeviceId === 2 in DIARY_SUCCESS, got: ${receivedDiarySuccess.targetDeviceId}`);
    passed = false;
  } else {
    console.log('[Test] SUCCESS: DIARY_SUCCESS contains targetDeviceId: 2');
  }

  // 清理
  deviceSock.disconnect();
  clientSock.disconnect();
  serverProc.kill();

  if (!passed) {
    process.exit(1);
  }
  console.log('\n[Test] ALL CHECKS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('[Test] Unhandled error:', err);
  process.exit(1);
});
