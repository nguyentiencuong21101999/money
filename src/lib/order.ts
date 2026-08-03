import type { Transaction } from "./types";

/**
 * Giao dịch chưa có `order` (dữ liệu ghi trước khi có trường này) xuống cuối
 * ngày, giữ nguyên nếp cũ — chứ không chen vào giữa các khoản đã đánh số.
 */
const UNSET = Number.MAX_SAFE_INTEGER;

function orderOf(tx: Transaction): number {
  return typeof tx.order === "number" ? tx.order : UNSET;
}

/**
 * Thứ tự hiển thị: ngày mới nhất lên đầu, trong cùng một ngày thì `order` nhỏ
 * nằm trên. So id để hai khoản bằng điểm vẫn xếp cố định, không nhảy mỗi lần render.
 */
export function byNewestFirst(a: Transaction, b: Transaction): number {
  return (
    b.date.localeCompare(a.date) || orderOf(a) - orderOf(b) || a.id.localeCompare(b.id)
  );
}

/** Ngược lại — ngày cũ nhất lên đầu, dùng cho CSV đọc từ trên xuống. */
export function byOldestFirst(a: Transaction, b: Transaction): number {
  return (
    a.date.localeCompare(b.date) || orderOf(a) - orderOf(b) || a.id.localeCompare(b.id)
  );
}

/**
 * Số thứ tự gợi ý cho khoản mới trong `date`: nằm dưới cùng của ngày hôm đó.
 * Đếm cả các khoản chưa có `order` để ngày cũ (toàn dữ liệu chưa đánh số) cũng
 * ra một con số hợp lý, không đè lên nhau.
 */
export function nextOrder(transactions: Transaction[], date: string): number {
  const sameDay = transactions.filter((tx) => tx.date === date);
  return sameDay.reduce((max, tx) => Math.max(max, tx.order ?? 0), sameDay.length) + 1;
}
