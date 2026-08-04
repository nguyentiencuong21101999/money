"use client";

import { useEffect, useState, type MouseEvent } from "react";
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

  /**
   * Bấm ra ngoài ảnh là đóng.
   *
   * Phải gắn ở CẢ hai lớp bọc: lớp trong tuy chỉ bọc sát ảnh nhưng lại trải kín
   * vùng cuộn, nên mọi cú bấm "ra ngoài" đều rơi vào nó và không bao giờ chạm
   * tới lớp ngoài — trước đây chỉ lớp ngoài nghe, thành ra bấm ra ngoài không
   * đóng được gì.
   *
   * onClick chứ không onMouseDown để trên điện thoại chạm cũng ăn. So target với
   * currentTarget để cú bấm vào chính cái ảnh (phóng to/thu nhỏ) không bị hiểu
   * thành bấm ra ngoài.
   */
  const closeIfOutside = (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      onClick={closeIfOutside}
      /* Bỏ backdrop-blur: nền đã là black/85, mắt gần như không thấy khác gì,
         mà backdrop-filter trên một lớp fixed phủ kín màn hình lại là chỗ Safari
         trên iPhone hay vẽ hụt nội dung bên trong. Không đáng để đổi. */
      className="animate-fade fixed inset-0 z-60 flex flex-col bg-black/85"
    >
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
      <div className="flex-1 overflow-auto" onClick={closeIfOutside}>
        <div
          onClick={closeIfOutside}
          className="flex min-h-full min-w-full items-center justify-center p-4"
        >
          {/*
            Cỡ ảnh tính theo VIEWPORT chứ không theo phần trăm của thẻ bọc: thẻ
            bọc co theo chính cái ảnh, nên `max-h-full` / `w-[200%]` là phần trăm
            của một thứ đang phụ thuộc vào mình — trình duyệt hiện giải ra số
            dùng được, nhưng đó là chỗ dễ vỡ khi đổi bố cục. vw/dvh thì luôn là
            một con số xác định, khỏi phải đoán.

            Phóng to chặn ở 1280px vì bản lưu kèm giao dịch chỉ 900px; kéo to hơn
            nữa chỉ được thêm ảnh nhoè chứ không thêm chữ đọc được.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption}
            onClick={() => setZoomed((z) => !z)}
            className={
              zoomed
                ? "w-[min(200vw,1280px)] max-w-none cursor-zoom-out rounded-lg"
                : "max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-2rem)] cursor-zoom-in rounded-lg object-contain"
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
