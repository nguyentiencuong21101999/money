"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpIcon } from "./icons";

/**
 * Nút nổi ở góc dưới phải, bấm là về đầu trang.
 *
 * Chỉ hiện khi ĐÃ CUỘN quá một màn hình. Hai điều kiện khác nhau mà dễ lẫn:
 *
 *   - "trang dài hơn một màn hình"  → hiện ngay từ lúc mở trang, dù chưa cuộn.
 *     Vô nghĩa: đang ở đầu trang rồi thì nút "về đầu trang" chẳng làm gì.
 *   - "đã cuộn quá một màn hình"    → đúng cái cần. Ở đầu trang thì ẩn, cuộn sâu
 *     mới hiện, và mức đó cũng tự bao hàm việc trang phải dài hơn hai màn hình.
 *
 * VÌ SAO useSyncExternalStore CHỨ KHÔNG useState + useEffect
 * Cách thường làm là nghe scroll rồi setState. Nhưng setState trong effect bị
 * eslint chặn (react-hooks/set-state-in-effect) vì nó tạo thêm một lượt render
 * với giá trị cũ trước khi sửa lại. useSyncExternalStore đọc vị trí cuộn thật
 * NGAY trong lượt render, nên quay lại trang ở vị trí đã cuộn sẵn (trình duyệt
 * tự phục hồi) là nút hiện đúng luôn, không lệch một nhịp.
 */
function subscribe(onChange: () => void): () => void {
  // passive: không bao giờ preventDefault, khai ra để trình duyệt khỏi phải chờ
  // handler chạy xong mới cuộn tiếp.
  window.addEventListener("scroll", onChange, { passive: true });
  // innerHeight đổi khi quay ngang điện thoại, mà nó là mốc so sánh.
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * Trả về boolean nên React tự bỏ qua khi giá trị không đổi — scroll bắn hàng
 * trăm lần mỗi giây nhưng chỉ render lại đúng hai lần: lúc vượt mốc và lúc về.
 */
function hasScrolledPastScreen(): boolean {
  return window.scrollY > window.innerHeight;
}

/** Trên máy chủ không có vị trí cuộn để đọc — mặc định là ẩn. */
function onServer(): boolean {
  return false;
}

export function ScrollTopButton() {
  const show = useSyncExternalStore(subscribe, hasScrolledPastScreen, onServer);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Lên đầu trang"
      /*
        Cùng bộ mặt và cùng cách neo với nút "+ Thêm giao dịch" của trang chủ:
        bg-brand, fixed, bottom-6, z-30. Khác đúng một chỗ là dạt phải thay vì
        giữa, nên hai nút đứng cùng hàng mà không đè nhau.

        Icon để currentColor (trắng), KHÔNG dùng prop gradient: nét tô dải tím
        hồng đặt trên nền cũng tím hồng thì gần như mất hút.
      */
      className="bg-brand animate-pop fixed right-4 bottom-6 z-30 flex h-12 w-12 items-center justify-center rounded-full text-white transition active:scale-95"
    >
      <ArrowUpIcon size={20} />
    </button>
  );
}
