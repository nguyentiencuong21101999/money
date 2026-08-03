"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { iconFor } from "@/lib/categories";
import { exportCSV } from "@/lib/csv";
import {
  currentMonth,
  dayLabel,
  MAX_MONTHS_PER_QUERY,
  monthLabel,
  monthsBetween,
} from "@/lib/date";
import { formatVND } from "@/lib/money";
import { byNewestFirst } from "@/lib/order";
import { byCategoryOf, summarize } from "@/lib/stats";
import { useTransactions } from "@/lib/transactions";
import type { Transaction } from "@/lib/types";
import { CollapsibleGroup, GroupList, netOf } from "./CollapsibleGroup";
import { HEADER_BUTTON, PageHeader } from "./PageHeader";
import { defaultRange, RangePicker } from "./RangePicker";

interface Props {
  /** Xem sao kê của người khác (trang quản lý). Bỏ trống = của chính mình. */
  uid?: string;
  /** Tên người đó, chỉ để hiện trên đầu trang khi admin đang xem hộ. */
  ownerName?: string;
}

export function Statement({ uid: otherUid, ownerName }: Props = {}) {
  const { user } = useAuth();
  const uid = otherUid ?? user!.uid;
  const latest = currentMonth();

  const [range, setRange] = useState(() => defaultRange(latest));
  /** Tháng đang mở trong danh sách. null = mặc định mở tháng gần nhất. */
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const { from, to } = range;
  const requested = useMemo(() => monthsBetween(from, to), [from, to]);
  // Firestore chặn ở 30 giá trị `in`. Cắt bớt thì phải nói ra, không lặng lẽ
  // trả thiếu dữ liệu rồi để người dùng tưởng mình tiêu ít hơn thực tế.
  const truncated = requested.length > MAX_MONTHS_PER_QUERY;
  const months = truncated ? requested.slice(-MAX_MONTHS_PER_QUERY) : requested;

  const { data: transactions, loading, error } = useTransactions(uid, months);

  const rows = useMemo(
    () => [...transactions].sort(byNewestFirst),
    [transactions],
  );
  const perMonth = useMemo(
    () => [...months].sort().reverse().map((m) => summarize(m, transactions)),
    [months, transactions],
  );
  const total = useMemo(
    () =>
      perMonth.reduce(
        (acc, m) => ({
          income: acc.income + m.income,
          expense: acc.expense + m.expense,
          count: acc.count + m.count,
        }),
        { income: 0, expense: 0, count: 0 },
      ),
    [perMonth],
  );
  const slices = useMemo(() => byCategoryOf(transactions), [transactions]);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-16">
      {/* Admin xem hộ thì logo lùi về đúng trang chi tiết vừa bấm sang, không
          nhảy thẳng về trang chủ bắt đi lại từ đầu. */}
      <PageHeader
        title={ownerName ? `Sao kê · ${ownerName}` : "Sao kê"}
        href={otherUid ? `/manager/${otherUid}` : "/"}
        backLabel={otherUid ? "trang chi tiết người dùng" : "trang chủ"}
      >
        <button
          type="button"
          onClick={() => exportCSV(months, transactions)}
          disabled={total.count === 0}
          className={HEADER_BUTTON}
        >
          <span className="sm:hidden">CSV</span>
          <span className="hidden sm:inline">Xuất CSV</span>
        </button>
      </PageHeader>

      <RangePicker latest={latest} value={range} onChange={setRange} />

      {truncated && (
        <p className="border-warning/50 bg-warning/10 text-ink-2 mb-4 rounded-xl border px-4 py-3 text-sm">
          Một lần chỉ tra được {MAX_MONTHS_PER_QUERY} tháng. Đang hiện{" "}
          {monthLabel(months[0]).toLowerCase()} đến {monthLabel(months[months.length - 1]).toLowerCase()}
          , bỏ qua {requested.length - months.length} tháng cũ hơn. Chia nhỏ khoảng để xem đủ.
        </p>
      )}

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className={loading ? "space-y-4 opacity-50" : "space-y-4"}>
        <section className="card animate-rise p-5">
          <p className="text-ink-2 text-xs font-medium">
            Số dư {months.length} tháng ({monthLabel(months[0]).toLowerCase()} –{" "}
            {monthLabel(months[months.length - 1]).toLowerCase()})
          </p>
          <p
            className={`mt-1 text-[clamp(1.5rem,7vw,2.5rem)] leading-none font-semibold tracking-tight ${
              total.income - total.expense < 0 ? "text-danger-text" : "text-ink"
            }`}
          >
            {total.income - total.expense < 0 ? "−" : ""}
            {formatVND(Math.abs(total.income - total.expense))}
          </p>
          <div className="border-hairline mt-5 grid grid-cols-3 gap-3 border-t pt-4">
            <Figure
              label="Tiền vào"
              value={`+${formatVND(total.income)}`}
              dot="bg-income"
              tone="text-success-text"
            />
            <Figure
              label="Tiền ra"
              value={`−${formatVND(total.expense)}`}
              dot="bg-expense"
              tone="text-danger-text"
            />
            <Figure label="Số giao dịch" value={String(total.count)} />
          </div>
        </section>

        {total.count > 0 && (
          <section className="card animate-rise p-4">
            <h2 className="text-sm font-semibold">Tổng theo tháng</h2>
            {/* Cao vừa đúng 6 tháng; dài hơn thì cuộn trong thẻ, để phần
                danh mục và danh sách bên dưới không bị đẩy quá xa. */}
            <div className="-mx-1 mt-2 max-h-64 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-88 text-sm">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr className="text-muted text-left text-xs">
                    <th className="py-1.5 pl-1 font-medium">Tháng</th>
                    <th className="py-1.5 text-right font-medium">Vào</th>
                    <th className="py-1.5 text-right font-medium">Ra</th>
                    <th className="py-1.5 pr-1 text-right font-medium">Số dư</th>
                  </tr>
                </thead>
                <tbody>
                  {perMonth.map((m) => (
                    <tr key={m.month} className="border-hairline border-t">
                      <td className="py-2 pl-1 whitespace-nowrap">{monthLabel(m.month)}</td>
                      <td className="text-ink-2 py-2 text-right tabular-nums">
                        {m.income ? formatVND(m.income) : "—"}
                      </td>
                      <td className="text-ink-2 py-2 text-right tabular-nums">
                        {m.expense ? formatVND(m.expense) : "—"}
                      </td>
                      <td
                        className={`py-2 pr-1 text-right font-medium tabular-nums ${
                          m.balance < 0 ? "text-danger-text" : "text-success-text"
                        }`}
                      >
                        {m.balance < 0 ? "−" : ""}
                        {formatVND(Math.abs(m.balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {slices.length > 0 && (
          <section className="card animate-rise p-4">
            <h2 className="text-sm font-semibold">Chi theo danh mục cả kỳ</h2>
            <ul className="mt-2.5 space-y-1.5">
              {slices.map((slice, index) => (
                <li key={slice.category} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span aria-hidden="true">{iconFor(slice.category)}</span>
                    <span className="truncate">{slice.category}</span>
                  </span>
                  <span className="text-ink-2 text-sm font-medium tabular-nums">
                    {formatVND(slice.total)}
                    <span className="text-muted ml-1.5 font-normal">
                      {Math.round(slice.share * 100)}%
                    </span>
                  </span>
                  <span className="col-span-2 block h-2">
                    <span
                      className="bg-expense animate-grow-x block h-full rounded-r"
                      // Bề rộng khớp đúng con số % bên cạnh, không vẽ theo
                      // danh mục lớn nhất (sẽ lệch với nhãn).
                      style={{
                        width: `${Math.max(1.5, slice.share * 100)}%`,
                        animationDelay: `${Math.min(index * 45, 300)}ms`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <StatementList
          rows={rows}
          count={total.count}
          open={openMonth}
          onToggle={setOpenMonth}
        />
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  dot,
  tone,
}: {
  label: string;
  value: string;
  dot?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1.5">
        {dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        <span className="text-ink-2 truncate text-xs font-medium">{label}</span>
      </span>
      <span className={`mt-0.5 block truncate text-base font-semibold ${tone ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

interface ListProps {
  rows: Transaction[];
  count: number;
  /** Tháng đang mở; null = chưa chọn, mặc định mở tháng gần nhất. */
  open: string | null;
  onToggle: (month: string) => void;
}

/** Export để dựng preview và kiểm tra riêng phần đóng/mở mà không cần đăng nhập. */
export function StatementList({ rows, count, open, onToggle }: ListProps) {
  if (count === 0) {
    return (
      <div className="card animate-pop px-5 py-12 text-center">
        <div className="text-3xl">📄</div>
        <p className="mt-2 text-sm font-medium">Khoảng này chưa có giao dịch nào</p>
        <p className="text-muted mt-1 text-sm">Thử chọn khoảng tháng rộng hơn.</p>
      </div>
    );
  }

  const byMonth = new Map<string, Transaction[]>();
  for (const tx of rows) {
    const bucket = byMonth.get(tx.month);
    if (bucket) bucket.push(tx);
    else byMonth.set(tx.month, [tx]);
  }

  const groups = [...byMonth.entries()];
  // null = chưa bấm gì, mặc định mở tháng gần nhất. Chuỗi rỗng = đã đóng hết.
  const active = open ?? groups[0]?.[0] ?? "";

  return (
    <GroupList>
      {groups.map(([month, list], index) => {
        const expanded = month === active;
        return (
          <CollapsibleGroup
            key={month}
            title={monthLabel(month)}
            count={list.length}
            net={netOf(list)}
            expanded={expanded}
            onToggle={() => onToggle(expanded ? "" : month)}
            delay={`${Math.min(index * 50, 250)}ms`}
          >
            {list.map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="bg-plane border-hairline flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm">
                  {iconFor(tx.category)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {tx.note || tx.merchant || tx.category}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {dayLabel(tx.date)} · {tx.category}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    tx.type === "income" ? "text-success-text" : "text-danger-text"
                  }`}
                >
                  {tx.type === "income" ? "+" : "−"}
                  {formatVND(tx.amount).replace(" ₫", "")}
                </span>
              </li>
            ))}
          </CollapsibleGroup>
        );
      })}
    </GroupList>
  );
}
