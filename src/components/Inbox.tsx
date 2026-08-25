"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useProfiles, type UserProfile } from "@/lib/profile";
import { useViewport } from "@/lib/viewport";
import { Conversation } from "./Conversation";

/**
 * Hộp thư dựng theo giao diện TikTok — nền TRẮNG, chữ đen, thanh tab dán đáy.
 *
 * Trang này phủ kín màn hình bằng `fixed inset-0` chứ không nằm trong luồng
 * trang: nền app là gradient hồng vẽ ở body::before, để nguyên thì màu hồng ăn
 * lên hai mép và không còn giống ảnh mẫu nữa. Bên trong lớp phủ là MỘT CỘT rộng
 * đúng bằng màn điện thoại, căn giữa — trên màn hình rộng thì giao diện giữ
 * nguyên tỉ lệ thay vì kéo dài ra thành hàng chữ dài ngoẵng.
 *
 * Người trong danh bạ + trong danh sách hội thoại là NGƯỜI THẬT: đọc từ
 * collection `users` (hồ sơ được ghi mỗi lần ai đó mở app — xem lib/profile.ts),
 * bỏ chính mình ra. Phần chữ quanh họ ("shared a video", "2 giờ", các dòng của
 * TikTok Shop/Tako) là chữ trang trí cho giống app thật.
 */
