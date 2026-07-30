"use client";

import { useEffect, useRef } from "react";

/** Khớp với thời lượng animate-expand / animate-drop trong globals.css. */
const ANIMATION_MS = 360;

/**
 * Khi một panel (lịch, bảng chọn tháng, menu) mở ra mà bị khuất dưới mép màn
 * hình hoặc mép hộp thoại, tự cuộn vừa đủ để thấy trọn nó.
 *
 * `block: "nearest"` nghĩa là chỉ cuộn đúng phần thiếu — panel đã nằm trọn
 * trong tầm mắt thì không cuộn gì cả, tránh giật màn hình vô cớ.
 * scrollIntoView tự đi ngược lên MỌI vùng cuộn cha, nên xử lý được cả trường
 * hợp panel nằm trong hộp thoại có thanh cuộn riêng.
 */
export function useRevealOnOpen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const reveal = () =>
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // Cuộn hai nhịp: ngay khi panel vẽ xong để mắt bám theo, rồi cuộn lại lần
    // nữa sau khi hiệu ứng nở chiều cao chạy hết — lúc đó panel mới đủ cao,
    // nếu chỉ cuộn ở nhịp đầu thì vẫn hụt mất phần đáy.
    const frame = requestAnimationFrame(reveal);
    const settled = setTimeout(reveal, ANIMATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [open]);

  return ref;
}
