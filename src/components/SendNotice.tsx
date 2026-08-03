"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

interface Result {
  sent: number;
  failed: number;
  cleaned: number;
}

/** Ô soạn thông báo gửi cho một người, dùng trong trang /manager/{uid}. */
export function SendNotice({ uid }: { uid: string }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Gửi thất bại.");

      setResult(payload as Result);
      setTitle("");
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card animate-rise p-4">
      <h2 className="text-sm font-semibold">Gửi thông báo</h2>
      <p className="text-muted mt-0.5 text-xs">
        Lưu vào hộp thư của người này, đồng thời đẩy tới các máy họ đã bật thông báo.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-ink-2 text-xs font-medium">Tiêu đề</span>
          <input
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

        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="bg-brand w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition duration-200 active:scale-[0.98] disabled:opacity-40"
        >
          {sending ? "Đang gửi…" : "Gửi"}
        </button>
      </div>
    </section>
  );
}
