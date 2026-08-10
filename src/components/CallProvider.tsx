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
  enterRoom,
  QUALITY,
  requestFacing,
  requestQuality,
  shareCamera,
  viewRoom,
  watchRoomCount,
  type Presence,
  type Quality,
  type ShareSession,
  type ViewSession,
} from "@/lib/call";
import type { Unsubscribe } from "firebase/firestore";

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
  // Room + mặt cam hiện tại của bên xem, để nút "Đổi cam" gửi yêu cầu.
  const viewCallIdRef = useRef<string | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  // Bên chia sẻ: chỉ bật cam khi có người vào room. Giữ ngữ cảnh để bật khi
  // presence >= 2, camera đang chạy giữ ở captureRef.
  const roleRef = useRef<"sharer" | "viewer" | null>(null);
  const shareCtxRef = useRef<{ callId: string; email: string; quality: Quality } | null>(null);
  const captureRef = useRef<{ handle: ShareSession; stream: MediaStream } | null>(null);
  const startingRef = useRef(false);

  // Bật camera thật + bắt đầu signaling. Gọi khi có người vào room.
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

  // Tắt camera khi còn một mình (giữ mặt trong room, chờ người vào lại).
  const stopCapture = useCallback(() => {
    captureRef.current?.handle.stop();
    captureRef.current?.stream.getTracks().forEach((t) => t.stop());
    captureRef.current = null;
    setCall((c) => (c ? { ...c, localStream: null, connState: null } : c));
  }, []);

  // Đếm người trong room + đánh dấu mình đang ở đó. Bên chia sẻ: >=2 mới bật cam.
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

  const share = useCallback(
    async (callId: string, quality: Quality = "720p") => {
      if (!user?.email) throw new Error("Cần đăng nhập.");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trang phải chạy trên HTTPS thì mới bật được camera.");
      }
      // Xin quyền một nhịp NGAY trong cú bấm (iOS cần cử chỉ cho lần đầu), rồi
      // tắt liền: chưa có ai xem thì KHÔNG giữ camera, màn hình đen. Cam chỉ bật
      // khi presence >= 2 (xem trackPresence).
      const primer = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      primer.getTracks().forEach((t) => t.stop());

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
      value={{ call, share, view, switchCamera, switchQuality, hangUp }}
    >
      {children}
      <FloatingCall
        call={call}
        onHangUp={hangUp}
        onSwitchCamera={switchCamera}
        onSwitchQuality={switchQuality}
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
 * Khung video nổi, hiện ở mọi trang khi có cuộc gọi. Với bên chia sẻ hiện camera
 * của chính họ kèm chữ "Đang chia sẻ camera với …" — dấu hiệu luôn thấy để
 * không bao giờ quên mình đang phát.
 */
function FloatingCall({
  call,
  onHangUp,
  onSwitchCamera,
  onSwitchQuality,
}: {
  call: CallState | null;
  onHangUp: () => void;
  onSwitchCamera: () => void;
  onSwitchQuality: (quality: Quality) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSharer = call?.role === "sharer";
  const stream = isSharer ? call?.localStream : call?.remoteStream;
  // Bên xem bắt đầu ở trạng thái tắt tiếng để iOS chịu tự phát; chạm để bật.
  const [soundOn, setSoundOn] = useState(false);
  // Bên xem mặc định toàn màn hình; thu nhỏ về khung nổi nếu muốn vừa xem vừa
  // dùng app.
  const [minimized, setMinimized] = useState(false);
  const muted = isSharer || !soundOn;

  function toggleSound() {
    if (isSharer) return;
    const el = videoRef.current;
    const next = !soundOn;
    setSoundOn(next);
    if (el) {
      el.muted = !next;
      // play() trong cú chạm mới được iOS cho phát KÈM tiếng.
      void el.play().catch(() => {});
    }
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Hết stream (bên kia dừng) → xoá khung, không để đứng hình cũ.
    if (!stream) {
      el.srcObject = null;
      return;
    }
    // Gắn lại srcObject + phát. Safari chặn tự phát video CÓ TIẾNG khi không có
    // cú bấm trực tiếp → thử phát, bị chặn thì mute rồi phát lại (thấy hình,
    // tạm mất tiếng).
    const attach = () => {
      el.srcObject = stream;
      el.play().catch(() => {
        el.muted = true;
        void el.play().catch(() => {});
      });
    };
    attach();
    // Track video của bên kia thường tới SAU khi gán srcObject; nghe addtrack để
    // gắn lại, không thì Safari cứ đen hình.
    stream.addEventListener("addtrack", attach);
    return () => stream.removeEventListener("addtrack", attach);
    // `minimized` trong deps: đổi chế độ làm video remount, phải gắn lại srcObject.
  }, [stream, minimized]);

  if (!call) return null;

  const label = isSharer
    ? call.localStream
      ? `Đang chia sẻ camera với ${call.peerName}`
      : `Chờ ${call.peerName} vào room mới bật cam`
    : call.remoteStream
      ? `Đang xem camera của ${call.peerName}`
      : `Chưa có ai trong room (${call.peerName})`;

  const video = (
    <video
      ref={videoRef}
      playsInline
      autoPlay
      muted={muted}
      className="h-full w-full object-contain"
    />
  );
  const liveBadge = (
    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-critical/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      {isSharer ? (call.localStream ? "Đang chia sẻ" : "Đang chờ") : "LIVE"}
    </span>
  );
  const countBadge = (
    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
      {call.count} trong room
    </span>
  );

  // Bên xem, toàn màn hình.
  if (!isSharer && !minimized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div
          onClick={toggleSound}
          className="relative flex-1 cursor-pointer overflow-hidden"
        >
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
          {/* Chọn chất lượng: gửi yêu cầu, bên chia sẻ áp ngay. */}
          {call.remoteStream && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1.5 left-1/2 flex -translate-x-1/2 gap-1"
            >
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
          )}
          {call.remoteStream && !soundOn && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              🔇 Chạm để bật tiếng
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-black/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-white/60">{stateLabel(call.connState)}</p>
          </div>
          {call.remoteStream && (
            <button
              type="button"
              onClick={onSwitchCamera}
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

  // Khung nổi nhỏ: bên chia sẻ, hoặc bên xem đã thu nhỏ.
  return (
    <div className="fixed right-3 bottom-3 z-50 w-44 overflow-hidden rounded-2xl bg-black/85 shadow-lg">
      <div
        onClick={isSharer ? undefined : () => setMinimized(false)}
        className={`relative aspect-3/4 w-full bg-black ${
          isSharer ? "" : "cursor-pointer"
        }`}
      >
        {video}
        {liveBadge}
        {countBadge}
        {!isSharer && (
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            Chạm để mở to
          </span>
        )}
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
