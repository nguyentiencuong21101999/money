// Bảng màu + vài hằng layout dùng chung cho giao diện kiểu TikTok.
// Không có safe-area-context trong deps nên chèn lề an toàn bằng hằng số (đủ cho
// iPhone hiện đại — đây là UI nguỵ trang, không cần chính xác từng pixel).
export const colors = {
  bg: "#000",
  text: "#fff",
  sub: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.35)",
  red: "#FE2C55", // đỏ TikTok
  cyan: "#25F4EE", // xanh TikTok
  pill: "rgba(255,255,255,0.14)",
  card: "#161616",
  line: "rgba(255,255,255,0.08)",
};

export const inset = {
  top: 52, // chừa status bar / tai thỏ
  bottom: 22, // chừa vạch home indicator
};

/** 1172 → "1.172" (kiểu số của TikTok tiếng Việt: dấu chấm ngăn nghìn). */
export function formatCount(n: number): string {
  return n.toLocaleString("de-DE");
}
