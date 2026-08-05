"use client";

import { dateVN, timeAgo } from "@/lib/date";
import type { UserProfile } from "@/lib/profile";

interface Props {
  profile: UserProfile;
  now: number;
  /**
   * Điện thoại thì xếp ảnh lên trên, chữ xuống dưới. Dùng ở thẻ có thêm nút bấm
   * bên cạnh: nằm ngang thì chữ bị bóp còn "nguyen cu…", "cuongnguye…", đọc
   * không ra ai. Danh sách không có nút nên cứ để nằm ngang cho gọn hàng.
   */
  stack?: boolean;
}

/** Ảnh + tên + email + ngày tạo — dùng chung cho danh sách và trang chi tiết. */
export function UserCard({ profile, now, stack }: Props) {
  return (
    <div
      className={`flex min-w-0 flex-1 ${
        stack ? "flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" : "items-center gap-3"
      }`}
    >
      <UserAvatar profile={profile} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {profile.displayName || "(chưa đặt tên)"}
        </p>
        <p className="text-muted truncate text-xs">{profile.email}</p>
        <p className="text-muted mt-0.5 truncate text-xs">
          Tạo {profile.createdAt ? dateVN(profile.createdAt) : "—"}
          {profile.lastSeenAt ? ` · vào ${timeAgo(profile.lastSeenAt, now)}` : ""}
        </p>
      </div>
    </div>
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
      className="bar-fill flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {source[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
