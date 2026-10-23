const io = require("socket.io-client");

// 目標伺服器 (AWS Elastic Beanstalk Port 80)
const SERVER_URL = "http://daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";

// 支援命令列指定: node scratch/test-emit-esp32.js <index1_deviceId> <index2_motorSpeed>
// 預設: 裝置 1, 馬達數值 180
const targetDeviceId = process.argv[2] || "1";
const motorSpeed = process.argv[3] || "180";

console.log(`[Test] 正在連線至: ${SERVER_URL}...`);
const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
  rejectUnauthorized: false,
});

socket.on("connect", () => {
  console.log(`[Test] 成功連線！Socket ID: ${socket.id}`);
  
  // 傳送要求的陣列格式: ['index1', 'index2']
  const testPayload = [String(targetDeviceId), String(motorSpeed)];

  console.log(`[Test] 正在廣播 'esp32-event' -> 裝置: ${testPayload[0]}, 馬達值: ${testPayload[1]}`);
  socket.emit("esp32-event", testPayload);

  setTimeout(() => {
    console.log("[Test] 測試指令發送完成，斷開連線。");
    socket.disconnect();
    process.exit(0);
  }, 1200);
});

socket.on("connect_error", (err) => {
  console.error("[Test] 連線失敗:", err.message);
  process.exit(1);
});
