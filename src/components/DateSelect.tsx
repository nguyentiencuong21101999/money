"use client";

import { useEffect, useRef, useState } from "react";
import { monthOf, todayISO } from "@/lib/date";
import { useRevealOnOpen } from "@/lib/reveal";

/** Tuần Việt Nam bắt đầu từ Thứ 2. */
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

interface Props {
  label: string;
  /** YYYY-MM-DD */
  value: string;
  onChange: (date: string) => void;
}

/**
 * Ô chọn ngày kèm lịch riêng của app. Thay cho <input type="date"> vì lịch gốc
 * của trình duyệt hiện tiếng Anh, tuần bắt đầu từ Chủ nhật và màu xanh mặc định.
 */
export function DateSelect({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(value));
  const root = useRef<HTMLDivElement>(null);
  const panel = useRevealOnOpen<HTMLDivElement>(open);
  const today = todayISO();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      // Lịch nằm ngoài `root` (là ô grid riêng) nên phải kiểm tra cả hai khối.
      if (root.current?.contains(target) || panel.current?.contains(target))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panel]);

  /** Mở lịch thì luôn nhảy về tháng của ngày đang chọn. */
  function toggle() {
    if (!open) setView(monthOf(value));
    setOpen((v) => !v);
  }

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  /*
    Ô này nằm trong hộp thoại có thanh cuộn riêng. Nếu để lịch định vị tuyệt
    đối thì nó không thuộc luồng cuộn của hộp thoại, mở ra là tràn khỏi đáy và
    cuộn cách mấy cũng không thấy hết. Nên chèn lịch thành một hàng trong lưới
    (col-span-2 = chiếm trọn bề ngang): nội dung bị đẩy xuống, hộp thoại tự dài
    ra, cuộn tới là thấy đủ.
    Trả về fragment để hai khối thành hai ô của lưới cha.
  */
  return (
    <>
      <div ref={root}>
        <span className="text-ink-2 text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`field mt-1 flex items-center justify-between gap-2 text-left ${
            open ? "border-expense" : "hover:border-expense/45"
          }`}
        >
          <span className="truncate tabular-nums">{formatDMY(value)}</span>
          <span aria-hidden="true" className="text-muted shrink-0 text-sm">
            🗓
          </span>
        </button>
      </div>

      {open && (
        <div className="col-span-2">
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            // scroll-mb để useRevealOnOpen chừa khoảng thở dưới đáy,
            // không căn sát mép rồi thiếu vài pixel.
            className="card border-expense/25 scroll-mb-5 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <NavArrow
                label="Tháng trước"
                onClick={() => setView(addMonths(view, -1))}
              >
                ‹
              </NavArrow>
              <span className="text-sm font-semibold">{viewLabel(view)}</span>
              <NavArrow
                label="Tháng sau"
                onClick={() => setView(addMonths(view, 1))}
              >
                ›
              </NavArrow>
            </div>

            <div className="text-muted mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cellsFor(view).map((date, i) =>
                date === null ? (
                  <span key={`x${i}`} />
                ) : (
                  <button
                    key={date}
                    type="button"
                    onClick={() => pick(date)}
                    className={`h-8 rounded-lg text-sm tabular-nums transition duration-150 active:scale-90 ${
                      date === value
                        ? "bg-brand font-semibold text-white shadow-[0_4px_10px_-4px_rgba(194,37,92,0.5)]"
                        : date === today
                          ? "text-expense font-semibold ring-expense/40 ring-1 ring-inset"
                          : "text-ink-2 hover:bg-expense/8 hover:text-ink"
                    }`}
                  >
                    {Number(date.slice(8))}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              onClick={() => pick(today)}
              disabled={value === today}
              className="border-hairline text-ink-2 hover:border-expense/40 hover:text-expense mt-2.5 w-full rounded-lg border py-1.5 text-xs font-medium transition duration-150 disabled:opacity-40 disabled:hover:border-current"
            >
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "2026-07-30" → "30/07/2026" */
function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function viewLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Các ô của lưới lịch: null cho phần đệm đầu tháng, còn lại là YYYY-MM-DD.
 * Chỉ dựng ngày từ các thành phần rời nên không dính chuyện lệch múi giờ.
 */
function cellsFor(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  // getDay() trả 0 cho Chủ nhật; đổi về tuần bắt đầu Thứ 2.
  const leading = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const total = new Date(y, m, 0).getDate();

  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: total },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
}

function NavArrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-ink-2 hover:bg-expense/8 hover:text-expense h-7 w-7 shrink-0 rounded-lg text-lg leading-none transition duration-150 active:scale-90"
    >
      {children}
    </button>
  );
}
