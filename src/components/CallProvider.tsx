"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_FPS,
  enterRoom,
  clampFps,
  FPS_CHOICES,
  FPS_MAX,
  FPS_MIN,
  QUALITY,
  requestAudio,
  requestCamera,
  requestFacing,
  requestFocus,
  requestFps,
  requestQuality,
  requestZoom,
  shareCamera,
  viewRoom,
  watchRoomCount,
  type CallStats,
  type CameraInfo,
  type Fps,
  type Presence,
  type Quality,
  type ShareSession,
  type ViewSession,
} from "@/lib/call";
import type { Unsubscribe } from "firebase/firestore";
import { SpeakerIcon } from "./icons";

/**
 * Lớp "cuộc gọi toàn app". Đặt ở layout gốc nên kết nối WebRTC sống xuyên suốt
 * khi người dùng chuyển màn — vừa xem chi tiêu vừa còn cuộc gọi. Khung nổi
 * (FloatingCall) luôn hiện dấu "đang chia sẻ / đang xem" + nút Dừng ở MỌI
 * trang: cố ý để không bao giờ có luồng camera chạy nền mà người dùng không
 * thấy.
 */
interface CallState {
  role: "sharer" | "viewer";
  peerName: string;
  connState: RTCPeerConnectionState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Số người đang trong room (theo presence). */
  count: number;
  /** Chất lượng người xem đang yêu cầu (để tô nút). */
  quality: Quality;
  /** Nhịp quay người xem đang yêu cầu (để tô nút). */
  fps: Fps;
  /** Danh sách camera bên chia sẻ công bố (để người xem chọn ống kính). */
  cameras?: CameraInfo[];
  /** deviceId camera đang chọn (để tô nút). */
  cameraId?: string;
  /** Số liệu luồng đang nhận (chỉ bên xem), cập nhật mỗi giây. */
  stats?: CallStats | null;
}

interface CallContext {
  call: CallState | null;
  /** Bật camera của mình vào room (bên chia sẻ). Mặc định 720p. */
  share: (callId: string, quality?: Quality) => Promise<void>;
  /** Vào room để xem (bên xem). */
  view: (callId: string) => Promise<void>;
  /** Người xem yêu cầu bên chia sẻ đổi cam trước/sau. */
  switchCamera: () => void;
  /** Người xem yêu cầu bên chia sẻ đổi chất lượng. */
  switchQuality: (quality: Quality) => void;
  /** Người xem yêu cầu bên chia sẻ đổi nhịp quay (đánh đổi mượt ↔ nét). */
  switchFps: (fps: Fps) => void;
  /** Người xem bật/tắt MIC của bên chia sẻ (mặc định tắt). */
  setListen: (on: boolean) => void;
  /** Người xem chọn ống kính (theo deviceId trong call.cameras). */
  setCamera: (deviceId: string) => void;
  /** Người xem chỉnh zoom camera bên chia sẻ (1 = không zoom). */
  setZoom: (factor: number) => void;
  /** Người xem khoá/mở nét ở tâm camera bên chia sẻ. */
  setFocus: (locked: boolean) => void;
  hangUp: () => void;
}

const Ctx = createContext<CallContext | null>(null);

