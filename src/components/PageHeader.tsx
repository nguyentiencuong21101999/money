import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * Nút nhỏ trên đầu trang. Gom thành một chỗ vì trước đây mỗi trang tự viết một
 * kiểu: Xuất CSV ở trang chủ thì viền mảnh, ở trang sao kê lại nền hồng đặc —
 * cùng một việc mà hai bộ mặt.
 */
export const HEADER_BUTTON =
  "border-hairline text-ink-2 hover:bg-expense/8 hover:border-expense/30 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97] disabled:opacity-40";

interface Props {
  title: string;
  /**
   * Bấm vào logo thì về đâu. Mặc định trang chủ, nhưng trang nằm sâu thì trỏ
   * ngược lên một tầng — lùi về đúng chỗ vừa bấm sang, chứ không nhảy thẳng về
   * nhà bắt người ta đi lại từ đầu.
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
 */
export function PageHeader({
  title,
  href = "/",
  backLabel = "trang chủ",
  children,
}: Props) {
  return (
    <header className="animate-fade mb-4 flex items-center justify-between gap-3">
      <Link
        href={href}
        aria-label={`${title} — quay lại ${backLabel}`}
        className="flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-75 active:scale-[0.98]"
      >
        <Logo size={26} />
        <h1 className="truncate text-lg font-semibold">{title}</h1>
      </Link>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}
