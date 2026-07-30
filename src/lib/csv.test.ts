import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCSV } from "./csv.ts";
import type { Transaction } from "./types.ts";

function tx(partial: Partial<Transaction> & { id: string; date: string }): Transaction {
  return {
    type: "expense",
    amount: 1000,
    note: "",
    category: "Khác",
    month: partial.date.slice(0, 7),
    source: "manual",
    ...partial,
  } as Transaction;
}

const DATA: Transaction[] = [
  tx({ id: "a", date: "2026-06-10", amount: 50000, note: "Ăn trưa", category: "Ăn uống" }),
  tx({ id: "b", date: "2026-06-25", amount: 12000000, type: "income", category: "Lương", note: "Lương" }),
  tx({ id: "c", date: "2026-07-02", amount: 250000, note: "Xăng xe", category: "Đi lại" }),
  // Ngoài khoảng chọn — không được lọt vào file.
  tx({ id: "d", date: "2026-04-01", amount: 999999, note: "Cũ" }),
];

test("CSV chỉ chứa giao dịch trong khoảng tháng đã chọn", () => {
  const csv = buildCSV(["2026-06", "2026-07"], DATA);
  assert.ok(csv.includes("Ăn trưa"));
  assert.ok(csv.includes("Xăng xe"));
  assert.ok(!csv.includes("999999"), "giao dịch ngoài khoảng vẫn lọt vào file");
});

test("CSV dùng dấu chấm phẩy và xếp giao dịch theo thứ tự thời gian", () => {
  const lines = buildCSV(["2026-06", "2026-07"], DATA).split("\r\n");
  assert.equal(lines[0].split(";")[0], "Tháng");
  assert.ok(lines[1].startsWith("2026-06;2026-06-10;Tiền ra;50000;Ăn uống;Ăn trưa"));
  assert.ok(lines[2].includes("2026-06-25;Tiền vào;12000000"));
  assert.ok(lines[3].includes("2026-07-02"));
});

test("CSV có bảng tổng theo tháng khi chọn nhiều tháng", () => {
  const csv = buildCSV(["2026-06", "2026-07"], DATA);
  assert.ok(csv.includes("Tổng theo tháng"));
  // Tháng 6: vào 12.000.000, ra 50.000, dư 11.950.000
  assert.ok(csv.includes("2026-06;;;12000000;50000;11950000"));
  // Tháng 7: không có thu, chi 250.000
  assert.ok(csv.includes("2026-07;;;0;250000;-250000"));
});

test("CSV một tháng thì bỏ bảng tổng theo tháng cho gọn", () => {
  const csv = buildCSV(["2026-07"], DATA);
  assert.ok(!csv.includes("Tổng theo tháng"));
  assert.ok(csv.includes("Tổng tiền ra;;;250000"));
});

test("tổng cuối file cộng đúng cả kỳ", () => {
  const csv = buildCSV(["2026-06", "2026-07"], DATA);
  assert.ok(csv.includes("Tổng tiền vào;;;12000000"));
  assert.ok(csv.includes("Tổng tiền ra;;;300000")); // 50.000 + 250.000
  assert.ok(csv.includes("Số dư;;;11700000"));
  assert.ok(csv.includes("Số giao dịch;;;3"));
});

test("ghi chú chứa dấu chấm phẩy hoặc nháy kép không làm vỡ cột", () => {
  const csv = buildCSV(
    ["2026-07"],
    [tx({ id: "x", date: "2026-07-05", note: 'Mua "sữa"; bánh mì' })],
  );
  assert.ok(csv.includes('"Mua ""sữa""; bánh mì"'));
});