export function useCall(): CallContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCall phải nằm trong <CallProvider>");
  return ctx;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [call, setCall] = useState<CallState | null>(null);
  const handleRef = useRef<ShareSession | ViewSession | null>(null);
  const presenceRef = useRef<Presence | null>(null);
  const countUnsubRef = useRef<Unsubscribe | null>(null);
  // Room hiện tại của bên xem, để nút "Đổi cam" / chất lượng gửi yêu cầu.
  const viewCallIdRef = useRef<string | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  // Bên chia sẻ: chỉ bật cam khi có người vào room. Quyền đã xin sẵn lúc bấm,
  // camera thật giữ ở captureRef, bật/tắt theo presence.
  const roleRef = useRef<"sharer" | "viewer" | null>(null);
  const shareCtxRef = useRef<{ callId: string; email: string; quality: Quality } | null>(null);
  const captureRef = useRef<{ handle: ShareSession; stream: MediaStream } | null>(null);
  const startingRef = useRef(false);

  // Bật camera thật + signaling khi có người trong room.
  const startCapture = useCallback(async () => {
    const ctx = shareCtxRef.current;
    if (!ctx || captureRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const q = QUALITY[ctx.quality];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: q.width },
          height: { ideal: q.height },
          frameRate: { ideal: 24 },
        },
        audio: true,
      });
      const handle = await shareCamera({
        callId: ctx.callId,
        myEmail: ctx.email,
        stream,
        quality: ctx.quality,
        onState: (connState) => setCall((c) => (c ? { ...c, connState } : c)),
      });
      captureRef.current = { handle, stream };
      setCall((c) => (c ? { ...c, localStream: stream } : c));
    } catch (e) {
      console.error("[call] bật cam lỗi", e);
    } finally {
      startingRef.current = false;
    }
  }, []);

  // Còn một mình → tắt cam, giữ mặt trong room chờ người vào lại.
  const stopCapture = useCallback(() => {
    captureRef.current?.handle.stop();
    captureRef.current?.stream.getTracks().forEach((t) => t.stop());
    captureRef.current = null;
    setCall((c) => (c ? { ...c, localStream: null, connState: null } : c));
  }, []);

  const trackPresence = useCallback(
    (callId: string, email: string) => {
      presenceRef.current = enterRoom(callId, email);
      countUnsubRef.current = watchRoomCount(callId, (count) => {
        setCall((c) => (c ? { ...c, count } : c));
        if (roleRef.current !== "sharer") return;
        if (count >= 2) void startCapture();
        else stopCapture();
      });
    },
    [startCapture, stopCapture],
  );

  const hangUp = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    captureRef.current?.handle.stop();
    captureRef.current?.stream.getTracks().forEach((t) => t.stop());
    captureRef.current = null;
    shareCtxRef.current = null;
    roleRef.current = null;
    presenceRef.current?.stop();
    presenceRef.current = null;
    countUnsubRef.current?.();
    countUnsubRef.current = null;
    viewCallIdRef.current = null;
    facingRef.current = "user";
    setCall(null);
  }, []);

  const switchCamera = useCallback(() => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    void requestFacing(cid, facingRef.current);
  }, []);

  const switchQuality = useCallback((quality: Quality) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    setCall((c) => (c ? { ...c, quality } : c));
    void requestQuality(cid, quality);
  }, []);

  const switchFps = useCallback((fps: Fps) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    setCall((c) => (c ? { ...c, fps } : c));
    void requestFps(cid, fps);
  }, []);

  const setListen = useCallback((on: boolean) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    void requestAudio(cid, on);
  }, []);

  const setCamera = useCallback((deviceId: string) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    setCall((c) => (c ? { ...c, cameraId: deviceId } : c));
    void requestCamera(cid, deviceId);
  }, []);

  const setZoom = useCallback((factor: number) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    void requestZoom(cid, factor);
  }, []);

  const setFocus = useCallback((locked: boolean) => {
    const cid = viewCallIdRef.current;
    if (!cid) return;
    void requestFocus(cid, locked);
  }, []);

  const share = useCallback(
    async (callId: string, quality: Quality = "720p") => {
      if (!user?.email) throw new Error("Cần đăng nhập.");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trang phải chạy trên HTTPS thì mới bật được camera.");
      }
      // Kiểm quyền TRƯỚC bằng Permissions API — không đụng tới camera. Nếu ĐÃ
      // cấp quyền thì khỏi "chớp" gì cả: cam chỉ bật khi có người vào room. Chỉ
      // khi CHƯA cấp (hoặc trình duyệt không cho kiểm) mới phải xin một nhịp
      // trong cú bấm này rồi tắt liền (iOS cần cử chỉ cho lần xin quyền đầu).
      let granted = false;
      try {
        const status = await navigator.permissions?.query({
          name: "camera" as PermissionName,
        });
        granted = status?.state === "granted";
      } catch {
        // Safari cũ / không hỗ trợ query "camera" → coi như chưa biết, đi xin.
      }
      if (!granted) {
        const primer = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        primer.getTracks().forEach((t) => t.stop());
      }

      const email = user.email.toLowerCase();
      const viewerEmail =
        callId.split("__").find((e) => e !== email) ?? "người xem";
      shareCtxRef.current = { callId, email, quality };
      roleRef.current = "sharer";
      setCall({
        role: "sharer",
        peerName: viewerEmail,
        connState: null,
        localStream: null,
        remoteStream: null,
        count: 1,
        quality,
        fps: DEFAULT_FPS,
      });
      trackPresence(callId, email);
    },
    [user, trackPresence],
  );

  const view = useCallback(
    async (callId: string) => {
      if (!user?.email) throw new Error("Cần đăng nhập.");
      roleRef.current = "viewer";
      const handle = await viewRoom({
        callId,
        myEmail: user.email,
        onState: (connState) => setCall((c) => (c ? { ...c, connState } : c)),
        onRemoteStream: (remoteStream) =>
          setCall((c) => (c ? { ...c, remoteStream } : c)),
        onCameras: (cameras) => setCall((c) => (c ? { ...c, cameras } : c)),
        onStats: (stats) => setCall((c) => (c ? { ...c, stats } : c)),
      });
      handleRef.current = handle;
      viewCallIdRef.current = callId;
      facingRef.current = "user";
      setCall({
        role: "viewer",
        peerName: handle.sharerEmail,
        connState: null,
        localStream: null,
        remoteStream: null,
        count: 1,
        quality: "720p",
        fps: DEFAULT_FPS,
      });
      trackPresence(callId, user.email);
    },
    [user, trackPresence],
  );

  // Đăng xuất giữa cuộc gọi thì cắt luôn, đừng để luồng camera treo lại. Đây là
  // dọn dẹp theo hệ thống ngoài (WebRTC + stream) khi phiên đổi.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!user) hangUp();
  }, [user, hangUp]);

  return (
    <Ctx.Provider
      value={{
        call,
        share,
        view,
        switchCamera,
        switchQuality,
        switchFps,
        setListen,
        setCamera,
        setZoom,
        setFocus,
        hangUp,
      }}
    >
      {children}
      <FloatingCall
        call={call}
        onHangUp={hangUp}
        onSwitchCamera={switchCamera}
        onSwitchQuality={switchQuality}
        onSwitchFps={switchFps}
        onSetListen={setListen}
        onSetCamera={setCamera}
        onSetZoom={setZoom}
      />
    </Ctx.Provider>
  );
}

