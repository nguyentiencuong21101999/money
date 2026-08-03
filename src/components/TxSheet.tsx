"use client";

import { useEffect, useState } from "react";
import { categoriesFor } from "@/lib/categories";
import { todayISO } from "@/lib/date";
import { formatVND, parseAmount } from "@/lib/money";
import { draftFromScan, type ScannedReceipt } from "@/lib/scan";
import {
  addTransaction,
  deleteTransaction,
  updateTransaction,
  type TransactionDraft,
} from "@/lib/transactions";
import type { Transaction, TxType } from "@/lib/types";
import { DateSelect } from "./DateSelect";
import { UploadScan } from "./UploadScan";

interface Props {
  uid: string;
  /** Có giá trị = đang sửa; undefined = thêm mới. */
  editing?: Transaction;
  /** Ngày mặc định khi thêm mới, để khớp tháng đang xem. */
  defaultDate?: string;
  /** Ảnh dán ở dashboard đã quét xong — dùng làm giá trị khởi tạo cho form. */
  prefill?: ScannedReceipt;
  /** Thứ tự gợi ý cho khoản mới trong một ngày — tính theo dữ liệu đang tải. */
  nextOrder?: (date: string) => number;
  onClose: () => void;
}

export function TxSheet({
  uid,
  editing,
  defaultDate,
  prefill,
  nextOrder,
  onClose,
}: Props) {
  // Chỉ dùng cho giá trị khởi tạo, nên tính một lần lúc mount là đủ.
  const [seed] = useState(() => (prefill ? draftFromScan(prefill) : null));

  const [type, setType] = useState<TxType>(editing?.type ?? seed?.type ?? "expense");
  const [amountText, setAmountText] = useState(
    editing ? String(editing.amount) : (seed?.amountText ?? ""),
  );
  const [note, setNote] = useState(editing?.note ?? seed?.note ?? "");
  const [category, setCategory] = useState(
    editing?.category ?? seed?.category ?? "Ăn uống",
  );
  const [date, setDate] = useState(
    editing?.date ?? seed?.date ?? defaultDate ?? todayISO(),
  );
  const [merchant, setMerchant] = useState(editing?.merchant ?? seed?.merchant ?? "");
  const [thumbnail, setThumbnail] = useState(editing?.thumbnail ?? seed?.thumbnail);
  const [source, setSource] = useState<"manual" | "ocr">(
    editing?.source ?? (seed ? "ocr" : "manual"),
  );
  const [lowConfidence, setLowConfidence] = useState(seed?.lowConfidence ?? false);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const options = categoriesFor(type);
  // Thứ tự trong ngày chạy ngầm, không hiện ra form: khoản mới xuống cuối ngày
  // đang chọn, khoản cũ giữ nguyên số đã có.
  const order = editing?.order ?? nextOrder?.(date);

  /** Đổi Thu/Chi thì danh mục cũ có thể không còn hợp lệ — đổi luôn tại đây. */
  function switchType(next: TxType) {
    setType(next);
    const nextOptions = categoriesFor(next);
    if (!nextOptions.includes(category)) setCategory(nextOptions[0]);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Quét ảnh ngay trong form: ghi đè các ô, nhưng giữ ghi chú người dùng đã gõ. */
  function applyScan(scanned: ScannedReceipt) {
    const next = draftFromScan(scanned);
    setType(next.type);
    if (next.amountText) setAmountText(next.amountText);
    setCategory(next.category);
    if (next.date) setDate(next.date);
    if (next.merchant) setMerchant(next.merchant);
    if (next.note && !note) setNote(next.note);
    setThumbnail(next.thumbnail);
    setSource("ocr");
    setLowConfidence(next.lowConfidence);
  }

  async function save() {
    if (amount <= 0) {
      setError(
        amountText.trim()
          ? `Chưa hiểu "${amountText}" là bao nhiêu. Thử gõ 50000, 50k hoặc 1tr5.`
          : "Bạn quên nhập số tiền rồi.",
      );
      return;
    }
    setSaving(true);
    setSlow(false);
    setError(null);
    // addDoc của Firestore không reject khi mất kết nối — nó chờ vô hạn.
    // Sau 8 giây thì nói cho người dùng biết thay vì để spinner quay mãi.
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    const draft: TransactionDraft = {
      type,
      amount,
      note: note.trim(),
      category,
      date,
      source,
      merchant: merchant.trim() || undefined,
      thumbnail,
      order,
    };
    try {
      if (editing) await updateTransaction(uid, editing.id, draft);
      else await addTransaction(uid, draft);
      onClose();
    } catch (e) {
      console.error("[save]", e);
      const code = (e as { code?: string })?.code;
      setError(
        code === "permission-denied"
          ? "Firestore từ chối ghi. Kiểm tra đã Publish nội dung firestore.rules chưa (bước B7 trong CHECKLIST.md)."
          : `Lưu thất bại: ${e instanceof Error ? e.message : String(e)}`,
      );
      setSaving(false);
    } finally {
      clearTimeout(slowTimer);
    }
  }

  async function remove() {
    if (!editing || !confirm("Xoá giao dịch này?")) return;
    setSaving(true);
    try {
      await deleteTransaction(uid, editing.id);
      onClose();
    } catch (e) {
      setError(`Xoá thất bại: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Trên điện thoại đây là bottom sheet nên trượt lên từ đáy; từ sm trở lên
          nó nằm giữa màn hình như hộp thoại nên bật ra tại chỗ hợp lý hơn. */}
      <div className="card animate-sheet sm:animate-pop max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {editing ? "Sửa giao dịch" : "Thêm giao dịch"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-muted hover:bg-plane hover:text-ink -mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none active:scale-90"
          >
            ×
          </button>
        </div>

        <div className="mt-4">
          <UploadScan
            onScanned={applyScan}
            thumbnail={thumbnail}
            onRemove={() => setThumbnail(undefined)}
          />
        </div>

        <div className="mt-4 space-y-3.5">
          <div className="border-hairline grid grid-cols-2 gap-1 rounded-xl border p-1">
            <TypeTab
              active={type === "expense"}
              accent="expense"
              onClick={() => switchType("expense")}
            >
              Tiền ra
            </TypeTab>
            <TypeTab
              active={type === "income"}
              accent="income"
              onClick={() => switchType("income")}
            >
              Tiền vào
            </TypeTab>
          </div>

          <label className="block">
            <span className="text-ink-2 text-xs font-medium">Số tiền</span>
            <input
              autoFocus
              inputMode="decimal"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                setLowConfidence(false);
              }}
              placeholder="vd: 50k · 1tr · 250.000"
              className={`field mt-1 text-lg font-semibold tabular-nums ${
                lowConfidence ? "border-warning bg-warning/10" : ""
              }`}
            />
            <span className="text-muted mt-1 block text-xs">
              {amount > 0 ? `= ${formatVND(amount)}` : "Gõ được cả 50k, 1tr, 1,5tr"}
            </span>
          </label>

          {lowConfidence && (
            <p className="border-warning/50 bg-warning/10 text-ink-2 rounded-lg border px-3 py-2 text-xs">
              ⚠️ Số tiền này đọc chưa chắc chắn — ngó lại một cái trước khi lưu nhé.
            </p>
          )}

          <label className="block">
            <span className="text-ink-2 text-xs font-medium">
              Ghi chú <span className="text-muted font-normal">(tiêu vào việc gì?)</span>
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="vd: Ăn trưa với team"
              className="field mt-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-ink-2 text-xs font-medium">Danh mục</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="field mt-1"
              >
                {options.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <DateSelect label="Ngày" value={date} onChange={setDate} />
          </div>

          <label className="block">
            <span className="text-ink-2 text-xs font-medium">
              Nơi thanh toán <span className="text-muted font-normal">(không bắt buộc)</span>
            </span>
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="vd: Circle K"
              className="field mt-1"
            />
          </label>

          {error && <p className="text-critical text-sm">{error}</p>}

          {slow && (
            <p className="border-warning/50 bg-warning/10 text-ink-2 rounded-lg border px-3 py-2 text-xs">
              Firestore chưa phản hồi sau 8 giây. Thường là mất mạng, hoặc trình chặn
              quảng cáo / tường lửa đang chặn kết nối tới{" "}
              <code>firestore.googleapis.com</code>. Giao dịch đã lưu tạm trên máy và sẽ
              tự đồng bộ khi kết nối lại.
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            {editing && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="text-critical border-critical/30 hover:bg-critical/[0.07] rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                Xoá
              </button>
            )}
            {/* Chỉ khoá khi đang lưu. KHÔNG khoá khi số tiền trống — nếu khoá thì
                cú bấm không tới được save() và người dùng không hiểu vì sao im lặng. */}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-brand flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition duration-200 active:scale-[0.98] disabled:opacity-40"
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeTab({
  active,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  accent: "income" | "expense";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    accent === "income"
      ? "bg-income/[0.12] text-income"
      : "bg-expense/[0.12] text-expense";
  // Tab không hoạt động vẫn khai báo nền trong suốt để trình duyệt nội suy được
  // màu nền khi đổi tab, thay vì nhảy phịch một cái.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg py-2 text-sm font-medium transition-colors duration-200 ease-out ${
        active ? activeClass : "text-muted hover:bg-plane hover:text-ink-2 bg-transparent"
      }`}
    >
      {children}
    </button>
  );
}
