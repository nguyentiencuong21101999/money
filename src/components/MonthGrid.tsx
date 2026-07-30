"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/date";
import { useRevealOnOpen } from "@/lib/reveal";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface GridProps {
  value: string;
  /** Tháng nhỏ nhất / lớn nhất được phép chọn, dạng YYYY-MM. */
  min?: string;
  max?: string;
  /** Tháng được tô nhấn nhẹ (thường là tháng hiện tại). */
  highlight?: string;
  onPick: (month: string) => void;
}

/** Lưới 12 tháng kèm thanh chuyển năm. Dùng chung cho mọi chỗ cần chọn tháng. */
export function MonthGrid({ value, min, max, highlight, onPick }: GridProps) {
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Arrow
          label="Năm trước"
          disabled={!!min && year <= Number(min.slice(0, 4))}
          onClick={() => setYear((y) => y - 1)}
        >
          ‹
        </Arrow>
        <span className="text-sm font-semibold tabular-nums">{year}</span>
        <Arrow
          label="Năm sau"
          disabled={!!max && year >= Number(max.slice(0, 4))}
          onClick={() => setYear((y) => y + 1)}
        >
          ›
        </Arrow>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((m) => {
          const month = `${year}-${String(m).padStart(2, "0")}`;
          const selected = month === value;
          const blocked = (!!min && month < min) || (!!max && month > max);
          return (
            <button
              key={m}
              type="button"
              disabled={blocked}
              onClick={() => onPick(month)}
              className={`rounded-lg py-2 text-sm font-medium transition duration-150 active:scale-[0.96] ${
                selected
                  ? "bg-brand text-white shadow-[0_4px_12px_-4px_rgba(194,37,92,0.5)]"
                  : blocked
                    ? "text-muted/40 cursor-not-allowed"
                    : month === highlight
                      ? "text-expense hover:bg-expense/10"
                      : "text-ink-2 hover:bg-expense/8 hover:text-ink"
              }`}
            >
              Tháng {m}
            </button>
          );
        })}
      </div>
    </>
  );
}

interface SelectProps {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (month: string) => void;
}

/**
 * Nút chọn tháng kèm bảng sổ xuống. Thay cho <input type="month"> vì bảng chọn
 * gốc của trình duyệt hiện tiếng Anh, màu xanh mặc định và lạc hẳn tông app.
 */
export function MonthSelect({ label, value, min, max, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRevealOnOpen<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <span className="text-ink-2 text-xs font-medium">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`field mt-1 flex items-center justify-between gap-2 text-left ${
          open ? "border-expense" : "hover:border-expense/45"
        }`}
      >
        <span className="truncate tabular-nums">{monthLabel(value)}</span>
        <span
          aria-hidden="true"
          className={`text-muted shrink-0 text-[9px] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          className="card animate-drop border-expense/25 absolute top-full left-0 z-40 mt-1.5 w-60 p-3 shadow-lg"
        >
          <MonthGrid
            value={value}
            min={min}
            max={max}
            onPick={(month) => {
              onChange(month);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-ink-2 hover:bg-expense/8 hover:text-expense h-7 w-7 shrink-0 rounded-lg text-lg leading-none transition duration-150 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
