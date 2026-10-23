"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useSocket, DispatchPayload, getOrCreateDeviceUUID } from "../socket/SocketManager";
import { getSeedPresetForDevice } from "@/config/seedPresets";

/**
 * 演出生命週期 4 階段狀態定義 (Timeline States)
 * 總長調整為 25.0 秒，強化階段感與沉澱凝視：
 * PHASE_1_ACCUMULATE（沉澱凝視，0.0s – 12.0s，長度 12 秒）
 * PHASE_2_RUPTURE   （演算法斷裂與關鍵字爆發，12.0s – 15.0s，長度 3 秒，12.0s 瞬間爆發）
 * PHASE_3_ERASE     （倒退抹消與失重，15.0s – 21.0s，長度 6 秒）
 * PHASE_4_RESIDUAL  （殘留與懸空，21.0s – 25.0s，長度 4 秒）
 */
export enum TimelinePhase {
  PHASE_1_ACCUMULATE = "PHASE_1_ACCUMULATE",
  PHASE_2_RUPTURE = "PHASE_2_RUPTURE",
  PHASE_3_ERASE = "PHASE_3_ERASE",
  PHASE_4_RESIDUAL = "PHASE_4_RESIDUAL",
}

export const TIMELINE_CONFIG = {
  PHASE_1_START: 0.0,
  PHASE_1_END: 12.0,
  PHASE_2_START: 12.0,
  PHASE_2_BURST: 12.0,
  PHASE_2_END: 15.0,
  PHASE_3_START: 15.0,
  PHASE_3_END: 21.0,
  PHASE_4_START: 21.0,
  PHASE_4_END: 25.0,
  TOTAL_DURATION: 25.0,
} as const;

export interface TimelineFrameData {
  phase: TimelinePhase;
  elapsedTime: number;       // 當前循環經過的秒數 (0.0s ~ 25.0s)
  phaseTime: number;         // 當前階段經過的秒數
  phaseDuration: number;     // 當前階段總長度 (秒)
  phaseProgress: number;     // 當前階段進度 (0.0 ~ 1.0)
  totalProgress: number;     // 整體 25 秒循環進度 (0.0 ~ 1.0)
  cycleIndex: number;        // 當前演繹循環計數
  payload: DispatchPayload | null;
  isPreempted: boolean;
}

export interface PerformanceTimelineContextValue {
  phase: TimelinePhase;
  elapsedTime: number;
  phaseTime: number;
  phaseProgress: number;
  totalProgress: number;
  cycleIndex: number;
  payload: DispatchPayload | null;
  /** 手動或新訊息搶佔中斷並重置至 Phase 1 */
  triggerPreempt: (newPayload?: DispatchPayload | null) => void;
  /** 高頻（60fps）每幀回呼訂閱，供 WebGL Canvas / Shader 零 React 重繪耗損存取 */
  subscribeFrame: (callback: (data: TimelineFrameData) => void) => () => void;
  /** 取得當前時間軸快照 */
  getSnapshot: () => TimelineFrameData;
}

const defaultFrameData: TimelineFrameData = {
  phase: TimelinePhase.PHASE_1_ACCUMULATE,
  elapsedTime: 0.0,
  phaseTime: 0.0,
  phaseDuration: 12.0,
  phaseProgress: 0.0,
  totalProgress: 0.0,
  cycleIndex: 0,
  payload: null,
  isPreempted: false,
};

const PerformanceTimelineContext = createContext<PerformanceTimelineContextValue>({
  phase: TimelinePhase.PHASE_1_ACCUMULATE,
  elapsedTime: 0.0,
  phaseTime: 0.0,
  phaseProgress: 0.0,
  totalProgress: 0.0,
  cycleIndex: 0,
  payload: null,
  triggerPreempt: () => {},
  subscribeFrame: () => () => {},
  getSnapshot: () => defaultFrameData,
});

/**
 * 依據給定時間秒數計算其所屬的 25 秒狀態機階段與進度
 */
