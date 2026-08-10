"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlipCameraIcon } from "@/components/icons";

type Facing = "user" | "environment";

/**
 * Trang test camera: bấm một lần là xin quyền rồi hiện hình ngay, có nút đổi
 * giữa camera trước ("user") và camera sau ("environment").
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
  const [facing, setFacing] = useState<Facing>("user");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  // Mở stream theo mặt camera yêu cầu. Tách riêng để cả nút "Bật" lẫn nút đổi
  // cam đều dùng chung, và luôn tắt stream cũ trước khi mở cái mới — nếu không
  // camera trước vẫn giữ máy, cái sau xin không được.
  const open = useCallback(async (want: Facing) => {
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

      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: want },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setFacing(want);
      setState("on");
    } catch (e) {
      // Hiện thẳng tên + nội dung lỗi để chẩn được trên máy thật. Thường gặp:
      // NotAllowedError (từ chối quyền), NotFoundError (không có camera),
      // TypeError (không phải secure context), OverconstrainedError (máy không
      // có mặt camera vừa yêu cầu).
      const err = e as { name?: string; message?: string };
      const name = err?.name;
      const detail = `${name ?? "Lỗi"}: ${err?.message ?? "không rõ"}`;
      setError(
        name === "NotAllowedError"
          ? `Bạn đã từ chối quyền camera. Vào Cài đặt → Safari → Camera cho phép trang này rồi thử lại.\n[${detail}]`
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? `Không tìm thấy camera phù hợp trên máy này.\n[${detail}]`
            : detail,
      );
      setState("error");
    }
  }, []);

  // Đổi mặt camera. Chỉ có nghĩa khi đang bật; máy tính thường chỉ một camera
  // nên đổi sang "environment" có thể lại rơi về camera trước — vô hại.
  function flip() {
    void open(facing === "user" ? "environment" : "user");
  }

  // Tắt stream khi rời trang để đèn camera không sáng dai dẳng.
  useEffect(() => stop, [stop]);

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Test camera</h1>

      <p className="text-muted text-center text-xs">
        trạng thái: {state} · mặt: {facing === "user" ? "trước" : "sau"}
      </p>

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
          onClick={() => void open("user")}
          disabled={state === "asking"}
          className="bg-expense rounded-xl px-6 py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {state === "asking" ? "Đang xin quyền…" : "Bật camera"}
        </button>
      )}
    </main>
  );
}
