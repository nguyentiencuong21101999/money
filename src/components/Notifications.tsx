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
    /* Cột cao đúng một màn hình: đầu trang và dòng ghi chú cuối đứng yên, chỉ
       danh sách ở giữa cuộn. Dùng flex chứ không đặt max-height bằng calc() cho
       cái <ul>, vì đầu trang có thể xuống dòng trên máy hẹp — calc() đoán chiều
       cao đó là đoán sai, còn flex-1 thì lấy đúng phần còn lại bao nhiêu cũng
       vừa. min-h-0 là bắt buộc: thiếu nó thì flex item không cho co nhỏ hơn nội
       dung và cả trang lại dài ra như cũ. */
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4 pt-4 pb-4">
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
          <span className="sm:hidden">Đọc tất cả</span>
          <span className="hidden sm:inline">Đánh dấu đã đọc tất cả</span>
        </button>
      </PageHeader>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 shrink-0 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card animate-pop shrink-0 px-5 py-12 text-center">
          <BellIcon size={32} className="text-expense/55 mx-auto" />
          <p className="mt-2 text-sm font-medium">
            {loading ? "Đang tải…" : "Chưa có thông báo nào"}
          </p>
          <p className="text-muted mt-1 text-sm">
            Bật thông báo trong menu tài khoản để nhận nhắc ghi chi tiêu.
          </p>
        </div>
      ) : (
        <ul className="card animate-rise divide-hairline min-h-0 flex-1 divide-y overflow-y-auto p-0">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={openItem} now={now} />
          ))}
        </ul>
      )}

      {items.length === ALL_COUNT && (
        <p className="text-muted mt-3 shrink-0 text-center text-xs">
          Chỉ hiện {ALL_COUNT} thông báo gần nhất.
        </p>
      )}
    </div>
  );
}