function stateLabel(s: RTCPeerConnectionState | null): string {
  switch (s) {
    case "connected":
      return "Đã kết nối";
    case "connecting":
      return "Đang kết nối…";
    case "disconnected":
      return "Mất kết nối";
    case "failed":
      return "Kết nối thất bại (mạng chặt, cần TURN)";
    default:
      return "Đang chờ…";
  }
}

/**
 * Chọn khung theo vai: client (chia sẻ) và manager (xem) có giao diện riêng.
 */
function FloatingCall({
  call,
  onHangUp,
  onSwitchCamera,
  onSwitchQuality,
  onSwitchFps,
  onSetListen,
  onSetCamera,
  onSetZoom,
}: {
  call: CallState | null;
  onHangUp: () => void;
  onSwitchCamera: () => void;
  onSwitchQuality: (quality: Quality) => void;
  onSwitchFps: (fps: Fps) => void;
  onSetListen: (on: boolean) => void;
  onSetCamera: (deviceId: string) => void;
  onSetZoom: (factor: number) => void;
}) {
  if (!call) return null;
  if (call.role === "sharer") {
    return <SharerWidget call={call} onHangUp={onHangUp} />;
  }
  return (
    <ViewerWidget
      call={call}
      onHangUp={onHangUp}
      onSwitchCamera={onSwitchCamera}
      onSwitchQuality={onSwitchQuality}
      onSwitchFps={onSwitchFps}
      onSetListen={onSetListen}
      onSetCamera={onSetCamera}
      onSetZoom={onSetZoom}
    />
  );
}

