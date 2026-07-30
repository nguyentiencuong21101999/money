"use client";

import { monthLabel } from "@/lib/date";
import { formatVND } from "@/lib/money";
import type { MonthSummary } from "@/lib/stats";

interface Props {
  summary: MonthSummary;
  previousMonth: string;
  /** Tỉ lệ thay đổi chi tiêu so với tháng trước; null nếu tháng trước chưa có chi. */
  delta: number | null;
}

export function SummaryPanel({ summary, previousMonth, delta }: Props) {
  const { income, expense, balance } = summary;
  const positive = balance >= 0;

  return (
    <div className="card animate-rise p-5">
      <p className="text-ink-2 text-xs font-medium">Số dư {monthLabel(summary.month).toLowerCase()}</p>
      {/* Hero figure — con số duy nhất của trang, dùng chữ số tỉ lệ (không tabular).
          clamp theo bề rộng để số hàng tỷ không tràn ra ngoài thẻ trên điện thoại. */}
      {/* animate-pop chỉ tác động opacity + transform nên không đụng tới cỡ chữ clamp. */}
      {/* Số dư âm mới tô đỏ. Số dư dương để màu chữ thường — đây là con số
          chủ đạo của trang, tô xanh cả tháng thành ra rực rỡ vô nghĩa. */}
      <p
        className={`animate-pop mt-1 text-[clamp(1.6rem,7.5vw,2.75rem)] leading-none font-semibold tracking-tight ${
          positive ? "text-ink" : "text-danger-text"
        }`}
      >
        {positive ? "" : "−"}
        {formatVND(Math.abs(balance))}
      </p>

      <div className="border-hairline mt-5 grid grid-cols-2 gap-4 border-t pt-4">
        {/* Trễ so le để mắt đọc lần lượt vào → ra, thay vì hai ô nhảy cùng lúc. */}
        <Tile label="Tiền vào" value={income} accent="income" delay="60ms" />
        <Tile label="Tiền ra" value={expense} accent="expense" delay="120ms" />
      </div>

      <div className="mt-3.5">
        <DeltaLine delta={delta} previousMonth={previousMonth} />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: number;
  accent: "income" | "expense";
  delay: string;
}) {
  return (
    <div className="animate-rise min-w-0" style={{ animationDelay: delay }}>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${
            accent === "income" ? "bg-income" : "bg-expense"
          }`}
        />
        <span className="text-ink-2 text-xs font-medium">{label}</span>
      </span>
      {/* tabular-nums để hai ô cạnh nhau thẳng cột chữ số dù độ dài khác nhau. */}
      <span
        className={`mt-0.5 block truncate text-xl font-semibold tracking-tight tabular-nums ${
          accent === "income" ? "text-success-text" : "text-danger-text"
        }`}
      >
        {accent === "income" ? "+" : "−"}
        {formatVND(value)}
      </span>
    </div>
  );
}

function DeltaLine({
  delta,
  previousMonth,
}: {
  delta: number | null;
  previousMonth: string;
}) {
  if (delta === null) {
    return (
      <p className="text-muted text-xs leading-snug">
        Chưa có dữ liệu chi tiêu của {monthLabel(previousMonth).toLowerCase()} để so sánh.
      </p>
    );
  }

  const percent = `${Math.abs(delta * 100).toFixed(0)}%`;
  if (Math.abs(delta) < 0.005) {
    return (
      <p className="text-ink-2 text-xs leading-snug">
        Chi tiêu gần như không đổi so với {monthLabel(previousMonth).toLowerCase()}.
      </p>
    );
  }

  const worse = delta > 0;
  return (
    <p
      className={`animate-fade text-xs leading-snug font-medium ${
        worse ? "text-critical" : "text-success-text"
      }`}
    >
      {/* Mũi tên nhỏ hơn chữ một chút để không kéo lệch đường baseline của dòng. */}
      <span aria-hidden="true" className="mr-0.5 text-[0.85em]">
        {worse ? "▲" : "▼"}
      </span>{" "}
      Chi tiêu {worse ? "tăng" : "giảm"} {percent} so với{" "}
      {monthLabel(previousMonth).toLowerCase()}
    </p>
  );
}
