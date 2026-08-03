/**
 * Toàn app chốt theo giờ Việt Nam (UTC+7), KHÔNG theo giờ máy.
 * Lý do: máy tính có thể đặt múi giờ khác, hoặc app chạy trên server Vercel ở
 * Singapore/Mỹ — nếu lấy giờ máy thì "hôm nay" sẽ lệch ngày và giao dịch rơi
 * nhầm tháng. Dùng en-CA vì locale này in ra đúng dạng YYYY-MM-DD.
 */
const VN_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Một mốc thời gian bất kỳ, quy về ngày theo giờ Việt Nam. Tách riêng để test được. */
export function isoInVN(instant: Date): string {
  return VN_DATE_FORMAT.format(instant);
}

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayISO(): string {
  return isoInVN(new Date());
}

/** "07/2026" theo giờ Việt Nam — dùng cho các mốc thời gian lấy từ Firebase. */
export function monthYearInVN(instant: Date): string {
  const iso = isoInVN(instant);
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "2026-07-30" → "2026-07" */
export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(todayISO());
}

/** shiftMonth("2026-01", -1) → "2025-12" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** lastNMonths("2026-07", 3) → ["2026-05", "2026-06", "2026-07"] */
export function lastNMonths(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(month, i - n + 1));
}

/**
 * Firestore chỉ cho tối đa 30 giá trị trong toán tử `in`, nên một lần truy vấn
 * không ôm quá 30 tháng. Sao kê dài hơn phải tách kỳ.
 */
export const MAX_MONTHS_PER_QUERY = 30;

/** monthsBetween("2026-05", "2026-07") → ["2026-05", "2026-06", "2026-07"]. Tự đảo nếu nhập ngược. */
export function monthsBetween(from: string, to: string): string[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const months: string[] = [];
  for (let cur = start; cur <= end; cur = shiftMonth(cur, 1)) {
    months.push(cur);
    if (months.length >= 600) break; // chặn vòng lặp vô hạn nếu chuỗi tháng hỏng
  }
  return months;
}

/** "2026-07" → "Tháng 7/2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

/** "2026-07" → "T7" (nhãn trục biểu đồ) */
export function monthShort(month: string): string {
  return `T${Number(month.split("-")[1])}`;
}

const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** "2026-07-30" → "Thứ 5, 30/07" */
export function dayLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Mốc thời gian tuyệt đối, vd ngày tạo tài khoản: "03/08/2026" theo giờ VN. */
export function dateVN(at: number): string {
  const [y, m, d] = isoInVN(new Date(at)).split("-");
  return `${d}/${m}/${y}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Mốc thời gian tương đối cho danh sách thông báo: "vừa xong", "5 phút trước",
 * "3 giờ trước", "2 ngày trước", quá một tuần thì in thẳng "30/07".
 * Nhận `now` từ bên ngoài thay vì gọi Date.now() bên trong để test được.
 */
export function timeAgo(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE) return "vừa xong";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ trước`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} ngày trước`;

  // Vẫn quy về giờ Việt Nam như mọi chỗ khác, rồi đảo thành dd/MM.
  const [, month, day] = isoInVN(new Date(at)).split("-");
  return `${day}/${month}`;
}

/** Ngày AI đọc được có hợp lệ không — chặn dữ liệu rác trước khi ghi vào Firestore. */
export function isValidISODate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
