import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { CallRoom } from "@/components/CallRoom";

export const metadata: Metadata = {
  title: "Gọi video",
};

/**
 * `?xem=<callId>` → B mở từ thông báo (màn xác nhận chia sẻ camera).
 * `?goi=<email>` → A vào room của một người (điền sẵn email người nhận).
 * Không có gì → A tự nhập email để gửi yêu cầu.
 */
export default async function GoiPage({
  searchParams,
}: {
  searchParams: Promise<{ xem?: string; goi?: string }>;
}) {
  const { xem, goi } = await searchParams;
  return (
    <AuthGate>
      <CallRoom viewCallId={xem ?? null} prefillEmail={goi ?? null} />
    </AuthGate>
  );
}