export function computeTimelineFrame(
  rawElapsed: number,
  payload: DispatchPayload | null,
  cycleIndex: number,
  isPreempted: boolean = false
): TimelineFrameData {
  const elapsedTime = Math.max(0, Math.min(TIMELINE_CONFIG.TOTAL_DURATION, rawElapsed));
  const totalProgress = elapsedTime / TIMELINE_CONFIG.TOTAL_DURATION;

  let phase = TimelinePhase.PHASE_1_ACCUMULATE;
  let phaseTime = 0;
  let phaseDuration = 12.0;

  if (elapsedTime < TIMELINE_CONFIG.PHASE_2_START) {
    phase = TimelinePhase.PHASE_1_ACCUMULATE;
    phaseTime = elapsedTime - TIMELINE_CONFIG.PHASE_1_START;
    phaseDuration = TIMELINE_CONFIG.PHASE_1_END - TIMELINE_CONFIG.PHASE_1_START; // 12.0s
  } else if (elapsedTime < TIMELINE_CONFIG.PHASE_3_START) {
    phase = TimelinePhase.PHASE_2_RUPTURE;
    phaseTime = elapsedTime - TIMELINE_CONFIG.PHASE_2_START;
    phaseDuration = TIMELINE_CONFIG.PHASE_2_END - TIMELINE_CONFIG.PHASE_2_START; // 3.0s
  } else if (elapsedTime < TIMELINE_CONFIG.PHASE_4_START) {
    phase = TimelinePhase.PHASE_3_ERASE;
    phaseTime = elapsedTime - TIMELINE_CONFIG.PHASE_3_START;
    phaseDuration = TIMELINE_CONFIG.PHASE_3_END - TIMELINE_CONFIG.PHASE_3_START; // 6.0s
  } else {
    phase = TimelinePhase.PHASE_4_RESIDUAL;
    phaseTime = elapsedTime - TIMELINE_CONFIG.PHASE_4_START;
    phaseDuration = TIMELINE_CONFIG.PHASE_4_END - TIMELINE_CONFIG.PHASE_4_START; // 4.0s
  }

  const phaseProgress =
    phaseDuration > 0
      ? Math.min(1.0, Math.max(0.0, phaseTime / phaseDuration))
      : 0;

  return {
    phase,
    elapsedTime,
    phaseTime,
    phaseDuration,
    phaseProgress,
    totalProgress,
    cycleIndex,
    payload,
    isPreempted,
  };
}

export interface PerformanceTimelineProviderProps {
  children: ReactNode;
  /** 自訂初始 Payload */
  initialPayload?: DispatchPayload | null;
  /** 是否在 25.0s 完成時自動呼叫 Socket reportIdle（預設 true） */
  autoReportIdle?: boolean;
}

