import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { Manager } from "@/components/Manager";

export const metadata: Metadata = {
  title: "Quản lý",
};

export default function ManagerPage() {
  return (
    <AuthGate>
      <Manager />
    </AuthGate>
  );
}
