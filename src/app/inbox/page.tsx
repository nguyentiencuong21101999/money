"use client";

import { AuthGate } from "@/components/AuthGate";
import { Inbox } from "@/components/Inbox";
import { useAuth } from "@/lib/auth";

export default function InboxPage() {
  return (
    <AuthGate>
      <InboxScreen />
    </AuthGate>
  );
}

/**
 * Tách ra một lớp trong vì AuthGate chỉ vẽ children KHI đã có người đăng nhập —
 * lấy user ở ngoài cổng thì lúc chưa xong phiên vẫn là null.
 */
function InboxScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return <Inbox user={user} />;
}
