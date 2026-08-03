import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { UserDetail } from "@/components/UserDetail";

export const metadata: Metadata = {
  title: "Chi tiết người dùng",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <AuthGate>
      <UserDetail uid={uid} />
    </AuthGate>
  );
}
