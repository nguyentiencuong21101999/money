"use client";

import { useSyncExternalStore } from "react";

/**
 * Khung nhìn THỰC SỰ THẤY ĐƯỢC — phần còn lại sau khi bàn phím chiếm chỗ.
 *
 * Cần đến nó vì trên iOS, bật bàn phím KHÔNG làm phần tử `position: fixed` co
 * lại: khung bố cục vẫn cao nguyên, Safari chỉ cuộn cả trang lên để lộ ô đang
 * gõ. Hậu quả là đỉnh của lớp phủ toàn màn hình bị đẩy khuất lên trên — ở màn
 * chat thì đó chính là ảnh và tên người đang nhắn.
 *
 * Sửa bằng cách đặt chiều cao lớp phủ đúng bằng `height` của visual viewport và
 * dịch nó xuống `offsetTop` — lớp phủ luôn nằm gọn trong vùng còn thấy được, nên
 * phần đầu ở nguyên chỗ cũ.
 */
export interface Viewport {
  height: number;
  offsetTop: number;
}

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  // `scroll` chứ không riêng `resize`: iOS đẩy khung nhìn trượt đi mà không đổi
  // chiều cao trong lúc bàn phím trồi lên, chỉ nghe resize là hụt mất quãng đó.
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
  };
}

/*
  Trả về CHUỖI chứ không trả object: useSyncExternalStore so hai lần chụp bằng
  Object.is, mà object thì lần nào cũng là tham chiếu mới — render vô hạn.
  Làm tròn luôn để những thay đổi lẻ tẻ dưới 1px không kích hoạt render.
*/
function snapshot(): string {
  const vv = window.visualViewport;
  if (!vv) return "";
  return `${Math.round(vv.height)}:${Math.round(vv.offsetTop)}`;
}

/** Máy chủ không có khung nhìn — trả rỗng để bên gọi dùng chiều cao mặc định. */
function serverSnapshot(): string {
  return "";
}

export function useViewport(): Viewport | null {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!raw) return null;
  const [height, offsetTop] = raw.split(":").map(Number);
  return { height, offsetTop };
}
