/**
 * Dấu ₫ trong khung bo tròn — dùng chung cho header, màn hình đăng nhập và
 * favicon (bản favicon nằm ở src/app/icon.svg, giữ y hệt hình này).
 * Vẽ bằng path chứ không dùng ký tự ₫ vì nhiều font hệ thống thiếu glyph đó.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sổ tiền"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="15" fill="var(--color-brand)" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M26.5 16h6a13 13 0 0 1 0 26h-6V16z" />
        <path d="M18 29h11" />
        <path d="M22 51h20" />
      </g>
    </svg>
  );
}
