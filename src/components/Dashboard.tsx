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
import { Loading } from "./Loading";
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
  const { data: transactions, loading: txLoading, error } = useTransactions(uid, months);
  const { data: budgetLimit, loading: budgetLoading } = useBudget(uid, month);
  // Chờ cả hai: hạn mức về sau giao dịch thì BudgetBar nhảy từ "chưa đặt hạn
  // mức" sang thanh tiến độ, trông như app tự đổi ý.
  const loading = txLoading || budgetLoading;

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

  /*
   * Chưa có dữ liệu thì chưa vẽ gì cả — kể cả đầu trang và thanh chọn tháng.
   *
   * Đặt sau toàn bộ hook để thứ tự hook không đổi giữa các lần render. Vẽ đầu
   * trang trước rồi chờ tiếp ở khoảng giữa thì thành hai nhịp chờ nối nhau: màn
   * xác thực vừa tắt, đầu trang hiện ra, xong lại một màn chờ nữa. Trả về đúng
   * cái màn chờ AuthGate đang dùng thì người dùng chỉ thấy một nhịp, rồi cả
   * trang hiện ra một lượt.
   */
  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-28">
      {/* animate-fade chạy trên opacity nên biến header thành stacking context riêng:
          z-40 của dropdown trong UserMenu sẽ bị nhốt bên trong và tụt xuống dưới
          thanh chọn tháng (z-20). Đặt z cho chính header để cả khối nổi lên trên. */}
      <header className="animate-fade relative z-30 mb-4 flex items-center justify-between gap-3">
        {/* Co được (min-w-0 + truncate) chứ không shrink-0: máy 320px thì chữ
            cắt bớt một chút, còn hơn gãy hai dòng hay đẩy cả trang tràn ngang. */}
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
          <Logo size={26} />
          <span className="truncate">Sổ tiền</span>
        </h1>
        {/* `relative` ở đây là mốc neo cho hộp thư của chuông — xem NotificationBell. */}
        <div className="relative flex shrink-0 items-center gap-2">
          <Link href="/sao-ke" className={HEADER_BUTTON}>
            Sao kê
          </Link>
          <button
            type="button"
            onClick={() => exportMonthCSV(month, transactions)}
            disabled={monthTransactions.length === 0}
            className={HEADER_BUTTON}
          >
            <span className="sm:hidden">CSV</span>
            <span className="hidden sm:inline">Xuất CSV</span>
          </button>
          <NotificationBell uid={uid} />
          <UserMenu user={user!} onSignOut={signOutUser} />
        </div>
      </header>

      {/* Một hàng filter duy nhất, đặt trên mọi biểu đồ mà nó chi phối.
          Trước đây cả dải ngang phủ một lớp nền mờ chạy hết bề rộng; giờ chính
          MonthPicker là viên kính nên dải nền đó thừa — bỏ đi thì nội dung cuộn
          trôi phía sau viên thuốc, đúng cách iOS xếp lớp. */}
      <div className="sticky top-2 z-20 mb-4 flex justify-center">
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

      <div className="space-y-4">
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
        className="bg-brand animate-pop fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition active:scale-95"
      >
        + Thêm giao dịch
      </button>

      {scanning && (
        <div className="animate-fade fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-md">
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
