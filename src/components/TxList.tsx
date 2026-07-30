"use client";

import { useState } from "react";
import { iconFor } from "@/lib/categories";
import { dayLabel } from "@/lib/date";
import { formatVND } from "@/lib/money";
import type { Transaction } from "@/lib/types";
import { CollapsibleGroup, GroupList, netOf } from "./CollapsibleGroup";

interface Props {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
}

export function TxList({ transactions, onEdit }: Props) {
  /** Ngày đang mở. null = chưa bấm gì, mặc định mở ngày gần nhất. */
  const [open, setOpen] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <div className="card animate-pop px-5 py-12 text-center">
        <div className="animate-rise text-3xl" style={{ animationDelay: "80ms" }}>
          🧾
        </div>
        <p className="mt-2 text-sm font-medium">Tháng này chưa ghi khoản nào</p>
        <p className="text-muted mt-1 text-sm">
          Bấm <strong>+ Thêm giao dịch</strong> để gõ tay,
          <br />
          hoặc dán thẳng ảnh hoá đơn vào đây.
        </p>
      </div>
    );
  }

  const days = groupByDay(transactions);
  const active = open ?? days[0][0];

  return (
    <GroupList>
      {days.map(([date, rows], i) => {
        const expanded = date === active;
        return (
          <CollapsibleGroup
            key={date}
            title={dayLabel(date)}
            count={rows.length}
            net={netOf(rows)}
            expanded={expanded}
            onToggle={() => setOpen(expanded ? "" : date)}
            // So le nhẹ cho có nhịp; chặn ở 250ms để nhóm cuối khỏi chờ lâu.
            delay={`${Math.min(i * 50, 250)}ms`}
          >
            {rows.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => onEdit(tx)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition duration-200 ease-out hover:bg-black/2.5 active:scale-[0.99]"
                >
                  {tx.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tx.thumbnail}
                      alt=""
                      className="border-hairline h-10 w-10 shrink-0 rounded-lg border object-cover"
                    />
                  ) : (
                    <span className="bg-plane border-hairline flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg">
                      {iconFor(tx.category)}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {tx.note || tx.merchant || tx.category}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {tx.category}
                      {tx.merchant && tx.note ? ` · ${tx.merchant}` : ""}
                      {tx.source === "ocr" ? " · 📷 từ ảnh" : ""}
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
                </button>
              </li>
            ))}
          </CollapsibleGroup>
        );
      })}
    </GroupList>
  );
}

function groupByDay(transactions: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const bucket = map.get(tx.date);
    if (bucket) bucket.push(tx);
    else map.set(tx.date, [tx]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
