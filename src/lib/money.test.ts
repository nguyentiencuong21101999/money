import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCompact, formatVND, parseAmount } from "./money.ts";

test("parseAmount đọc được các cách viết số tiền của người Việt", () => {
  const cases: Record<string, number> = {
    "50000": 50_000,
    "50.000": 50_000,
    "50,000": 50_000,
    "1.234.567": 1_234_567,
    "35.000đ": 35_000,
    "250000 ₫": 250_000,
    "50k": 50_000,
    "1tr": 1_000_000,
    "3m": 3_000_000,
    "2 triệu": 2_000_000,
    "1tỷ": 1_000_000_000,
    "1,5tr": 1_500_000,
    // Kiểu nói miệng: đuôi là phần thập phân ngầm.
    "1tr5": 1_500_000,
    "1tr250": 1_250_000,
    "3triệu5": 3_500_000,
    "50k5": 50_500,
    "1tỷ2": 1_200_000_000,
    // Rác thì trả 0 thay vì NaN.
    "": 0,
    abc: 0,
    tr: 0,
  };

  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(parseAmount(input), expected, `parseAmount(${JSON.stringify(input)})`);
  }
});

test("formatVND và formatCompact dùng định dạng vi-VN", () => {
  assert.equal(formatVND(1_234_567), "1.234.567 ₫");
  assert.equal(formatVND(0), "0 ₫");
  assert.equal(formatCompact(999), "999");
  assert.equal(formatCompact(12_500), "12,5k");
  assert.equal(formatCompact(25_000_000), "25tr");
  assert.equal(formatCompact(1_500_000_000), "1,5 tỷ");
});
