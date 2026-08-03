import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { ManagerStatement } from "@/components/ManagerStatement";

export const metadata: Metadata = {
  title: "Sao kê người dùng",
};

export default async function ManagerStatementPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return (
    <AuthGate>
      <ManagerStatement uid={uid} />
    </AuthGate>
  );
}
