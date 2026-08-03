"use client";

import Link from "next/link";
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
      <header className="animate-fade mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="Quay lại"
            className="border-hairline hover:bg-surface flex h-8 w-8 items-center justify-center rounded-lg border text-lg leading-none transition active:scale-95"
          >
            ‹
          </Link>
          <h1 className="text-lg font-semibold">Thông báo</h1>
          {unread > 0 && (
            <span className="bg-expense/12 text-expense rounded-full px-2 py-0.5 text-xs font-medium">
              {unread} chưa đọc
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void markAllRead(uid).catch((e) => console.error("[noti]", e))}
          disabled={unread === 0}
          className="border-hairline text-ink-2 hover:bg-surface rounded-lg border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97] disabled:opacity-40"
        >
          Đánh dấu đã đọc tất cả
        </button>
      </header>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card animate-pop px-5 py-12 text-center">
          <div className="text-3xl">🔔</div>
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
