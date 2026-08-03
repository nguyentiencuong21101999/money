"use client";

import { timeAgo } from "@/lib/date";
import type { AppNotification } from "@/lib/notifications";

interface Props {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
  /** Mốc "bây giờ" truyền từ ngoài vào để cả danh sách tính cùng một mốc. */
  now: number;
}

/** Một dòng thông báo, dùng chung cho hộp thư ở chuông và trang xem tất cả. */
export function NotificationRow({ item, onOpen, now }: Props) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition duration-200 hover:bg-black/2.5 active:scale-[0.995] ${
          item.isRead ? "" : "bg-expense/5"
        }`}
      >
        {/* Chấm hồng là dấu hiệu duy nhất cho "chưa đọc" ở mức liếc mắt; chỗ
            trống vẫn giữ nguyên bề rộng để chữ hai loại thẳng hàng nhau. */}
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            item.isRead ? "bg-transparent" : "bg-expense"
          }`}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`min-w-0 truncate text-sm ${
                item.isRead ? "text-ink-2" : "font-semibold"
              }`}
            >
              {item.title}
            </span>
            <span className="text-muted shrink-0 text-[11px]">
              {item.createdAt ? timeAgo(item.createdAt, now) : "đang gửi…"}
            </span>
          </span>
          {item.body && (
            <span className="text-muted mt-0.5 line-clamp-2 block text-xs">
              {item.body}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
