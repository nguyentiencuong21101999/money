import { useCallback, useEffect, useRef, useState } from "react";
import { mediaDevices, registerGlobals } from "react-native-webrtc";
import type { Unsubscribe } from "firebase/firestore";
import {
  DEFAULT_FPS,
  enterRoom,
  pickCameraId,
  QUALITY,
  shareCamera,
  watchRoomCount,
  type Presence,
  type Quality,
  type ShareSession,
} from "../../src/lib/call";
import {
  endKeepAliveCall,
  onSystemEndCall,
  startKeepAliveCall,
} from "./callkeep";
import {
  setCameraFocus,
  setCameraZoom,
  startKeepAlivePip,
  stopKeepAlivePip,
} from "./keepalive-pip";

/**
 * Cài RTCPeerConnection / RTCIceCandidate / RTCSessionDescription /
 * navigator.mediaDevices lên global. Nhờ đúng bước này mà `shareCamera()` viết
 * cho trình duyệt chạy nguyên xi ở đây — không có bản WebRTC thứ hai để lệch.
 *
 * Gọi ở cấp module, TRƯỚC khi bất kỳ component nào dùng tới.
 */
registerGlobals();

export interface ShareState {
  /** Số người đang trong room (theo presence). */
  count: number;
  connState: RTCPeerConnectionState | null;
  /** Chỉ có khi camera đang thật sự bật, tức là đã có người vào xem. */
  localStream: MediaStream | null;
  error: string | null;
}

const IDLE: ShareState = {
  count: 0,
  connState: null,
  localStream: null,
  error: null,
};

/**
 * Nửa "bên chia sẻ" của cuộc gọi, bám sát `CallProvider` bên web để hai bên cư
 * xử giống nhau — xem docs/signaling.md.
 *
 * Điểm quan trọng giữ nguyên từ bản web: **camera chỉ bật khi có người trong
 * room** (presence >= 2). Còn một mình thì vẫn ở trong room nhưng tắt cam, để
 * không bao giờ có luồng camera chạy mà không ai xem.
 */
export function useShare(myEmail: string) {
  const [state, setState] = useState<ShareState>(IDLE);
  const [sharing, setSharing] = useState(false);

  const ctxRef = useRef<{ callId: string; email: string; quality: Quality } | null>(null);
  const captureRef = useRef<{ handle: ShareSession; stream: MediaStream } | null>(null);
  const presenceRef = useRef<Presence | null>(null);
  const countUnsubRef = useRef<Unsubscribe | null>(null);
  const startingRef = useRef(false);
  // uuid cuộc gọi CallKit đang giữ app sống dưới nền.
  const callUuidRef = useRef<string | null>(null);

  const startCapture = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || captureRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const q = QUALITY[ctx.quality];
      // Chọn ĐÚNG cam trước bằng deviceId (xem pickCameraId) — nếu để facingMode
      // thì iPhone 15 và 16 vớ phải ống kính khác nhau.
      const camId = await pickCameraId("user");
      const stream = (await mediaDevices.getUserMedia({
        video: {
          ...(camId ? { deviceId: camId } : { facingMode: "user" }),
          width: { ideal: q.width },
          height: { ideal: q.height },
          // Khớp với DEFAULT_FPS bên shareCamera: lệch thì lần đổi fps đầu tiên
          // của người xem trông như không có tác dụng.
          frameRate: { ideal: DEFAULT_FPS },
        },
        // KHÔNG lấy mic ở đây. Mic do NGƯỜI XEM bật (cờ wantAudio); shareCamera
        // thêm/gỡ track mic theo cờ đó. Mặc định im lặng, mic không hề active.
        audio: false,
      })) as unknown as MediaStream;

      const handle = await shareCamera({
        callId: ctx.callId,
        myEmail: ctx.email,
        stream,
        quality: ctx.quality,
        fps: DEFAULT_FPS,
        deviceId: camId, // để zoom biết chỉnh camera nào
        onState: (connState) => setState((s) => ({ ...s, connState })),
        // Người xem chỉnh zoom → áp thẳng videoZoomFactor lên camera đang quay.
        onZoom: (deviceId, factor) => setCameraZoom(deviceId, factor),
        // Người xem khoá/mở nét ở tâm.
        onFocus: (deviceId, locked) => setCameraFocus(deviceId, locked),
      });
      captureRef.current = { handle, stream };
      setState((s) => ({ ...s, localStream: stream, error: null }));
      // PiP giữ-nền đã bật từ lúc start() (không phụ thuộc camera) — xem start().
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (!captureRef.current) return;
    captureRef.current.handle.stop();
    captureRef.current.stream.getTracks().forEach((t) => t.stop());
    captureRef.current = null;
    // KHÔNG tắt PiP ở đây: người xem rời (còn một mình) thì vẫn phải GIỮ app sống
    // dưới nền để bắt được lúc họ vào lại. PiP chỉ tắt khi tắt hẳn LIVE (stop()).
    setState((s) => ({ ...s, localStream: null, connState: null }));
  }, []);

  const stop = useCallback(() => {
    stopCapture();
    presenceRef.current?.stop();
    presenceRef.current = null;
    countUnsubRef.current?.();
    countUnsubRef.current = null;
    ctxRef.current = null;
    // Kết thúc cuộc gọi CallKit + tắt PiP giữ-nền.
    if (callUuidRef.current) {
      endKeepAliveCall(callUuidRef.current);
      callUuidRef.current = null;
    }
    stopKeepAlivePip();
    setSharing(false);
    setState(IDLE);
  }, [stopCapture]);

  const start = useCallback(
    // Mặc định 1080p (4:3) cho nét — người xem hạ được nếu mạng yếu.
    (callId: string, quality: Quality = "1080p") => {
      const email = myEmail.toLowerCase();
      const other = callId.split("__").find((e) => e !== email) ?? "người xem";
      ctxRef.current = { callId, email, quality };
      setSharing(true);
      setState({ ...IDLE, count: 1 });

      void other;

      // BẬT PiP GIỮ-NỀN NGAY khi bật LIVE (không đợi camera). PiP dùng nội dung ảnh
      // chạy bằng timer nên KHÔNG cần camera — nhờ vậy dù đang MỘT MÌNH và đã thoát
      // app xuống nền, app vẫn sống để bắt được lúc người xem vào rồi mới bật camera.
      // Truyền "" = không có track camera → ô PiP hiện ảnh feed (PipLogoContent).
      startKeepAlivePip("");

      // Camera CHỈ bật khi có người xem (>= 2 người) — không bao giờ có luồng camera
      // chạy mà không ai xem. Người xem rời (count về 1) thì tắt cam, nhưng PiP vẫn
      // giữ để app sống dưới nền chờ họ vào lại.
      presenceRef.current = enterRoom(callId, email);
      countUnsubRef.current = watchRoomCount(callId, (count) => {
        setState((s) => ({ ...s, count }));
        if (count >= 2) void startCapture();
        else stopCapture();
      });
    },
    [myEmail, startCapture, stopCapture],
  );

  // Người dùng bấm "Kết thúc" trên giao diện CallKit (màn khoá / viên thuốc xanh)
  // → dừng chia sẻ theo, đừng để luồng camera treo lại.
  useEffect(() => onSystemEndCall(() => stop()), [stop]);

  // Rời màn hình / đóng app giữa chừng thì cắt sạch, đừng để luồng camera treo lại.
  useEffect(() => stop, [stop]);

  return { state, sharing, start, stop };
}
