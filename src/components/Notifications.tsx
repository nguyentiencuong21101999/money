"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  ALL_COUNT,
  markAllRead,
  markRead,
  useInbox,
  type AppNotification,
} from "@/lib/notifications";
import { useNow } from "@/lib/now";
import { NotificationRow } from "./NotificationRow";
import { BellIcon } from "./icons";
import { HEADER_BUTTON, PageHeader } from "./PageHeader";

export function Notifications() {
  const { user } = useAuth();
  const uid = user!.uid;
  const router = useRouter();
  const { items, unread, loading, error } = useInbox(uid, ALL_COUNT);
  const now = useNow();

  function openItem(item: AppNotification) {
    if (!item.isRead) void markRead(uid, item.id).catch((e) => console.error("[noti]", e));
    if (item.link) router.push(item.link);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-16">
      <PageHeader title="Thông báo">
        {unread > 0 && (
          <span className="bg-expense/12 text-expense rounded-full px-2 py-0.5 text-xs font-medium">
            {unread} chưa đọc
          </span>
        )}
        <button
          type="button"
          onClick={() => void markAllRead(uid).catch((e) => console.error("[noti]", e))}
          disabled={unread === 0}
          className={HEADER_BUTTON}
        >
          Đánh dấu đã đọc tất cả
        </button>
      </PageHeader>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card animate-pop px-5 py-12 text-center">
          <BellIcon size={32} className="text-expense/55 mx-auto" />
          <p className="mt-2 text-sm font-medium">
            {loading ? "Đang tải…" : "Chưa có thông báo nào"}
          </p>
          <p className="text-muted mt-1 text-sm">
            Bật thông báo trong menu tài khoản để nhận nhắc ghi chi tiêu.
          </p>
        </div>
      ) : (
        <ul className="card animate-rise divide-hairline divide-y overflow-hidden p-0">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={openItem} now={now} />
          ))}
        </ul>
      )}

      {items.length === ALL_COUNT && (
        <p className="text-muted mt-3 text-center text-xs">
          Chỉ hiện {ALL_COUNT} thông báo gần nhất.
        </p>
      )}
    </div>
  );
}
