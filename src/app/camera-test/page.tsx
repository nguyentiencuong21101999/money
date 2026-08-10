"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlipCameraIcon } from "@/components/icons";

type Facing = "user" | "environment";

/**
 * Trang test camera + mic: bấm một lần là xin quyền rồi hiện hình ngay, có nút
 * đổi camera trước/sau và một thanh đo mức âm để biết mic có ăn không.
 *
 * Cố ý KHÔNG dùng popup giả hay bật lén — trình duyệt hiện hộp xin quyền thật,
 * người dùng thấy rõ camera/mic đang bật (đèn báo của máy sáng). Đủ để test
 * nhanh camera + mic + quyền chạy được trên từng máy.
 */
export default function CameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Web Audio để đo mức mic; giữ ref để dọn đúng khi tắt.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [state, setState] = useState<"idle" | "asking" | "on" | "error">(
    "idle",
  );
  const [facing, setFacing] = useState<Facing>("user");
  const [level, setLevel] = useState(0); // 0..1, mức âm mic hiện tại
  const [error, setError] = useState<string | null>(null);

  // Dựng bộ đo mức âm từ track mic của stream. Đọc dạng sóng theo từng khung
  // hình, tính RMS rồi đẩy vào `level` để vẽ thanh.
  const meterAudio = useCallback((stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume(); // Safari khởi tạo ở trạng thái "suspended".
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    // Cố ý KHÔNG nối analyser -> ctx.destination: không phát tiếng ra loa,
    // tránh hú (mic thu lại tiếng loa). Chỉ đo, không nghe.

    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const x = (v - 128) / 128; // về [-1, 1]
        sum += x * x;
      }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 3)); // nhân lên cho dễ thấy
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLevel(0);
    setState("idle");
  }, []);

  // Mở stream theo mặt camera yêu cầu. Tách riêng để cả nút "Bật" lẫn nút đổi
  // cam đều dùng chung, và luôn dọn stream + audio cũ trước khi mở cái mới —
  // nếu không camera/mic trước vẫn giữ máy, cái sau xin không được.
  const open = useCallback(
    async (want: Facing) => {
      setError(null);
      setState("asking");
      try {
        // Safari iOS ẩn hẳn mediaDevices khi trang không phải "secure context"
        // (http qua IP LAN). Bắt riêng để báo cho đúng, không thì bấm nút là
        // TypeError khó hiểu.
        if (!window.isSecureContext) {
          throw new Error(
            "Trang không phải HTTPS (isSecureContext = false). Safari chặn camera.",
          );
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Trình duyệt không cấp mediaDevices.getUserMedia ở ngữ cảnh này.",
          );
        }

        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: want },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        meterAudio(stream);
        setFacing(want);
        setState("on");
      } catch (e) {
        // Hiện thẳng tên + nội dung lỗi để chẩn được trên máy thật. Thường gặp:
        // NotAllowedError (từ chối quyền), NotFoundError (không có thiết bị),
        // TypeError (không phải secure context), OverconstrainedError (máy không
        // có mặt camera vừa yêu cầu).
        const err = e as { name?: string; message?: string };
        const name = err?.name;
        const detail = `${name ?? "Lỗi"}: ${err?.message ?? "không rõ"}`;
        setError(
          name === "NotAllowedError"
            ? `Bạn đã từ chối quyền camera/mic. Vào Cài đặt → Safari → Camera & Micrô cho phép trang này rồi thử lại.\n[${detail}]`
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? `Không tìm thấy camera/mic phù hợp trên máy này.\n[${detail}]`
              : detail,
        );
        setState("error");
      }
    },
    [meterAudio],
  );

  // Đổi mặt camera. Chỉ có nghĩa khi đang bật; máy tính thường chỉ một camera
  // nên đổi sang "environment" có thể lại rơi về camera trước — vô hại.
  function flip() {
    void open(facing === "user" ? "environment" : "user");
  }

  // Tắt stream khi rời trang để đèn camera/mic không sáng dai dẳng.
  useEffect(() => stop, [stop]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Test camera &amp; mic</h1>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black/80">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Nút đổi cam nổi trên khung hình, chỉ hiện khi camera đang chạy. */}
        {state === "on" && (
          <button
            type="button"
            onClick={flip}
            aria-label="Chuyển camera trước/sau"
            className="absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition active:scale-[0.94]"
          >
            <FlipCameraIcon size={22} />
          </button>
        )}
      </div>

      {/* Thanh đo mức mic: nói vào mic thì thanh chạy — chứng tỏ mic ăn. */}
      {state === "on" && (
        <div className="w-full">
          <p className="text-muted mb-1 text-center text-xs">
            Mức mic (nói thử xem thanh có chạy không)
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="bar-fill h-full rounded-full transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-expense text-center text-sm whitespace-pre-line">
          {error}
        </p>
      )}

      {state === "on" ? (
        <button
          onClick={stop}
          className="rounded-xl bg-black/10 px-6 py-3 font-medium transition active:scale-[0.98]"
        >
          Tắt camera &amp; mic
        </button>
      ) : (
        <button
          onClick={() => void open("user")}
          disabled={state === "asking"}
          className="bg-expense rounded-xl px-6 py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {state === "asking" ? "Đang xin quyền…" : "Bật camera & mic"}
        </button>
      )}
    </main>
  );
}
