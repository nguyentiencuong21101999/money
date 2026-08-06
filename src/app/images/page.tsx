import type { Metadata } from "next";
import { AlbumLibrary } from "@/components/AlbumLibrary";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Thư viện ảnh",
};

/**
 * Thư viện ảnh — độc lập với phần sổ tiền.
 *
 * Ảnh được gom theo album. Mỗi album là một thư mục thật trên Drive của chủ app:
 *
 *   Thư viện ảnh — Sổ tiền/ban@gmail.com/Tên album/anh.jpg
 *
 * Metadata nằm trong Firestore ở /users/{uid}/albums và /users/{uid}/images.
 * Không dùng chung gì với /users/{uid}/transactions ngoài lớp đăng nhập, nên sửa
 * bên này không thể làm hỏng sổ thu chi.
 */
export default function Anh() {
  return (
    <AuthGate>
      <AlbumLibrary />
    </AuthGate>
  );
}
