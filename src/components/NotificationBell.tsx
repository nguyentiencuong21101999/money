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
import { BellIcon } from "./icons";
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
    // KHÔNG đặt `relative` ở đây: panel rộng 336px mà neo vào riêng cái chuông
    // thì trên điện thoại rìa trái lọt khỏi màn hình, vì chuông còn cách mép
    // phải một khoảng bằng cái avatar. Neo vào cả hàng nút (thẻ `relative` bọc
    // ngoài trong header) thì rìa phải panel trùng mép phải trang, luôn vừa.
    <div ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        // Cùng px/py với các nút chữ bên cạnh nên cao y nhau, không phải
        // ép h-[30px] rồi cầu mong nó khớp.
        className={`relative rounded-lg border px-2 py-1.5 transition active:scale-[0.97] ${
          open
            ? "border-expense/45 bg-surface"
            : "border-hairline hover:border-expense/30 hover:bg-expense/8"
        }`}
      >
        <BellIcon size={17} className="text-expense" />
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
          className="card animate-drop border-expense/25 absolute top-full right-0 z-40 mt-2 w-[min(21rem,calc(100vw-2rem))] origin-top-right overflow-hidden p-0 shadow-lg"
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
            /* 25rem là đúng 5 dòng: dòng có ghi chú hai hàng cao 79px, đo bằng
               chính markup này. Vẫn nạp 10 cái gần nhất rồi cuộn bên trong, chỉ
               là không thả cả 10 xuống thành một dải dài lê thê. Còn `60dvh` để
               trên máy màn ngắn (hoặc khi để ngang) hộp thư co theo màn hình chứ
               không tràn ra ngoài. */
            <ul className="border-hairline max-h-[min(25rem,60dvh)] divide-hairline divide-y overflow-y-auto border-t">
              {items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={openItem} now={now} />
              ))}
            </ul>
          )}

          <Link
            href="/thong-bao"
            onClick={() => setOpen(false)}
            className="border-hairline text-ink-2 hover:bg-expense/8 block border-t px-4 py-3 text-center text-sm font-medium transition"
          >
            Xem tất cả
          </Link>
        </div>
      )}
    </div>
  );
}
