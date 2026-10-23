#include <AccelStepper.h>

// ============================================================================
// 🦾 [motor.ino] 步進馬達驅動與狀態機控制分頁
// ============================================================================

// 引用來自 config.ino 的馬達硬體與運動參數
extern const int MOTOR_ENA_PIN;
extern const int MOTOR_DIR_PIN;
extern const int MOTOR_PUL_PIN;
extern const float STEPS_PER_DEG;
extern const float MAX_TARGET_ANGLE_DEG;
extern const float MOTOR_MAX_SPEED_DEG_S;
extern const float MOTOR_ACCEL_DEG_S2;
extern const bool  MOTOR_DIR_INVERT;
extern const unsigned long MOTOR_ENABLE_SETTLE_MS;
extern const unsigned long MOTOR_HOLD_MS;
extern const unsigned long MOTOR_RELEASE_MS;

// 建立 AccelStepper 物件 (DRIVER 模式: PUL_PIN=26, DIR_PIN=27)
AccelStepper stepper(AccelStepper::DRIVER, 26, 27);

// 馬達狀態機定義
enum MotorState {
  STATE_IDLE = 0,         // 待機中，靜止斷電，等待 Socket.IO 指令
  STATE_ENABLE_WAIT = 1,  // 通電激磁，等待內部磁場穩定
  STATE_ROTATING = 2,     // 加減速旋轉至目標角度
  STATE_HOLD = 3,         // 旋轉到位，通電鎖定維持力矩
  STATE_RELEASED = 4      // 斷電釋放，讓外部彈簧將機構拉回原點
};

MotorState currentMotorState = STATE_IDLE;
unsigned long motorStateStartTime = 0;
float currentTargetAngleDeg = 0.0f;

// 使用 int 接收狀態，避免 Arduino 預編譯器自動生成原型宣告時產生 MotorState 未定義之錯誤
void changeMotorState(int nextState) {
  currentMotorState = (MotorState)nextState;
  motorStateStartTime = millis();
}

/**
 * 觸發馬達動作 (由 socketio.ino 收到 esp32-event 時呼叫)
 * @param rawMotorValue 0 ~ 255 的數值
 * 功能：自動 mapping 至 0.0° ~ 15.75° (MAX_TARGET_ANGLE_DEG) 並啟動動作
 */
void triggerMotorAction(int rawMotorValue) {
  // 1. 限制數值在 0 ~ 255 範圍內
  int clamped = constrain(rawMotorValue, 0, 255);

  // 2. Mapping 計算：0 -> 0.0°, 255 -> 15.75°
  currentTargetAngleDeg = (clamped / 255.0f) * MAX_TARGET_ANGLE_DEG;

  Serial.printf("[Motor] >>> 收到馬達指令！原始值: %d (0~255) => Mapping 角度: %.2f° (0.0°~%.2f°)\n",
                clamped, currentTargetAngleDeg, MAX_TARGET_ANGLE_DEG);

  // 若數值極小（接近 0），直接保持釋放待機
  if (currentTargetAngleDeg <= 0.05f) {
    Serial.println("[Motor] 目標角度為 0°，保持釋放待機狀態");
    stepper.disableOutputs();
    changeMotorState(STATE_IDLE);
    return;
  }

  // 3. 通電啟動動作週期
  stepper.enableOutputs();
  stepper.setCurrentPosition(0); // 每輪歸零，避免回彈誤差累積
  changeMotorState(STATE_ENABLE_WAIT);
}

void Motor_Init() {
  stepper.setEnablePin(MOTOR_ENA_PIN);
  stepper.setPinsInverted(MOTOR_DIR_INVERT, false, true); // (方向, 步進, 致能反向)
  stepper.setMinPulseWidth(20);                           // 20微秒脈衝寬度，確保光耦穩定觸發
  stepper.setMaxSpeed(MOTOR_MAX_SPEED_DEG_S * STEPS_PER_DEG);
  stepper.setAcceleration(MOTOR_ACCEL_DEG_S2 * STEPS_PER_DEG);

  // 初始斷電釋放，處於待機狀態
  stepper.disableOutputs();
  currentMotorState = STATE_IDLE;
  Serial.println("[Motor] 步進馬達驅動器初始化完成 (目前處於 STATE_IDLE 待機等待指令)");
}

void Motor_Loop() {
  // 必須以最高頻率持續呼叫，以平滑產生步進脈衝
  stepper.run();

  const unsigned long elapsed = millis() - motorStateStartTime;

  switch (currentMotorState) {
    case STATE_IDLE:
      // 待機中，靜止等待 triggerMotorAction 呼叫
      break;

    case STATE_ENABLE_WAIT:
      // 通電穩定後，計算步數並開始轉動
      if (elapsed >= MOTOR_ENABLE_SETTLE_MS) {
        long targetSteps = lround(currentTargetAngleDeg * STEPS_PER_DEG);
        Serial.printf("[Motor] 線圈穩定完成，開始旋轉 %ld 步 (%.2f°)...\n",
                      targetSteps, currentTargetAngleDeg);
        stepper.move(targetSteps);
        changeMotorState(STATE_ROTATING);
      }
      break;

    case STATE_ROTATING:
      // 檢查是否已走完所有步數
      if (stepper.distanceToGo() == 0) {
        Serial.printf("[Motor] 到達目標角度 %.2f°，進入通電鎖定狀態 (維持 %lu 毫秒)\n",
                      currentTargetAngleDeg, MOTOR_HOLD_MS);
        changeMotorState(STATE_HOLD);
      }
      break;

    case STATE_HOLD:
      // 到位鎖定時間滿，斷電讓彈簧回彈
      if (elapsed >= MOTOR_HOLD_MS) {
        Serial.printf("[Motor] 鎖定結束，切斷馬達致能 (ENA 斷電)，讓外部彈簧回彈！\n");
        stepper.disableOutputs(); // 斷電釋放，馬達失去扭矩，彈簧回彈
        changeMotorState(STATE_RELEASED);
      }
      break;

    case STATE_RELEASED:
      // 彈簧回彈冷卻時間滿，回到待機狀態等待下一筆指令
      if (elapsed >= MOTOR_RELEASE_MS) {
        Serial.println("[Motor] 動作週期完成，回到待機狀態 (STATE_IDLE)\n");
        changeMotorState(STATE_IDLE);
      }
      break;
  }
}
