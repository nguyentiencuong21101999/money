"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { imageFromTransfer } from "@/lib/clipboard";
import { exportMonthCSV } from "@/lib/csv";
import { currentMonth, lastNMonths, monthOf, shiftMonth, todayISO } from "@/lib/date";
import { nextOrder } from "@/lib/order";
import {
  describeScanError,
  scanReceipt,
  type ScannedReceipt,
} from "@/lib/scan";
import { byCategory, spendingDelta, summarize, trend } from "@/lib/stats";
import { useBudget, useTransactions } from "@/lib/transactions";
import type { Transaction } from "@/lib/types";
import { BudgetBar } from "./BudgetBar";
import { CategoryBars } from "./CategoryBars";
import { Logo } from "./Logo";
import { MonthPicker } from "./MonthPicker";
import { MonthlyTrend } from "./MonthlyTrend";
import { NotificationBell } from "./NotificationBell";
import { HEADER_BUTTON } from "./PageHeader";
import { SummaryPanel } from "./SummaryPanel";
import { TxList } from "./TxList";
import { TxSheet } from "./TxSheet";
import { UserMenu } from "./UserMenu";

const TREND_MONTHS = 6;

type SheetState =
  | { mode: "closed" }
  | { mode: "add"; prefill?: ScannedReceipt }
  | { mode: "edit"; tx: Transaction };

export function Dashboard() {
  const { user, signOutUser } = useAuth();
  const uid = user!.uid;

  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<SheetState>({ mode: "closed" });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const months = useMemo(() => lastNMonths(month, TREND_MONTHS), [month]);
  const { data: transactions, loading, error } = useTransactions(uid, months);
  const { data: budgetLimit } = useBudget(uid, month);

  const previousMonth = shiftMonth(month, -1);
  const summary = useMemo(() => summarize(month, transactions), [month, transactions]);
  const previous = useMemo(
    () => summarize(previousMonth, transactions),
    [previousMonth, transactions],
  );
  const slices = useMemo(() => byCategory(month, transactions), [month, transactions]);
  const points = useMemo(() => trend(months, transactions), [months, transactions]);
  const monthTransactions = useMemo(
    () => transactions.filter((tx) => tx.month === month),
    [month, transactions],
  );

  // Thêm mới khi đang xem tháng cũ thì mặc định ghi vào tháng đó, không nhảy về hôm nay.
  const defaultDate =
    month === monthOf(todayISO()) ? todayISO() : `${month}-01`;

  /**
   * Chụp màn hình chuyển khoản rồi dán/kéo thẳng vào trang: quét luôn rồi mở
   * form với số tiền đã điền sẵn. Chỉ bắt khi form đang đóng — lúc form mở thì
   * UploadScan tự xử lý. Không đặt dependency array để handler luôn đọc state mới.
   */
  useEffect(() => {
    if (sheet.mode !== "closed") return;

    async function handleImage(file: File) {
      setScanError(null);
      setScanning(true);
      try {
        setSheet({ mode: "add", prefill: await scanReceipt(file, await user!.getIdToken()) });
      } catch (e) {
        setScanError(describeScanError(e));
      } finally {
        setScanning(false);
      }
    }

    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void handleImage(file);
    };
    const onDrop = (e: DragEvent) => {
      const file = imageFromTransfer(e.dataTransfer);
      if (!file) return;
      e.preventDefault();
      void handleImage(file);
    };
    const allowDrop = (e: DragEvent) => e.preventDefault();

    document.addEventListener("paste", onPaste);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragover", allowDrop);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragover", allowDrop);
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-28">
      {/* animate-fade chạy trên opacity nên biến header thành stacking context riêng:
          z-40 của dropdown trong UserMenu sẽ bị nhốt bên trong và tụt xuống dưới
          thanh chọn tháng (z-20). Đặt z cho chính header để cả khối nổi lên trên. */}
      <header className="animate-fade relative z-30 mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={26} />
          Sổ tiền
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/sao-ke" className={HEADER_BUTTON}>
            Sao kê
          </Link>
          <button
            type="button"
            onClick={() => exportMonthCSV(month, transactions)}
            disabled={monthTransactions.length === 0}
            className={HEADER_BUTTON}
          >
            Xuất CSV
          </button>
          <NotificationBell uid={uid} />
          <UserMenu user={user!} onSignOut={signOutUser} />
        </div>
      </header>

      {/* Một hàng filter duy nhất, đặt trên mọi biểu đồ mà nó chi phối. */}
      <div className="bg-plane/85 sticky top-0 z-20 -mx-4 mb-4 flex justify-center px-4 py-2 backdrop-blur">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {scanError && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {scanError} Bấm <strong>+ Thêm giao dịch</strong> để gõ tay.
        </p>
      )}

      <div className={loading ? "space-y-4 opacity-50" : "space-y-4"}>
        <SummaryPanel
          summary={summary}
          previousMonth={previousMonth}
          delta={spendingDelta(summary.expense, previous.expense)}
        />

        {/* key theo tháng: đổi tháng thì ô sửa hạn mức tự đóng lại */}
        <BudgetBar
          key={month}
          uid={uid}
          month={month}
          limit={budgetLimit}
          spent={summary.expense}
        />

        {summary.count > 0 && <CategoryBars slices={slices} />}

        <MonthlyTrend points={points} currentMonth={month} onSelectMonth={setMonth} />

        <TxList
          transactions={monthTransactions}
          onEdit={(tx) => setSheet({ mode: "edit", tx })}
        />
      </div>

      <button
        type="button"
        onClick={() => setSheet({ mode: "add" })}
        className="bg-brand animate-pop fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-[0_6px_20px_-4px_rgba(194,37,92,0.45)] transition hover:brightness-110 active:scale-95"
      >
        + Thêm giao dịch
      </button>

      {scanning && (
        <div className="animate-fade fixed inset-0 z-40 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
          <p className="card animate-pop flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium shadow-lg">
            <span className="border-expense/25 border-t-expense h-4 w-4 animate-spin rounded-full border-2" />
            Đang đọc hoá đơn…
          </p>
        </div>
      )}

      {sheet.mode !== "closed" && (
        <TxSheet
          uid={uid}
          editing={sheet.mode === "edit" ? sheet.tx : undefined}
          prefill={sheet.mode === "add" ? sheet.prefill : undefined}
          defaultDate={defaultDate}
          nextOrder={(date) => nextOrder(transactions, date)}
          onClose={() => setSheet({ mode: "closed" })}
        />
      )}
    </div>
  );
}
