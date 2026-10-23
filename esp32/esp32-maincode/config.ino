// ============================================================================
// ⚙️ [config.ino] ESP32 專屬硬體與網路參數設定頁 (Configuration Page)
// ============================================================================
// 說明：
// 當您為不同台 ESP32 燒錄時，只需在此分頁修改相關參數，其餘分頁程式碼皆不需變動！
// ============================================================================

// 1. 本台 ESP32 裝置編號 (有效範圍: 1 ~ 6)
//    當收到 'esp32-event' 且 index1 與本編號相同時，才會觸發 Pin 2 亮燈及馬達動作
int MY_DEVICE_ID = 1;

// 2. W5500 實體網卡 MAC 位址
//    注意：同一個區域網路內，每台 ESP32 的 MAC 最後一碼請勿重複 (例如 0x01 ~ 0x06)
byte W5500_MAC[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0x01 };

// 3. W5500 靜態備用固定 IP 設定 (當區網路由器無 DHCP 伺服器時使用)
//    每台裝置的 IP 最後一碼建議分開 (例如 192.168.1.11 ~ 192.168.1.16)
IPAddress W5500_LOCAL_IP(192, 168, 1, 11);
IPAddress W5500_GATEWAY(192, 168, 1, 1);
IPAddress W5500_SUBNET(255, 255, 255, 0);
IPAddress W5500_DNS(8, 8, 8, 8);               // Google 公共 DNS

// 4. Socket.IO 伺服器主機設定
//    目前直連 AWS Elastic Beanstalk (Port 80 原生明文通道，無 SSL 開銷)
const char* SOCKET_HOST = "daf2026-env.eba-myc7zuva.us-east-1.elasticbeanstalk.com";
const int   SOCKET_PORT = 80;
const char* SOCKET_PATH = "/socket.io/?EIO=3&transport=websocket";

// 5. 板載指示燈 Pin 腳設定
const int LED_PIN = 2;                         // 板載指示燈 Pin 2 (收到本機指令時亮起 1 秒)

// ============================================================================
// 🦾 步進馬達控制參數 (Stepper Motor Configuration)
// ============================================================================
// 6. 馬達驅動器接腳 (ENA+, DIR+, PUL+)
const int MOTOR_ENA_PIN = 14;                  // ENA+ (致能)
const int MOTOR_DIR_PIN = 27;                  // DIR+ (方向)
const int MOTOR_PUL_PIN = 26;                  // PUL+ (步進脈衝)

// 7. 驅動器參數 (需與驅動器撥碼開關一致)
const long MOTOR_STEPS_PER_REV = 200;          // 1.8° 步進馬達 (每轉 200 步)
const long MOTOR_MICROSTEP     = 32;           // 驅動器細分數
const float STEPS_PER_DEG = (MOTOR_STEPS_PER_REV * MOTOR_MICROSTEP) / 360.0f; // ≈17.7778 步/度

// 8. 動作運動學參數 (只需調整這裡)
//    esp32-event 的 0~255 數值將 mapping 到 0.0f ~ MAX_TARGET_ANGLE_DEG
const float MAX_TARGET_ANGLE_DEG  = 15.75f;    // 最大旋轉角度 (原 140 步 @ 16 細分，改 32 細分對應 280 步)
const float MOTOR_MAX_SPEED_DEG_S = 13.5f;     // 最大速度 (度/秒)
const float MOTOR_ACCEL_DEG_S2    = 4.5f;      // 加速度 (度/秒²)
const bool  MOTOR_DIR_INVERT      = false;     // false = 順時針；true = 逆時針

// 9. 時間狀態參數 (毫秒 ms)
const unsigned long MOTOR_ENABLE_SETTLE_MS = 500;  // 上電後等待線圈穩定時間
const unsigned long MOTOR_HOLD_MS          = 2000; // 旋轉到位後通電鎖定維持時間
const unsigned long MOTOR_RELEASE_MS       = 5000; // 斷電釋放、彈簧回彈冷卻時間
