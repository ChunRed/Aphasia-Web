#include <Ethernet.h>

// 引用於 config.ino 的伺服器主機與連線設定
extern const char* SOCKET_HOST;
extern const int   SOCKET_PORT;
extern const char* SOCKET_PATH;
extern int         MY_DEVICE_ID;

EthernetClient socketClient;
bool socketConnected = false;
unsigned long lastReconnectTime = 0;
const unsigned long RECONNECT_INTERVAL = 3000; // 斷線後每 3 秒自動重試連線

// 外部引用的 Pin 2 控制函式 (定義於 esp32-maincode.ino)
extern void triggerPin2();

// 發送已遮罩 (Masked) 的 WebSocket 文字訊框 (RFC 6455 規範：客戶端發送必須遮罩)
void sendWebSocketText(const String& msg) {
  if (!socketClient.connected()) return;

  size_t len = msg.length();
  uint8_t mask[4] = { 0x33, 0x77, 0xAA, 0xEE };

  // 訊框標頭
  socketClient.write((uint8_t)0x81); // FIN = 1, Opcode = 1 (Text Frame)

  if (len <= 125) {
    socketClient.write((uint8_t)(0x80 | len)); // Mask = 1, Length
  } else if (len <= 65535) {
    socketClient.write((uint8_t)(0x80 | 126));
    socketClient.write((uint8_t)((len >> 8) & 0xFF));
    socketClient.write((uint8_t)(len & 0xFF));
  } else {
    return;
  }

  // 寫入 4 位元組遮罩金鑰
  socketClient.write(mask, 4);

  // 寫入遮罩後之資料酬載
  for (size_t i = 0; i < len; i++) {
    socketClient.write((uint8_t)(msg[i] ^ mask[i % 4]));
  }
}

// 建立 WebSocket 握手
bool connectWebSocket() {
  Serial.print("[Socket.IO] 正在透過 W5500 連線至伺服器: ");
  Serial.print(SOCKET_HOST);
  Serial.print(":");
  Serial.println(SOCKET_PORT);

  if (!socketClient.connect(SOCKET_HOST, SOCKET_PORT)) {
    Serial.println("[Socket.IO] TCP 連線失敗，3 秒後將自動重試...");
    return false;
  }

  Serial.println("[Socket.IO] TCP 連線成功！發起 WebSocket 握手協商...");

  // 發送 WebSocket 升級請求標頭
  socketClient.print("GET ");
  socketClient.print(SOCKET_PATH);
  socketClient.println(" HTTP/1.1");
  socketClient.print("Host: ");
  socketClient.println(SOCKET_HOST);
  socketClient.println("Upgrade: websocket");
  socketClient.println("Connection: Upgrade");
  socketClient.println("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==");
  socketClient.println("Sec-WebSocket-Version: 13");
  socketClient.println();

  // 等候伺服器回應 HTTP 101 Switching Protocols
  unsigned long timeout = millis() + 6000;
  bool is101 = false;
  while (millis() < timeout) {
    if (socketClient.available()) {
      String line = socketClient.readStringUntil('\n');
      line.trim();
      if (line.indexOf("101") >= 0) {
        is101 = true;
      }
      if (line.length() == 0) {
        // 空行代表 HTTP Headers 結束
        break;
      }
    }
    delay(5);
  }

  if (is101) {
    socketConnected = true;
    Serial.println("\n[Socket.IO] >>> 成功連線！WebSocket 握手完成 (101 Switching Protocols)！");
    Serial.printf("[Socket.IO] >>> 本台 ESP32 編號 [#%d]，正在專注監聽 'esp32-event' 中...\n\n", MY_DEVICE_ID);
    return true;
  } else {
    Serial.println("[Socket.IO] WebSocket 握手失敗 (未收到 101 回應)");
    socketClient.stop();
    return false;
  }
}

