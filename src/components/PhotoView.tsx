"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  src: string;
  /** Dòng chữ nhỏ trên đầu, vd "Ảnh hoá đơn". */
  caption?: string;
  onClose: () => void;
}

/**
 * Xem ảnh hoá đơn to hết màn hình. Bấm vào ảnh để phóng to gấp đôi rồi kéo xem
 * từng góc — ảnh lưu kèm giao dịch chỉ 640px nên chữ nhỏ cần phóng mới đọc rõ.
 *
 * Vẽ bằng portal ra thẳng <body>: thẻ chứa form có transform (animate-sheet)
 * nên `fixed` đặt bên trong sẽ bị neo vào form và cuộn theo form, không phủ
 * hết màn hình.
 */
export function PhotoView({ src, caption = "Ảnh hoá đơn", onClose }: Props) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Bắt ở pha capture rồi chặn lại: nếu để phím chạy tiếp, form giao dịch
      // bên dưới cũng nghe Escape và đóng luôn cả form.
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="animate-fade fixed inset-0 z-60 flex flex-col bg-black/85 backdrop-blur-[2px]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-sm font-medium text-white/85">{caption}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-white/85 transition hover:bg-white/15 active:scale-90"
        >
          ×
        </button>
      </div>

      {/* Vùng cuộn để kéo xem ảnh khi đã phóng to. Lớp bên trong đặt min-h/min-w
          full nên lúc ảnh còn nhỏ thì căn giữa, lúc ảnh to hơn màn hình thì
          không bị cắt mất mép trên/trái như khi căn giữa bằng flex đơn thuần. */}
      <div
        className="flex-1 overflow-auto"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="flex min-h-full min-w-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption}
            onClick={() => setZoomed((z) => !z)}
            className={
              zoomed
                ? "w-[200%] max-w-none cursor-zoom-out rounded-lg"
                : "max-h-full max-w-full cursor-zoom-in rounded-lg object-contain"
            }
          />
        </div>
      </div>

      <p className="shrink-0 pb-4 text-center text-xs text-white/55">
        Bấm vào ảnh để {zoomed ? "thu nhỏ" : "phóng to"} · Esc hoặc × để đóng
      </p>
    </div>,
    document.body,
  );
}
