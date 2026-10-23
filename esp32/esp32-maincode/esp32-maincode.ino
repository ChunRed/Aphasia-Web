#include <Wire.h>
#include <Ethernet.h>
#include <EthernetUdp.h>

// ========== 引用於 config.ino 的設定參數 ==========
extern int MY_DEVICE_ID;
extern const int LED_PIN;

// ========== Pin 2 非阻塞計時器 ==========
// 使用 millis() 計算時間，不使用 delay() 避免中斷 W5500 網路連線與心跳包
unsigned long ledOffTime = 0;
bool ledActive = false;

// 觸發 Pin 2 亮起 1 秒後自動熄滅
void triggerPin2() {
  digitalWrite(LED_PIN, HIGH);
  ledOffTime = millis() + 1000; // 亮起 1000 毫秒 (1秒)
  ledActive = true;
  Serial.println("[LED] >>> Pin 2 亮起 (將在 1 秒後自動熄滅)");
}

// 在 loop() 中週期性檢查是否已滿 1 秒需熄滅
void updatePin2() {
  if (ledActive && millis() >= ledOffTime) {
    digitalWrite(LED_PIN, LOW);
    ledActive = false;
    Serial.println("[LED] >>> Pin 2 已熄滅");
  }
}

// ========== 外部函式宣告 ==========
extern void Net_Init();        // W5500 乙太網初始化 (定義於 network.ino)
extern void SocketIO_Init();   // Socket.IO 初始化 (定義於 socketio.ino)
extern void SocketIO_Loop();   // Socket.IO 封包處理 (定義於 socketio.ino)

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==========================================");
  Serial.printf("  ESP32 裝置 [#%d] 純 W5500 Socket.IO Client\n", MY_DEVICE_ID);
  Serial.println("  目標主機: AWS Elastic Beanstalk (Port 80)");
  Serial.println("==========================================");

  // 1. 初始化 Pin 2 為輸出模式，預設熄滅 (LOW)
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 2. 初始化 W5500 實體有線網路模組 (自動 DHCP / 靜態備份)
  Net_Init();

  // 3. 初始化 Socket.IO Client 直連 AWS Port 80 並監聽 'esp32-event'
  SocketIO_Init();
}

void loop() {
  // 1. 保持 Socket.IO / WebSocket 連線與事件處理
  SocketIO_Loop();

  // 2. 檢查 Pin 2 是否滿 1 秒需熄滅
  updatePin2();
}