// 解析並處理 'esp32-event' 的資料陣列 ['index1', 'index2']
void handleEsp32Event(const String& payload) {
  const String eventKey = "\"esp32-event\"";
  int eventIdx = payload.indexOf(eventKey);
  if (eventIdx < 0) return;

  String afterEvent = payload.substring(eventIdx + eventKey.length());
  int openBracket = afterEvent.indexOf('[');
  int closeBracket = afterEvent.indexOf(']', openBracket);

  String raw1 = "";
  String raw2 = "";

  if (openBracket >= 0 && closeBracket > openBracket) {
    String inner = afterEvent.substring(openBracket + 1, closeBracket);
    int commaIdx = inner.indexOf(',');
    if (commaIdx >= 0) {
      raw1 = inner.substring(0, commaIdx);
      raw2 = inner.substring(commaIdx + 1);
    }
  } else {
    // 兼容若是直接以逗號傳遞的情形: "esp32-event", "1", "180"
    int firstComma = afterEvent.indexOf(',');
    if (firstComma >= 0) {
      String rest = afterEvent.substring(firstComma + 1);
      int secondComma = rest.indexOf(',');
      if (secondComma >= 0) {
        raw1 = rest.substring(0, secondComma);
        raw2 = rest.substring(secondComma + 1);
      }
    }
  }

  // 清除引號、空白與中括號
  raw1.replace("\"", ""); raw1.replace("'", ""); raw1.trim();
  raw2.replace("\"", ""); raw2.replace("'", ""); raw2.replace("]", ""); raw2.trim();

  int targetDeviceId = raw1.toInt();
  int motorValue = raw2.toInt();

  // 印出接收到的兩個數值
  Serial.println("==============================================");
  Serial.println("[Socket.IO] >>> 收到 'esp32-event' 事件訊息！");
  Serial.print("  > 裝置編號 (index1): ");
  Serial.println(targetDeviceId);
  Serial.print("  > 馬達數值 (index2): ");
  Serial.println(motorValue);

  // 比對是否為這台 ESP32 的編號
  if (targetDeviceId == MY_DEVICE_ID) {
    Serial.printf("  ==> 【符合本台裝置 #%d】指令生效！Pin 2 亮起 1 秒\n", MY_DEVICE_ID);
    triggerPin2();
  } else {
    Serial.printf("  ==> (指定給 #%d 號機，本機為 #%d，略過硬體動作)\n", targetDeviceId, MY_DEVICE_ID);
  }
  Serial.println("==============================================\n");
}

// 處理接收到的 WebSocket 訊框
void processIncomingData() {
  if (!socketClient.connected()) {
    if (socketConnected) {
      Serial.println("[Socket.IO] 與伺服器連線已中斷");
      socketConnected = false;
    }
    return;
  }

  while (socketClient.available() >= 2) {
    // 讀取 RFC 6455 訊框標頭
    uint8_t b1 = socketClient.read();
    uint8_t b2 = socketClient.read();

    uint8_t opcode = b1 & 0x0F;
    bool isMasked = (b2 & 0x80) != 0;
    uint32_t payloadLen = b2 & 0x7F;

    if (payloadLen == 126) {
      while (socketClient.available() < 2) delay(1);
      payloadLen = (socketClient.read() << 8) | socketClient.read();
    } else if (payloadLen == 127) {
      while (socketClient.available() < 8) delay(1);
      socketClient.read(); socketClient.read(); socketClient.read(); socketClient.read();
      payloadLen = (socketClient.read() << 24) | (socketClient.read() << 16) | (socketClient.read() << 8) | socketClient.read();
    }

    uint8_t maskKey[4] = {0};
    if (isMasked) {
      while (socketClient.available() < 4) delay(1);
      socketClient.readBytes(maskKey, 4);
    }

    // 讀取酬載內容
    String payload = "";
    payload.reserve(min((uint32_t)1024, payloadLen));

    for (uint32_t i = 0; i < payloadLen; i++) {
      while (!socketClient.available()) delay(1);
      uint8_t c = socketClient.read();
      if (isMasked) {
        c ^= maskKey[i % 4];
      }
      payload += (char)c;
    }

    // --- 處理 Socket.IO / Engine.IO 協議封包 ---
    // 1. 關閉連線訊框 (Opcode 0x8)
    if (opcode == 0x8) {
      socketClient.stop();
      socketConnected = false;
      return;
    }

    // 2. WebSocket 底層 Ping (Opcode 0x9) -> 回覆 Pong (Opcode 0xA)
    if (opcode == 0x9) {
      socketClient.write((uint8_t)0x8A);
      socketClient.write((uint8_t)0x80);
      socketClient.write(maskKey, 4);
      continue;
    }

    // 3. Engine.IO 心跳 Ping ("2") -> 立即回覆 Pong ("3") 維持連線
    if (payload.startsWith("2")) {
      sendWebSocketText("3");
      continue;
    }

    // 4. Socket.IO 事件封包 ("42")
    if (payload.startsWith("42")) {
      // 僅處理 'esp32-event'，其餘事件 (如 online_count, init_data 等) 一律靜默忽略不 print
      if (payload.indexOf("\"esp32-event\"") >= 0) {
        handleEsp32Event(payload);
      }
      continue;
    }

    // 其餘連線封包 (如 0 或 40) 靜默忽略不印，維持 Console 乾淨
  }
}

void SocketIO_Init() {
  socketConnected = false;
  lastReconnectTime = millis();
  connectWebSocket();
}

void SocketIO_Loop() {
  if (socketConnected && socketClient.connected()) {
    processIncomingData();
  } else {
    // 斷線時每隔 RECONNECT_INTERVAL 自動嘗試重新連線
    if (millis() - lastReconnectTime >= RECONNECT_INTERVAL) {
      lastReconnectTime = millis();
      socketClient.stop();
      connectWebSocket();
    }
  }
}
