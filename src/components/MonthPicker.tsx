"use client";

import { useEffect, useRef, useState } from "react";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/date";
import { useRevealOnOpen } from "@/lib/reveal";
import { Arrow, MonthGrid } from "./MonthGrid";

interface Props {
  month: string;
  onChange: (month: string) => void;
}

export function MonthPicker({ month, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRevealOnOpen<HTMLDivElement>(open);

  const latest = currentMonth();
  const atLatest = month >= latest;

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

  function pick(value: string) {
    onChange(value);
    setOpen(false);
  }

  return (
    <div className="relative" ref={root}>
      {/* Viền ngả tím khi rê chuột và khi đang mở, để nút này đọc ra là bấm được.
          Viên thuốc kính: thanh này nổi trên nội dung đang cuộn nên dùng
          glass-bar (đặc hơn thẻ thường), không phải card. */}
      <div
        className={`glass-bar ring-ramp flex items-center gap-1 rounded-full p-0.5 transition-colors duration-200 ${
          open ? "is-ringed" : ""
        }`}
      >
        <Arrow label="Tháng trước" onClick={() => onChange(shiftMonth(month, -1))}>
          ‹
        </Arrow>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="hover:bg-expense/10 flex min-w-32 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150"
        >
          {monthLabel(month)}
          <span
            aria-hidden="true"
            className={`text-muted text-[9px] transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        <Arrow
          label="Tháng sau"
          disabled={atLatest}
          onClick={() => onChange(shiftMonth(month, 1))}
        >
          ›
        </Arrow>
      </div>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Chọn tháng"
          className="card overlay-surface animate-drop border-expense/25 absolute top-full left-1/2 z-40 mt-2 w-64 -translate-x-1/2 p-3 shadow-lg"
        >
          <MonthGrid value={month} max={latest} highlight={latest} onPick={pick} />

          <button
            type="button"
            onClick={() => pick(latest)}
            disabled={month === latest}
            className="frame-ramp text-ink-2 mt-2.5 w-full rounded-lg py-1.5 text-xs font-medium transition duration-150 disabled:opacity-40"
          >
            Về tháng này
          </button>
        </div>
      )}
    </div>
  );
}
