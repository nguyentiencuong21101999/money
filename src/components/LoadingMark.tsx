import { Logo } from "./Logo";

/**
 * Logo thở nhẹ, dùng cho ô chờ NẰM TRONG trang — khi đầu trang đã hiện rồi mà
 * một phần nội dung còn đang tải.
 *
 * VÌ SAO TÁCH KHỎI <Loading />
 * Loading là màn chờ phủ kín màn hình và CỐ TÌNH không nhận props: cả app dùng
 * đúng một hình ở đúng một chỗ nên hai lượt chờ nối nhau (xác thực rồi tải dữ
 * liệu) chỉ còn một nhịp. Thêm props vào đó là mở đường cho mỗi chỗ một cỡ, đúng
 * cái nó dựng ra để tránh.
 *
 * Ở đây là việc khác: khung trang đã vẽ, chỉ một khối bên trong còn trống. Nên
 * cần cỡ nhỏ hơn và không chiếm cả chiều cao khung nhìn — nhưng vẫn là cùng một
 * hình, cùng một nhịp thở, để người dùng nhận ra "đang chờ" mà không phải học
 * thêm một kiểu báo chờ nào khác.
 */
export function LoadingMark({ size = 56 }: { size?: number }) {
  return (
    <span role="status" aria-label="Đang tải" className="animate-breathe">
      <Logo size={size} />
    </span>
  );
}