/**
 * Khung nổi nhỏ của NGƯỜI CHIA SẺ (client): hiện camera của chính mình, dấu
 * "đang chia sẻ / đang chờ" + nút Dừng. Camera chỉ bật khi có người vào room
 * (localStream mới có), còn một mình thì đen + "đang chờ".
 */
function SharerWidget({
  call,
  onHangUp,
}: {
  call: CallState;
  onHangUp: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = call.localStream;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    const attach = () => {
      el.srcObject = stream;
      void el.play().catch(() => {});
    };
    attach();
    stream.addEventListener("addtrack", attach);
    return () => stream.removeEventListener("addtrack", attach);
  }, [stream]);

  const waiting = !stream;
  return (
    <div className="fixed right-3 bottom-3 z-50 w-44 overflow-hidden rounded-2xl bg-black/85 shadow-lg">
      <div className="relative aspect-3/4 w-full bg-black">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="h-full w-full object-contain"
        />
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-critical/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          {waiting ? "Đang chờ" : "Đang chia sẻ"}
        </span>
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {call.count} trong room
        </span>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium text-white">
          {waiting
            ? `Chờ ${call.peerName} vào room mới bật cam`
            : `Đang chia sẻ camera với ${call.peerName}`}
        </p>
        <p className="text-[10px] text-white/60">{stateLabel(call.connState)}</p>
        <button
          type="button"
          onClick={onHangUp}
          className="mt-1 w-full rounded-lg bg-white/15 py-1 text-[11px] font-medium text-white transition active:scale-[0.97]"
        >
          Dừng
        </button>
      </div>
    </div>
  );
}

/**
 * Khung của NGƯỜI XEM (manager): mặc định toàn màn hình — có đổi cam, đổi chất
 * lượng, zoom số, nút loa bật/tắt tiếng ở thanh dưới; bấm "Thu nhỏ" về khung
 * nổi để vừa xem vừa dùng app.
 */
