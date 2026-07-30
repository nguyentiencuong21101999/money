import { monthShort } from "./date";
import type { Transaction } from "./types";

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export function summarize(month: string, transactions: Transaction[]): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const tx of transactions) {
    if (tx.month !== month) continue;
    count += 1;
    if (tx.type === "income") income += tx.amount;
    else expense += tx.amount;
  }
  return { month, income, expense, balance: income - expense, count };
}

export interface CategorySlice {
  category: string;
  total: number;
  /** 0..1, tỉ trọng trên tổng chi của tháng */
  share: number;
}

/** Gộp mọi khoản chi trong danh sách theo danh mục, sắp xếp giảm dần. */
export function byCategoryOf(transactions: Transaction[]): CategorySlice[] {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount);
    sum += tx.amount;
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total, share: sum ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Chi tiêu của riêng một tháng, gộp theo danh mục. */
export function byCategory(month: string, transactions: Transaction[]): CategorySlice[] {
  return byCategoryOf(transactions.filter((tx) => tx.month === month));
}

export interface TrendPoint {
  month: string;
  label: string;
  income: number;
  expense: number;
}

export function trend(months: string[], transactions: Transaction[]): TrendPoint[] {
  return months.map((month) => {
    const { income, expense } = summarize(month, transactions);
    return { month, label: monthShort(month), income, expense };
  });
}

/**
 * Mức thay đổi chi tiêu so với tháng trước.
 * null khi tháng trước không chi đồng nào (chia cho 0 thì % vô nghĩa).
 */
export function spendingDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