export function PerformanceTimelineProvider({
  children,
  initialPayload = null,
  autoReportIdle = true,
}: PerformanceTimelineProviderProps) {
  const { currentPayload: socketPayload, reportIdle, deviceUuid } = useSocket();

  // 演出資料狀態：開機無資料時優先指派該裝置對應之種子資料，徹底消除 5 秒空白
  const initialOrSeed =
    initialPayload ||
    socketPayload ||
    (typeof window !== "undefined"
      ? getSeedPresetForDevice(deviceUuid || getOrCreateDeviceUUID())
      : getSeedPresetForDevice(""));

  const [activePayload, setActivePayload] = useState<DispatchPayload | null>(initialOrSeed);
  const activePayloadRef = useRef<DispatchPayload | null>(activePayload);
  activePayloadRef.current = activePayload;

  // React 呈現狀態（依階段轉換與定時更新）
  const [phase, setPhase] = useState<TimelinePhase>(TimelinePhase.PHASE_1_ACCUMULATE);
  const [elapsedTime, setElapsedTime] = useState<number>(0.0);
  const [phaseTime, setPhaseTime] = useState<number>(0.0);
  const [phaseProgress, setPhaseProgress] = useState<number>(0.0);
  const [totalProgress, setTotalProgress] = useState<number>(0.0);
  const [cycleIndex, setCycleIndex] = useState<number>(0);

  // 時鐘基線與內部參照
  const startTimeRef = useRef<number>(performance.now());
  const cycleIndexRef = useRef<number>(0);
  const currentFrameRef = useRef<TimelineFrameData>(defaultFrameData);
  const frameSubscribersRef = useRef<Set<(data: TimelineFrameData) => void>>(new Set());
  const hasReportedIdleThisCycleRef = useRef<boolean>(false);
  const lastPhaseRef = useRef<TimelinePhase>(TimelinePhase.PHASE_1_ACCUMULATE);

  // 訂閱高頻每幀回呼
  const subscribeFrame = useCallback((callback: (data: TimelineFrameData) => void) => {
    frameSubscribersRef.current.add(callback);
    callback(currentFrameRef.current);
    return () => {
      frameSubscribersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback((): TimelineFrameData => {
    return currentFrameRef.current;
  }, []);

  // 搶佔中斷 (Preemption)：立即重置時鐘並從 Phase 1 開始全新的 25 秒生命週期
  const triggerPreempt = useCallback(
    (newPayload?: DispatchPayload | null) => {
      const payloadToSet =
        newPayload !== undefined ? newPayload : activePayloadRef.current;

      console.log(
        `[PerformanceTimeline] 觸發搶佔中斷 (Preemption)，重置至 Phase 1！(Payload ID: ${
          payloadToSet?.id || "none"
        })`
      );

      startTimeRef.current = performance.now();
      hasReportedIdleThisCycleRef.current = false;
      cycleIndexRef.current++;
      setCycleIndex(cycleIndexRef.current);

      if (newPayload !== undefined) {
        setActivePayload(newPayload);
        activePayloadRef.current = newPayload;
        lastHandledPayloadIdRef.current = newPayload?.id || null;
      }

      const frame = computeTimelineFrame(
        0.0,
        payloadToSet,
        cycleIndexRef.current,
        true
      );
      currentFrameRef.current = frame;
      lastPhaseRef.current = frame.phase;

      setPhase(frame.phase);
      setElapsedTime(0.0);
      setPhaseTime(0.0);
      setPhaseProgress(0.0);
      setTotalProgress(0.0);

      // 即時通知所有 60fps 訂閱者
      frameSubscribersRef.current.forEach((cb) => cb(frame));
    },
    []
  );

  // 監聽 Socket 派發之最新 payload（搶佔中斷 Preemption 核心）
  const lastHandledPayloadIdRef = useRef<string | null>(initialOrSeed?.id || null);

  useEffect(() => {
    if (socketPayload && socketPayload.id) {
      if (socketPayload.id !== lastHandledPayloadIdRef.current) {
        lastHandledPayloadIdRef.current = socketPayload.id;
        console.log(
          `[PerformanceTimeline] 偵測到伺服器派發新訊息 ${socketPayload.id}，執行搶佔中斷 (重置 25s)`
        );
        triggerPreempt(socketPayload);
      }
    }
  }, [socketPayload, triggerPreempt]);

  // 取得高精度時間戳記（舊款手機若不支援 performance.now 則平滑降級為 Date.now）
  const getNow = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  // 核心統一時鐘 RAF 循環 (25 秒演出狀態機)
  useEffect(() => {
    let animationFrameId: number;
    let lastReactSyncTime = 0;

    const tick = () => {
      try {
        const now = getNow();
        let rawElapsed = (now - startTimeRef.current) / 1000;

        // 檢查是否已達到 25.0s 週期上限
        if (rawElapsed >= TIMELINE_CONFIG.TOTAL_DURATION) {
          // 完成回報 (25.0s)：通知 Server 自己已進入閒置
          if (!hasReportedIdleThisCycleRef.current) {
            hasReportedIdleThisCycleRef.current = true;
            if (autoReportIdle) {
              console.log(
                `[PerformanceTimeline] 25 秒演出週期結束，回報 DEVICE_IDLE (常駐 Phase 4 待機)`
              );
              reportIdle();
            }
          }

          // 演出結束後的「常駐待機」邏輯（Hold on Last Frame）：
          // 不清空畫面、不重播到空白狀態，時間軸停留在 25.0s (Phase 4 殘留懸空待機)
          // 畫面持續維持在 Phase 4，直到有新的觀眾送出日記觸發 triggerPreempt
          rawElapsed = TIMELINE_CONFIG.TOTAL_DURATION;
        }

        const frame = computeTimelineFrame(
          rawElapsed,
          activePayloadRef.current,
          cycleIndexRef.current,
          false
        );
        currentFrameRef.current = frame;

        // 1. 即時派發至 60fps 訂閱者（獨立 try-catch，防止 WebGL 訂閱者報錯拖垮時鐘循環）
        frameSubscribersRef.current.forEach((cb) => {
          try {
            cb(frame);
          } catch (cbErr) {
            console.warn("[PerformanceTimeline] Frame subscriber error:", cbErr);
          }
        });

        // 2. 同步 React 狀態（階段切換時立即同步；其餘每 80ms 同步一次以維持介面流暢反應）
        const phaseChanged = frame.phase !== lastPhaseRef.current;
        const timeToSync = now - lastReactSyncTime > 80;

        if (phaseChanged || timeToSync) {
          lastReactSyncTime = now;
          if (phaseChanged) {
            lastPhaseRef.current = frame.phase;
            console.log(`[Timer: ${frame.elapsedTime.toFixed(1)}s | ${frame.phase}]`);
          }
          setPhase(frame.phase);
          setElapsedTime(frame.elapsedTime);
          setPhaseTime(frame.phaseTime);
          setPhaseProgress(frame.phaseProgress);
          setTotalProgress(frame.totalProgress);
        }
      } catch (tickErr) {
        console.warn("[PerformanceTimeline] Tick calculation error:", tickErr);
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    startTimeRef.current = getNow();
    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [autoReportIdle, reportIdle]);

  const contextValue: PerformanceTimelineContextValue = {
    phase,
    elapsedTime,
    phaseTime,
    phaseProgress,
    totalProgress,
    cycleIndex,
    payload: activePayload,
    triggerPreempt,
    subscribeFrame,
    getSnapshot,
  };

  return (
    <PerformanceTimelineContext.Provider value={contextValue}>
      {children}
    </PerformanceTimelineContext.Provider>
  );
}

export function usePerformanceTimeline(): PerformanceTimelineContextValue {
  return useContext(PerformanceTimelineContext);
}

export default PerformanceTimelineProvider;
