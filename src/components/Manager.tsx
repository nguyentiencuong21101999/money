"use client";

import Link from "next/link";
import { useAdminGate } from "@/lib/admin-gate";
import { dateVN, timeAgo } from "@/lib/date";
import { useNow } from "@/lib/now";
import { useProfiles, type UserProfile } from "@/lib/profile";

export function Manager() {
  const allowed = useAdminGate();
  const { data: users, loading, error } = useProfiles(allowed);
  const now = useNow();

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-16">
      <header className="animate-fade mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Quay lại"
          className="border-hairline hover:bg-surface flex h-8 w-8 items-center justify-center rounded-lg border text-lg leading-none transition active:scale-95"
        >
          ‹
        </Link>
        <h1 className="text-lg font-semibold">Quản lý người dùng</h1>
        <span className="text-muted ml-auto text-xs">{users.length} người</span>
      </header>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {users.length === 0 ? (
        <div className="card animate-pop px-5 py-12 text-center">
          <div className="text-3xl">👥</div>
          <p className="mt-2 text-sm font-medium">
            {loading ? "Đang tải…" : "Chưa có ai trong danh sách"}
          </p>
          <p className="text-muted mt-1 text-sm">
            Hồ sơ chỉ được ghi khi người dùng mở app. Người đã đăng nhập từ trước
            sẽ hiện ra sau lần vào app kế tiếp.
          </p>
        </div>
      ) : (
        <ul className="card animate-rise divide-hairline divide-y overflow-hidden p-0">
          {users.map((user) => (
            <li key={user.uid}>
              <Link
                href={`/manager/${user.uid}`}
                className="flex items-center gap-3 px-4 py-3 transition duration-200 hover:bg-black/2.5 active:scale-[0.995]"
              >
                <Avatar user={user} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {user.displayName || "(chưa đặt tên)"}
                  </span>
                  <span className="text-muted block truncate text-xs">{user.email}</span>
                  <span className="text-muted mt-0.5 block truncate text-xs">
                    Tạo {user.createdAt ? dateVN(user.createdAt) : "—"}
                    {user.lastSeenAt ? ` · vào ${timeAgo(user.lastSeenAt, now)}` : ""}
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted shrink-0 text-lg">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Avatar({ user }: { user: UserProfile }) {
  if (user.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.photoURL}
        alt=""
        // Ảnh Google trả 403 nếu gửi kèm referrer.
        referrerPolicy="no-referrer"
        className="border-hairline h-10 w-10 shrink-0 rounded-full border object-cover"
      />
    );
  }
  const source = user.displayName || user.email || "?";
  return (
    <span
      aria-hidden="true"
      className="bg-expense flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
    >
      {source[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
