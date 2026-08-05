"use client";

import { useState } from "react";
import { monthLabel, shiftMonth } from "@/lib/date";
import { MonthSelect } from "./MonthGrid";

export interface MonthRange {
  from: string;
  to: string;
}

type PresetId = "3m" | "6m" | "12m" | "year" | "custom";

const PRESETS: { id: PresetId; label: string; from: (latest: string) => string }[] = [
  { id: "3m", label: "3 tháng", from: (m) => shiftMonth(m, -2) },
  { id: "6m", label: "6 tháng", from: (m) => shiftMonth(m, -5) },
  { id: "12m", label: "12 tháng", from: (m) => shiftMonth(m, -11) },
  { id: "year", label: "Năm nay", from: (m) => `${m.slice(0, 4)}-01` },
];

export const DEFAULT_PRESET: PresetId = "3m";

/** Khoảng mặc định khi mở trang sao kê. */
export function defaultRange(latest: string): MonthRange {
  return { from: shiftMonth(latest, -2), to: latest };
}

interface Props {
  /** Tháng mới nhất được phép chọn. */
  latest: string;
  value: MonthRange;
  onChange: (range: MonthRange) => void;
}

export function RangePicker({ latest, value, onChange }: Props) {
  const [preset, setPreset] = useState<PresetId>(DEFAULT_PRESET);

  return (
    <section className="card animate-rise relative z-30 mb-4 p-4">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((option) => (
          <Chip
            key={option.id}
            active={preset === option.id}
            onClick={() => {
              setPreset(option.id);
              onChange({ from: option.from(latest), to: latest });
            }}
          >
            {option.label}
          </Chip>
        ))}
        <Chip active={preset === "custom"} onClick={() => setPreset("custom")}>
          Tuỳ chọn
        </Chip>
      </div>

      {preset === "custom" ? (
        // Chỉ hiện hai ô chọn khi thật sự cần — mặc định bốn nút nhanh là đủ.
        <div className="animate-rise mt-3 grid grid-cols-2 gap-3">
          <MonthSelect
            label="Từ tháng"
            value={value.from}
            max={value.to}
            onChange={(from) => onChange({ ...value, from })}
          />
          <MonthSelect
            label="Đến tháng"
            value={value.to}
            min={value.from}
            max={latest}
            onChange={(to) => onChange({ ...value, to })}
          />
        </div>
      ) : (
        <p className="text-muted mt-2.5 text-xs">
          {monthLabel(value.from)} → {monthLabel(value.to)}
        </p>
      )}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition active:scale-[0.96] ${
        active ? "bg-brand text-white" : "frame-ramp text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}
