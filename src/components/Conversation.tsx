"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/lib/profile";
import { sendMessage, threadId, useMessages } from "@/lib/chat";

/**
 * Màn nhắn tin kiểu TikTok: đầu trang có ảnh + tên + nút gọi, giữa là dòng
 * tin, dưới cùng là thanh soạn "Nhắn tin…".
 *
 * Tin nhắn là THẬT (Firestore, xem lib/chat.ts). Riêng huy hiệu 🔥 cạnh tên là
 * đồ trang trí cho giống app thật — không đếm gì cả.
 */
export function Conversation({
  me,
  peer,
  peerName,
  onBack,
}: {
  /** UID của mình, đã đăng nhập. */
  me: string;
  peer: UserProfile;
  peerName: string;
  onBack: () => void;
}) {
  const id = peer.uid ? threadId(me, peer.uid) : null;
  const { messages, error } = useMessages(id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Luôn dán đáy khi có tin mới — không ai đọc tin nhắn từ trên xuống.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const lastMine = [...messages].reverse().find((m) => m.from === me);

  async function send() {
    const text = draft.trim();
    if (!text || !peer.uid || sending) return;
    setDraft("");
    setSending(true);
    try {
      await sendMessage(me, peer.uid, text);
    } catch (e) {
      console.error("[chat] send", e);
      // Trả chữ về ô soạn để không mất công gõ lại.
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <Header peer={peer} name={peerName} onBack={onBack} />

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {error && (
          <p className="mt-3 rounded-xl bg-[#fe2c55]/8 px-3 py-2 text-[13px] text-[#fe2c55]">
            {error}
          </p>
        )}

        {!error && messages.length === 0 && (
          <p className="mt-10 text-center text-[14px] text-[#16182380]">
            Chưa có tin nhắn nào. Gửi lời chào đi.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={m.id}>
            {needsStamp(m.at, messages[i - 1]?.at) && <TimeStamp at={m.at} />}
            <Bubble
              text={m.text}
              own={m.from === me}
              peer={peer}
              seen={m.id === lastMine?.id}
              /*
                Ảnh chỉ gắn vào tin CUỐI của một chuỗi liền mạch cùng người gửi
                — mấy tin trên thụt vào cho thẳng hàng. Gắn ảnh vào từng tin
                thì một người nhắn liền năm câu là năm cái ảnh xếp dọc.
              */
              showAvatar={messages[i + 1]?.from !== m.from}
            />
          </div>
        ))}

        <div ref={endRef} />
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        disabled={!peer.uid}
        /*
          Bàn phím trồi lên làm khung tin co lại, phần đáy — tức mấy tin mới
          nhất — bị đẩy khuất. Chờ một nhịp cho bàn phím chạy xong hoạt ảnh rồi
          mới dán lại xuống đáy.
        */
        onFocus={() => {
          setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 300);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({
  peer,
  name,
  onBack,
}: {
  peer: UserProfile;
  name: string;
  onBack: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-2 py-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Quay lại"
        className="p-1 active:opacity-50"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 4.5 7.5 12l7.5 7.5"
            stroke="#161823"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <PeerAvatar peer={peer} name={name} size={40} />

      <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">
        {name}{" "}
        {/* Huy hiệu streak — trang trí, số cố định. */}
        <span className="whitespace-nowrap">
          🔥<span className="text-[#fe2c55]">36</span>
        </span>
      </h2>

      <button type="button" aria-label="Gọi" className="p-1.5 active:opacity-50">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.2 3.5c.9 0 1.4.5 1.8 1.4l1 2.3c.3.8.2 1.4-.4 2l-1 1c-.2.2-.3.5-.1.8a13.5 13.5 0 0 0 5.5 5.5c.3.2.6.1.8-.1l1-1c.6-.6 1.2-.7 2-.4l2.3 1c.9.4 1.4.9 1.4 1.8 0 2.3-1.9 4.2-4.2 4.2C8.8 22 2 15.2 2 7.7 2 5.4 3.9 3.5 6.2 3.5z"
            stroke="#161823"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button type="button" aria-label="Thêm" className="p-1.5 active:opacity-50">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#161823" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
    </header>
  );
}

/* ---------------------------------------------------------------- dòng tin */

/** Bo góc 20px = đúng nửa chiều cao một dòng, nên tin ngắn ra viên thuốc tròn
 *  còn tin dài vẫn bo mềm — giống hệt app thật. */
const SHAPE = "max-w-[76%] rounded-[20px] px-3.5 py-2 text-[16px] leading-[1.35] whitespace-pre-wrap";

function Bubble({
  text,
  own,
  peer,
  seen,
  showAvatar,
}: {
  text: string;
  own: boolean;
  peer: UserProfile;
  seen: boolean;
  showAvatar: boolean;
}) {
  if (own) {
    return (
      <div className="mb-2 flex flex-col items-end">
        <p className={`${SHAPE} bg-[#2f5bf5] text-white`}>{text}</p>
        {seen && (
          <span className="mt-1 text-[13px] text-[#16182380]">Đã xem</span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-end gap-2">
      {showAvatar ? (
        <PeerAvatar peer={peer} name={peer.displayName || peer.email} size={28} />
      ) : (
        // Chỗ trống đúng bằng ảnh + khoảng cách, để cả chuỗi tin thẳng một mép.
        <span className="w-7 shrink-0" aria-hidden="true" />
      )}
      <p className={`${SHAPE} bg-[#f1f1f2]`}>{text}</p>
    </div>
  );
}

/** "Hôm nay 8:55 CH" — mốc giờ in giữa, ngăn giữa hai cụm tin. */
function TimeStamp({ at }: { at: number }) {
  return (
    <p className="py-3 text-center text-[13px] text-[#16182380]">{stampOf(at)}</p>
  );
}

/* ------------------------------------------------------------ thanh soạn */

const LIMIT = 2000;

/**
 * Ô soạn tin dùng `contenteditable` chứ KHÔNG dùng <input>.
 *
 * Lý do duy nhất: Safari trên iOS treo một thanh phụ trợ (hai mũi tên chuyển ô
 * + nút Xong) ngay trên bàn phím cho MỌI form control. Đó là giao diện của
 * trình duyệt, không có thuộc tính hay CSS nào tắt được. `contenteditable`
 * không phải form control nên Safari không gắn thanh đó.
 *
 * Cái giá phải trả: chữ nằm trong DOM chứ không nằm trong state, nên placeholder
 * phải tự vẽ, dán phải tự lọc về chữ thuần, và giới hạn độ dài phải tự cắt.
 */
function Composer({
  value,
  onChange,
  onSend,
  onFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFocus: () => void;
  disabled: boolean;
}) {
  const typing = value.trim().length > 0;
  const box = useRef<HTMLDivElement>(null);

  /*
    Kéo DOM về khớp với state khi state đổi mà KHÔNG do gõ — gửi xong thì xoá
    trắng, gửi lỗi thì trả chữ lại. Lúc đang gõ thì hai bên vốn đã bằng nhau nên
    không ghi gì cả; ghi đè lúc đó là con trỏ nhảy về đầu dòng sau mỗi phím.
  */
  useEffect(() => {
    const el = box.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  function read() {
    const el = box.current;
    if (!el) return;
    const text = el.textContent ?? "";
    if (text.length > LIMIT) {
      el.textContent = text.slice(0, LIMIT);
      onChange(el.textContent);
      return;
    }
    onChange(text);
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))]">
      {/* Đang gõ thì nút máy ảnh nhường chỗ cho nút chữ "A", đúng như app thật. */}
      <button
        type="button"
        aria-label={typing ? "Kiểu chữ" : "Máy ảnh"}
        className="shrink-0 p-1 active:opacity-50"
      >
        {typing ? <TextModeIcon /> : <CameraIcon />}
      </button>

      <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-full bg-[#f1f1f2] py-1 pr-1.5 pl-4">
        <div className="relative min-w-0 flex-1">
          {!value && (
            <span className="pointer-events-none absolute inset-0 flex items-center text-[16px] text-[#16182359]">
              Nhắn tin...
            </span>
          )}

          <div
            ref={box}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Nhắn tin"
            enterKeyHint="send"
            onFocus={onFocus}
            onInput={read}
            onKeyDown={(e) => {
              // Enter là GỬI; muốn xuống dòng thì Shift+Enter.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={(e) => {
              // Dán thẳng vào contenteditable là lôi cả thẻ HTML của nguồn vào.
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            style={{ outline: "none" }}
            className="max-h-[110px] min-w-0 overflow-y-auto text-[16px] leading-[1.4] break-words whitespace-pre-wrap"
          />
        </div>

        {/* Gõ rồi thì chỉ còn mặt sticker; mic và dấu + nhường chỗ cho nút gửi,
            và nút gửi nằm NGAY TRONG ô nhập chứ không đứng ngoài. */}
        {!typing && <MicIcon />}
        <StickerIcon />
        {!typing && <PlusRound />}

        {typing && (
          <button
            type="button"
            onClick={onSend}
            aria-label="Gửi"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2b8cff_0%,#7b4dff_100%)] active:opacity-80"
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- chung */

function PeerAvatar({
  peer,
  name,
  size,
}: {
  peer: UserProfile;
  name: string;
  size: number;
}) {
  if (peer.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={peer.photoURL}
        alt=""
        // Ảnh Google trả 403 nếu gửi kèm referrer.
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full bg-[#f1f1f2] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-[#e3e3e4] font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Cách nhau quá 15 phút thì in lại mốc giờ, như app thật. */
function needsStamp(at: number, prev: number | undefined): boolean {
  return prev === undefined || at - prev > 15 * 60_000;
}

function stampOf(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const clock = d
    .toLocaleTimeString("vi-VN", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\bAM\b/i, "SA")
    .replace(/\bPM\b/i, "CH");

  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Hôm nay ${clock}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hôm qua ${clock}`;

  return `${d.toLocaleDateString("vi-VN")} ${clock}`;
}

/** Máy ảnh: thân bo góc, mấu ngắm bo tròn, chấm đen giữa ống kính. */
function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#161823" aria-hidden="true">
      <path d="M9.6 3.4h4.8a1.6 1.6 0 0 1 1.4.9l.7 1.4h3.9a2.6 2.6 0 0 1 2.6 2.6v9.5a2.6 2.6 0 0 1-2.6 2.6H3.6A2.6 2.6 0 0 1 1 17.8V8.3a2.6 2.6 0 0 1 2.6-2.6h3.9l.7-1.4a1.6 1.6 0 0 1 1.4-.9z" />
      <circle cx="12" cy="13" r="3.7" fill="#fff" />
      <circle cx="12" cy="13" r="1.5" fill="#161823" />
    </svg>
  );
}

/**
 * Khối vuông bo góc màu đen với chữ "A" trắng — chế độ kiểu chữ, thay chỗ nút
 * máy ảnh khi đang gõ.
 *
 * Chữ A vẽ bằng NÉT chứ không dùng <text>: <text> phụ thuộc font của máy, cỡ
 * và vị trí lệch mỗi nơi một kiểu, có máy còn không ra chữ. Ba nét thì vẽ đâu
 * cũng y hệt.
 */
function TextModeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="7" fill="#161823" />
      <path
        d="M8 17.2 12 7.2l4 10M9.6 14.1h4.8"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Máy bay giấy trắng trong nút gửi. Đường viền đi vòng vào giữa (15 → 17,12 →
 * 15) tạo VẾT KHUYẾT hình chữ V ở đuôi — thiếu nó thì đây chỉ là một tam giác
 * đặc, không ra dáng máy bay giấy.
 *
 * Hình gốc chĩa sang phải, xoay bằng CSS thay vì transform trong SVG: xoay
 * trong SVG thì mũi máy bay chọc ra ngoài viewBox và bị cắt cụt.
 */
function SendIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="#fff"
      aria-hidden="true"
      className="-rotate-45"
    >
      <path d="M2 21 23 12 2 3v7l15 2-15 2z" />
    </svg>
  );
}

/* Ba icon dưới đây đều ĐẶC màu đen, cùng một trọng lượng nét với nút + tròn
   bên cạnh — để nét thì chúng nhạt hơn hẳn và hàng icon nhìn so le. */

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#161823" aria-hidden="true">
      <rect x="8.8" y="2.2" width="6.4" height="11.6" rx="3.2" />
      <path
        d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0M12 17.9v3.9"
        stroke="#161823"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function StickerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#161823" aria-hidden="true">
      <circle cx="12" cy="12" r="9.6" />
      <circle cx="9.1" cy="10.1" r="1.5" fill="#fff" />
      <circle cx="14.9" cy="10.1" r="1.5" fill="#fff" />
      <path
        d="M8.2 14.2a4.6 4.6 0 0 0 7.6 0"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function PlusRound() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#161823" />
      <path d="M12 7.5v9M7.5 12h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
