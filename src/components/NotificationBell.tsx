"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  markAllRead,
  markRead,
  useInbox,
  type AppNotification,
} from "@/lib/notifications";
import { useNow } from "@/lib/now";
import { useRevealOnOpen } from "@/lib/reveal";
import { NotificationRow } from "./NotificationRow";

/** Chuông + hộp thư 10 thông báo gần nhất, đặt cạnh nút Xuất CSV. */
export function NotificationBell({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRevealOnOpen<HTMLDivElement>(open);
  const router = useRouter();
  const { items, unread, error } = useInbox(uid);
  // Một mốc cho cả danh sách, tự làm mới mỗi phút.
  const now = useNow();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(item: AppNotification) {
    if (!item.isRead) void markRead(uid, item.id).catch((e) => console.error("[noti]", e));
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }


  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        className={`relative flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-sm transition active:scale-[0.95] ${
          open ? "border-expense/45 bg-surface" : "border-hairline hover:bg-surface"
        }`}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="bg-expense absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          role="menu"
          className="card animate-drop border-expense/25 absolute right-0 z-40 mt-2 w-[min(21rem,calc(100vw-2rem))] origin-top-right overflow-hidden p-0 shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold">
              Thông báo
              {unread > 0 && (
                <span className="text-muted ml-1.5 text-xs font-normal">
                  {unread} chưa đọc
                </span>
              )}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead(uid).catch((e) => console.error("[noti]", e))}
                className="text-expense hover:text-brand shrink-0 text-xs font-medium underline underline-offset-2"
              >
                Đọc tất cả
              </button>
            )}
          </div>

          {error && <p className="text-critical px-4 pb-3 text-xs">{error}</p>}

          {items.length === 0 ? (
            <p className="text-muted border-hairline border-t px-4 py-8 text-center text-sm">
              Chưa có thông báo nào
            </p>
          ) : (
            // Trần chiều cao rồi cuộn bên trong, để hộp thư không dài quá màn hình.
            <ul className="border-hairline max-h-[60dvh] divide-hairline divide-y overflow-y-auto border-t">
              {items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={openItem} now={now} />
              ))}
            </ul>
          )}

          <Link
            href="/thong-bao"
            onClick={() => setOpen(false)}
            className="border-hairline text-ink-2 hover:bg-plane block border-t px-4 py-3 text-center text-sm font-medium transition"
          >
            Xem tất cả
          </Link>
        </div>
      )}
    </div>
  );
}
