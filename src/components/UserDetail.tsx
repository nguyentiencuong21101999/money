"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminGate } from "@/lib/admin-gate";
import { currentMonth, lastNMonths, shiftMonth } from "@/lib/date";
import { useNow } from "@/lib/now";
import { useProfile } from "@/lib/profile";
import { byCategory, spendingDelta, summarize, trend } from "@/lib/stats";
import { useTransactions } from "@/lib/transactions";
import { CategoryBars } from "./CategoryBars";
import { MonthPicker } from "./MonthPicker";
import { MonthlyTrend } from "./MonthlyTrend";
import { PageHeader } from "./PageHeader";
import { SendNotice } from "./SendNotice";
import { SummaryPanel } from "./SummaryPanel";
import { TxList } from "./TxList";
import { UserCard } from "./UserCard";

const TREND_MONTHS = 6;

export function UserDetail({ uid }: { uid: string }) {
  const allowed = useAdminGate();
  const [month, setMonth] = useState(currentMonth());
  const [sending, setSending] = useState(false);
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
      <PageHeader title="Chi tiết" href="/manager" backLabel="danh sách người dùng" />

      {profile && (
        <section className="card animate-rise mb-4 flex flex-wrap items-center gap-3 p-4">
          <UserCard profile={profile} now={now} />
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/manager/${uid}/sao-ke`}
              className="border-hairline text-ink-2 hover:bg-expense/8 rounded-lg border px-3 py-2 text-xs font-medium transition active:scale-[0.97]"
            >
              Sao kê
            </Link>
            <button
              type="button"
              onClick={() => setSending(true)}
              className="bg-brand rounded-lg px-3 py-2 text-xs font-medium text-white transition hover:brightness-110 active:scale-[0.97]"
            >
              Gửi thông báo
            </button>
          </div>
        </section>
      )}

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

        {/* Đúng danh sách của trang chủ, chia theo ngày và đóng/mở được — chỉ
            bỏ onEdit đi, vì admin không sửa được giao dịch của người khác và
            rules cũng chặn, đừng vẽ ra thứ trông như bấm được. */}
        <TxList transactions={monthRows} />
      </div>

      {sending && (
        <SendNotice
          uid={uid}
          name={profile?.displayName || profile?.email || "người dùng này"}
          onClose={() => setSending(false)}
        />
      )}
    </div>
  );
}
