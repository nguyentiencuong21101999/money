/**
 * Email được vào trang /manager.
 *
 * SỬA Ở ĐÂY THÌ PHẢI SỬA CẢ TRONG firestore.rules — hàm isAdmin() trong đó mới
 * là chỗ chặn thật. Danh sách này chỉ để ẩn/hiện giao diện; ai cũng gõ được
 * URL /manager, và ai cũng mở được DevTools sửa biến trong trình duyệt.
 *
 * Dùng NEXT_PUBLIC_ vì cả trình duyệt lẫn route API đều cần đọc. Email không
 * phải bí mật, và có giấu cũng vô nghĩa khi rules đã ghi công khai.
 */
export const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "cuongnguyen21101999@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && ADMIN_EMAILS.includes(email!.toLowerCase());
}
