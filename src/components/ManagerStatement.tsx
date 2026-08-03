"use client";

import { useAdminGate } from "@/lib/admin-gate";
import { useProfile } from "@/lib/profile";
import { Statement } from "./Statement";

/** Sao kê của một người khác, y hệt trang họ tự xem — chỉ khác là chỉ để đọc. */
export function ManagerStatement({ uid }: { uid: string }) {
  const allowed = useAdminGate();
  const { data: profile } = useProfile(uid, allowed);

  if (!allowed) return null;

  return (
    <Statement uid={uid} ownerName={profile?.displayName || profile?.email || "…"} />
  );
}