function ViewerWidget({
  call,
  onHangUp,
  onSwitchCamera,
  onSwitchQuality,
  onSwitchFps,
  onSetListen,
  onSetCamera,
  onSetZoom,
}: {
  call: CallState;
  onHangUp: () => void;
  onSwitchCamera: () => void;
  onSwitchQuality: (quality: Quality) => void;
  onSwitchFps: (fps: Fps) => void;
  onSetListen: (on: boolean) => void;
  onSetCamera: (deviceId: string) => void;
  onSetZoom: (factor: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Bắt đầu tắt tiếng để iOS chịu tự phát; chạm để bật.
  const [soundOn, setSoundOn] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Mức zoom hiện tại (chỉ để hiện nhãn + gửi yêu cầu). Zoom THẬT do bên chia sẻ
  // áp bằng videoZoomFactor (nét), không phóng CSS ở đây nữa. `zoomText` là ô nhập
  // để gõ số lẻ (vd 3.6) trong lúc đang gõ chưa chuẩn hoá.
  const [zoom, setZoomState] = useState(1);
  const [zoomText, setZoomText] = useState("1");
  // Ô gõ fps: giữ chuỗi trong lúc gõ, chuẩn hoá khi rời ô.
  const [fpsText, setFpsText] = useState(String(call.fps));
  const applyFps = (n: number) => {
    const v = clampFps(n);
    setFpsText(String(v));
    onSwitchFps(v);
  };
  const applyZoom = (factor: number) => {
    // Kẹp tối thiểu 1x, làm tròn 1 số lẻ. Trần thật do máy chia sẻ tự kẹp theo
    // maxAvailableVideoZoomFactor của ống kính.
    const v = Math.max(1, +factor.toFixed(1));
    setZoomState(v);
    setZoomText(String(v));
    onSetZoom(v);
  };
  // Đổi ống kính → zoom mỗi cam là riêng, nên reset cho cam mới.
  const pickCamera = (deviceId: string) => {
    onSetCamera(deviceId);
    applyZoom(1);
  };
  const stream = call.remoteStream;

  function toggleSound() {
    const el = videoRef.current;
    const next = !soundOn;
    setSoundOn(next);
    if (el) {
      el.muted = !next;
      void el.play().catch(() => {});
    }
    // Bật tiếng = xin bên chia sẻ MỞ MIC (họ mới thu âm); tắt = bảo họ gỡ mic.
    onSetListen(next);
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    const attach = () => {
      el.srcObject = stream;
      el.play().catch(() => {
        el.muted = true;
        void el.play().catch(() => {});
      });
    };
    attach();
    stream.addEventListener("addtrack", attach);
    return () => stream.removeEventListener("addtrack", attach);
    // `minimized` trong deps: đổi chế độ làm video remount, phải gắn lại srcObject.
  }, [stream, minimized]);

  const label = call.remoteStream
    ? `Đang xem camera của ${call.peerName}`
    : `Chưa có ai trong room (${call.peerName})`;

  const video = (
    <video
      ref={videoRef}
      playsInline
      autoPlay
      muted={!soundOn}
      className="h-full w-full object-contain"
    />
  );
  const liveBadge = (
    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-critical/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      LIVE
    </span>
  );
  const countBadge = (
    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
      {call.count} trong room
    </span>
  );

  // Toàn màn hình.
  if (!minimized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Không bắt chạm cả khung nữa: bật/tắt tiếng nằm ở nút loa thanh dưới,
            chạm nhầm vào hình không còn mở mic bên kia. */}
        <div className="relative flex-1 overflow-hidden">
          {call.remoteStream ? (
            video
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/70">
              Chưa có ai trong room — {call.peerName} chưa chia sẻ. Khi họ bật
              camera, hình sẽ tự hiện.
            </div>
          )}
          {liveBadge}
          {countBadge}
          {/* Chọn chất lượng và nhịp quay: gửi yêu cầu, bên chia sẻ mở lại camera.
              Hai hàng này là một cặp đánh đổi — nhiều điểm ảnh hay nhiều khung,
              cùng ăn chung một lượng băng thông. */}
          {call.remoteStream && (
            <div className="absolute top-1.5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
              <div className="flex gap-1">
                {(["480p", "720p", "1080p"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSwitchQuality(q)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                      call.quality === q
                        ? "bg-white text-black"
                        : "bg-black/60 text-white"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {FPS_CHOICES.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => applyFps(f)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                      call.fps === f
                        ? "bg-white text-black"
                        : "bg-black/60 text-white"
                    }`}
                  >
                    {f}fps
                  </button>
                ))}
                {/* Gõ số bất kỳ (35, 40, 45…). Máy tự kẹp về dải format đỡ nổi. */}
                <input
                  type="number"
                  inputMode="numeric"
                  min={FPS_MIN}
                  max={FPS_MAX}
                  value={fpsText}
                  onChange={(e) => setFpsText(e.target.value)}
                  onBlur={() => applyFps(clampFps(parseInt(fpsText, 10) || call.fps))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-10 rounded-full bg-black/60 px-1 py-0.5 text-center text-[10px] font-medium text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {/* Zoom THẬT: bên chia sẻ chỉnh videoZoomFactor (nét hơn phóng CSS). */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyZoom(Math.max(1, +(zoom - 0.5).toFixed(1)))}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm font-semibold text-white"
                >
                  −
                </button>
                {/* Gõ số lẻ được (vd 3.6). Áp ngay khi gõ, chuẩn hoá khi rời ô. */}
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={0.1}
                  value={zoomText}
                  onChange={(e) => {
                    setZoomText(e.target.value);
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v >= 1) onSetZoom(+v.toFixed(1));
                  }}
                  onBlur={() => applyZoom(parseFloat(zoomText) || 1)}
                  className="w-12 rounded-full bg-black/60 px-1 py-0.5 text-center text-[10px] font-medium text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => applyZoom(Math.min(10, +(zoom + 0.5).toFixed(1)))}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm font-semibold text-white"
                >
                  +
                </button>
              </div>
            </div>
          )}
          {/* Chọn ống kính = ZOOM QUANG thật (đổi hẳn camera bên chia sẻ). */}
          {call.remoteStream && call.cameras && call.cameras.length > 1 && (
            <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1">
              {call.cameras.map((cam) => (
                <button
                  key={cam.deviceId}
                  type="button"
                  onClick={() => pickCamera(cam.deviceId)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    call.cameraId === cam.deviceId
                      ? "bg-white text-black"
                      : "bg-black/60 text-white"
                  }`}
                >
                  {cam.zoom}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 bg-black/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-white/60">
              {stateLabel(call.connState)}
              {/* Số liệu thật để phân biệt "thiếu băng thông" với "mất gói":
                  kbps thấp mà mất ≈ 0 → nén thô (ô vuông); mất > 0 kèm pli tăng
                  → gói rơi. Đoán bằng mắt hai cái này giống hệt nhau. */}
              {call.stats && (
                <span className="tabular-nums">
                  {" · "}
                  {call.stats.width}×{call.stats.height} · {call.stats.fps}fps ·{" "}
                  {call.stats.kbps} kbps ·{" "}
                  <span className={call.stats.loss > 1 ? "text-critical" : ""}>
                    mất {call.stats.loss.toFixed(1)}%
                  </span>{" "}
                  · pli {call.stats.pli}
                </span>
              )}
            </p>
          </div>
          {/* Bật tiếng = xin bên kia mở mic, nên để hẳn một nút có trạng thái
              rõ (sáng = đang nghe) thay vì chạm mù vào khung hình. */}
          {call.remoteStream && (
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Tắt tiếng" : "Bật tiếng"}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition active:scale-[0.97] ${
                soundOn ? "bg-white text-black" : "bg-white/15 text-white"
              }`}
            >
              <SpeakerIcon size={20} muted={!soundOn} />
            </button>
          )}
          {call.remoteStream && (
            <button
              type="button"
              onClick={() => {
                onSwitchCamera();
                applyZoom(1); // đổi cam → reset zoom về 1x
              }}
              className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97]"
            >
              Đổi cam
            </button>
          )}
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97]"
          >
            Thu nhỏ
          </button>
          <button
            type="button"
            onClick={onHangUp}
            className="bg-critical/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97]"
          >
            Dừng
          </button>
        </div>
      </div>
    );
  }

  // Đã thu nhỏ: khung nổi nhỏ, chạm để mở to lại.
  return (
    <div className="fixed right-3 bottom-3 z-50 w-44 overflow-hidden rounded-2xl bg-black/85 shadow-lg">
      <div
        onClick={() => setMinimized(false)}
        className="relative aspect-3/4 w-full cursor-pointer bg-black"
      >
        {video}
        {liveBadge}
        {countBadge}
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
          Chạm để mở to
        </span>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium text-white">{label}</p>
        <p className="text-[10px] text-white/60">{stateLabel(call.connState)}</p>
        <button
          type="button"
          onClick={onHangUp}
          className="mt-1 w-full rounded-lg bg-white/15 py-1 text-[11px] font-medium text-white transition active:scale-[0.97]"
        >
          Dừng
        </button>
      </div>
    </div>
  );
}
