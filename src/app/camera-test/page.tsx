"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Trang test camera: bấm một lần là xin quyền rồi hiện hình ngay.
 *
 * Cố ý KHÔNG dùng popup giả hay bật lén — trình duyệt hiện hộp xin quyền thật,
 * người dùng thấy rõ camera đang bật (đèn báo của máy sáng). Đủ để test nhanh
 * camera + quyền chạy được trên từng máy.
 */
export default function CameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "asking" | "on" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  async function start() {
    // Đặt trạng thái NGAY khi chạm, trước mọi await. Chạm mà chữ đổi thành
    // "đang xin quyền" tức là JS sống và nút gắn sự kiện ổn.
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("on");
    } catch (e) {
      // Hiện thẳng tên + nội dung lỗi để chẩn được trên máy thật. Thường gặp:
      // NotAllowedError (từ chối quyền), NotFoundError (không có camera),
      // TypeError (không phải secure context).
      const err = e as { name?: string; message?: string };
      const name = err?.name;
      const detail = `${name ?? "Lỗi"}: ${err?.message ?? "không rõ"}`;
      setError(
        name === "NotAllowedError"
          ? `Bạn đã từ chối quyền camera. Vào Cài đặt → Safari → Camera cho phép trang này rồi thử lại.\n[${detail}]`
          : name === "NotFoundError"
            ? `Không tìm thấy camera trên máy này.\n[${detail}]`
            : detail,
      );
      setState("error");
    }
  }

  // Tắt stream khi rời trang để đèn camera không sáng dai dẳng.
  useEffect(() => stop, [stop]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Test camera</h1>

      <p className="text-muted text-center text-xs">trạng thái: {state}</p>

      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black/80">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </div>

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
          Tắt camera
        </button>
      ) : (
        <button
          onClick={() => void start()}
          disabled={state === "asking"}
          className="bg-expense rounded-xl px-6 py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {state === "asking" ? "Đang xin quyền…" : "Bật camera"}
        </button>
      )}
    </main>
  );
}
