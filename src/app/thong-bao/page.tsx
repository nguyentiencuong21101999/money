import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { Notifications } from "@/components/Notifications";

export const metadata: Metadata = {
  title: "Thông báo",
};

export default function ThongBao() {
  return (
    <AuthGate>
      <Notifications />
    </AuthGate>
  );
}
