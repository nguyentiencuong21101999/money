"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { roomId } from "@/lib/call";
import { monthYearInVN } from "@/lib/date";
import { useRevealOnOpen } from "@/lib/reveal";
import { CameraIcon, ImageIcon, UsersIcon } from "./icons";
import { PushToggle } from "./PushToggle";
import { useCall } from "./CallProvider";

interface Props {
  user: User;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRevealOnOpen<HTMLDivElement>(open);

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

  const name = user.displayName ?? user.email?.split("@")[0] ?? "Bạn";

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${name}`}
        className={`glass-chip ring-ramp flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1 sm:pr-3 transition duration-200 active:scale-[0.97] ${
          open ? "is-ringed" : ""
        }`}
      >
        <Avatar user={user} size={26} />
        {/* Trên điện thoại chỉ còn ảnh: cái tên này ngốn ~45px, đủ để header
            phải gãy dòng. Ảnh đã đủ để biết đang đăng nhập bằng tài khoản nào. */}
        <span className="hidden max-w-28 truncate text-xs font-medium sm:inline">
          {firstName(name)}
        </span>
        <span
          aria-hidden="true"
          className={`text-muted text-[9px] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          ref={panel}
          role="menu"
          className="card overlay-surface animate-drop border-expense/25 absolute right-0 z-40 mt-2 w-64 origin-top-right overflow-hidden p-0 shadow-lg"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="text-muted truncate text-xs">{user.email}</p>
            </div>
          </div>

          <dl className="border-hairline text-muted border-t px-4 py-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt>Đăng nhập qua</dt>
              <dd className="text-ink-2">{providerLabel(user)}</dd>
            </div>
            <div className="mt-1.5 flex justify-between gap-3">
              <dt>Thành viên từ</dt>
              <dd className="text-ink-2">{joinedAt(user)}</dd>
            </div>
          </dl>

          <PushToggle uid={user.uid} />

          <CameraToggle user={user} />

          {/* Thư viện ảnh — cho mọi người, không riêng admin: mỗi người chỉ thấy
              album của chính mình (firestore.rules chặn theo uid). */}
          <Link
            href="/images"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="border-hairline hover:bg-expense/8 flex items-center gap-2 border-t px-4 py-3 text-sm font-medium transition"
          >
            <ImageIcon size={16} gradient />
            Quản lý ảnh
          </Link>

          {/* Chia sẻ camera của mình cho quản trị viên. Bấm là mở trang xác nhận
              (KHÔNG tự bật cam) — người dùng tự đồng ý và luôn thấy dấu "đang
              chia sẻ" khi bật. */}
          {/* {user.email && ADMIN_EMAILS[0] && (
            <Link
              href={`/goi?xem=${encodeURIComponent(roomId(user.email, ADMIN_EMAILS[0]))}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="border-hairline hover:bg-expense/8 flex items-center gap-2 border-t px-4 py-3 text-sm font-medium transition"
            >
              <CameraIcon size={16} gradient />
              Chia sẻ camera
            </Link>
          )} */}

          {isAdminEmail(user.email) && (
            <Link
              href="/manager"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="border-hairline hover:bg-expense/8 flex items-center gap-2 border-t px-4 py-3 text-sm font-medium transition"
            >
              <UsersIcon size={16} gradient />
              Quản lý người dùng
            </Link>
          )}


          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="border-hairline text-critical hover:bg-critical/6 w-full border-t px-4 py-3 text-left text-sm font-medium transition"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hàng "Camera" trong menu, có công tắc giống "Thông báo" — hiện tại CHƯA nối
 * việc gì (để dành), gạt chỉ đổi trạng thái công tắc.
 */
function CameraToggle({ user }: { user: User }) {
  const { call, share, hangUp } = useCall();
  const [working, setWorking] = useState(false);
  // Trạng thái bật = mình đang chia sẻ camera (đồng bộ cả khi Dừng ở khung nổi).
  const on = call?.role === "sharer";

  // Bật = chia sẻ camera của mình cho admin; tắt = dừng chia sẻ.
  async function turnOn() {
    if (!user.email || !ADMIN_EMAILS[0]) return;
    await share(roomId(user.email, ADMIN_EMAILS[0]));
  }
  function turnOff() {
    hangUp();
  }

  async function toggle() {
    setWorking(true);
    try {
      if (on) turnOff();
      else await turnOn();
    } catch (e) {
      console.error("[camera] toggle", e);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="border-hairline border-t px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CameraIcon size={16} gradient />
          Camera
        </p>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={on}
          aria-label="Camera"
          onClick={() => void toggle()}
          disabled={working}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out active:scale-95 disabled:opacity-45 ${
            on ? "bar-fill" : "bg-axis"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
              on ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function Avatar({ user, size }: { user: User; size: number }) {
  const [failed, setFailed] = useState(false);
  const photo = user.photoURL;

  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        // Ảnh Google trả 403 nếu gửi kèm referrer từ localhost.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="border-hairline shrink-0 rounded-full border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="bar-fill flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(user)}
    </span>
  );
}

function initials(user: User): string {
  const source = user.displayName ?? user.email ?? "?";
  const words = source.trim().split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : source[0];
  return letters.toUpperCase();
}

function firstName(name: string): string {
  const words = name.trim().split(/\s+/);
  // Tên người Việt để họ trước, tên riêng đứng cuối mới là cách gọi thân mật.
  return words[words.length - 1];
}

function providerLabel(user: User): string {
  const id = user.providerData[0]?.providerId ?? "";
  if (id === "google.com") return "Google";
  if (id === "password") return "Email";
  return id || "—";
}

function joinedAt(user: User): string {
  const raw = user.metadata.creationTime;
  if (!raw) return "—";
  return monthYearInVN(new Date(raw));
}
