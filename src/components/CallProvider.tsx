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
  shareCamera,
  viewRoom,
  watchRoomCount,
  type Presence,
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
}

interface CallContext {
  call: CallState | null;
  /** Bật camera của mình vào room (bên chia sẻ). */
  share: (callId: string) => Promise<void>;
  /** Vào room để xem (bên xem). */
  view: (callId: string) => Promise<void>;
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
  const localRef = useRef<MediaStream | null>(null);
  const presenceRef = useRef<Presence | null>(null);
  const countUnsubRef = useRef<Unsubscribe | null>(null);

  // Bắt đầu đếm số người trong room + đánh dấu mình đang ở đó.
  const trackPresence = useCallback((callId: string, email: string) => {
    presenceRef.current = enterRoom(callId, email);
    countUnsubRef.current = watchRoomCount(callId, (count) =>
      setCall((c) => (c ? { ...c, count } : c)),
    );
  }, []);

  const hangUp = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    presenceRef.current?.stop();
    presenceRef.current = null;
    countUnsubRef.current?.();
    countUnsubRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setCall(null);
  }, []);

  const share = useCallback(
    async (callId: string) => {
      if (!user?.email) throw new Error("Cần đăng nhập.");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trang phải chạy trên HTTPS thì mới bật được camera.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      localRef.current = stream;
      try {
        const handle = await shareCamera({
          callId,
          myEmail: user.email,
          stream,
          onState: (connState) => setCall((c) => (c ? { ...c, connState } : c)),
        });
        handleRef.current = handle;
        setCall({
          role: "sharer",
          peerName: handle.viewerEmail,
          connState: null,
          localStream: stream,
          remoteStream: null,
          count: 1,
        });
        trackPresence(callId, user.email);
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        localRef.current = null;
        throw e;
      }
    },
    [user, trackPresence],
  );

  const view = useCallback(
    async (callId: string) => {
      if (!user?.email) throw new Error("Cần đăng nhập.");
      const handle = await viewRoom({
        callId,
        myEmail: user.email,
        onState: (connState) => setCall((c) => (c ? { ...c, connState } : c)),
        onRemoteStream: (remoteStream) =>
          setCall((c) => (c ? { ...c, remoteStream } : c)),
      });
      handleRef.current = handle;
      setCall({
        role: "viewer",
        peerName: handle.sharerEmail,
        connState: null,
        localStream: null,
        remoteStream: null,
        count: 1,
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
    <Ctx.Provider value={{ call, share, view, hangUp }}>
      {children}
      <FloatingCall call={call} onHangUp={hangUp} />
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
}: {
  call: CallState | null;
  onHangUp: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSharer = call?.role === "sharer";
  const stream = isSharer ? call?.localStream : call?.remoteStream;
  // Bên xem bắt đầu ở trạng thái tắt tiếng để iOS chịu tự phát; chạm để bật.
  const [soundOn, setSoundOn] = useState(false);
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
  }, [stream]);

  if (!call) return null;

  const label = isSharer
    ? `Đang chia sẻ camera với ${call.peerName}`
    : call.remoteStream
      ? `Đang xem camera của ${call.peerName}`
      : `Chưa có ai trong room (${call.peerName})`;

  return (
    <div className="fixed right-3 bottom-3 z-50 w-44 overflow-hidden rounded-2xl bg-black/85 shadow-lg">
      <div
        onClick={toggleSound}
        className={`relative aspect-3/4 w-full bg-black ${
          !isSharer ? "cursor-pointer" : ""
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={muted}
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-critical/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          {isSharer ? "Đang chia sẻ" : "LIVE"}
        </span>
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {call.count} trong room
        </span>
        {/* Bên xem: nhắc chạm để bật tiếng khi đang có hình mà còn tắt tiếng. */}
        {!isSharer && call.remoteStream && !soundOn && (
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            🔇 Chạm để bật tiếng
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
