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
      <defs>
        {/*
          Chuyển màu chéo cùng chiều với gradient nền trang: tím ở góc trên-trái
          xuống hồng cánh sen ở dưới-phải.
          Id phải duy nhất trong cả tài liệu, mà logo xuất hiện nhiều lần trên
          một trang (header + màn đăng nhập). Trùng id thì mọi bản đều lấy theo
          <defs> đầu tiên — ở đây cả ba stop giống hệt nhau nên vô hại, nhưng
          vẫn đặt tên riêng thay vì "gradient" chung chung để không đụng SVG khác.
        */}
        {/* Ba chặng khớp đúng --ramp trong globals.css — cùng dải với nút và
            thanh tiến độ. Đổi ở đây thì đổi cả ở đó, và ở src/app/icon.svg. */}
        <linearGradient id="logo-ramp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a21caf" />
          <stop offset="45%" stopColor="#c0208d" />
          <stop offset="100%" stopColor="#d61f6d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-ramp)" />
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
