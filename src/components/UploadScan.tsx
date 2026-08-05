"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { imageFromTransfer } from "@/lib/clipboard";
import { describeScanError, scanReceipt, type ScannedReceipt } from "@/lib/scan";
import { PhotoView } from "./PhotoView";

interface Props {
  onScanned: (scanned: ScannedReceipt) => void;
  /** Ảnh đang đính kèm — hiện ngay tại đây thay vì rơi xuống cuối form. */
  thumbnail?: string;
  onRemove: () => void;
}

export function UploadScan({ onScanned, thumbnail, onRemove }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  async function scan(file: File | null | undefined) {
    if (!file || working) return;
    setError(null);
    setWorking(true);
    try {
      onScanned(await scanReceipt(file, await user?.getIdToken()));
    } catch (e) {
      setError(describeScanError(e));
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Dán ảnh khi form đang mở. Dán chữ vào ô ghi chú vẫn hoạt động bình thường
  // vì imageFromTransfer trả null khi clipboard không chứa ảnh.
  // Không đặt dependency array: handler đọc state mới nhất ở mỗi lần render.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void scan(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <div>
      {/*
        KHÔNG dùng thuộc tính `capture`. Trên điện thoại nó ép mở thẳng camera
        và cắt mất lựa chọn lấy ảnh có sẵn — trong khi hoá đơn thường đã nằm
        trong thư viện dưới dạng ảnh chụp màn hình chuyển khoản.
        Bỏ đi thì hệ điều hành hiện đủ menu: Thư viện ảnh · Chụp ảnh · Chọn tệp.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => scan(e.target.files?.[0])}
      />
      {/* Đã có ảnh thì chính ô này hiện ảnh, không đẩy xuống cuối form —
          ảnh và nút đổi/bỏ nằm cùng chỗ vừa thao tác cho khỏi phải đi tìm. */}
      {thumbnail && !working ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void scan(imageFromTransfer(e.dataTransfer));
          }}
          className={`animate-rise flex items-center gap-3 rounded-xl border p-2.5 transition duration-200 ${
            dragging
              ? "border-expense bg-expense/20"
              : "border-expense/35 bg-expense/6 border-dashed"
          }`}
        >
          {/* Ảnh nhỏ 64px chỉ đủ nhận ra là hoá đơn nào — bấm vào là mở to ra xem. */}
          <button
            type="button"
            onClick={() => setViewing(true)}
            aria-label="Xem ảnh to"
            className="frame-ramp shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition active:scale-95"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt="Ảnh hoá đơn đã đính kèm"
              className="block h-16 w-16 object-cover"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-expense text-sm font-medium">Đã đính kèm ảnh hoá đơn</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setViewing(true)}
                className="text-expense hover:text-brand text-xs font-medium underline underline-offset-2"
              >
                🔍 Xem ảnh
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-expense hover:text-brand text-xs font-medium underline underline-offset-2"
              >
                Đổi ảnh khác
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="text-muted hover:text-critical text-xs underline underline-offset-2"
              >
                Bỏ ảnh
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Khi đang kéo ảnh qua, viền chuyển từ nét đứt sang nét liền và đậm màu
           lên để thấy rõ "thả được ở đây"; transition giữ cho cú đổi trạng thái
           không giật, còn scale nhẹ báo đây là vùng đang nhận ảnh. */
        <button
          type="button"
          disabled={working}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void scan(imageFromTransfer(e.dataTransfer));
          }}
          className={`text-expense flex w-full flex-col items-center justify-center gap-1 rounded-xl border px-4 py-3.5 text-sm font-medium transition duration-200 ease-out disabled:opacity-60 ${
            dragging
              ? "border-expense bg-expense/20 scale-[1.01]"
              : "border-expense/35 bg-expense/6 hover:bg-expense/11 border-dashed"
          }`}
        >
          {working ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Đang đọc hoá đơn…
            </span>
          ) : dragging ? (
            <span>Thả ảnh vào đây</span>
          ) : (
            <>
              {/* Hai điều bắt buộc ở đây:
                  1. text-ramp nằm ở thẻ CON, không đặt lên chính cái nút — nút
                     có nền bg-expense/6, mà background-clip:text sẽ cắt luôn
                     nền đó theo hình chữ và làm mất mảng nền.
                  2. Emoji phải nằm NGOÀI text-ramp. background-clip:text biến
                     chữ thành mặt nạ, mà emoji là glyph nhiều màu nên sẽ bị
                     nuốt mất màu riêng và hiện ra một khối đặc. */}
              <span>
                <span aria-hidden="true">📷 </span>
                <span className="text-ramp">Chọn ảnh hoá đơn từ máy hoặc chụp mới</span>
              </span>
              <span className="text-expense/70 text-xs font-normal">
                Dán ảnh (⌘V / Ctrl+V) hoặc kéo thả vào đây cũng được
              </span>
            </>
          )}
        </button>
      )}
      {error && <p className="text-critical mt-2.5 text-sm">{error}</p>}

      {viewing && thumbnail && (
        <PhotoView src={thumbnail} onClose={() => setViewing(false)} />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
