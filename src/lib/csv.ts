// Kèm đuôi .ts vì csv.test.ts chạy thẳng bằng node, không qua bundler.
import { byOldestFirst } from "./order.ts";
import type { Transaction } from "./types";

const HEADERS = [
  "Tháng",
  "Ngày",
  "Loại",
  "Số tiền (VND)",
  "Danh mục",
  "Ghi chú",
  "Nơi thanh toán",
  "Nguồn",
];

/**
 * Dùng dấu chấm phẩy: Excel ở locale Việt Nam lấy `,` làm dấu thập phân nên
 * file phân tách bằng `,` sẽ dồn hết vào một cột. Numbers và Google Sheets đều tự nhận `;`.
 */
const SEP = ";";

/** Xuất giao dịch của một khoảng tháng bất kỳ ra CSV (tải file về máy). */
export function exportCSV(months: string[], transactions: Transaction[]) {
  // BOM để Excel nhận đúng UTF-8, không thì tiếng Việt thành ký tự lạ.
  download(
    fileName(months),
    new Blob(["﻿" + buildCSV(months, transactions)], {
      type: "text/csv;charset=utf-8;",
    }),
  );
}

/** Phần sinh nội dung, tách riêng khỏi thao tác tải file để test được bằng node. */
export function buildCSV(months: string[], transactions: Transaction[]): string {
  const wanted = new Set(months);
  const rows = transactions
    .filter((tx) => wanted.has(tx.month))
    .sort(byOldestFirst);

  const body = rows.map((tx) => [
    tx.month,
    tx.date,
    tx.type === "income" ? "Tiền vào" : "Tiền ra",
    String(tx.amount),
    tx.category,
    tx.note,
    tx.merchant ?? "",
    tx.source === "ocr" ? "Đọc từ ảnh" : "Gõ tay",
  ]);

  const lines: string[][] = [HEADERS, ...body, []];

  // Nhiều tháng thì thêm bảng tổng từng tháng, để mở Excel là thấy ngay xu hướng.
  if (months.length > 1) {
    lines.push(["Tổng theo tháng"], ["Tháng", "", "", "Vào", "Ra", "Số dư"]);
    for (const month of [...months].sort()) {
      const inMonth = rows.filter((tx) => tx.month === month);
      const income = sum(inMonth.filter((t) => t.type === "income"));
      const expense = sum(inMonth.filter((t) => t.type === "expense"));
      lines.push([
        month,
        "",
        "",
        String(income),
        String(expense),
        String(income - expense),
      ]);
    }
    lines.push([]);
  }

  const income = sum(rows.filter((t) => t.type === "income"));
  const expense = sum(rows.filter((t) => t.type === "expense"));
  lines.push(
    ["Tổng tiền vào", "", "", String(income)],
    ["Tổng tiền ra", "", "", String(expense)],
    ["Số dư", "", "", String(income - expense)],
    ["Số giao dịch", "", "", String(rows.length)],
  );

  return lines.map((row) => row.map(escape).join(SEP)).join("\r\n");
}

/** Xuất đúng một tháng — dùng ở dashboard. */
export function exportMonthCSV(month: string, transactions: Transaction[]) {
  exportCSV([month], transactions);
}

function fileName(months: string[]): string {
  if (months.length === 0) return "so-tien.csv";
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last
    ? `so-tien-${first}.csv`
    : `so-tien-${first}_den_${last}.csv`;
}

function sum(rows: Transaction[]): number {
  return rows.reduce((total, tx) => total + tx.amount, 0);
}

function escape(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
