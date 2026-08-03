import type { TxType } from "./types";

export const EXPENSE_CATEGORIES = [
  "Ăn uống",
  "Đi lại",
  "Mua sắm",
  "Hoá đơn & tiện ích",
  "Sức khoẻ",
  "Giải trí",
  "Giáo dục",
  "Nhà cửa",
  "Khác",
] as const;

export const INCOME_CATEGORIES = [
  "Lương",
  "Thưởng",
  "Đầu tư",
  "Được tặng",
  "Khác",
] as const;

/**
 * Icon cho "Khác", cũng là icon dự phòng cho danh mục lạ — normalizeCategory()
 * dồn mọi thứ không khớp về "Khác" nên hai chỗ này phải trông giống nhau.
 * Trước là dấu "•", nhỏ và mờ nhạt, nhìn như lỗi hiển thị hơn là một danh mục.
 */
const DEFAULT_ICON = "💵";

export const CATEGORY_ICON: Record<string, string> = {
  "Ăn uống": "🍜",
  "Đi lại": "🛵",
  "Mua sắm": "🛍️",
  "Hoá đơn & tiện ích": "🧾",
  "Sức khoẻ": "💊",
  "Giải trí": "🎬",
  "Giáo dục": "📚",
  "Nhà cửa": "🏠",
  Lương: "💼",
  Thưởng: "🎁",
  "Đầu tư": "📈",
  "Được tặng": "💝",
  Khác: DEFAULT_ICON,
};

export function categoriesFor(type: TxType): readonly string[] {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/** Ép giá trị AI trả về vào đúng danh sách cố định, tránh sinh danh mục lạ. */
export function normalizeCategory(raw: string | null | undefined, type: TxType): string {
  const list = categoriesFor(type);
  if (!raw) return "Khác";
  const needle = raw.trim().toLowerCase();
  return list.find((c) => c.toLowerCase() === needle) ?? "Khác";
}

export function iconFor(category: string): string {
  return CATEGORY_ICON[category] ?? DEFAULT_ICON;
}
