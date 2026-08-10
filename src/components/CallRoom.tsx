"use client";

import { useState, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { roomId } from "@/lib/call";
import { useCall } from "./CallProvider";
import { HEADER_BUTTON, HOME_CRUMB, PageHeader } from "./PageHeader";
import { CameraIcon } from "./icons";

const TRAIL = [HOME_CRUMB];

/**
 * Nút hành động chính của trang gọi (Đồng ý chia sẻ, Vào room xem) — cùng một
 * kiểu bg-expense bo tròn. Gom về đây để khỏi lặp chuỗi class ở mỗi chỗ; truyền
 * thêm layout riêng (flex-1, gap…) qua `className`.
 */
function ActionButton({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`bg-expense rounded-xl px-6 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

interface Props {
  /** `?xem=<roomId>` => màn xác nhận CHIA SẺ camera của mình. */
  viewCallId: string | null;
  /** `?goi=<email>` => email người muốn xem (điền từ nút "Vào room"). */
  prefillEmail: string | null;
}

export function CallRoom({ viewCallId, prefillEmail }: Props) {
  return (
    <main className="mx-auto max-w-lg p-4">
      {viewCallId ? (
        <ShareMode callId={viewCallId} />
      ) : (
        <ViewMode prefillEmail={prefillEmail} />
      )}
    </main>
  );
}

/** Mở từ link chia sẻ: xác nhận rồi bật camera của mình cho người kia xem. */
function ShareMode({ callId }: { callId: string }) {
  const { user } = useAuth();
  const { call, share } = useCall();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = user?.email?.toLowerCase();
  const other = callId.split("__").find((e) => e !== me) ?? "người xem";

  async function agree() {
    setError(null);
    setStarting(true);
    try {
      await share(callId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  if (call?.role === "sharer") {
    return (
      <>
        <PageHeader title="Gọi video" trail={TRAIL} />
        <div className="mt-8 text-center">
          <p className="text-sm font-medium">
            Đang chia sẻ camera với {call.peerName}
          </p>
          <p className="text-muted mt-1 text-sm">
            Khung nổi góc màn hình luôn hiện để bạn biết camera đang được chia
            sẻ. Bấm Dừng ở đó bất cứ lúc nào.
          </p>
          <Link
            href="/"
            className="text-expense mt-6 inline-block text-sm font-medium"
          >
            Về trang chủ
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Gọi video" trail={TRAIL} />
      <div className="mt-8 flex flex-col items-center gap-5 text-center">
        <span className="bar-fill flex h-16 w-16 items-center justify-center rounded-full text-white">
          <CameraIcon size={28} />
        </span>
        <div>
          <p className="text-lg font-semibold">Chia sẻ camera với {other}?</p>
          <p className="text-muted mt-1.5 text-sm">
            Đồng ý thì camera của bạn sẽ được chia sẻ cho họ xem. Bạn luôn thấy
            dấu &quot;đang chia sẻ&quot; và dừng lại được bất cứ lúc nào.
          </p>
        </div>

        <div className="flex w-full gap-3">
          <Link
            href="/"
            className="border-hairline flex-1 rounded-xl border px-6 py-3 text-center text-sm font-medium transition active:scale-[0.98]"
          >
            Từ chối
          </Link>
          <ActionButton
            onClick={() => void agree()}
            disabled={starting}
            className="flex-1"
          >
            {starting ? "Đang mở…" : "Đồng ý chia sẻ"}
          </ActionButton>
        </div>
        {error && (
          <p className="text-expense whitespace-pre-line text-center text-sm">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** Vào room của một người (điền sẵn email) để xem camera của họ. */
function ViewMode({ prefillEmail }: { prefillEmail: string | null }) {
  const { user } = useAuth();
  const { call, view } = useCall();
  const target = (prefillEmail ?? "").trim().toLowerCase();
  const [starting, setStarting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!user?.email || !target) return;
    setError(null);
    setStarting(true);
    try {
      await view(roomId(user.email, target));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  // Nhắn người kia mở trang chia sẻ (thông báo + push). Họ vẫn tự bấm Đồng ý.
  async function notify() {
    if (!user?.email || !target) return;
    setError(null);
    setNotice(null);
    setNotifying(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          callId: roomId(user.email, target),
          calleeEmail: target,
          callerName: user.displayName || user.email.split("@")[0],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
      };
      if (!res.ok)
        throw new Error(data.error ?? `Máy chủ trả lỗi ${res.status}.`);
      setNotice(
        data.sent && data.sent > 0
          ? `Đã gửi thông báo (đẩy tới ${data.sent} máy).`
          : "Đã gửi thông báo (họ sẽ thấy khi mở app).",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNotifying(false);
    }
  }

  const header = (
    <PageHeader title="Gọi video" trail={TRAIL}>
      {target && (
        <button
          type="button"
          onClick={() => void notify()}
          disabled={notifying}
          className={HEADER_BUTTON}
        >
          {notifying ? "Đang gửi…" : "Gửi thông báo"}
        </button>
      )}
    </PageHeader>
  );

  if (call?.role === "viewer") {
    return (
      <>
        {header}
        <div className="mt-8 text-center">
          <p className="text-sm font-medium">
            Đang ở trong room với {call.peerName}
          </p>
          <p className="text-muted mt-1 text-sm">
            {call.remoteStream
              ? "Hình đang hiện toàn màn hình."
              : "Chưa có ai chia sẻ. Khi họ bật camera, hình sẽ tự hiện."}
          </p>
          <Link
            href="/"
            className="text-expense mt-6 inline-block text-sm font-medium"
          >
            Về trang chủ
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mt-6 flex flex-col gap-5">
        {target ? (
          <p className="text-muted text-sm">
            Vào room của{" "}
            <span className="text-ink-2 font-medium">{target}</span> để xem
            camera của họ. Chỉ thấy hình khi họ đang chủ động chia sẻ.
          </p>
        ) : (
          <p className="text-muted text-sm">
            Mở từ trang Quản lý người dùng → chọn người → bấm &quot;Vào
            room&quot;.
          </p>
        )}
        <ActionButton
          onClick={() => void join()}
          disabled={starting || !target}
          className="flex items-center justify-center gap-2"
        >
          <CameraIcon size={18} />
          {starting ? "Đang vào…" : "Vào room xem"}
        </ActionButton>
        {notice && <p className="text-brand text-center text-sm">{notice}</p>}
        {error && (
          <p className="text-expense whitespace-pre-line text-center text-sm">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
