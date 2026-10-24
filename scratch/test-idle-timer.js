const { spawn } = require('child_process');
const path = require('path');
const socketIoClient = require(path.join(__dirname, '../mobile/node_modules/socket.io-client'));

const SERVER_PORT = 8091;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

async function testIdleTimer() {
  console.log('[Test] Starting server on port', SERVER_PORT, 'with IDLE_TIMEOUT_SECONDS=2');
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../server'),
    env: { ...process.env, PORT: String(SERVER_PORT), IDLE_TIMEOUT_SECONDS: '2' },
    stdio: 'pipe',
  });

  serverProc.stdout.on('data', (d) => process.stdout.write('[Server stdout] ' + d));
  serverProc.stderr.on('data', (d) => process.stderr.write('[Server stderr] ' + d));

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('[Test] Connecting Mobile Device 3...');
  const deviceSock = socketIoClient(SERVER_URL, {
    query: {
      deviceUuid: '3',
      deviceId: '3',
      role: 'mobile',
    },
    transports: ['websocket', 'polling'],
  });

  let receivedAutoPayload = null;
  let receivedEsp32Event = null;

  deviceSock.on('connect', () => {
    console.log('[Test] Device 3 connected, sending DEVICE_READY (status: idle)');
    deviceSock.emit('DEVICE_READY', { deviceUuid: '3', deviceId: '3', status: 'idle' });
  });

  deviceSock.on('DISPATCH_PAYLOAD', (payload) => {
    console.log('[Test] Device 3 received DISPATCH_PAYLOAD:', payload.id, 'Text:', payload.originalText.slice(0, 20) + '...');
    receivedAutoPayload = payload;
  });

  deviceSock.on('esp32-event', (data) => {
    console.log('[Test] Received esp32-event:', data);
    receivedEsp32Event = data;
  });

  console.log('[Test] Waiting up to 6 seconds for autonomous idle trigger (timeout is 2s)...');
  const start = Date.now();
  while (!receivedAutoPayload && Date.now() - start < 6000) {
    await new Promise((r) => setTimeout(r, 400));
  }

  let passed = true;
  if (!receivedAutoPayload) {
    console.error('[Test] FAILED: Mobile device did not receive auto-play DISPATCH_PAYLOAD within timeout!');
    passed = false;
  } else {
    console.log('[Test] SUCCESS: Received auto-play payload from idle timer!');
  }

  if (!receivedEsp32Event) {
    console.error('[Test] FAILED: Did not receive esp32-event for idle dispatch!');
    passed = false;
  } else if (receivedEsp32Event[0] !== 3) {
    console.error(`[Test] FAILED: Expected esp32-event deviceId 3, got: ${receivedEsp32Event[0]}`);
    passed = false;
  } else {
    console.log(`[Test] SUCCESS: esp32-event received for Device 3 with motorValue ${receivedEsp32Event[1]}`);
  }

  deviceSock.disconnect();
  serverProc.kill();

  if (!passed) {
    process.exit(1);
  }
  console.log('\n[Test] IDLE TIMER AUTOMATION PASSED SUCCESSFULLY!');
  process.exit(0);
}

testIdleTimer().catch((err) => {
  console.error('[Test] Error:', err);
  process.exit(1);
});
