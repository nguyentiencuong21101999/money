"use client";

import { useEffect, useState } from "react";
import { enablePush, pushConfigured, pushState, type PushState } from "@/lib/push";

/**
 * Một dòng trong menu người dùng. Cố tình KHÔNG tự hỏi quyền lúc đăng nhập:
 * hỏi lúc người ta chưa cần thì phản xạ là bấm Chặn, mà đã Chặn thì trình
 * duyệt không cho hỏi lại nữa — phải vào cài đặt bật tay.
 */
export function PushToggle({ uid }: { uid: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushConfigured) return;
    let alive = true;
    void pushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  if (!pushConfigured || state === null) return null;

  async function enable() {
    setWorking(true);
    setError(null);
    try {
      setState(await enablePush(uid));
    } catch (e) {
      console.error("[push] enable", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  if (state === "off") {
    return (
      <Row>
        <button
          type="button"
          role="menuitem"
          onClick={enable}
          disabled={working}
          className="text-expense hover:text-brand text-sm font-medium disabled:opacity-50"
        >
          🔔 {working ? "Đang bật…" : "Bật thông báo"}
        </button>
        {error && <p className="text-critical mt-1 text-xs">{error}</p>}
      </Row>
    );
  }

  if (state === "on") {
    return (
      <Row>
        <p className="text-ink-2 text-sm">🔔 Thông báo: đang bật</p>
      </Row>
    );
  }

  return (
    <Row>
      <p className="text-muted text-xs">
        {state === "blocked"
          ? "Trình duyệt đang chặn thông báo của trang này. Muốn nhận thì bật lại trong cài đặt của trình duyệt."
          : "Máy này chưa nhận được thông báo. Trên iPhone phải Thêm vào màn hình chính rồi mở app từ icon đó."}
      </p>
    </Row>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-hairline border-t px-4 py-3">{children}</div>;
}
