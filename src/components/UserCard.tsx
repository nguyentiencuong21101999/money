"use client";

import { dateVN, timeAgo } from "@/lib/date";
import type { UserProfile } from "@/lib/profile";

/** Ảnh + tên + email + ngày tạo — dùng chung cho danh sách và trang chi tiết. */
export function UserCard({ profile, now }: { profile: UserProfile; now: number }) {
  return (
    <>
      <UserAvatar profile={profile} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {profile.displayName || "(chưa đặt tên)"}
        </span>
        <span className="text-muted block truncate text-xs">{profile.email}</span>
        <span className="text-muted mt-0.5 block truncate text-xs">
          Tạo {profile.createdAt ? dateVN(profile.createdAt) : "—"}
          {profile.lastSeenAt ? ` · vào ${timeAgo(profile.lastSeenAt, now)}` : ""}
        </span>
      </span>
    </>
  );
}

export function UserAvatar({ profile, size = 40 }: { profile: UserProfile; size?: number }) {
  if (profile.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.photoURL}
        alt=""
        // Ảnh Google trả 403 nếu gửi kèm referrer.
        referrerPolicy="no-referrer"
        className="border-hairline shrink-0 rounded-full border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const source = profile.displayName || profile.email || "?";
  return (
    <span
      aria-hidden="true"
      className="bg-expense flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {source[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
