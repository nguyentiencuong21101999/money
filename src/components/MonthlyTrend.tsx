"use client";

import { monthLabel } from "@/lib/date";
import { formatCompact, formatVND } from "@/lib/money";
import type { TrendPoint } from "@/lib/stats";

const PLOT_HEIGHT = 140;

interface Props {
  points: TrendPoint[];
  currentMonth: string;
  onSelectMonth: (month: string) => void;
}

export function MonthlyTrend({ points, currentMonth, onSelectMonth }: Props) {
  const peak = Math.max(...points.map((p) => Math.max(p.income, p.expense)), 0);
  const scaleMax = niceCeil(peak);
  const ticks = scaleMax > 0 ? [scaleMax, scaleMax / 2, 0] : [0];

  return (
    <section className="card animate-rise p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Thu chi {points.length} tháng gần đây</h2>
        <ul className="flex gap-3">
          <LegendItem swatch="bg-income">Tiền vào</LegendItem>
          <LegendItem swatch="bg-expense">Tiền ra</LegendItem>
        </ul>
      </div>

      <div className="mt-4 flex gap-2">
        {/* Trục giá trị: gánh những con số không được dán nhãn trực tiếp. */}
        <div
          className="text-muted flex w-11 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {formatCompact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden="true"
                className="bg-grid absolute inset-x-0 h-px"
                style={{ bottom: scaleMax ? `${(t / scaleMax) * 100}%` : 0 }}
              />
            ))}

            <div className="absolute inset-0 flex items-end">
              {points.map((p, index) => (
                <button
                  key={p.month}
                  type="button"
                  onClick={() => onSelectMonth(p.month)}
                  aria-label={`${monthLabel(p.month)}: vào ${formatVND(p.income)}, ra ${formatVND(p.expense)}`}
                  // Tháng đang xem: nền hồng rất nhạt + gạch chân hồng ở đáy,
                  // rõ hơn hẳn nền xám cũ mà vẫn không át được cột dữ liệu.
                  className={`group/bar relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-t transition-colors duration-200 ${
                    p.month === currentMonth
                      ? "bg-expense/8 shadow-[inset_0_-2px_0_0_var(--color-expense)]"
                      : "hover:bg-expense/5"
                  }`}
                >
                  {/* Cùng một delay cho cặp cột của tháng: hai chuỗi phải mọc
                      đồng thời thì mắt mới so sánh được vào/ra trong tháng đó. */}
                  <Bar
                    value={p.income}
                    max={scaleMax}
                    className="bg-income"
                    delay={Math.min(index * 55, 300)}
                  />
                  <Bar
                    value={p.expense}
                    max={scaleMax}
                    className="bg-expense"
                    delay={Math.min(index * 55, 300)}
                  />

                  {/* invisible (không phải chỉ opacity-0) để tooltip biến mất hẳn
                      khỏi luồng đọc màn hình và không chắn chuột khi rời hover. */}
                  <span className="border-hairline bg-surface pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-1 block -translate-x-1/2 translate-y-1 rounded-lg border px-2.5 py-1.5 text-left text-xs whitespace-nowrap opacity-0 shadow-sm transition-[opacity,transform] duration-200 ease-out group-hover/bar:visible group-hover/bar:translate-y-0 group-hover/bar:opacity-100">
                    <span className="block font-medium">{monthLabel(p.month)}</span>
                    <span className="text-ink-2 block tabular-nums">
                      Vào {formatVND(p.income)}
                    </span>
                    <span className="text-ink-2 block tabular-nums">
                      Ra {formatVND(p.expense)}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <span aria-hidden="true" className="bg-axis absolute inset-x-0 bottom-0 h-px" />
          </div>

          <div className="mt-1.5 flex">
            {points.map((p) => (
              <span
                key={p.month}
                className={`flex-1 text-center text-[11px] ${
                  p.month === currentMonth ? "text-ink font-semibold" : "text-muted"
                }`}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({
  value,
  max,
  className,
  delay,
}: {
  value: number;
  max: number;
  className: string;
  delay: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <span
      className={`animate-grow-y w-full max-w-[16px] rounded-t ${className}`}
      style={{
        height: value > 0 ? `max(3px, ${pct}%)` : 0,
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <li className="text-ink-2 flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${swatch}`} />
      {children}
    </li>
  );
}

/**
 * Làm tròn trần lên số "đẹp" để nhãn trục dễ đọc: 22tr → 25tr.
 * Bậc dày (không chỉ 1/2/5) để cột không bị lùn giả tạo vì trần quá rộng.
 */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = NICE_STEPS.find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}
