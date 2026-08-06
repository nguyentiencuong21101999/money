import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import { Logo } from "./Logo";

/**
 * Nút nhỏ trên đầu trang. Gom thành một chỗ vì trước đây mỗi trang tự viết một
 * kiểu: Xuất CSV ở trang chủ thì viền mảnh, ở trang sao kê lại nền hồng đặc —
 * cùng một việc mà hai bộ mặt.
 */
export const HEADER_BUTTON =
  "glass-chip ring-ramp text-ink-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition active:scale-[0.97] disabled:opacity-40";

/** Một mốc trong đường dẫn. */
export interface Crumb {
  label: string;
  href: string;
}

/**
 * Mốc gốc, khai một chỗ để bảy trang không tự gõ lại "Sổ tiền" mỗi nơi một kiểu.
 * Đổi tên app thì sửa đúng đây.
 */
export const HOME_CRUMB: Crumb = { label: "Sổ tiền", href: "/" };

interface Props {
  title: string;
  /**
   * Các trang cha, gốc đứng trước. KHÔNG chứa trang hiện tại — tên trang hiện
   * tại đã là `title` ngay bên dưới, nhắc lại trong đường dẫn là đọc hai lần.
   *
   * Có trail thì khỏi truyền href/backLabel: logo tự lùi về trang cha gần nhất.
   */
  trail?: Crumb[];
  /**
   * Bấm vào logo thì về đâu. Chỉ cần khi KHÔNG có trail; có trail rồi mà vẫn
   * truyền cái này là mở đường cho hai chỗ nói hai hướng khác nhau.
   */
  href?: string;
  /** Tên nơi sẽ về, cho trình đọc màn hình. */
  backLabel?: string;
  /** Nút bên phải, vd Xuất CSV. */
  children?: ReactNode;
}

/**
 * Đầu trang dùng chung cho mọi trang con. Logo là đường lùi lại — trước đây mỗi
 * trang một nút "‹" riêng, đi sâu hai ba tầng là mất lối về.
 *
 * Trên logo là đường dẫn: Sổ tiền › Thư viện ảnh › (trang này). Nó trả lời đúng
 * câu "mình đang ở đâu, lùi ra thì tới đâu" mà một mũi tên lùi không nói được —
 * vào từ link ngoài hay từ menu thì không có gì để đoán.
 */
export function PageHeader({ title, trail, href, backLabel, children }: Props) {
  const parent = trail?.[trail.length - 1];
  const backHref = href ?? parent?.href ?? "/";
  const backName = backLabel ?? parent?.label ?? "trang chủ";

  /*
    relative z-30 là BẮT BUỘC khi đầu trang có dropdown, không phải trang trí.

    animate-fade là animation trên opacity với fill-mode `both`, nên nó áp mãi và
    biến <header> thành một stacking context vĩnh viễn. Mọi z-index bên trong bị
    nhốt lại: panel dropdown khai z-40 vẫn tụt xuống dưới nội dung đứng sau header
    trong DOM (lưới ảnh, bảng sao kê). Đặt z cho chính header thì cả khối nổi lên.

    Dashboard đã gặp và sửa đúng như vậy cho <header> riêng của nó; z-30 để trên
    các thanh sticky đang dùng z-10 (đầu bảng sao kê) và z-20 (thanh chọn tháng).
  */
  return (
    <header className="animate-fade relative z-30 mb-4">
      {trail && trail.length > 0 && (
        <nav aria-label="Đường dẫn" className="mb-1">
          {/*
            Cho phép gãy dòng (flex-wrap) chứ không truncate cả dải: trên máy hẹp,
            đường dẫn ba mốc mà cắt bớt thì mất đúng cái mốc giữa — thứ duy nhất
            cho biết đã đi qua đâu. Thà xuống hai dòng.
          */}
          <ol className="text-muted flex flex-wrap items-center gap-x-1 text-xs">
            {trail.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-x-1">
                <Link
                  href={crumb.href}
                  className="hover:text-expense underline-offset-2 transition hover:underline"
                >
                  {crumb.label}
                </Link>
                {/*
                  SVG chứ không phải ký tự "›" tô .text-ramp: text-ramp dựng dải
                  màu bằng background-clip:text, mà glyph này rộng chừng 5px nên
                  cả dải bị nén lại thành một tông đục. Gradient của <linearGradient>
                  trải theo viewBox 24 đơn vị thì ở cỡ 14px vẫn thấy rõ tím → hồng.
                */}
                <ChevronRightIcon size={14} gradient />
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          aria-label={`${title} — quay lại ${backName}`}
          className="flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-75 active:scale-[0.98]"
        >
          <Logo size={26} />
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </Link>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
