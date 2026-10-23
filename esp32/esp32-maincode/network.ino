#include <Ethernet.h>
#include <EthernetUdp.h>

// ========== 引用於 config.ino 的硬體網路參數 ==========
extern int MY_DEVICE_ID;
extern byte W5500_MAC[];
extern IPAddress W5500_LOCAL_IP;
extern IPAddress W5500_DNS;
extern IPAddress W5500_GATEWAY;
extern IPAddress W5500_SUBNET;

#define W5500_CS 5

EthernetUDP Udp;
const unsigned int localPort = 4000;
extern const int NUM_DEVICES;

class FlipDevice;
extern FlipDevice* devices[4];

// 暫存發送給 Slave 1 與 Slave 2 的數值 (各 4 個數字，預設為 1)
int slave1Digits[4] = {1, 1, 1, 1};
int slave2Digits[4] = {1, 1, 1, 1};

void Net_Init() {
  // 依據 MY_DEVICE_ID 自動設定 MAC 與備用固定 IP 的最後一碼
  // 例如 MY_DEVICE_ID = 3 => MAC 最後一碼自動為 0x03, 備用 IP 自動為 192.168.1.13
  W5500_MAC[5] = (byte)MY_DEVICE_ID;
  W5500_LOCAL_IP = IPAddress(192, 168, 1, 10 + MY_DEVICE_ID);

  Serial.println("[W5500] 正在初始化 W5500 乙太網模組 (CS Pin 5)...");
  Serial.printf("[W5500] 裝置 #%d 自動配置: MAC 尾碼 0x%02X, 備用固定 IP: %d.%d.%d.%d\n",
                MY_DEVICE_ID, W5500_MAC[5],
                W5500_LOCAL_IP[0], W5500_LOCAL_IP[1], W5500_LOCAL_IP[2], W5500_LOCAL_IP[3]);

  Ethernet.init(W5500_CS);

  // 1. 優先嘗試透過 DHCP 自動取得 IP、Gateway 與 DNS（適合一般接上路由器的實體網路線）
  Serial.println("[W5500] 嘗試透過有線網路 DHCP 取得 IP...");
  if (Ethernet.begin(W5500_MAC) == 0) {
    // 2. 若 DHCP 逾時未回應，自動回退至 config.ino 設定之靜態固定 IP
    Serial.println("[W5500] DHCP 取得失敗，改用 config.ino 靜態固定 IP...");
    Ethernet.begin(W5500_MAC, W5500_LOCAL_IP, W5500_DNS, W5500_GATEWAY, W5500_SUBNET);
  } else {
    Serial.println("[W5500] DHCP 自動取得 IP 成功！");
  }

  delay(500);
  Serial.print("[W5500] 本機 IP 位址: ");
  Serial.println(Ethernet.localIP());
  Serial.print("[W5500] 預設閘道 (Gateway): ");
  Serial.println(Ethernet.gatewayIP());
  Serial.print("[W5500] DNS 伺服器: ");
  Serial.println(Ethernet.dnsServerIP());

  // 3. 開啟本機 OSC 監聽
  Udp.begin(localPort);
  Serial.print("[OSC] 本機 OSC 監聽 UDP Port: ");
  Serial.println(localPort);
}