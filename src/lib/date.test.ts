import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayLabel,
  isoInVN,
  lastNMonths,
  monthOf,
  monthYearInVN,
  monthsBetween,
  shiftMonth,
  timeAgo,
} from "./date.ts";

test("ngày luôn tính theo giờ Việt Nam, không theo giờ máy", () => {
  // 18:30 UTC = 01:30 hôm sau ở VN → phải sang ngày mới.
  assert.equal(isoInVN(new Date("2026-07-30T18:30:00Z")), "2026-07-31");

  // 16:00 UTC = 23:00 cùng ngày ở VN → vẫn là ngày cũ.
  assert.equal(isoInVN(new Date("2026-07-30T16:00:00Z")), "2026-07-30");

  // 17:00 UTC = đúng 00:00 hôm sau ở VN — mốc giao ngày.
  assert.equal(isoInVN(new Date("2026-07-30T17:00:00Z")), "2026-07-31");

  // Giao tháng: 31/07 17:00 UTC = 01/08 ở VN.
  assert.equal(isoInVN(new Date("2026-07-31T17:00:00Z")), "2026-08-01");

  // Giao năm: 31/12 17:00 UTC = 01/01 năm sau ở VN.
  assert.equal(isoInVN(new Date("2026-12-31T17:00:00Z")), "2027-01-01");
});

test("monthYearInVN in ra MM/YYYY theo giờ Việt Nam", () => {
  assert.equal(monthYearInVN(new Date("2026-07-31T17:00:00Z")), "08/2026");
  assert.equal(monthYearInVN(new Date("2026-07-31T16:00:00Z")), "07/2026");
});

test("các phép tính tháng không phụ thuộc múi giờ", () => {
  assert.equal(monthOf("2026-07-30"), "2026-07");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.deepEqual(lastNMonths("2026-03", 4), [
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
  ]);
});

test("monthsBetween liệt kê đủ khoảng tháng cho sao kê", () => {
  assert.deepEqual(monthsBetween("2026-05", "2026-07"), [
    "2026-05",
    "2026-06",
    "2026-07",
  ]);
  // Người dùng chọn ngược thứ tự thì tự đảo lại, không trả mảng rỗng.
  assert.deepEqual(monthsBetween("2026-07", "2026-05"), [
    "2026-05",
    "2026-06",
    "2026-07",
  ]);
  assert.deepEqual(monthsBetween("2025-11", "2026-02"), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.deepEqual(monthsBetween("2026-07", "2026-07"), ["2026-07"]);
  assert.equal(monthsBetween("2024-01", "2026-12").length, 36);
});

test("dayLabel ra đúng thứ trong tuần", () => {
  assert.equal(dayLabel("2026-07-30"), "Thứ 5, 30/07");
  assert.equal(dayLabel("2026-08-02"), "Chủ nhật, 02/08");
});

test("timeAgo in mốc tương đối, quá một tuần thì về dd/MM", () => {
  const now = Date.parse("2026-08-03T10:00:00+07:00");
  const ago = (ms: number) => timeAgo(now - ms, now);

  assert.equal(ago(0), "vừa xong");
  assert.equal(ago(59_000), "vừa xong");
  assert.equal(ago(60_000), "1 phút trước");
  assert.equal(ago(59 * 60_000), "59 phút trước");
  assert.equal(ago(60 * 60_000), "1 giờ trước");
  assert.equal(ago(23 * 3600_000), "23 giờ trước");
  assert.equal(ago(24 * 3600_000), "1 ngày trước");
  assert.equal(ago(6 * 24 * 3600_000), "6 ngày trước");

  // Đúng 7 ngày là chuyển sang ngày tháng — 27/07 theo giờ Việt Nam.
  assert.equal(ago(7 * 24 * 3600_000), "27/07");

  // Đồng hồ máy chạy chậm hơn máy chủ thì mốc gửi rơi vào tương lai;
  // không được in ra "-1 phút trước".
  assert.equal(timeAgo(now + 60_000, now), "vừa xong");
});
