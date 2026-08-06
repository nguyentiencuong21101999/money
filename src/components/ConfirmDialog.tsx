"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  /** Dòng giải thích. Ký tự xuống dòng trong chuỗi được giữ nguyên. */
  message?: string;
  /** Chữ trên nút xác nhận. Mặc định "Xoá". */
  confirmLabel?: string;
  /** Đang chạy việc — khoá cả hai nút để không bấm hai lần. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Popup xác nhận, dùng chung cho mọi việc xoá.
 *
 * Thay cho confirm() của trình duyệt. confirm() có ba vấn đề: nó là hộp thoại
 * của hệ điều hành nên không theo giao diện app, nó CHẶN toàn bộ luồng JavaScript
 * (không hiện được trạng thái "đang xoá…"), và trên iOS Safari nó bị chặn hẳn
 * trong một số ngữ cảnh nên việc xoá lặng lẽ không bao giờ chạy.
 *
 * z-70 để nằm trên cả PhotoViewer (z-60) và các sheet (z-50) — popup này mở được
 * từ trong viewer nên phải cao hơn nó.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Xoá",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Chặn ở pha capture: để phím chạy tiếp thì viewer hay sheet bên dưới cũng
      // nghe Escape và đóng theo, mất luôn cả thứ đang xem.
      e.stopPropagation();
      if (!busy) onCancel();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      // Căn giữa ở mọi cỡ, không bottom sheet — xem ghi chú cùng chuyện trong
      // AlbumDialog: hộp thoại ngắn dán sát mép dưới trông như bị tụt xuống.
      className="animate-fade fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-5 backdrop-blur-md"
      // Đang xoá thì bấm ra ngoài không đóng — việc đã chạy, đóng đi chỉ làm mất
      // chỗ báo kết quả.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      {/* sheet-surface là bắt buộc: .card là kính TRONG, nằm trên lớp phủ tối thì
          mặt kính ăn màu tối và ra xám đục. */}
      {/* max-h + overflow-y-auto như các sheet khác: tên ảnh dài hoặc thông báo
          lỗi nhiều dòng có thể đẩy popup cao hơn màn hình, không cho cuộn thì
          hai nút Huỷ/Xoá bị đẩy ra ngoài và không bấm được. */}
      <div className="card sheet-surface animate-pop max-h-[92dvh] w-full max-w-sm overflow-y-auto p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {message && (
          <p className="text-ink-2 mt-2 text-sm leading-relaxed whitespace-pre-line">
            {message}
          </p>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="glass-chip ring-ramp text-ink-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            /* bg-outflow = --color-danger-text, đúng màu app dùng cho số trừ.
               Không thêm đỏ mới vào bảng màu chỉ để làm nút này. */
            className="bg-outflow flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Đang xoá…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
