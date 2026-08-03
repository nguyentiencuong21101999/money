/**
 * Icon nét mỏng, vẽ bằng `currentColor` nên tô màu bằng class `text-*` ở thẻ
 * cha. Emoji (🔔 👥) thì màu do hệ điều hành quyết định — vàng trên máy này,
 * xanh trên máy khác — nên không nhuộm hồng theo bộ nhận diện được.
 */
function Icon({
  size = 18,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export function BellIcon(props: { size?: number; className?: string }) {
  return (
    <Icon {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  );
}

export function UsersIcon(props: { size?: number; className?: string }) {
  return (
    <Icon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}
