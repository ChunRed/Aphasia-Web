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

// 5. 硬體 Pin 腳設定
const int LED_PIN = 2;                         // 板載指示燈 Pin 2 (收到本機指令時亮起 1 秒)
const int MOTOR_PIN = 25;                      // 馬達 PWM 控制輸出腳位 (可依實際硬體接線修改)