export function Inbox({ user }: { user: User }) {
  const { data: profiles, loading } = useProfiles(true);
  const people = profiles.filter((p) => p.uid !== user.uid);
  const [open, setOpen] = useState<UserProfile | null>(null);
  const view = useViewport();

  /*
    Khoá cuộn của trang nền suốt lúc hộp thư mở. Trang Sổ tiền phía sau dài hơn
    màn hình, mà iOS cứ bật bàn phím là cuộn trang để lộ ô đang gõ — cuộn cái
    trang đó thì lớp phủ này trôi theo và phần đầu biến mất.
  */
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  return (
    /*
      [&_:focus-visible]:outline-none tắt vòng hồng mà globals.css áp cho mọi
      thứ bấm được lúc focus — trong lớp giả TikTok này nó lạc quẻ ở mọi nút,
      không riêng ô nhắn tin. Đánh đổi: bàn phím không còn thấy mình đang ở nút
      nào bên trong hộp thư.

      Chiều cao lấy theo visual viewport thay vì `inset-0`: bật bàn phím thì lớp
      phủ co lại đúng phần còn thấy được, nên phần đầu (ảnh + tên người đang
      nhắn) và thanh soạn tin đều ở nguyên chỗ. Xem lib/viewport.ts.
    */
    <div
      style={
        view
          ? { height: view.height, transform: `translateY(${view.offsetTop}px)` }
          : undefined
      }
      className="fixed inset-x-0 top-0 z-50 flex h-dvh justify-center bg-[#e4e4e6] antialiased [&_:focus-visible]:outline-none"
    >
      <div className="flex h-full w-full max-w-[430px] flex-col bg-white text-[#161823] shadow-[0_0_40px_rgba(0,0,0,0.14)]">
        {open ? (
          <Conversation
            me={user.uid}
            peer={open}
            peerName={nameOf(open)}
            onBack={() => setOpen(null)}
          />
        ) : (
          <>
            <Header />

            <div className="flex-1 overflow-y-auto overscroll-contain pb-2">
              <Stories me={user} people={people} onOpen={setOpen} />
              <Threads people={people} loading={loading} onOpen={setOpen} />
            </div>

            <TabBar />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header() {
  return (
    <header className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
      <button type="button" aria-label="Thêm bạn" className="active:opacity-50">
        <AddFriendIcon />
      </button>

      <div className="flex items-center gap-1.5">
        <h1 className="text-[19px] leading-none font-bold">Hộp thư</h1>
        <span className="flex items-center gap-1 rounded-full bg-[#f1f1f2] px-1.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#20d5a4]" />
          <ChevronDown />
        </span>
      </div>

      <button type="button" aria-label="Tìm kiếm" className="active:opacity-50">
        <SearchIcon />
      </button>
    </header>
  );
}

/* ----------------------------------------------------------------- stories */

function Stories({
  me,
  people,
  onOpen,
}: {
  me: User;
  people: UserProfile[];
  onOpen: (p: UserProfile) => void;
}) {
  return (
    <div className="relative pt-8 pb-3">
      {/* Bong bóng gợi ý, neo lên trên ô "Quay" đúng như app thật. */}
      <div className="pointer-events-none absolute top-1 left-3 z-10 max-w-[150px] rounded-2xl bg-white px-3 py-2 text-[13px] leading-[1.25] shadow-[0_2px_12px_rgba(0,0,0,0.16)]">
        Tám chuyện nào
      </div>

      <div className="flex gap-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Ô đầu: ảnh của chính mình, KHÔNG có vòng gradient, có dấu + xanh. */}
        <StoryCell
          label="Quay"
          photo={me.photoURL}
          fallback={initialOf(me.displayName ?? me.email ?? "?")}
          own
        />

        {people.map((p) => (
          <StoryCell
            key={p.uid}
            label={nameOf(p)}
            photo={p.photoURL}
            fallback={initialOf(nameOf(p))}
            onPress={() => onOpen(p)}
          />
        ))}
      </div>
    </div>
  );
}

function StoryCell({
  label,
  photo,
  fallback,
  own,
  onPress,
}: {
  label: string;
  photo: string | null | undefined;
  fallback: string;
  own?: boolean;
  onPress?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="w-[76px] shrink-0 active:opacity-60"
    >
      <div className="relative">
        {/* Vòng gradient xanh dương → xanh ngọc của story chưa xem. */}
        <div
          className={
            own
              ? "rounded-full p-[3px]"
              : "rounded-full bg-[linear-gradient(180deg,#2a8cff_0%,#25f4ee_100%)] p-[3px]"
          }
        >
          <Avatar photo={photo} fallback={fallback} size={70} />
        </div>

        {own && (
          <span className="absolute right-0 bottom-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-[#20a4f3]">
            <PlusIcon />
          </span>
        )}
      </div>

      <p className="mt-1.5 truncate text-center text-[13px] leading-tight">
        {label}
      </p>
    </button>
  );
}

/* ----------------------------------------------------------------- threads */

/** Một dòng trong danh sách: ảnh/biểu tượng bên trái, chữ giữa, dấu bên phải. */
interface Thread {
  key: string;
  avatar: React.ReactNode;
  title: string;
  preview: string;
  /** Mốc thời gian in nhạt, nối sau preview bằng dấu " · ". */
  time?: string;
  /** Máy ảnh xám bên phải (dòng nhắn tin với người thật). */
  camera?: boolean;
  /** Chấm đỏ chưa đọc bên phải. */
  unread?: boolean;
  /** Chỉ dòng của người thật mới mở được màn nhắn tin. */
  onOpen?: () => void;
}

function Threads({
  people,
  loading,
  onOpen,
}: {
  people: UserProfile[];
  loading: boolean;
  onOpen: (p: UserProfile) => void;
}) {
  // Chấm xanh chỉ gắn cho dòng "Hiện đang hoạt động" — dòng có mốc thời gian
  // nghĩa là người đó offline, treo chấm lên là mâu thuẫn với chính dòng chữ.
  const person = (p: UserProfile, preview: string, time?: string): Thread => ({
    key: p.uid,
    avatar: (
      <Avatar
        photo={p.photoURL}
        fallback={initialOf(nameOf(p))}
        size={56}
        online={!time}
      />
    ),
    title: nameOf(p),
    preview,
    time,
    camera: true,
    onOpen: () => onOpen(p),
  });

  const rows: (Thread | null)[] = [
    {
      key: "followers",
      avatar: <IconBubble bg="#20a4f3"><FollowersGlyph /></IconBubble>,
      title: "Những Follower mới",
      preview: "Bảo Nhi đã bắt đầu follow bạn.",
    },
    {
      key: "activity",
      avatar: <IconBubble bg="#fe2c55"><HeartGlyph /></IconBubble>,
      title: "Hoạt động",
      preview: "Fan Combat và 16 người khác đã thích video của bạn",
    },
    people[0] ? person(people[0], "shared a video", "2 giờ") : null,
    {
      key: "system",
      avatar: <IconBubble bg="#161823"><TrayGlyph /></IconBubble>,
      title: "Thông báo hệ thống",
      preview: "LIVE: Mở khóa phiên LIVE đẳng cấp",
      time: "2 ngày",
      unread: true,
    },
    people[1] ? person(people[1], "Hiện đang hoạt động") : null,
    people[2] ? person(people[2], "Hiện đang hoạt động") : null,
    {
      key: "shop",
      avatar: <IconBubble bg="#ff8a00"><BagGlyph /></IconBubble>,
      title: "TikTok Shop",
      preview: "Samsung Vietnam Store: ƯU ĐÃI LỚN",
      time: "3 ngày",
      unread: true,
    },
    {
      key: "tako",
      avatar: <TakoBubble />,
      title: "TikTok Tako",
      preview: "Chúng ta nên bắt đầu từ đâu?",
      time: "4 tháng 8",
    },
    ...people.slice(3).map((p) => person(p, "Hiện đang hoạt động")),
  ];

  const threads = rows.filter((r): r is Thread => r !== null);

  return (
    <div>
      {threads.map((t) => (
        <ThreadRow key={t.key} thread={t} />
      ))}

      {loading && people.length === 0 && (
        <p className="py-6 text-center text-[14px] text-[#16182380]">Đang tải…</p>
      )}
    </div>
  );
}

function ThreadRow({ thread }: { thread: Thread }) {
  return (
    <button
      type="button"
      onClick={thread.onOpen}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[#f1f1f2]"
    >
      <span className="shrink-0">{thread.avatar}</span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[1.35] font-semibold">
          {thread.title}
        </span>
        <span className="block truncate text-[15px] leading-[1.35] text-[#16182380]">
          {thread.preview}
          {thread.time ? ` · ${thread.time}` : ""}
        </span>
      </span>

      {thread.camera && <CameraIcon />}
      {thread.unread && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#fe2c55]" />
      )}
    </button>
  );
}

/* --------------------------------------------------------------- thanh tab */

function TabBar() {
  return (
    <nav className="flex shrink-0 items-end justify-around border-t border-[#f1f1f2] bg-white pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
      <Tab label="Trang chủ" icon={<HomeGlyph />} />
      <Tab label="Cửa hàng" icon={<ShopGlyph />} dot />

      <button type="button" aria-label="Tạo" className="px-2 pb-1 active:opacity-70">
        {/* Nút tạo kiểu TikTok: khối ĐEN ở giữa với dấu cộng TRẮNG, hai mảng
            xanh ngọc (trái) và đỏ (phải) thò ra 5px mỗi bên như bóng lệch màu.
            Bề rộng khung 52 trừ đi khối 42 rồi chia đôi = 5px mỗi bên. */}
        <span className="relative flex h-[30px] w-[52px] items-center justify-center">
          <span className="absolute left-0 h-[30px] w-[42px] rounded-[10px] bg-[#25f4ee]" />
          <span className="absolute right-0 h-[30px] w-[42px] rounded-[10px] bg-[#fe2c55]" />
          <span className="relative flex h-[30px] w-[42px] items-center justify-center rounded-[10px] bg-[#161823]">
            <PlusCreateIcon />
          </span>
        </span>
      </button>

      <Tab label="Hộp thư" icon={<InboxGlyph />} active />
      <Tab label="Hồ sơ" icon={<PersonGlyph />} />
    </nav>
  );
}

function Tab({
  label,
  icon,
  active,
  dot,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-16 flex-col items-center gap-0.5 active:opacity-60 ${
        active ? "text-[#161823]" : "text-[#16182399]"
      }`}
    >
      <span className="relative">
        {icon}
        {dot && (
          <span className="absolute -top-0.5 -right-1 h-[7px] w-[7px] rounded-full bg-[#fe2c55]" />
        )}
      </span>
      <span className={`text-[10px] ${active ? "font-semibold" : ""}`}>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------- chung */

function Avatar({
  photo,
  fallback,
  size,
  online,
}: {
  photo: string | null | undefined;
  fallback: string;
  size: number;
  online?: boolean;
}) {
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          // Ảnh Google trả 403 nếu gửi kèm referrer.
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-full bg-[#f1f1f2] object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-[#e3e3e4] font-semibold text-[#161823]"
          style={{ fontSize: size * 0.4 }}
        >
          {fallback}
        </span>
      )}

      {online && (
        <span className="absolute right-0 bottom-0 h-4 w-4 rounded-full border-2 border-white bg-[#20d5a4]" />
      )}
    </span>
  );
}

/** Ô tròn đặc màu cho các dòng hệ thống (follower, hoạt động, shop…). */
function IconBubble({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span
      className="flex h-14 w-14 items-center justify-center rounded-full"
      style={{ backgroundColor: bg }}
    >
      {children}
    </span>
  );
}

function TakoBubble() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#f1f1f2] bg-white">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M8 6h16a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-8l-6 4v-4a5 5 0 0 1-5-5v-8a5 5 0 0 1 3-4.6z"
          fill="#25f4ee"
          transform="translate(-1.5,0)"
        />
        <path
          d="M8 6h16a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-8l-6 4v-4a5 5 0 0 1-5-5v-8a5 5 0 0 1 3-4.6z"
          fill="#fe2c55"
          transform="translate(1.5,0)"
        />
        <path
          d="M8 6h16a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-8l-6 4v-4a5 5 0 0 1-5-5v-8a5 5 0 0 1 3-4.6z"
          fill="#161823"
        />
        <circle cx="13" cy="15" r="1.9" fill="#fff" />
        <circle cx="21" cy="15" r="1.9" fill="#fff" />
      </svg>
    </span>
  );
}

function nameOf(p: UserProfile): string {
  return p.displayName || p.email.split("@")[0] || "Người dùng";
}

function initialOf(source: string): string {
  return (source.trim()[0] ?? "?").toUpperCase();
}

/* ------------------------------------------------------------------- icons */

function AddFriendIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" stroke="#161823" strokeWidth="1.9" />
      <path
        d="M2.8 19.2c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2"
        stroke="#161823"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M18.5 8.5v5M21 11h-5"
        stroke="#161823"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7" stroke="#161823" strokeWidth="2" />
      <path d="M15.8 15.8 21 21" stroke="#161823" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 4.5 6 8.5l4-4" stroke="#161823" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 2v10M2 7h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PlusCreateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.5v13M3.5 10h13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Thân máy bo góc tròn, mấu ngắm phía trên cũng bo — nét gãy góc nhìn
          cứng hẳn so với icon của app thật. */}
      <rect x="2.4" y="6" width="19.2" height="13.2" rx="4.6" stroke="#16182359" strokeWidth="1.8" />
      <circle cx="12" cy="12.6" r="3.4" stroke="#16182359" strokeWidth="1.8" />
      <path
        d="M8.6 6.1 9.5 4.6a1.4 1.4 0 0 1 1.2-.7h2.6a1.4 1.4 0 0 1 1.2.7l.9 1.5"
        stroke="#16182359"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --- glyph trắng nằm trong ô tròn màu --- */

function FollowersGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3.6" />
      <path d="M2.6 19c0-3.3 2.9-5.4 6.4-5.4s6.4 2.1 6.4 5.4z" />
      <circle cx="17" cy="8.5" r="2.8" />
      <path d="M14 13.9c.9-.3 1.9-.5 3-.5 3 0 4.4 1.8 4.4 4.6h-4.6c0-1.6-1-3.1-2.8-4.1z" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M12 21s-8.4-5-8.4-10.6A4.9 4.9 0 0 1 12 7.2a4.9 4.9 0 0 1 8.4 3.2C20.4 16 12 21 12 21z" />
    </svg>
  );
}

function TrayGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M4.4 5.2h15.2l2.2 6.4v5.6a2 2 0 0 1-2 2H4.2a2 2 0 0 1-2-2v-5.6z" />
      <path d="M2.2 12h5.6a4.2 4.2 0 0 0 8.4 0h5.6" stroke="#161823" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function BagGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M4.6 7.5h14.8l1 12.2a1.6 1.6 0 0 1-1.6 1.8H5.2a1.6 1.6 0 0 1-1.6-1.8z" />
      <path
        d="M8.4 9.5V7a3.6 3.6 0 0 1 7.2 0v2.5"
        stroke="#ff8a00"
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --- glyph thanh tab (nét, ăn màu chữ của tab) --- */

function HomeGlyph() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.6 10.4 12 3.8l8.4 6.6v8.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShopGlyph() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.8 8h14.4l.9 11a1.6 1.6 0 0 1-1.6 1.7H5.5a1.6 1.6 0 0 1-1.6-1.7z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 10V7.4a3.4 3.4 0 0 1 6.8 0V10"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InboxGlyph() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.6" y="4.4" width="18.8" height="15.2" rx="4.4" fill="currentColor" />
      <path d="M8 12h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PersonGlyph() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.9" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M4.6 20.2c0-3.8 3.3-6 7.4-6s7.4 2.2 7.4 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
