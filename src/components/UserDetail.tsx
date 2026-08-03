"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminGate } from "@/lib/admin-gate";
import { iconFor } from "@/lib/categories";
import { currentMonth, dateVN, dayLabel, lastNMonths, shiftMonth, timeAgo } from "@/lib/date";
import { formatVND } from "@/lib/money";
import { useNow } from "@/lib/now";
import { useProfile } from "@/lib/profile";
import { byCategory, spendingDelta, summarize, trend } from "@/lib/stats";
import { useTransactions } from "@/lib/transactions";
import { CategoryBars } from "./CategoryBars";
import { MonthPicker } from "./MonthPicker";
import { MonthlyTrend } from "./MonthlyTrend";
import { SendNotice } from "./SendNotice";
import { SummaryPanel } from "./SummaryPanel";

const TREND_MONTHS = 6;

export function UserDetail({ uid }: { uid: string }) {
  const allowed = useAdminGate();
  const [month, setMonth] = useState(currentMonth());
  const now = useNow();

  const { data: profile } = useProfile(uid, allowed);
  const months = useMemo(() => lastNMonths(month, TREND_MONTHS), [month]);
  const { data: transactions, error } = useTransactions(allowed ? uid : undefined, months);

  const previousMonth = shiftMonth(month, -1);
  const summary = useMemo(() => summarize(month, transactions), [month, transactions]);
  const previous = useMemo(
    () => summarize(previousMonth, transactions),
    [previousMonth, transactions],
  );
  const slices = useMemo(() => byCategory(month, transactions), [month, transactions]);
  const points = useMemo(() => trend(months, transactions), [months, transactions]);
  const monthRows = useMemo(
    () => transactions.filter((tx) => tx.month === month),
    [month, transactions],
  );

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-16">
      <header className="animate-fade mb-4 flex items-center gap-2">
        <Link
          href="/manager"
          aria-label="Quay lại danh sách"
          className="border-hairline hover:bg-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-lg leading-none transition active:scale-95"
        >
          ‹
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {profile?.displayName || profile?.email || "Người dùng"}
          </h1>
          <p className="text-muted truncate text-xs">
            {profile?.email}
            {profile?.createdAt ? ` · tạo ${dateVN(profile.createdAt)}` : ""}
            {profile?.lastSeenAt ? ` · vào ${timeAgo(profile.lastSeenAt, now)}` : ""}
          </p>
        </div>
      </header>

      <div className="bg-plane/85 sticky top-0 z-20 -mx-4 mb-4 flex justify-center px-4 py-2 backdrop-blur">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <SummaryPanel
          summary={summary}
          previousMonth={previousMonth}
          delta={spendingDelta(summary.expense, previous.expense)}
        />

        {summary.count > 0 && <CategoryBars slices={slices} />}

        <MonthlyTrend points={points} currentMonth={month} onSelectMonth={setMonth} />

        <SendNotice uid={uid} />

        {/* Danh sách chỉ để xem: admin không được sửa giao dịch của người khác,
            rules cũng chặn, nên đừng làm ra nút bấm gợi ý điều không làm được. */}
        <section className="card animate-rise overflow-hidden p-0">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-semibold">
            Giao dịch trong tháng
            <span className="text-muted ml-1.5 text-xs font-normal">
              {monthRows.length} khoản
            </span>
          </h2>
          {monthRows.length === 0 ? (
            <p className="text-muted px-4 py-8 text-center text-sm">
              Tháng này chưa có khoản nào
            </p>
          ) : (
            <ul className="divide-hairline max-h-[70dvh] divide-y overflow-y-auto">
              {monthRows.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
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
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
