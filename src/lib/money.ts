const VN = new Intl.NumberFormat("vi-VN");

/** 1234567 → "1.234.567 ₫" */
export function formatVND(n: number): string {
  return `${VN.format(Math.round(n))} ₫`;
}

/** 1234567 → "1.234.567" (không kèm ký hiệu tiền, dùng trong ô input) */
export function formatNumber(n: number): string {
  return VN.format(Math.round(n));
}

/** Rút gọn cho nhãn trục biểu đồ: 1234567 → "1,2tr" */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${trim(n / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trim(n / 1_000)}k`;
  return VN.format(n);
}

function trim(v: number): string {
  return VN.format(Math.round(v * 10) / 10);
}

/** Hậu tố đơn vị, xếp từ lớn xuống nhỏ để "tỷ" được thử trước "triệu". */
const SUFFIXES: [string, number][] = [
  ["tỷ|ty|b", 1_000_000_000],
  ["triệu|trieu|tr|m", 1_000_000],
  ["nghìn|nghin|ngàn|ngan|k", 1_000],
];

/**
 * Đọc số tiền người dùng gõ, chấp nhận cách viết đời thường:
 * "50000" · "50.000" · "50,000" · "50k" · "1tr" · "1,5tr" · "2 triệu" · "35.000đ"
 * và cả kiểu nói miệng "1tr5" = 1.500.000, "1tr250" = 1.250.000, "50k5" = 50.500.
 */
export function parseAmount(input: string): number {
  const s = input.toLowerCase().trim().replace(/[đ₫\s]/g, "");
  if (!s) return 0;

  for (const [alternatives, multiplier] of SUFFIXES) {
    // "1tr5" / "1tr250": phần đuôi là phần thập phân ngầm — 5 → 0,5; 250 → 0,250.
    const compound = s.match(new RegExp(`^([\\d.,]+)(?:${alternatives})(\\d+)$`));
    if (compound) {
      const whole = Number.parseFloat(compound[1].replace(/[.,]/g, ""));
      return Math.round((whole + Number.parseFloat(`0.${compound[2]}`)) * multiplier);
    }

    const plain = s.match(new RegExp(`^([\\d.,]+)(?:${alternatives})$`));
    if (plain) {
      const value = Number.parseFloat(plain[1].replace(",", "."));
      return Number.isFinite(value) ? Math.round(value * multiplier) : 0;
    }
  }

  // Không có hậu tố: mọi dấu chấm/phẩy đều là dấu phân cách nghìn.
  const digits = s.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}
