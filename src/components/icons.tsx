/**
 * Icon nét mỏng, vẽ bằng `currentColor` nên tô màu bằng class `text-*` ở thẻ
 * cha. Emoji (🔔 👥) thì màu do hệ điều hành quyết định — vàng trên máy này,
 * xanh trên máy khác — nên không nhuộm hồng theo bộ nhận diện được.
 */
function Icon({
  size = 18,
  className,
  gradient,
  children,
}: {
  size?: number;
  className?: string;
  /** Tô nét bằng dải tím→hồng thay vì một màu đặc. */
  gradient?: boolean;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={gradient ? "url(#icon-ramp)" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      {gradient && (
        <defs>
          {/*
            Hai chặng khớp --ramp-ink trong globals.css. Phải khai báo TRONG
            từng SVG vì gradient của SVG không nhận được biến CSS qua thuộc
            tính stroke. Nhiều icon trên cùng trang sẽ trùng id, trình duyệt lấy
            <defs> đầu tiên — vô hại vì mọi bản đều giống hệt nhau.
          */}
          <linearGradient id="icon-ramp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-expense)" />
            <stop offset="100%" stopColor="var(--color-danger-text)" />
          </linearGradient>
        </defs>
      )}
      {children}
    </svg>
  );
}

export function BellIcon(props: { size?: number; className?: string; gradient?: boolean }) {
  return (
    <Icon {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  );
}

export function UsersIcon(props: { size?: number; className?: string; gradient?: boolean }) {
  return (
    <Icon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

export function ArrowUpIcon(props: {
  size?: number;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </Icon>
  );
}

export function ImageIcon(props: {
  size?: number;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      {/* Đường chân trời cắt qua khung: đủ để nhận ra là ảnh ở cỡ 16px. */}
      <path d="M21 15l-4.35-4.35a2 2 0 0 0-2.83 0L3 21" />
    </Icon>
  );
}

export function CameraIcon(props: {
  size?: number;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <Icon {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: {
  size?: number;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}
