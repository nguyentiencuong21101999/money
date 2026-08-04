import { Logo } from "./Logo";

interface Props {
  /** Đọc cho trình đọc màn hình, vd "Đang tải giao dịch". */
  label?: string;
  /**
   * Chiếm cả màn hình. Dùng khi trang chưa vẽ được gì cả (còn đang xác thực).
   * Mặc định là một khối nằm trong trang, bên dưới đầu trang đã vẽ sẵn.
   */
  full?: boolean;
}

/**
 * Icon thở nhẹ, dùng cho MỌI lần chờ: chờ đăng nhập, chờ giao dịch, chờ hồ sơ.
 *
 * Cố tình dùng chung một hình cho tất cả: vào app là màn xác thực hiện logo
 * này, xong tới lượt chờ dữ liệu vẫn logo này — mắt thấy một nhịp chờ liền
 * mạch, không phải hai nhịp với hai hình khác nhau nhấp nháy nối nhau.
 *
 * Thà chờ còn hơn vẽ số 0 rồi nhảy: các panel tổng kết mà hiện sẵn "0 ₫" lúc
 * chưa có dữ liệu thì người đọc kịp tin là mình chưa tiêu gì.
 */
export function Loading({ label = "Đang tải", full = false }: Props) {
  return (
    <div
      className={full ? "flex min-h-dvh items-center justify-center p-5" : "flex justify-center py-24"}
    >
      <span role="status" aria-label={label} className="animate-breathe">
        <Logo size={full ? 64 : 44} />
      </span>
    </div>
  );
}
