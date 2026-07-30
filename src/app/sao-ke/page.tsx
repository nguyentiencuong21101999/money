import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { Statement } from "@/components/Statement";

export const metadata: Metadata = {
  title: "Sao kê",
};

export default function SaoKe() {
  return (
    <AuthGate>
      <Statement />
    </AuthGate>
  );
}
