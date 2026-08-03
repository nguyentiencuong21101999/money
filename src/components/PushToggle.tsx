"use client";

import { useEffect, useState } from "react";
import {
  enablePush,
  pushConfigured,
  pushState,
  syncPush,
  turnOffPush,
  watchPermission,
  type PushState,
} from "@/lib/push";

/**
 * Một dòng trong menu người dùng, có công tắc bật/tắt thông báo cho MÁY NÀY.
 *
 * Cố tình KHÔNG tự hỏi quyền lúc đăng nhập: hỏi lúc người ta chưa cần thì phản
 * xạ là bấm Chặn, mà đã Chặn thì trình duyệt không cho hỏi lại nữa.
 */
export function PushToggle({ uid }: { uid: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushConfigured) return;
    let alive = true;
    const refresh = () => void pushState().then((s) => alive && setState(s));
    refresh();

    // Người dùng gạt công tắc thông báo trong cài đặt của trình duyệt thì công
    // tắc ở đây đổi theo ngay, và Firestore cũng khớp lại: tắt thì xoá token đã
    // chết, bật lại thì xin token mới. Không có cái này thì phải tải lại trang.
    const unwatch = watchPermission(() => {
      if (!alive) return;
      refresh();
      void syncPush(uid).catch((e) => console.error("[push] sync", e));
    });

    return () => {
      alive = false;
      unwatch();
    };
  }, [uid]);

  if (!pushConfigured || state === null) return null;

  async function toggle() {
    setWorking(true);
    setError(null);
    try {
      setState(await (state === "on" ? turnOffPush(uid) : enablePush(uid)));
    } catch (e) {
      console.error("[push] toggle", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  const on = state === "on";
  // Chặn hẳn thì gạt cũng vô ích — trình duyệt không cho hỏi lại quyền nữa.
  const locked = state === "blocked" || state === "unsupported";

  return (
    <div className="border-hairline border-t px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${locked ? "text-muted" : ""}`}>
            🔔 Thông báo
          </p>
          <p className="text-muted mt-0.5 text-xs">{hint(state, working)}</p>
        </div>

        <button
          type="button"
          // Nằm trong <div role="menu"> nên phải là menuitemcheckbox, không
          // phải switch — trình đọc màn hình mới đọc đúng "đã chọn / bỏ chọn".
          role="menuitemcheckbox"
          aria-checked={on}
          aria-label="Nhận thông báo trên máy này"
          onClick={toggle}
          disabled={working || locked}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
            on ? "bg-expense" : "bg-axis"
          }`}
        >
          {/* Núm chạy bằng transform nên không gây reflow, khớp với nguyên tắc
              chuyển động của cả app: ngắn, chỉ transform + opacity. */}
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
              on ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && <p className="text-critical mt-1.5 text-xs">{error}</p>}
    </div>
  );
}

function hint(state: PushState, working: boolean): string {
  if (working) return state === "on" ? "Đang tắt…" : "Đang bật…";
  if (state === "on") return "Máy này đang nhận thông báo";
  if (state === "off") return "Bật để nhận nhắc trên máy này";
  if (state === "blocked") {
    return "Trình duyệt đang chặn. Bấm ổ khoá cạnh thanh địa chỉ để mở lại.";
  }
  return "Máy này chưa nhận được. Trên iPhone phải Thêm vào màn hình chính.";
}
