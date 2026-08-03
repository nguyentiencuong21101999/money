"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

interface Result {
  sent: number;
  failed: number;
  cleaned: number;
  /** Lý do từng máy không nhận được, đã gộp trùng. */
  reasons?: string[];
}

interface Props {
  uid: string;
  /** Tên người nhận, chỉ để hiện trong tiêu đề popup. */
  name: string;
  onClose: () => void;
}

/** Popup soạn thông báo gửi cho một người, mở từ trang /manager/{uid}. */
export function SendNotice({ uid, name, onClose }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    if (!title.trim()) {
      setError("Chưa nhập tiêu đề.");
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user!.getIdToken()}`,
        },
        body: JSON.stringify({ uid, title: title.trim(), body: body.trim() }),
      });
      // Đọc text trước rồi mới parse: máy chủ sập giữa đường thì body rỗng
      // hoặc là trang HTML, gọi thẳng .json() sẽ ném lỗi tối nghĩa của trình
      // duyệt thay vì cho thấy chuyện gì đã xảy ra.
      const text = await response.text();
      let payload: (Result & { error?: string }) | null = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Máy chủ trả về dữ liệu lạ (${response.status}): ${text.slice(0, 200)}`);
      }
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? `Gửi thất bại (mã ${response.status}).`);
      }

      setResult(payload);
      setTitle("");
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card animate-sheet sm:animate-pop max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Gửi thông báo</h2>
            <p className="text-muted truncate text-xs">cho {name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-muted hover:bg-expense/8 hover:text-ink -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none active:scale-90"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <label className="block">
            <span className="text-ink-2 text-xs font-medium">Tiêu đề</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="vd: Hôm nay chưa ghi khoản nào"
              className="field mt-1"
            />
          </label>

          <label className="block">
            <span className="text-ink-2 text-xs font-medium">
              Nội dung <span className="text-muted font-normal">(không bắt buộc)</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="vd: Ghi nhanh trước khi quên nhé"
              className="field mt-1 resize-y"
            />
          </label>

          {error && <p className="text-critical text-sm">{error}</p>}

          {result && (
            <p className="border-good/40 bg-good/8 text-ink-2 rounded-lg border px-3 py-2 text-xs">
              Đã lưu vào hộp thư. Đẩy tới {result.sent} máy
              {result.failed > 0 ? `, ${result.failed} máy không nhận được` : ""}
              {result.cleaned > 0 ? ` (đã dọn ${result.cleaned} token chết)` : ""}.
              {result.sent === 0 && result.failed === 0
                ? " Người này chưa bật thông báo trên máy nào — họ vẫn thấy khi mở app."
                : ""}
            </p>
          )}

          {/* Máy nào không nhận được thì phải nói vì sao, không thì chỉ biết
              "thất bại 1 máy" rồi ngồi đoán. */}
          {result?.reasons?.map((reason) => (
            <p
              key={reason}
              className="border-warning/50 bg-warning/10 text-ink-2 rounded-lg border px-3 py-2 text-xs"
            >
              {reason}
            </p>
          ))}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="border-hairline text-ink-2 hover:bg-expense/8 rounded-xl border px-4 py-2.5 text-sm font-medium transition"
            >
              {result ? "Xong" : "Huỷ"}
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="bg-brand flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition duration-200 active:scale-[0.98] disabled:opacity-40"
            >
              {sending ? "Đang gửi…" : "Gửi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
