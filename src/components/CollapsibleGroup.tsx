"use client";

import type { ReactNode } from "react";
import { formatVND } from "@/lib/money";

interface Props {
  /** Nhãn nhóm: tên ngày ở dashboard, tên tháng ở sao kê. */
  title: string;
  count: number;
  /** Thu trừ chi của cả nhóm; dương thì hiện màu xanh. */
  net: number;
  expanded: boolean;
  onToggle: () => void;
  /** Độ trễ animation, để các nhóm hiện so le. */
  delay?: string;
  /** Các thẻ <li> bên trong. */
  children: ReactNode;
}

/**
 * Khối nhóm đóng/mở dùng chung cho danh sách theo ngày (dashboard) và theo
 * tháng (sao kê). Phần thân luôn có trần chiều cao và tự cuộn, để một ngày
 * hay một tháng nhiều giao dịch không kéo dài cả trang.
 */
export function CollapsibleGroup({
  title,
  count,
  net,
  expanded,
  onToggle,
  delay,
  children,
}: Props) {
  return (
    <section
      className={`card animate-rise liftable overflow-hidden ${expanded ? "is-open" : ""}`}
      style={delay ? { animationDelay: delay } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-expense/8 flex w-full items-center gap-3 px-3.5 py-3 text-left transition"
      >
        <span
          aria-hidden="true"
          className={`text-muted text-[10px] transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
        </span>
        <span className="text-muted shrink-0 text-xs">{count} khoản</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            net > 0
              ? "text-success-text"
              : net < 0
                ? "text-danger-text"
                : "text-muted"
          }`}
        >
          {net > 0 ? "+" : net < 0 ? "−" : ""}
          {formatVND(Math.abs(net)).replace(" ₫", "")}
        </span>
      </button>

      {/* Không đặt trần chiều cao ở đây: vùng cuộn nằm ở <GroupList> bao ngoài,
          để cả trang chỉ có MỘT thanh cuộn thay vì cuộn lồng trong cuộn. */}
      {expanded && (
        <ul className="divide-hairline border-hairline divide-y border-t">
          {children}
        </ul>
      )}
    </section>
  );
}

/**
 * Khung chứa các nhóm. Cao tối đa 65% màn hình rồi tự cuộn, để danh sách 30 ngày
 * hay 30 tháng không đẩy phần bên dưới ra khỏi tầm mắt.
 */
export function GroupList({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-0.5 max-h-[65vh] space-y-2.5 overflow-y-auto px-0.5 py-0.5">
      {children}
    </div>
  );
}

/** Thu trừ chi của một nhóm giao dịch. */
export function netOf(rows: { type: string; amount: number }[]): number {
  return rows.reduce(
    (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
    0,
  );
}
