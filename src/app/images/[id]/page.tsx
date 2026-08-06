import type { Metadata } from "next";
import { AlbumDetail } from "@/components/AlbumDetail";
import { AuthGate } from "@/components/AuthGate";

/**
 * Tiêu đề tĩnh, không phải tên album.
 *
 * Tên album chỉ đọc được sau khi đăng nhập (Firestore rules chặn theo uid), mà
 * generateMetadata chạy trên máy chủ không có phiên người dùng. Lấy tên ở đó
 * đồng nghĩa với mở đường đọc album qua Admin SDK — thêm hạ tầng chỉ để đổi chữ
 * trên tab. Tên thật hiện ở đầu trang, chỗ người ta thực sự nhìn.
 */
export const metadata: Metadata = {
  title: "Album",
};

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGate>
      <AlbumDetail albumId={id} />
    </AuthGate>
  );
}
