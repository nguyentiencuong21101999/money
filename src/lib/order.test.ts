import assert from "node:assert/strict";
import { test } from "node:test";
import { byNewestFirst, byOldestFirst, nextOrder } from "./order.ts";
import type { Transaction } from "./types.ts";

function tx(id: string, date: string, order?: number): Transaction {
  return {
    id,
    type: "expense",
    amount: 1000,
    note: "",
    category: "Khác",
    date,
    month: date.slice(0, 7),
    source: "manual",
    ...(order === undefined ? {} : { order }),
  };
}

test("trong cùng một ngày thì số thứ tự lớn nằm trên", () => {
  const rows = [tx("a", "2026-08-01", 1), tx("c", "2026-08-01", 3), tx("b", "2026-08-01", 2)];
  assert.deepEqual([...rows].sort(byNewestFirst).map((r) => r.id), ["c", "b", "a"]);
});

test("ngày mới nhất vẫn lên đầu, thứ tự chỉ xếp bên trong ngày", () => {
  const rows = [tx("cu", "2026-07-31", 9), tx("moi", "2026-08-01", 1)];
  assert.deepEqual([...rows].sort(byNewestFirst).map((r) => r.id), ["moi", "cu"]);
});

test("khoản chưa đánh số xuống cuối ngày — chúng cũ hơn mọi khoản mới thêm", () => {
  const rows = [tx("cu-1", "2026-08-01"), tx("moi", "2026-08-01", 5), tx("cu-2", "2026-08-01")];
  assert.deepEqual(
    [...rows].sort(byNewestFirst).map((r) => r.id),
    ["moi", "cu-1", "cu-2"],
  );
});

test("CSV xếp ngược lại — ngày cũ lên đầu, trong ngày thì cũ trước mới sau", () => {
  const rows = [tx("b", "2026-08-01", 2), tx("cu", "2026-07-31", 1), tx("a", "2026-08-01", 1)];
  assert.deepEqual([...rows].sort(byOldestFirst).map((r) => r.id), ["cu", "a", "b"]);

  // Khoản chưa đánh số là cũ nhất nên trong CSV nằm trước.
  const mixed = [tx("moi", "2026-08-01", 1), tx("cu", "2026-08-01")];
  assert.deepEqual([...mixed].sort(byOldestFirst).map((r) => r.id), ["cu", "moi"]);
});

test("nextOrder cho khoản mới số lớn hơn mọi khoản trong đúng ngày đó", () => {
  const rows = [tx("a", "2026-08-01", 1), tx("b", "2026-08-01", 2), tx("x", "2026-07-31", 7)];
  assert.equal(nextOrder(rows, "2026-08-01"), 3);
  assert.equal(nextOrder(rows, "2026-07-31"), 8);
  // Ngày chưa có khoản nào thì bắt đầu từ 1.
  assert.equal(nextOrder(rows, "2026-08-02"), 1);
});

test("ngày toàn dữ liệu cũ chưa đánh số vẫn ra số lớn hơn số khoản đang có", () => {
  const rows = [tx("a", "2026-08-01"), tx("b", "2026-08-01"), tx("c", "2026-08-01")];
  assert.equal(nextOrder(rows, "2026-08-01"), 4);
});

test("thêm liên tiếp thì khoản sau luôn nằm trên khoản trước", () => {
  const rows: Transaction[] = [];
  for (const id of ["mot", "hai", "ba"]) {
    rows.push(tx(id, "2026-08-01", nextOrder(rows, "2026-08-01")));
  }
  assert.deepEqual([...rows].sort(byNewestFirst).map((r) => r.id), ["ba", "hai", "mot"]);
});
