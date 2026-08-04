import { Logo } from "./Logo";

/**
 * Màn chờ duy nhất của app: logo thở nhẹ, giữa màn hình, không props.
 *
 * KHÔNG có biến thể "khối nhỏ nằm trong trang". Mở app phải chờ hai việc nối
 * nhau — xác thực rồi tải giao dịch — mà mỗi việc một kiểu màn chờ thì người
 * dùng thấy hai nhịp: logo to giữa màn hình, rồi đầu trang hiện ra kèm một logo
 * nhỏ hơn tụt xuống dưới, rồi mới tới nội dung. Cùng một hình ở cùng một chỗ
 * suốt cả hai việc thì chỉ còn một nhịp chờ.
 *
 * Cũng vì vậy mà đừng thêm props: khác cỡ hay khác chỗ một chút là lại thành
 * hai nhịp.
 */
export function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <span role="status" aria-label="Đang tải" className="animate-breathe">
        <Logo size={64} />
      </span>
    </div>
  );
}
