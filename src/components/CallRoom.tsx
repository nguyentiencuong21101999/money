"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { roomId } from "@/lib/call";
import { useCall } from "./CallProvider";
import { HOME_CRUMB, PageHeader } from "./PageHeader";
import { CameraIcon } from "./icons";

const TRAIL = [HOME_CRUMB];

interface Props {
  /** `?xem=<roomId>` => màn xác nhận CHIA SẺ camera của mình. */
  viewCallId: string | null;
  /** `?goi=<email>` => điền sẵn email người muốn xem. */
  prefillEmail: string | null;
}

export function CallRoom({ viewCallId, prefillEmail }: Props) {
  return (
    <main className="mx-auto max-w-lg p-4">
      <PageHeader title="Gọi video" trail={TRAIL} />
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

  const other = useMemo(() => {
    const me = user?.email?.toLowerCase();
    return callId.split("__").find((e) => e !== me) ?? "người xem";
  }, [callId, user]);

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
      <div className="mt-8 text-center">
        <p className="text-sm font-medium">Đang chia sẻ camera với {call.peerName}</p>
        <p className="text-muted mt-1 text-sm">
          Khung nổi góc màn hình luôn hiện để bạn biết camera đang được chia sẻ.
          Bấm Dừng ở đó bất cứ lúc nào.
        </p>
        <Link href="/" className="text-expense mt-6 inline-block text-sm font-medium">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-5 text-center">
      <span className="bar-fill flex h-16 w-16 items-center justify-center rounded-full text-white">
        <CameraIcon size={28} />
      </span>
      <div>
        <p className="text-lg font-semibold">Chia sẻ camera với {other}?</p>
        <p className="text-muted mt-1.5 text-sm">
          Đồng ý thì camera của bạn sẽ được chia sẻ cho họ xem. Bạn luôn thấy dấu
          &quot;đang chia sẻ&quot; và dừng lại được bất cứ lúc nào.
        </p>
      </div>
      <div className="flex w-full gap-3">
        <Link
          href="/"
          className="border-hairline flex-1 rounded-xl border px-6 py-3 text-center text-sm font-medium transition active:scale-[0.98]"
        >
          Từ chối
        </Link>
        <button
          onClick={() => void agree()}
          disabled={starting}
          className="bg-expense flex-1 rounded-xl px-6 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {starting ? "Đang mở…" : "Đồng ý chia sẻ"}
        </button>
      </div>
      {error && (
        <p className="text-expense whitespace-pre-line text-center text-sm">{error}</p>
      )}
    </div>
  );
}

/** Vào room của một người để xem camera của họ (nếu họ đang chia sẻ). */
function ViewMode({ prefillEmail }: { prefillEmail: string | null }) {
  const { user } = useAuth();
  const { call, view } = useCall();
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [starting, setStarting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!user?.email) return;
    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Nhập email người muốn xem trước đã.");
      return;
    }
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

  // Nhắn người kia mở trang chia sẻ (thông báo + push, như cũ). Họ vẫn phải tự
  // bấm Đồng ý mới bật camera.
  async function notify() {
    if (!user?.email) return;
    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Nhập email người nhận trước đã.");
      return;
    }
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
      if (!res.ok) throw new Error(data.error ?? `Máy chủ trả lỗi ${res.status}.`);
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

  if (call?.role === "viewer") {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm font-medium">Đang ở trong room với {call.peerName}</p>
        <p className="text-muted mt-1 text-sm">
          {call.remoteStream
            ? "Hình đang hiện ở khung nổi góc màn hình."
            : "Chưa có ai chia sẻ. Khi họ bật camera, hình sẽ hiện ở khung nổi."}
        </p>
        <Link href="/" className="text-expense mt-6 inline-block text-sm font-medium">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <p className="text-muted text-sm">
        Vào room của một người để xem camera của họ. Chỉ thấy hình{" "}
        <span className="text-ink-2 font-medium">khi họ đang chủ động chia sẻ</span>.
      </p>
      <input
        type="email"
        inputMode="email"
        autoCapitalize="none"
        placeholder="email người muốn xem"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border-hairline focus:border-expense w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none"
      />
      <button
        onClick={() => void join()}
        disabled={starting}
        className="bg-expense flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        <CameraIcon size={18} />
        {starting ? "Đang vào…" : "Vào room xem"}
      </button>
      <button
        onClick={() => void notify()}
        disabled={notifying}
        className="border-hairline rounded-xl border px-6 py-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
      >
        {notifying ? "Đang gửi…" : "Gửi thông báo"}
      </button>
      {notice && <p className="text-brand text-center text-sm">{notice}</p>}
      {error && (
        <p className="text-expense whitespace-pre-line text-center text-sm">{error}</p>
      )}
    </div>
  );
}
