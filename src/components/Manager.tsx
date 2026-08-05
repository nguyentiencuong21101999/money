"use client";

import Link from "next/link";
import { useAdminGate } from "@/lib/admin-gate";
import { useNow } from "@/lib/now";
import { useProfiles } from "@/lib/profile";
import { UsersIcon } from "./icons";
import { PageHeader } from "./PageHeader";
import { UserCard } from "./UserCard";

export function Manager() {
  const allowed = useAdminGate();
  const { data: users, loading, error } = useProfiles(allowed);
  const now = useNow();

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-16">
      <PageHeader title="Quản lý">
        <span className="text-muted text-xs">{users.length} người</span>
      </PageHeader>

      {error && (
        <p className="border-critical/40 bg-critical/6 text-critical mb-4 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {users.length === 0 ? (
        <div className="card animate-pop px-5 py-12 text-center">
          <UsersIcon size={32} gradient className="mx-auto opacity-60" />
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
                className="flex items-center gap-3 px-4 py-3 transition duration-200 hover:bg-expense/8 active:scale-[0.995]"
              >
                <UserCard profile={user} now={now} />
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
