import type { Transaction } from "./types";

/**
 * Giao dịch chưa có `order` (dữ liệu ghi trước khi có trường này) xuống cuối
 * ngày: chúng cũ hơn mọi khoản mới thêm, mà mới nhất thì phải nằm trên.
 * Dùng -1 chứ không phải 0 vì `order` bắt đầu từ 1.
 */
const UNSET = -1;

function orderOf(tx: Transaction): number {
  return typeof tx.order === "number" ? tx.order : UNSET;
}

/**
 * Thứ tự hiển thị: ngày mới nhất lên đầu, trong cùng một ngày thì `order` LỚN
 * nằm trên — khoản vừa thêm nhận số lớn nhất nên hiện ngay đầu ngày, không phải
 * đi tìm ở cuối. So id để hai khoản bằng điểm vẫn xếp cố định, không nhảy mỗi
 * lần render.
 */
export function byNewestFirst(a: Transaction, b: Transaction): number {
  return (
    b.date.localeCompare(a.date) || orderOf(b) - orderOf(a) || a.id.localeCompare(b.id)
  );
}

/** Ngược lại — cũ nhất lên đầu, dùng cho CSV đọc từ trên xuống. */
export function byOldestFirst(a: Transaction, b: Transaction): number {
  return (
    a.date.localeCompare(b.date) || orderOf(a) - orderOf(b) || a.id.localeCompare(b.id)
  );
}

/**
 * Số thứ tự cho khoản MỚI trong `date`: lớn hơn mọi khoản đang có nên nằm đầu
 * ngày. Đếm cả các khoản chưa có `order` để ngày cũ (toàn dữ liệu chưa đánh số)
 * cũng ra một con số hợp lý, không đè lên nhau.
 *
 * Chỉ dùng khi THÊM. Sửa một khoản cũ thì giữ nguyên `order` của nó, không gọi
 * hàm này — không thì mỗi lần sửa là khoản đó lại nhảy lên đầu ngày.
 */
export function nextOrder(transactions: Transaction[], date: string): number {
  const sameDay = transactions.filter((tx) => tx.date === date);
  return sameDay.reduce((max, tx) => Math.max(max, tx.order ?? 0), sameDay.length) + 1;
}
